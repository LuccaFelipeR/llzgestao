import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { sb, rpcOk } from "@/lib/db-any";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { friendlyError } from "@/lib/error-messages";
import { Crown, Mail, ShieldCheck, UserX, Search, Plus } from "lucide-react";

interface StaffProfile {
  id: string;
  email: string | null;
  full_name: string | null;
  account_type: string | null;
  staff_activated_at: string | null;
  created_at: string;
}
interface InviteRow {
  id: string;
  email: string;
  full_name: string | null;
  status: string;
  created_at: string;
  expires_at: string;
}
interface MemberRow { user_id: string; companies: { name: string } | null }

interface Props {
  /** Abre a pessoa na Central de usuários. */
  onOpenUser?: (userId: string) => void;
}

export default function PlatformStaffCenter({ onOpenUser }: Props) {
  const { isPlatformSuperAdmin, user } = useAuth();
  const queryClient = useQueryClient();
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["llz-staff-center"],
    queryFn: async () => {
      const [profilesRes, invitesRes, superRes, membersRes] = await Promise.all([
        sb.from("profiles").select("id,email,full_name,account_type,staff_activated_at,created_at").order("created_at", { ascending: false }),
        sb.from("platform_staff_invites").select("id,email,full_name,status,created_at,expires_at").order("created_at", { ascending: false }),
        sb.from("user_roles").select("user_id, role"),
        sb.from("company_members").select("user_id, companies(name)"),
      ]);
      if (profilesRes.error) throw profilesRes.error;
      const superIds = new Set(
        ((superRes.data ?? []) as { user_id: string; role: string }[])
          .filter((r) => r.role === "super_admin" || r.role === "admin")
          .map((r) => r.user_id),
      );
      return {
        profiles: (profilesRes.data ?? []) as StaffProfile[],
        invites: (invitesRes.data ?? []) as InviteRow[],
        superIds,
        members: (membersRes.data ?? []) as MemberRow[],
      };
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["llz-staff-center"] });
    queryClient.invalidateQueries({ queryKey: ["admin-users-overview"] });
    queryClient.invalidateQueries({ queryKey: ["access-diagnostics"] });
  };

  const mut = useMutation({
    mutationFn: async (job: { name: string; args: Record<string, unknown>; title: string }) => {
      await rpcOk(job.name, job.args);
      return job.title;
    },
    onSuccess: (title) => {
      invalidate();
      setInviteEmail("");
      setInviteName("");
      toast({ title });
    },
    onError: (e: Error) =>
      toast({ title: "Não foi possível concluir", description: friendlyError(e), variant: "destructive" }),
  });

  const staff = useMemo(() => (data?.profiles ?? []).filter((p) => p.account_type === "llz_staff"), [data]);
  const active = staff.filter((p) => !!p.staff_activated_at || data?.superIds.has(p.id));
  const pending = staff.filter((p) => !p.staff_activated_at && !data?.superIds.has(p.id));
  const openInvites = (data?.invites ?? []).filter((i) => i.status !== "revoked" && i.status !== "activated");

  const memberIds = useMemo(
    () => new Set((data?.members ?? []).map((m) => m.user_id)),
    [data],
  );

  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return (data?.profiles ?? [])
      .filter((p) => p.account_type !== "llz_staff")
      .filter((p) => `${p.full_name ?? ""} ${p.email ?? ""}`.toLowerCase().includes(q))
      .slice(0, 8);
  }, [data, search]);

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Crown size={16} className="text-primary" /> Central da Equipe LLZ
        </h3>
        <p className="text-[11px] text-muted-foreground mt-1">
          A Equipe LLZ é um <strong>tipo de conta</strong>, não um conjunto de cargos. Todo membro ativo tem o mesmo
          acesso interno; apenas o Super Admin possui privilégios adicionais. Membro LLZ nunca é vinculado a empresa
          cliente.
        </p>
      </div>

      {isLoading && <p className="text-xs text-muted-foreground">Carregando equipe...</p>}

      {/* Membros ativos */}
      <section className="space-y-2">
        <h4 className="text-sm font-semibold">Membros ativos ({active.length})</h4>
        {active.length === 0 && <p className="text-xs text-muted-foreground">Nenhum membro ativo.</p>}
        {active.map((p) => {
          const isSuper = data?.superIds.has(p.id);
          return (
            <div key={p.id} className="bg-card border border-border rounded-xl p-3 flex flex-col sm:flex-row sm:items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{p.full_name || "Sem nome"}</p>
                <p className="text-xs text-muted-foreground truncate">{p.email}</p>
                <p className="text-[11px] text-muted-foreground">
                  Ativado em {p.staff_activated_at ? new Date(p.staff_activated_at).toLocaleString("pt-BR") : "—"}
                </p>
              </div>
              <div className="flex gap-1 flex-wrap items-center">
                <Badge variant="outline" className="text-[10px]">Equipe LLZ</Badge>
                {isSuper && <Badge className="text-[10px] gap-1"><Crown size={10} /> Super Admin</Badge>}
                {onOpenUser && (
                  <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => onOpenUser(p.id)}>
                    Abrir conta
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs gap-1"
                  disabled={!isPlatformSuperAdmin || isSuper || p.id === user?.id || mut.isPending}
                  title={isSuper ? "O Super Admin não pode ser removido pela interface." : undefined}
                  onClick={() =>
                    mut.mutate({
                      name: "staff_remove",
                      args: { _user_id: p.id },
                      title: "Removido da Equipe LLZ — a conta continua existindo",
                    })
                  }
                >
                  <UserX size={14} /> Remover da equipe
                </Button>
              </div>
            </div>
          );
        })}
      </section>

      {/* Aguardando ativação */}
      <section className="space-y-2">
        <h4 className="text-sm font-semibold">Aguardando ativação ({pending.length})</h4>
        {pending.length === 0 && <p className="text-xs text-muted-foreground">Ninguém aguardando ativação.</p>}
        {pending.map((p) => (
          <div key={p.id} className="bg-card border border-border rounded-xl p-3 flex flex-col sm:flex-row sm:items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{p.full_name || "Sem nome"}</p>
              <p className="text-xs text-muted-foreground truncate">{p.email}</p>
            </div>
            <Button
              size="sm"
              className="h-8 text-xs gap-1"
              disabled={!isPlatformSuperAdmin || mut.isPending}
              onClick={() =>
                mut.mutate({ name: "staff_activate", args: { _user_id: p.id }, title: "Membro LLZ ativado" })
              }
            >
              <ShieldCheck size={14} /> Ativar acesso interno
            </Button>
          </div>
        ))}
      </section>

      {/* Convites */}
      <section className="space-y-2">
        <h4 className="text-sm font-semibold">Convites ({openInvites.length})</h4>
        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          <div className="grid sm:grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">E-mail</Label>
              <Input
                className="h-9 text-sm"
                placeholder="pessoa@llz.com.br"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Nome (opcional)</Label>
              <Input
                className="h-9 text-sm"
                placeholder="Nome completo"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
              />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Nenhum cargo global é atribuído. A conta será criada como Equipe LLZ e precisará de ativação.
          </p>
          <Button
            size="sm"
            className="h-8 text-xs gap-1"
            disabled={!isPlatformSuperAdmin || !inviteEmail.trim() || mut.isPending}
            onClick={() =>
              mut.mutate({
                name: "staff_invite_create",
                args: { _email: inviteEmail.trim(), _full_name: inviteName.trim() || null },
                title: "Convite criado",
              })
            }
          >
            <Plus size={14} /> Criar convite
          </Button>
        </div>

        {openInvites.map((i) => (
          <div key={i.id} className="bg-card border border-border rounded-xl p-3 flex flex-col sm:flex-row sm:items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate flex items-center gap-1"><Mail size={13} /> {i.email}</p>
              <p className="text-[11px] text-muted-foreground">
                Status: {i.status} • expira em {new Date(i.expires_at).toLocaleDateString("pt-BR")}
              </p>
            </div>
            <div className="flex gap-1 flex-wrap">
              {i.status === "registered" && (
                <Button
                  size="sm"
                  className="h-8 text-xs gap-1"
                  disabled={!isPlatformSuperAdmin || mut.isPending}
                  onClick={() =>
                    mut.mutate({
                      name: "staff_invite_activate",
                      args: { _invite_id: i.id },
                      title: "Convite ativado",
                    })
                  }
                >
                  <ShieldCheck size={14} /> Ativar
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                disabled={!isPlatformSuperAdmin || mut.isPending}
                onClick={() =>
                  mut.mutate({ name: "staff_invite_revoke", args: { _invite_id: i.id }, title: "Convite revogado" })
                }
              >
                Revogar
              </Button>
            </div>
          </div>
        ))}
      </section>

      {/* Adicionar conta existente */}
      <section className="space-y-2">
        <h4 className="text-sm font-semibold">Adicionar conta existente à Equipe LLZ</h4>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8 h-9 text-sm"
            placeholder="Buscar conta de cliente por nome ou e-mail"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {candidates.map((p) => {
          const linked = memberIds.has(p.id);
          return (
            <div key={p.id} className="bg-card border border-border rounded-xl p-3 flex flex-col sm:flex-row sm:items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{p.full_name || "Sem nome"}</p>
                <p className="text-xs text-muted-foreground truncate">{p.email}</p>
                {linked && (
                  <p className="text-[11px] text-destructive">
                    Vinculada a empresa cliente — conversão bloqueada.
                  </p>
                )}
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs gap-1"
                disabled={!isPlatformSuperAdmin || linked || mut.isPending}
                onClick={() =>
                  mut.mutate({
                    name: "staff_add_existing_account",
                    args: { _user_id: p.id },
                    title: "Conta agora é Equipe LLZ",
                  })
                }
              >
                <Crown size={14} /> Tornar Equipe LLZ
              </Button>
            </div>
          );
        })}
      </section>
    </div>
  );
}
