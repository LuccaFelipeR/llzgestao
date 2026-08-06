import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { friendlyError } from "@/lib/error-messages";
import { Building2, Crown, Star, UserPlus, Users, ShieldAlert } from "lucide-react";

/** Cargos EMPRESARIAIS — vivem apenas em company_members.role */
export const COMPANY_ROLE_LABELS: Record<string, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  supervisor: "Supervisor",
  member: "Operador",
};

const ASSIGNABLE_ROLES = ["admin", "supervisor", "member"];

interface Props {
  initialCompanyId?: string | null;
}

export default function CompanyUsersCenter({ initialCompanyId }: Props) {
  const { isPlatformAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [companyId, setCompanyId] = useState<string | null>(initialCompanyId ?? null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [addEmail, setAddEmail] = useState("");
  const [addRole, setAddRole] = useState("member");
  const [transferMember, setTransferMember] = useState<any>(null);

  useEffect(() => {
    if (initialCompanyId) setCompanyId(initialCompanyId);
  }, [initialCompanyId]);

  const { data: companies } = useQuery({
    queryKey: ["users-center-companies"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("companies")
        .select("id,name,status,max_users,main_focal_user_id")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const company = (companies ?? []).find((c: any) => c.id === companyId) ?? null;

  const { data: members, isLoading } = useQuery({
    queryKey: ["users-center-members", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data: rows, error } = await (supabase as any)
        .from("company_members")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at");
      if (error) throw error;
      const ids = (rows ?? []).map((m: any) => m.user_id);
      let profs: any[] = [];
      if (ids.length) {
        const { data } = await supabase
          .from("profiles")
          .select("id,email,full_name,is_approved")
          .in("id", ids);
        profs = data ?? [];
      }
      let lastActivity: Record<string, string> = {};
      if (ids.length) {
        const { data: acts } = await supabase
          .from("activity_log")
          .select("user_id, created_at")
          .in("user_id", ids)
          .order("created_at", { ascending: false })
          .limit(500);
        (acts ?? []).forEach((a: any) => {
          if (a.user_id && !lastActivity[a.user_id]) lastActivity[a.user_id] = a.created_at;
        });
      }
      return (rows ?? []).map((m: any) => ({
        ...m,
        profile: profs.find((p) => p.id === m.user_id) ?? null,
        last_activity: lastActivity[m.user_id] ?? null,
      }));
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["users-center-members", companyId] });
    queryClient.invalidateQueries({ queryKey: ["users-center-companies"] });
    queryClient.invalidateQueries({ queryKey: ["admin-companies"] });
  };

  const rpc = (fn: string, args: Record<string, unknown>, okTitle: string) =>
    ({
      mutationFn: async () => {
        const { data, error } = await (supabase as any).rpc(fn, args);
        if (error) throw error;
        return data;
      },
      onSuccess: () => {
        invalidate();
        toast({ title: okTitle });
      },
      onError: (e: Error) => toast({ title: "Erro", description: friendlyError(e), variant: "destructive" }),
    });

  const setRoleMutation = useMutation({
    mutationFn: async ({ memberId, role }: { memberId: string; role: string }) => {
      const { error } = await (supabase as any).rpc("company_member_set_role", {
        _company_id: companyId,
        _member_id: memberId,
        _role: role,
      });
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast({ title: "Cargo atualizado nesta empresa" }); },
    onError: (e: Error) => toast({ title: "Erro", description: friendlyError(e), variant: "destructive" }),
  });

  const setActiveMutation = useMutation({
    mutationFn: async ({ memberId, active }: { memberId: string; active: boolean }) => {
      const { error } = await (supabase as any).rpc("company_member_set_active", {
        _company_id: companyId,
        _member_id: memberId,
        _active: active,
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => { invalidate(); toast({ title: v.active ? "Acesso reativado nesta empresa" : "Acesso bloqueado nesta empresa" }); },
    onError: (e: Error) => toast({ title: "Erro", description: friendlyError(e), variant: "destructive" }),
  });

  const setFocalMutation = useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await (supabase as any).rpc("company_member_set_focal", {
        _company_id: companyId,
        _member_id: memberId,
      });
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast({ title: "Ponto focal atualizado" }); },
    onError: (e: Error) => toast({ title: "Erro", description: friendlyError(e), variant: "destructive" }),
  });

  const transferMutation = useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await (supabase as any).rpc("company_transfer_ownership", {
        _company_id: companyId,
        _new_owner_member_id: memberId,
      });
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); setTransferMember(null); toast({ title: "Propriedade transferida" }); },
    onError: (e: Error) => toast({ title: "Erro", description: friendlyError(e), variant: "destructive" }),
  });

  const addMemberMutation = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).rpc("company_member_add_by_email", {
        _company_id: companyId,
        _email: addEmail,
        _role: addRole,
      });
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); setAddEmail(""); setAddRole("member"); toast({ title: "Usuário vinculado à empresa" }); },
    onError: (e: Error) => toast({ title: "Não foi possível vincular", description: friendlyError(e), variant: "destructive" }),
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (members ?? []).filter((m: any) => {
      if (term) {
        const hay = `${m.profile?.full_name ?? ""} ${m.profile?.email ?? ""}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      if (roleFilter !== "all" && m.role !== roleFilter) return false;
      if (statusFilter === "active" && m.is_active === false) return false;
      if (statusFilter === "blocked" && m.is_active !== false) return false;
      return true;
    });
  }, [members, search, roleFilter, statusFilter]);

  const activeCount = (members ?? []).filter((m: any) => m.is_active !== false).length;
  const owner = (members ?? []).find((m: any) => m.role === "owner");
  const canManage = isPlatformAdmin;

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Building2 size={16} className="text-primary" />
          <h3 className="font-semibold text-sm">Usuários das Empresas</h3>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Cargos empresariais (Proprietário, Administrador, Supervisor, Operador) existem apenas
          dentro da empresa selecionada. Acessos globais da LLZ ficam na aba “Equipe LLZ”.
        </p>
        <div className="max-w-md">
          <Label className="text-xs">Empresa</Label>
          <Select value={companyId ?? ""} onValueChange={(v) => setCompanyId(v)}>
            <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione uma empresa" /></SelectTrigger>
            <SelectContent>
              {(companies ?? []).map((c: any) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {!companyId && (
        <p className="text-center text-muted-foreground py-10 text-sm">
          Selecione uma empresa para ver e administrar a equipe vinculada.
        </p>
      )}

      {companyId && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: "Usuários", value: members?.length ?? 0 },
              { label: "Ativos", value: activeCount },
              { label: "Bloqueados", value: (members?.length ?? 0) - activeCount },
              {
                label: "Limite do plano",
                value: company?.max_users ? `${activeCount}/${company.max_users}` : "Sem limite",
              },
            ].map((s) => (
              <div key={s.label} className="stat-card flex flex-col gap-1">
                <span className="text-xs text-muted-foreground font-medium">{s.label}</span>
                <span className="text-xl font-bold">{s.value}</span>
              </div>
            ))}
          </div>

          <div className="bg-card border border-border rounded-xl p-4 space-y-2">
            <div className="flex items-center gap-2">
              <UserPlus size={15} className="text-primary" />
              <p className="text-xs font-semibold">Incluir usuário existente por e-mail</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                placeholder="usuario@empresa.com"
                value={addEmail}
                onChange={(e) => setAddEmail(e.target.value)}
                className="h-9 text-xs flex-1"
              />
              <Select value={addRole} onValueChange={setAddRole}>
                <SelectTrigger className="h-9 text-xs w-full sm:w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ASSIGNABLE_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>{COMPANY_ROLE_LABELS[r]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                className="h-9 text-xs"
                disabled={!canManage || !addEmail.trim() || addMemberMutation.isPending}
                onClick={() => addMemberMutation.mutate()}
              >
                Vincular
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Se a pessoa ainda não tem conta, use o código de convite da empresa ou o cadastro normal.
              Vincular um usuário nunca cria papel global da plataforma.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              placeholder="Buscar por nome ou e-mail"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 text-xs flex-1"
            />
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="h-9 text-xs w-full sm:w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os cargos</SelectItem>
                {Object.keys(COMPANY_ROLE_LABELS).map((r) => (
                  <SelectItem key={r} value={r}>{COMPANY_ROLE_LABELS[r]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 text-xs w-full sm:w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="active">Ativos</SelectItem>
                <SelectItem value="blocked">Bloqueados</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading && <p className="text-xs text-muted-foreground">Carregando equipe...</p>}
          {!isLoading && filtered.length === 0 && (
            <p className="text-center text-muted-foreground py-8 text-sm">Nenhum usuário encontrado nesta empresa.</p>
          )}

          <div className="space-y-2">
            {filtered.map((m: any) => {
              const active = m.is_active !== false;
              const isOwner = m.role === "owner";
              return (
                <div key={m.id} className="bg-card border border-border rounded-xl p-4">
                  <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm truncate">
                          {m.profile?.full_name || m.profile?.email || m.user_id.slice(0, 8)}
                        </span>
                        {isOwner && (
                          <Badge className="text-[10px] bg-primary/15 text-primary border-0 gap-1">
                            <Crown size={11} /> Proprietário
                          </Badge>
                        )}
                        {m.is_main_focal_point && (
                          <Badge variant="outline" className="text-[10px] border-primary text-primary gap-1">
                            <Star size={11} /> Ponto focal
                          </Badge>
                        )}
                        {active ? (
                          <Badge className="text-[10px] bg-accent/15 text-accent border-0">Ativo</Badge>
                        ) : (
                          <Badge variant="destructive" className="text-[10px]">Bloqueado</Badge>
                        )}
                        {!m.profile && (
                          <Badge variant="outline" className="text-[10px] border-warning text-warning">Sem perfil</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{m.profile?.email ?? "—"}</p>
                      <p className="text-[10px] text-muted-foreground">
                        Cargo: {COMPANY_ROLE_LABELS[m.role] ?? m.role}
                        {" • "}Entrada: {m.created_at ? new Date(m.created_at).toLocaleDateString("pt-BR") : "—"}
                        {" • "}Aprovação: {m.approved_at ? new Date(m.approved_at).toLocaleDateString("pt-BR") : "—"}
                        {" • "}Última atividade: {m.last_activity ? new Date(m.last_activity).toLocaleString("pt-BR") : "sem registro"}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {isOwner ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-[11px]"
                          disabled={!canManage}
                          onClick={() => setTransferMember(m)}
                        >
                          Transferir propriedade
                        </Button>
                      ) : (
                        <Select
                          value={m.role}
                          disabled={!canManage}
                          onValueChange={(v) => setRoleMutation.mutate({ memberId: m.id, role: v })}
                        >
                          <SelectTrigger className="h-8 text-[11px] w-36"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {ASSIGNABLE_ROLES.map((r) => (
                              <SelectItem key={r} value={r}>{COMPANY_ROLE_LABELS[r]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}

                      {!m.is_main_focal_point && active && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-[11px]"
                          disabled={!canManage}
                          onClick={() => setFocalMutation.mutate(m.id)}
                        >
                          Definir ponto focal
                        </Button>
                      )}

                      {!isOwner && (
                        <Button
                          size="sm"
                          variant="outline"
                          className={`h-8 text-[11px] ${active ? "text-destructive border-destructive/30" : "text-accent border-accent/40"}`}
                          disabled={!canManage}
                          title="Esta ação afeta somente o acesso a esta empresa."
                          onClick={() => setActiveMutation.mutate({ memberId: m.id, active: !active })}
                        >
                          {active ? "Bloquear nesta empresa" : "Reativar nesta empresa"}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
            <ShieldAlert size={13} /> Bloquear ou alterar cargo afeta somente o acesso a esta empresa. Conta,
            perfil e vínculos em outras empresas permanecem intactos.
          </p>
        </>
      )}

      <Dialog open={!!transferMember} onOpenChange={(o) => !o && setTransferMember(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Crown size={18} className="text-primary" /> Transferir propriedade</DialogTitle>
          </DialogHeader>
          <TransferOwnership
            members={members ?? []}
            currentOwner={owner}
            pending={transferMutation.isPending}
            onConfirm={(id) => transferMutation.mutate(id)}
            onCancel={() => setTransferMember(null)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TransferOwnership({
  members,
  currentOwner,
  pending,
  onConfirm,
  onCancel,
}: {
  members: any[];
  currentOwner: any;
  pending: boolean;
  onConfirm: (memberId: string) => void;
  onCancel: () => void;
}) {
  const [target, setTarget] = useState<string>("");
  const [confirmed, setConfirmed] = useState(false);
  const candidates = members.filter((m) => m.role !== "owner" && m.is_active !== false);

  return (
    <div className="space-y-4">
      <div className="bg-secondary rounded-lg p-3 text-xs">
        Proprietário atual: <strong>{currentOwner?.profile?.full_name || currentOwner?.profile?.email || "—"}</strong>
      </div>
      <div>
        <Label className="text-xs">Novo proprietário</Label>
        <Select value={target} onValueChange={setTarget}>
          <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Escolha um membro ativo" /></SelectTrigger>
          <SelectContent>
            {candidates.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.profile?.full_name || m.profile?.email || m.user_id.slice(0, 8)} — {COMPANY_ROLE_LABELS[m.role] ?? m.role}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {candidates.length === 0 && (
          <p className="text-[11px] text-warning mt-1">Nenhum outro membro ativo disponível.</p>
        )}
      </div>
      <div className="bg-warning/10 border border-warning/30 rounded-lg p-3 text-[11px] space-y-1">
        <p className="font-semibold flex items-center gap-1"><Users size={12} /> Impacto</p>
        <p>O proprietário atual passa a Administrador; o membro escolhido vira Proprietário. A empresa mantém exatamente um proprietário ativo. Nenhum papel global é alterado.</p>
      </div>
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
        Confirmo a transferência de propriedade desta empresa.
      </label>
      <div className="flex gap-3">
        <Button variant="outline" className="flex-1" onClick={onCancel}>Cancelar</Button>
        <Button className="flex-1" disabled={!target || !confirmed || pending} onClick={() => onConfirm(target)}>
          {pending ? "Transferindo..." : "Transferir"}
        </Button>
      </div>
    </div>
  );
}
