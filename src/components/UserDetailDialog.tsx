import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { sb, rpcOk } from "@/lib/db-any";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { friendlyError } from "@/lib/error-messages";
import { Crown, Link2, Star, Unlink, UserCheck, UserX, ShieldCheck } from "lucide-react";

/** Cargos EMPRESARIAIS — vivem apenas em company_members.role */
export const COMPANY_ROLE_LABELS: Record<string, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  supervisor: "Supervisor",
  member: "Operador",
};

export const ASSIGNABLE_COMPANY_ROLES = ["admin", "supervisor", "member"];

export interface UserMembership {
  membership_id: string;
  company_id: string;
  company: string;
  role: string;
  is_active: boolean;
  is_main_focal_point: boolean;
  joined_at: string;
}

export interface UserOverviewRow {
  id: string;
  email: string | null;
  full_name: string | null;
  account_type: string | null;
  is_approved: boolean;
  rejection_reason?: string | null;
  staff_activated_at: string | null;
  is_super_admin: boolean;
  is_staff_active: boolean;
  created_at: string;
  last_activity: string | null;
  companies: UserMembership[];
}

export function accountLabel(u: { account_type: string | null; companies: UserMembership[] }) {
  if (u.account_type === "llz_staff") return "Equipe LLZ";
  return u.companies.length === 0 ? "Cliente · Sem empresa" : "Cliente";
}

export function statusLabel(u: { is_approved: boolean; rejection_reason?: string | null }) {
  if (u.is_approved) return "Ativo";
  return u.rejection_reason ? "Bloqueado" : "Pendente";
}

interface Props {
  userId: string | null;
  onClose: () => void;
}

export default function UserDetailDialog({ userId, onClose }: Props) {
  const { isPlatformSuperAdmin, user } = useAuth();
  const queryClient = useQueryClient();
  const [linkCompanyId, setLinkCompanyId] = useState("");
  const [linkRole, setLinkRole] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-user-detail", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await sb.rpc("admin_user_detail", { _user_id: userId });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as UserOverviewRow;
    },
  });

  const { data: companies } = useQuery({
    queryKey: ["user-detail-companies"],
    queryFn: async () => {
      const { data, error } = await sb.from("companies").select("id,name").order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-user-detail", userId] });
    queryClient.invalidateQueries({ queryKey: ["admin-users-overview"] });
    queryClient.invalidateQueries({ queryKey: ["llz-staff-center"] });
    queryClient.invalidateQueries({ queryKey: ["users-center-members"] });
    queryClient.invalidateQueries({ queryKey: ["access-diagnostics"] });
  };

  const onError = (e: Error) =>
    toast({ title: "Não foi possível concluir", description: friendlyError(e), variant: "destructive" });

  const run = (name: string, args: Record<string, unknown>, title: string) =>
    rpcOk(name, args).then(() => {
      invalidate();
      toast({ title });
    });

  const mut = useMutation({
    mutationFn: async (job: { name: string; args: Record<string, unknown>; title: string }) =>
      run(job.name, job.args, job.title),
    onError,
    onSuccess: () => {
      setLinkCompanyId("");
      setLinkRole("");
    },
  });

  const u = data ?? null;
  const isSelf = !!u && u.id === user?.id;
  const linkedIds = new Set((u?.companies ?? []).map((c) => c.company_id));
  const linkable = (companies ?? []).filter((c) => !linkedIds.has(c.id));
  const isStaff = u?.account_type === "llz_staff";

  return (
    <Dialog open={!!userId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{u?.full_name || "Conta"}</DialogTitle>
          <DialogDescription>{u?.email}</DialogDescription>
        </DialogHeader>

        {isLoading && <p className="text-xs text-muted-foreground">Carregando conta...</p>}

        {u && (
          <div className="space-y-5">
            {/* Identidade */}
            <div className="flex flex-wrap gap-1">
              <Badge variant="outline" className="text-[10px]">{accountLabel(u)}</Badge>
              <Badge variant={u.is_approved ? "secondary" : "outline"} className="text-[10px]">
                {statusLabel(u)}
              </Badge>
              {u.is_super_admin && <Badge className="text-[10px] gap-1"><Crown size={11} /> Super Admin</Badge>}
              {isStaff && !u.is_staff_active && !u.is_super_admin && (
                <Badge variant="outline" className="text-[10px]">Aguardando ativação LLZ</Badge>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Cadastro: {new Date(u.created_at).toLocaleString("pt-BR")} • Última atividade:{" "}
              {u.last_activity ? new Date(u.last_activity).toLocaleString("pt-BR") : "sem registro"}
            </p>

            {/* Aprovação da conta */}
            <div className="flex gap-2 flex-wrap">
              {!u.is_approved ? (
                <Button
                  size="sm"
                  className="h-8 text-xs gap-1"
                  disabled={mut.isPending}
                  onClick={() =>
                    mut.mutate({
                      name: "account_set_approval",
                      args: { _user_id: u.id, _approved: true, _reason: null },
                      title: "Conta aprovada",
                    })
                  }
                >
                  <UserCheck size={14} /> Aprovar conta
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs gap-1"
                  disabled={mut.isPending || u.is_super_admin || isSelf}
                  title={u.is_super_admin ? "O Super Admin não pode ser bloqueado pela interface." : undefined}
                  onClick={() =>
                    mut.mutate({
                      name: "account_set_approval",
                      args: { _user_id: u.id, _approved: false, _reason: null },
                      title: "Conta bloqueada",
                    })
                  }
                >
                  <UserX size={14} /> Bloquear conta
                </Button>
              )}

              {/* Equipe LLZ */}
              {!isStaff && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs gap-1"
                  disabled={!isPlatformSuperAdmin || mut.isPending || u.companies.length > 0}
                  title={
                    u.companies.length > 0
                      ? "Contas vinculadas a empresa cliente não podem virar Equipe LLZ."
                      : undefined
                  }
                  onClick={() =>
                    mut.mutate({
                      name: "staff_add_existing_account",
                      args: { _user_id: u.id },
                      title: "Conta agora é Equipe LLZ",
                    })
                  }
                >
                  <Crown size={14} /> Tornar Equipe LLZ
                </Button>
              )}
              {isStaff && !u.is_staff_active && (
                <Button
                  size="sm"
                  className="h-8 text-xs gap-1"
                  disabled={!isPlatformSuperAdmin || mut.isPending}
                  onClick={() =>
                    mut.mutate({ name: "staff_activate", args: { _user_id: u.id }, title: "Membro LLZ ativado" })
                  }
                >
                  <ShieldCheck size={14} /> Ativar membro LLZ
                </Button>
              )}
              {isStaff && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs gap-1"
                  disabled={!isPlatformSuperAdmin || mut.isPending || u.is_super_admin || isSelf}
                  title={u.is_super_admin ? "O Super Admin não pode ser removido pela interface." : undefined}
                  onClick={() =>
                    mut.mutate({
                      name: "staff_remove",
                      args: { _user_id: u.id },
                      title: "Removido da Equipe LLZ — a conta continua existindo",
                    })
                  }
                >
                  <UserX size={14} /> Remover da Equipe LLZ
                </Button>
              )}
            </div>

            {/* Vínculos empresariais */}
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Empresas vinculadas</h4>
              {u.companies.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  {isStaff
                    ? "Nenhuma (esperado para Equipe LLZ)."
                    : "Cliente · Sem empresa — estado válido. Vincule uma empresa abaixo quando fizer sentido."}
                </p>
              )}
              {u.companies.map((m) => (
                <div key={m.membership_id} className="border border-border rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{m.company}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {COMPANY_ROLE_LABELS[m.role] ?? m.role}
                    </Badge>
                    <Badge variant={m.is_active ? "secondary" : "destructive"} className="text-[10px]">
                      {m.is_active ? "Vínculo ativo" : "Bloqueado na empresa"}
                    </Badge>
                    {m.is_main_focal_point && (
                      <Badge variant="outline" className="text-[10px] gap-1"><Star size={10} /> Ponto focal</Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 items-center">
                    {m.role === "owner" ? (
                      <span className="text-[11px] text-muted-foreground">
                        Proprietário: transfira a propriedade na aba “Usuários das Empresas” antes de desvincular.
                      </span>
                    ) : (
                      <Select
                        value={m.role}
                        disabled={mut.isPending}
                        onValueChange={(v) =>
                          mut.mutate({
                            name: "company_member_set_role",
                            args: { _company_id: m.company_id, _member_id: m.membership_id, _role: v },
                            title: "Cargo atualizado nesta empresa",
                          })
                        }
                      >
                        <SelectTrigger className="h-8 text-[11px] w-36"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {ASSIGNABLE_COMPANY_ROLES.map((r) => (
                            <SelectItem key={r} value={r}>{COMPANY_ROLE_LABELS[r]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}

                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-[11px]"
                      disabled={mut.isPending || m.is_main_focal_point || !m.is_active}
                      onClick={() =>
                        mut.mutate({
                          name: "company_member_set_focal",
                          args: { _company_id: m.company_id, _member_id: m.membership_id },
                          title: "Ponto focal atualizado",
                        })
                      }
                    >
                      <Star size={12} className="mr-1" /> Ponto focal
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-[11px]"
                      disabled={mut.isPending || m.role === "owner"}
                      onClick={() =>
                        mut.mutate({
                          name: "company_member_set_active",
                          args: {
                            _company_id: m.company_id,
                            _member_id: m.membership_id,
                            _active: !m.is_active,
                          },
                          title: m.is_active ? "Acesso bloqueado nesta empresa" : "Acesso reativado nesta empresa",
                        })
                      }
                    >
                      {m.is_active ? "Bloquear nesta empresa" : "Reativar nesta empresa"}
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-[11px] text-destructive border-destructive/30"
                      disabled={mut.isPending || m.role === "owner"}
                      title="A conta continuará existindo no sistema."
                      onClick={() =>
                        mut.mutate({
                          name: "company_member_unlink",
                          args: { _company_id: m.company_id, _member_id: m.membership_id },
                          title: "Empresa desvinculada — a conta continuará existindo no sistema",
                        })
                      }
                    >
                      <Unlink size={12} className="mr-1" /> Desvincular
                    </Button>
                  </div>
                </div>
              ))}
              <p className="text-[11px] text-muted-foreground">
                Desvincular remove apenas o vínculo com a empresa. <strong>A conta continuará existindo no
                sistema.</strong>
              </p>
            </div>

            {/* Vincular empresa */}
            {!isStaff && (
              <div className="border border-border rounded-lg p-3 space-y-2">
                <h4 className="text-sm font-semibold flex items-center gap-1"><Link2 size={14} /> Vincular empresa</h4>
                <div className="grid sm:grid-cols-3 gap-2">
                  <div className="space-y-1 sm:col-span-2">
                    <Label className="text-xs">Empresa</Label>
                    <Select value={linkCompanyId} onValueChange={setLinkCompanyId}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione a empresa" /></SelectTrigger>
                      <SelectContent>
                        {linkable.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Cargo</Label>
                    <Select value={linkRole} onValueChange={setLinkRole}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Cargo" /></SelectTrigger>
                      <SelectContent>
                        {ASSIGNABLE_COMPANY_ROLES.map((r) => (
                          <SelectItem key={r} value={r}>{COMPANY_ROLE_LABELS[r]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button
                  size="sm"
                  className="h-8 text-xs gap-1"
                  disabled={!linkCompanyId || !linkRole || mut.isPending}
                  onClick={() =>
                    mut.mutate({
                      name: "company_member_link",
                      args: { _company_id: linkCompanyId, _user_id: u.id, _role: linkRole },
                      title: "Empresa vinculada",
                    })
                  }
                >
                  <Link2 size={14} /> Vincular
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
