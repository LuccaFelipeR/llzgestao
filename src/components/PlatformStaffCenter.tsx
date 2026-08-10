import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { sb, rpcOk } from "@/lib/db-any";
import { useAuth, PLATFORM_ROLE_LABEL } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Crown, Mail, Copy, Ban, CheckCircle2, UserPlus, Search, ShieldCheck, X } from "lucide-react";
import { friendlyError } from "@/lib/error-messages";

const GLOBAL_ROLE_KEYS = ["super_admin", "admin", "platform_admin", "support_agent", "developer"];
const SUPER_ROLES = ["super_admin", "admin"];

/** Papéis administráveis pela interface comum (super_admin e admin legado ficam de fora). */
export const MANAGEABLE_ROLES = [
  { value: "platform_admin", label: "Administrador da Plataforma" },
  { value: "support_agent", label: "Suporte" },
  { value: "developer", label: "Desenvolvedor" },
];

const INVITE_STATUS: Record<string, string> = {
  pending: "Aguardando criação da conta",
  registered: "Cadastro encontrado — aguardando ativação",
  active: "Ativo",
  expired: "Expirado",
  revoked: "Cancelado",
};

type Filter = "all" | "platform_admin" | "support_agent" | "developer" | "pending";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "platform_admin", label: "Administradores" },
  { key: "support_agent", label: "Suporte" },
  { key: "developer", label: "Desenvolvedores" },
  { key: "pending", label: "Aguardando ativação" },
];

interface RoleRow { id: string; user_id: string; role: string }
interface ProfileRow {
  id: string;
  email: string | null;
  full_name: string | null;
  account_type: string | null;
  is_approved: boolean;
  created_at: string;
  updated_at?: string | null;
}
interface MemberRow { user_id: string; companies: { name: string } | null }
interface InviteRow {
  id: string;
  email: string;
  full_name: string | null;
  intended_role: string;
  status: string;
  created_at: string;
  expires_at: string;
  registered_at: string | null;
}

export default function PlatformStaffCenter() {
  const { isPlatformSuperAdmin, user } = useAuth();
  const queryClient = useQueryClient();

  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [inviteRole, setInviteRole] = useState("support_agent");
  const [filter, setFilter] = useState<Filter>("all");

  // adicionar conta existente
  const [showAdd, setShowAdd] = useState(false);
  const [candidateSearch, setCandidateSearch] = useState("");
  const [candidateId, setCandidateId] = useState<string | null>(null);
  const [candidateRole, setCandidateRole] = useState("");

  // gerenciar acesso
  const [manageId, setManageId] = useState<string | null>(null);
  const [manageRole, setManageRole] = useState("support_agent");
  const [manageMode, setManageMode] = useState<"replace" | "add">("replace");

  // ativação de staff pendente
  const [activateRole, setActivateRole] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["llz-staff-center"],
    queryFn: async () => {
      const [profilesRes, rolesRes, membersRes, invitesRes] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at", { ascending: false }),
        supabase.from("user_roles").select("id, user_id, role"),
        sb.from("company_members").select("user_id, companies(name)"),
        sb.from("platform_staff_invites").select("*").order("created_at", { ascending: false }),
      ]);
      if (profilesRes.error) throw profilesRes.error;
      return {
        profiles: (profilesRes.data ?? []) as ProfileRow[],
        roles: ((rolesRes.data ?? []) as RoleRow[]).filter((r) => GLOBAL_ROLE_KEYS.includes(r.role)),
        members: (membersRes.data ?? []) as MemberRow[],
        invites: (invitesRes.data ?? []) as InviteRow[],
      };
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["llz-staff-center"] });
    queryClient.invalidateQueries({ queryKey: ["accounts-center"] });
    queryClient.invalidateQueries({ queryKey: ["access-diagnostics"] });
    queryClient.invalidateQueries({ queryKey: ["admin-profiles"] });
  };

  const onError = (e: Error) =>
    toast({ title: "Não foi possível concluir", description: friendlyError(e), variant: "destructive" });

  const createInvite = useMutation({
    mutationFn: async () =>
      rpcOk("staff_invite_create", { _email: email, _full_name: fullName, _role: inviteRole }),
    onSuccess: () => {
      setEmail(""); setFullName(""); invalidate();
      toast({ title: "Convite criado", description: "A pessoa aparece como aguardando criação da conta." });
    },
    onError,
  });

  const revokeInvite = useMutation({
    mutationFn: async (id: string) => rpcOk("staff_invite_revoke", { _invite_id: id }),
    onSuccess: () => { invalidate(); toast({ title: "Convite cancelado" }); },
    onError,
  });

  const activateInvite = useMutation({
    mutationFn: async (id: string) => rpcOk("staff_invite_activate", { _invite_id: id }),
    onSuccess: () => { invalidate(); toast({ title: "Membro ativado", description: "Papel global concedido." }); },
    onError,
  });

  const addExisting = useMutation({
    mutationFn: async (v: { userId: string; role: string }) =>
      rpcOk("staff_add_existing_account", { _user_id: v.userId, _role: v.role }),
    onSuccess: () => {
      setCandidateId(null); setCandidateSearch(""); setShowAdd(false); invalidate();
      toast({ title: "Conta adicionada à Equipe LLZ", description: "Nenhum vínculo empresarial foi criado." });
    },
    onError,
  });

  const applyRole = useMutation({
    mutationFn: async (v: { userId: string; role: string; mode: "replace" | "add" }) =>
      rpcOk("staff_role_apply", { _user_id: v.userId, _role: v.role, _mode: v.mode }),
    onSuccess: () => { setManageId(null); invalidate(); toast({ title: "Papel global atualizado" }); },
    onError,
  });

  const removeRole = useMutation({
    mutationFn: async (v: { userId: string; role: string }) =>
      rpcOk("staff_role_remove", { _user_id: v.userId, _role: v.role }),
    onSuccess: () => { invalidate(); toast({ title: "Papel removido" }); },
    onError,
  });

  const rows = useMemo(() => {
    if (!data) return [];
    return data.profiles.map((p) => ({
      ...p,
      roles: data.roles.filter((r) => r.user_id === p.id),
      companies: data.members.filter((m) => m.user_id === p.id).map((m) => m.companies?.name ?? "—"),
    }));
  }, [data]);

  const active = rows.filter((r) => r.account_type === "llz_staff" && r.roles.length > 0);
  const pending = rows.filter((r) => r.account_type === "llz_staff" && r.roles.length === 0);
  const invites = data?.invites ?? [];
  const pendingInvites = invites.filter((i) => i.status === "pending" || i.status === "registered");

  const filteredActive = active.filter((r) =>
    filter === "all" || filter === "pending" ? true : r.roles.some((x) => x.role === filter)
  );

  const candidates = rows
    .filter((r) => {
      const q = candidateSearch.trim().toLowerCase();
      if (q.length < 2) return false;
      if (r.account_type === "llz_staff" && r.roles.length > 0) return false;
      return `${r.full_name ?? ""} ${r.email ?? ""}`.toLowerCase().includes(q);
    })
    .slice(0, 8);

  const candidate = rows.find((r) => r.id === candidateId) ?? null;
  const managed = rows.find((r) => r.id === manageId) ?? null;
  const managedNext = managed
    ? manageMode === "replace"
      ? [...managed.roles.filter((r) => SUPER_ROLES.includes(r.role)).map((r) => r.role), manageRole]
      : Array.from(new Set([...managed.roles.map((r) => r.role), manageRole]))
    : [];

  const emailHasActiveStaff = active.some((a) => (a.email ?? "").toLowerCase() === email.trim().toLowerCase());

  return (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Crown size={16} className="text-primary" /> Equipe LLZ — acessos da plataforma
        </h3>
        <p className="text-[11px] text-muted-foreground mt-1">
          Somente papéis GLOBAIS (<code>user_roles</code>). Cargos de empresa ficam em “Usuários das Empresas”.
          Membro LLZ não precisa de empresa vinculada.
        </p>
        <div className="grid grid-cols-3 gap-2 mt-3">
          {[
            { label: "Membros ativos", value: active.length },
            { label: "Aguardando ativação", value: pending.length },
            { label: "Convites pendentes", value: pendingInvites.length },
          ].map((k) => (
            <div key={k.label} className="bg-secondary rounded-lg p-3 text-center">
              <p className="text-lg font-semibold">{k.value}</p>
              <p className="text-[10px] text-muted-foreground">{k.label}</p>
            </div>
          ))}
        </div>
      </div>

      {!isPlatformSuperAdmin && (
        <p className="text-[11px] text-muted-foreground">
          Apenas o super administrador pode convidar, ativar ou alterar papéis globais.
        </p>
      )}

      {/* Adicionar conta existente */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h4 className="font-semibold text-sm flex items-center gap-2">
            <ShieldCheck size={15} /> Adicionar conta existente
          </h4>
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setShowAdd((v) => !v)}>
            {showAdd ? "Fechar" : "Abrir"}
          </Button>
        </div>
        {showAdd && (
          <div className="space-y-3">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-8 h-9 text-sm"
                placeholder="Buscar conta existente por nome ou e-mail"
                value={candidateSearch}
                onChange={(e) => { setCandidateSearch(e.target.value); setCandidateId(null); }}
              />
            </div>

            {candidateSearch.trim().length >= 2 && candidates.length === 0 && (
              <p className="text-xs text-muted-foreground">Nenhuma conta encontrada.</p>
            )}

            <div className="space-y-1">
              {candidates.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setCandidateId(c.id)}
                  className={`w-full text-left border rounded-lg p-3 text-xs transition-colors ${
                    candidateId === c.id ? "border-primary bg-primary/5" : "border-border hover:bg-secondary"
                  }`}
                >
                  <p className="font-medium text-sm">{c.full_name || "Sem nome"}</p>
                  <p className="text-muted-foreground">{c.email}</p>
                  <p className="text-muted-foreground">
                    Tipo atual: {c.account_type === "llz_staff" ? "Equipe LLZ" : "Cliente"} • Empresas:{" "}
                    {c.companies.length > 0 ? c.companies.join(", ") : "Nenhuma"} • Papéis globais:{" "}
                    {c.roles.length > 0 ? c.roles.map((r) => PLATFORM_ROLE_LABEL[r.role] ?? r.role).join(", ") : "Nenhum"}
                  </p>
                </button>
              ))}
            </div>

            {candidate && (
              <div className="border border-border rounded-lg p-3 space-y-2">
                <div className="space-y-1 max-w-xs">
                  <Label className="text-xs">Papel LLZ</Label>
                  <Select value={candidateRole} onValueChange={setCandidateRole}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione o cargo" /></SelectTrigger>
                    <SelectContent>
                      {MANAGEABLE_ROLES.map((r) => (
                        <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {candidate.companies.length > 0 ? (
                  <p className="text-xs text-destructive">
                    Esta conta ainda possui vínculo com empresa cliente ({candidate.companies.join(", ")}). Remova ou
                    regularize os vínculos antes de transformá-la em membro da Equipe LLZ.
                  </p>
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    Resumo: <strong>{candidate.email}</strong> passará a ser <strong>Equipe LLZ</strong> com o papel{" "}
                    <strong>{MANAGEABLE_ROLES.find((r) => r.value === candidateRole)?.label ?? "— selecione o cargo"}</strong>.
                    Nenhuma empresa será criada ou vinculada.
                  </p>
                )}
                <Button
                  size="sm"
                  className="h-8 text-xs gap-1"
                  disabled={
                    !isPlatformSuperAdmin || !candidateRole || candidate.companies.length > 0 || addExisting.isPending
                  }
                  onClick={() => addExisting.mutate({ userId: candidate.id, role: candidateRole })}
                >
                  <CheckCircle2 size={14} /> Confirmar adição à Equipe LLZ
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Convidar novo membro */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <h4 className="font-semibold text-sm flex items-center gap-2"><UserPlus size={15} /> Convidar novo membro</h4>
        <div className="grid sm:grid-cols-3 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Nome (opcional)</Label>
            <Input className="h-9 text-sm" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">E-mail</Label>
            <Input className="h-9 text-sm" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Papel global previsto</Label>
            <Select value={inviteRole} onValueChange={setInviteRole}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MANAGEABLE_ROLES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {emailHasActiveStaff && (
          <p className="text-xs text-destructive">
            Este e-mail já pertence a um membro ativo da Equipe LLZ. Use “Gerenciar acesso”.
          </p>
        )}
        <Button
          size="sm"
          className="h-8 text-xs gap-1"
          disabled={!isPlatformSuperAdmin || !email.trim() || emailHasActiveStaff || createInvite.isPending}
          onClick={() => createInvite.mutate()}
        >
          <Mail size={14} /> Criar convite
        </Button>
      </div>

      {/* Filtros */}
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

      {isLoading && <p className="text-xs text-muted-foreground">Carregando equipe...</p>}

      {/* Membros ativos */}
      {filter !== "pending" && (
        <div className="space-y-2">
          <h4 className="font-semibold text-sm">Membros ativos</h4>
          {filteredActive.length === 0 && (
            <p className="text-xs text-muted-foreground">Nenhum membro nesta visão.</p>
          )}
          {filteredActive.map((p) => {
            const isSuper = p.roles.some((r) => SUPER_ROLES.includes(r.role));
            return (
              <div key={p.id} className="bg-card border border-border rounded-xl p-4 space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm truncate">{p.full_name || "Sem nome"}</p>
                    <p className="text-xs text-muted-foreground truncate">{p.email}</p>
                    <p className="text-[11px] text-muted-foreground">
                      Equipe LLZ desde {new Date(p.created_at).toLocaleDateString("pt-BR")} • Empresa: Nenhuma •
                      Última atividade registrada:{" "}
                      {p.updated_at ? new Date(p.updated_at).toLocaleDateString("pt-BR") : "—"}
                    </p>
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    <Badge variant="outline" className="text-[10px]">Equipe LLZ</Badge>
                    <Badge variant={p.is_approved ? "secondary" : "outline"} className="text-[10px]">
                      {p.is_approved ? "Ativa" : "Bloqueada"}
                    </Badge>
                    {isSuper && <Badge className="text-[10px]">Super Admin</Badge>}
                    {p.roles.map((r) => (
                      <Badge key={r.id} variant="secondary" className="text-[10px]">
                        {PLATFORM_ROLE_LABEL[r.role] ?? r.role}
                      </Badge>
                    ))}
                  </div>
                </div>

                {isSuper ? (
                  <p className="text-[11px] text-muted-foreground">
                    Conta de super administrador: alterações exigem fluxo administrativo específico.
                  </p>
                ) : (
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      disabled={!isPlatformSuperAdmin || p.id === user?.id}
                      onClick={() => {
                        setManageId(manageId === p.id ? null : p.id);
                        setManageRole(p.roles[0]?.role ?? "support_agent");
                        setManageMode("replace");
                      }}
                    >
                      Gerenciar acesso
                    </Button>
                  </div>
                )}

                {manageId === p.id && managed && (
                  <div className="border border-border rounded-lg p-3 space-y-2">
                    <div className="grid sm:grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Novo papel</Label>
                        <Select value={manageRole} onValueChange={setManageRole}>
                          <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {MANAGEABLE_ROLES.map((r) => (
                              <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Modo</Label>
                        <Select value={manageMode} onValueChange={(v) => setManageMode(v as "replace" | "add")}>
                          <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="replace">Substituir papéis atuais</SelectItem>
                            <SelectItem value="add">Adicionar papel</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Papéis atuais: {managed.roles.map((r) => PLATFORM_ROLE_LABEL[r.role] ?? r.role).join(", ") || "Nenhum"}
                      <br />
                      Papéis após alteração:{" "}
                      {managedNext.map((r) => PLATFORM_ROLE_LABEL[r] ?? r).join(", ")}
                    </p>
                    <div className="flex gap-2 flex-wrap">
                      <Button
                        size="sm"
                        className="h-8 text-xs gap-1"
                        disabled={!isPlatformSuperAdmin || applyRole.isPending}
                        onClick={() => applyRole.mutate({ userId: p.id, role: manageRole, mode: manageMode })}
                      >
                        <CheckCircle2 size={14} /> Confirmar alteração
                      </Button>
                      {managed.roles
                        .filter((r) => !SUPER_ROLES.includes(r.role))
                        .map((r) => (
                          <Button
                            key={r.id}
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs gap-1"
                            disabled={!isPlatformSuperAdmin || removeRole.isPending}
                            onClick={() => removeRole.mutate({ userId: p.id, role: r.role })}
                          >
                            <X size={14} /> Remover {PLATFORM_ROLE_LABEL[r.role] ?? r.role}
                          </Button>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Aguardando ativação */}
      <div className="space-y-2">
        <h4 className="font-semibold text-sm">Aguardando ativação</h4>
        {pending.length === 0 && (
          <p className="text-xs text-muted-foreground">Nenhuma conta aguardando ativação.</p>
        )}
        {pending.map((p) => {
          const invite = invites.find(
            (i) => (i.email ?? "").toLowerCase() === (p.email ?? "").toLowerCase() && i.status === "registered"
          );
          const role = activateRole[p.id] ?? invite?.intended_role ?? "support_agent";
          return (
            <div key={p.id} className="bg-card border border-border rounded-xl p-4 space-y-2">
              <div className="min-w-0">
                <p className="font-semibold text-sm truncate">{p.full_name || "Sem nome"}</p>
                <p className="text-xs text-muted-foreground truncate">{p.email}</p>
                <p className="text-[11px] text-muted-foreground">
                  {invite ? "Cadastro encontrado (convite LLZ)" : "Ativação administrativa da conta existente"} •
                  Cadastro em {new Date(p.created_at).toLocaleDateString("pt-BR")}
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
                <div className="space-y-1 max-w-xs w-full">
                  <Label className="text-xs">Papel global</Label>
                  <Select value={role} onValueChange={(v) => setActivateRole((s) => ({ ...s, [p.id]: v }))}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MANAGEABLE_ROLES.map((r) => (
                        <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  size="sm"
                  className="h-8 text-xs gap-1"
                  disabled={!isPlatformSuperAdmin || applyRole.isPending || activateInvite.isPending}
                  onClick={() =>
                    invite && role === invite.intended_role
                      ? activateInvite.mutate(invite.id)
                      : applyRole.mutate({ userId: p.id, role, mode: "replace" })
                  }
                >
                  <CheckCircle2 size={14} /> Ativar membro
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Convites */}
      <div className="space-y-2">
        <h4 className="font-semibold text-sm">Convites</h4>
        {invites.length === 0 && <p className="text-xs text-muted-foreground">Nenhum convite registrado.</p>}
        {invites.map((i) => (
          <div key={i.id} className="bg-card border border-border rounded-xl p-4 space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-sm truncate">{i.full_name || "Sem nome"}</p>
                <p className="text-xs text-muted-foreground truncate">{i.email}</p>
              </div>
              <div className="flex gap-1 flex-wrap">
                <Badge variant="outline" className="text-[10px]">
                  {PLATFORM_ROLE_LABEL[i.intended_role] ?? i.intended_role}
                </Badge>
                <Badge variant="secondary" className="text-[10px]">{INVITE_STATUS[i.status] ?? i.status}</Badge>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Enviado em {new Date(i.created_at).toLocaleDateString("pt-BR")} • Validade{" "}
              {new Date(i.expires_at).toLocaleDateString("pt-BR")}
            </p>
            <div className="flex gap-2 flex-wrap">
              {i.status === "pending" && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs gap-1"
                  onClick={() => {
                    navigator.clipboard.writeText(
                      `${window.location.origin}/login?email=${encodeURIComponent(i.email)}`
                    );
                    toast({ title: "Link copiado", description: "A pessoa deve se cadastrar com este e-mail." });
                  }}
                >
                  <Copy size={14} /> Copiar link
                </Button>
              )}
              {i.status === "registered" && (
                <Button
                  size="sm"
                  className="h-8 text-xs gap-1"
                  disabled={!isPlatformSuperAdmin || activateInvite.isPending}
                  onClick={() => activateInvite.mutate(i.id)}
                >
                  <CheckCircle2 size={14} /> Ativar membro
                </Button>
              )}
              {(i.status === "pending" || i.status === "registered") && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs gap-1"
                  disabled={!isPlatformSuperAdmin || revokeInvite.isPending}
                  onClick={() => revokeInvite.mutate(i.id)}
                >
                  <Ban size={14} /> Cancelar convite
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
