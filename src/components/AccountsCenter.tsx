import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { sb, rpcOk } from "@/lib/db-any";
import { useAuth, PLATFORM_ROLE_LABEL } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { UserCheck, UserX, Search, IdCard, Crown } from "lucide-react";
import { friendlyError } from "@/lib/error-messages";

const GLOBAL_ROLE_KEYS = ["super_admin", "admin", "platform_admin", "support_agent", "developer"];

/** Papéis globais atribuíveis pela interface — nunca há seleção implícita. */
const MANAGEABLE_ROLES: { value: string; label: string }[] = [
  { value: "platform_admin", label: "Administrador da Plataforma" },
  { value: "support_agent", label: "Suporte" },
  { value: "developer", label: "Desenvolvedor" },
];

type Filter = "all" | "pending" | "customers" | "staff" | "blocked";


const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Todas" },
  { key: "pending", label: "Pendentes" },
  { key: "customers", label: "Clientes" },
  { key: "staff", label: "Equipe LLZ" },
  { key: "blocked", label: "Bloqueadas" },
];

interface ProfileRow {
  id: string;
  email: string | null;
  full_name: string | null;
  is_approved: boolean;
  rejection_reason?: string | null;
  account_type?: string | null;
  created_at: string;
}
interface RoleRow { user_id: string; role: string }
interface MemberRow { user_id: string; is_active: boolean; companies: { name: string } | null }
interface InviteRow { email: string; status: string; intended_role: string }

export default function AccountsCenter() {
  const { isPlatformAdmin, isPlatformSuperAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [staffTargetId, setStaffTargetId] = useState<string | null>(null);
  const [staffRole, setStaffRole] = useState<string>("");

  const { data, isLoading } = useQuery({
    queryKey: ["accounts-center"],
    queryFn: async () => {
      const [profilesRes, rolesRes, membersRes, invitesRes] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at", { ascending: false }),
        supabase.from("user_roles").select("user_id, role"),
        sb.from("company_members").select("user_id, is_active, companies(name)"),
        sb.from("platform_staff_invites").select("email, status, intended_role"),
      ]);
      if (profilesRes.error) throw profilesRes.error;
      return {
        profiles: (profilesRes.data ?? []) as ProfileRow[],
        roles: (rolesRes.data ?? []) as RoleRow[],
        members: (membersRes.data ?? []) as MemberRow[],
        invites: (invitesRes.data ?? []) as InviteRow[],
      };
    },
  });

  const setApproval = useMutation({
    mutationFn: async ({ userId, approved }: { userId: string; approved: boolean }) => {
      await rpcOk("account_set_approval", { _user_id: userId, _approved: approved, _reason: null });
    },
    onSuccess: (_d, v) => {
      queryClient.invalidateQueries({ queryKey: ["accounts-center"] });
      queryClient.invalidateQueries({ queryKey: ["admin-profiles"] });
      toast({ title: v.approved ? "Conta aprovada" : "Conta bloqueada" });
    },
    onError: (e: Error) => toast({ title: "Erro", description: friendlyError(e), variant: "destructive" }),
  });

  const addToStaff = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      await rpcOk("staff_add_existing_account", { _user_id: userId, _role: role });
    },
    onSuccess: (_d, v) => {
      queryClient.invalidateQueries({ queryKey: ["accounts-center"] });
      queryClient.invalidateQueries({ queryKey: ["llz-staff-center"] });
      queryClient.invalidateQueries({ queryKey: ["access-diagnostics"] });
      queryClient.invalidateQueries({ queryKey: ["admin-profiles"] });
      setStaffTargetId(null);
      setStaffRole("");
      toast({
        title: "Conta adicionada à Equipe LLZ",
        description: `Papel global concedido: ${MANAGEABLE_ROLES.find((r) => r.value === v.role)?.label ?? v.role}.`,
      });
    },
    onError: (e: Error) => toast({ title: "Erro", description: friendlyError(e), variant: "destructive" }),
  });



  const rows = useMemo(() => {
    if (!data) return [];
    return data.profiles.map((p) => {
      const roles = data.roles.filter((r) => r.user_id === p.id && GLOBAL_ROLE_KEYS.includes(r.role));
      const memberships = data.members.filter((m) => m.user_id === p.id);
      const invite = data.invites.find((i) => (i.email ?? "").toLowerCase() === (p.email ?? "").toLowerCase());
      return { ...p, roles, memberships, invite };
    });
  }, [data]);

  const staffTarget = rows.find((r) => r.id === staffTargetId) ?? null;



  const filtered = rows.filter((r) => {
    const q = search.trim().toLowerCase();
    if (q && !`${r.full_name ?? ""} ${r.email ?? ""}`.toLowerCase().includes(q)) return false;
    if (filter === "pending") return !r.is_approved;
    if (filter === "customers") return r.account_type === "customer";
    if (filter === "staff") return r.account_type === "llz_staff";
    if (filter === "blocked") return !r.is_approved && !!r.rejection_reason;
    return true;
  });

  return (
    <div className="space-y-3">
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <IdCard size={16} className="text-primary" /> Central de contas
        </h3>
        <p className="text-[11px] text-muted-foreground mt-1">
          Visão global de todas as contas. Existem apenas dois tipos: <strong>Cliente</strong> e{" "}
          <strong>Equipe LLZ</strong>. Membro da Equipe LLZ sem empresa é comportamento normal.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex gap-1 bg-secondary rounded-xl p-1 overflow-x-auto">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                filter === f.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8 h-9 text-sm"
            placeholder="Buscar por nome ou e-mail"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {isLoading && <p className="text-xs text-muted-foreground">Carregando contas...</p>}
      {!isLoading && filtered.length === 0 && (
        <p className="text-sm text-muted-foreground py-6 text-center">Nenhuma conta nesta visão.</p>
      )}

      <div className="space-y-2">
        {filtered.map((r) => {
          const isStaff = r.account_type === "llz_staff";
          return (
            <div key={r.id} className="bg-card border border-border rounded-xl p-4 space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm truncate">{r.full_name || "Sem nome"}</p>
                  <p className="text-xs text-muted-foreground truncate">{r.email}</p>
                </div>
                <div className="flex gap-1 flex-wrap">
                  <Badge variant="outline" className="text-[10px]">{isStaff ? "Equipe LLZ" : "Cliente"}</Badge>
                  <Badge variant={r.is_approved ? "secondary" : "outline"} className="text-[10px]">
                    {r.is_approved ? "Ativo" : "Pendente"}
                  </Badge>
                  {!r.is_approved && r.rejection_reason && (
                    <Badge variant="destructive" className="text-[10px]">Bloqueado</Badge>
                  )}
                </div>
              </div>

              <div className="text-[11px] text-muted-foreground space-y-0.5">
                <p>Cadastro: {r.created_at ? new Date(r.created_at).toLocaleString("pt-BR") : "—"}</p>
                {isStaff ? (
                  <p>
                    Papéis globais:{" "}
                    {r.roles.length > 0
                      ? r.roles.map((x) => PLATFORM_ROLE_LABEL[x.role] ?? x.role).join(", ")
                      : r.invite?.status === "registered"
                        ? "Cadastro concluído — aguardando ativação LLZ"
                        : "Nenhum"}
                    {" • "}Empresa: Nenhuma (esperado)
                  </p>
                ) : (
                  <p>
                    Empresas:{" "}
                    {r.memberships.length > 0
                      ? r.memberships
                          .map((m) => `${m.companies?.name ?? "—"}${m.is_active ? "" : " (bloqueado na empresa)"}`)
                          .join(", ")
                      : "Nenhuma"}
                  </p>
                )}
                {r.invite && <p>Convite LLZ: {r.invite.status}</p>}
              </div>

              <div className="flex gap-2 flex-wrap">
                {!r.is_approved ? (
                  <Button
                    size="sm"
                    className="h-8 text-xs gap-1"
                    disabled={!isPlatformAdmin || setApproval.isPending}
                    onClick={() => setApproval.mutate({ userId: r.id, approved: true })}
                  >
                    <UserCheck size={14} /> {r.rejection_reason ? "Reativar conta" : "Aprovar conta"}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs gap-1"
                    disabled={!isPlatformAdmin || setApproval.isPending}
                    onClick={() => setApproval.mutate({ userId: r.id, approved: false })}
                  >
                    <UserX size={14} /> Bloquear conta
                  </Button>
                )}
                {!isStaff && r.memberships.length === 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs gap-1"
                    disabled={!isPlatformSuperAdmin || addToStaff.isPending}
                    onClick={() => { setStaffRole(""); setStaffTargetId(r.id); }}
                  >
                    <Crown size={14} /> Adicionar à Equipe LLZ
                  </Button>
                )}
                {!isStaff && r.memberships.length > 0 && (
                  <span className="text-[11px] text-muted-foreground self-center">
                    Vinculada a empresa cliente ({r.memberships.map((m) => m.companies?.name ?? "—").join(", ")}) — não
                    pode virar Equipe LLZ.
                  </span>
                )}
              </div>

            </div>
          );
        })}
      </div>

      <Dialog
        open={!!staffTarget}
        onOpenChange={(o) => { if (!o) { setStaffTargetId(null); setStaffRole(""); } }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar à Equipe LLZ</DialogTitle>
            <DialogDescription>
              Escolha conscientemente o cargo global. Nenhum cargo é atribuído automaticamente.
            </DialogDescription>
          </DialogHeader>

          {staffTarget && (
            <div className="space-y-3">
              <div className="border border-border rounded-lg p-3 text-xs space-y-1">
                <p className="font-semibold text-sm">{staffTarget.full_name || "Sem nome"}</p>
                <p className="text-muted-foreground">{staffTarget.email}</p>
                <p className="text-muted-foreground">
                  Tipo atual: {staffTarget.account_type === "llz_staff" ? "Equipe LLZ" : "Cliente"}
                </p>
                {staffTarget.memberships.length === 0 ? (
                  <p className="text-muted-foreground">Vínculo empresarial: nenhum (confirmado)</p>
                ) : (
                  <p className="text-destructive">
                    Vínculo empresarial: {staffTarget.memberships.map((m) => m.companies?.name ?? "—").join(", ")} —
                    conversão bloqueada.
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Cargo global (obrigatório)</Label>
                <Select value={staffRole} onValueChange={setStaffRole}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Selecione o cargo" />
                  </SelectTrigger>
                  <SelectContent>
                    {MANAGEABLE_ROLES.map((r) => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {staffRole && (
                <p className="text-[11px] text-muted-foreground">
                  Esta conta passará a ser do tipo Equipe LLZ e receberá acesso global de{" "}
                  <strong>{MANAGEABLE_ROLES.find((r) => r.value === staffRole)?.label}</strong>. Nenhuma empresa será
                  criada.
                </p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => { setStaffTargetId(null); setStaffRole(""); }}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              className="h-8 text-xs gap-1"
              disabled={
                !isPlatformSuperAdmin ||
                !staffRole ||
                !staffTarget ||
                staffTarget.memberships.length > 0 ||
                addToStaff.isPending
              }
              onClick={() => staffTarget && addToStaff.mutate({ userId: staffTarget.id, role: staffRole })}
            >
              <Crown size={14} /> Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );

}
