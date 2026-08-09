import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, PLATFORM_ROLE_LABEL } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Crown, Mail, Copy, Ban, CheckCircle2, UserPlus } from "lucide-react";
import { friendlyError } from "@/lib/error-messages";

const GLOBAL_ROLE_KEYS = ["super_admin", "admin", "platform_admin", "support_agent", "developer"];

const INVITE_ROLES = [
  { value: "platform_admin", label: "Administrador da Plataforma" },
  { value: "support_agent", label: "Suporte" },
  { value: "developer", label: "Desenvolvedor" },
];

const INVITE_STATUS: Record<string, string> = {
  pending: "Aguardando cadastro",
  registered: "Cadastro concluído — aguardando ativação",
  active: "Ativo",
  expired: "Expirado",
  revoked: "Cancelado",
};

interface StaffRoleRow { id: string; user_id: string; role: string }
interface StaffProfileRow {
  id: string;
  email: string | null;
  full_name: string | null;
  created_at: string;
  roles: StaffRoleRow[];
}
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
  const { isPlatformSuperAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("support_agent");

  const { data: staff } = useQuery({
    queryKey: ["llz-staff-members"],
    queryFn: async () => {
      const [profilesRes, rolesRes] = await Promise.all([
        supabase.from("profiles").select("*"),
        supabase.from("user_roles").select("id, user_id, role"),
      ]);
      if (profilesRes.error) throw profilesRes.error;
      const roles = ((rolesRes.data ?? []) as StaffRoleRow[]).filter((r) => GLOBAL_ROLE_KEYS.includes(r.role));
      return ((profilesRes.data ?? []) as Omit<StaffProfileRow, "roles">[])
        .map((p) => ({ ...p, roles: roles.filter((r) => r.user_id === p.id) }))
        .filter((p) => p.roles.length > 0) as StaffProfileRow[];
    },
  });

  const { data: invites } = useQuery({
    queryKey: ["llz-staff-invites"],
    queryFn: async () => {
      const { data, error } = await sb
        .from("platform_staff_invites")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as InviteRow[];
    },
  });


  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["llz-staff-invites"] });
    queryClient.invalidateQueries({ queryKey: ["llz-staff-members"] });
    queryClient.invalidateQueries({ queryKey: ["accounts-center"] });
    queryClient.invalidateQueries({ queryKey: ["access-diagnostics"] });
  };

  const createInvite = useMutation({
    mutationFn: async () =>
      runRpc("staff_invite_create", { _email: email, _full_name: fullName, _role: role }, "Convite criado")(),
    onSuccess: () => {
      setEmail("");
      setFullName("");
      invalidate();
      toast({ title: "Convite criado", description: "A pessoa aparece como aguardando cadastro." });
    },
    onError: (e: Error) => toast({ title: "Erro", description: friendlyError(e), variant: "destructive" }),
  });

  const revokeInvite = useMutation({
    mutationFn: async (id: string) => runRpc("staff_invite_revoke", { _invite_id: id }, "ok")(),
    onSuccess: () => { invalidate(); toast({ title: "Convite cancelado" }); },
    onError: (e: Error) => toast({ title: "Erro", description: friendlyError(e), variant: "destructive" }),
  });

  const activateInvite = useMutation({
    mutationFn: async (id: string) => runRpc("staff_invite_activate", { _invite_id: id }, "ok")(),
    onSuccess: () => { invalidate(); toast({ title: "Membro ativado", description: "Papel global concedido." }); },
    onError: (e: Error) => toast({ title: "Erro", description: friendlyError(e), variant: "destructive" }),
  });

  function copyLink(inviteEmail: string) {
    const link = `${window.location.origin}/login?email=${encodeURIComponent(inviteEmail)}`;
    navigator.clipboard.writeText(link);
    toast({ title: "Link copiado", description: "A pessoa deve se cadastrar com exatamente este e-mail." });
  }

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
      </div>

      {/* Convidar */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <h4 className="font-semibold text-sm flex items-center gap-2"><UserPlus size={15} /> Convidar membro</h4>
        {!isPlatformSuperAdmin && (
          <p className="text-[11px] text-muted-foreground">Apenas o super administrador pode criar convites.</p>
        )}
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
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {INVITE_ROLES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button
          size="sm"
          className="h-8 text-xs gap-1"
          disabled={!isPlatformSuperAdmin || !email.trim() || createInvite.isPending}
          onClick={() => createInvite.mutate()}
        >
          <Mail size={14} /> Criar convite
        </Button>
      </div>

      {/* Convites */}
      <div className="space-y-2">
        <h4 className="font-semibold text-sm">Convites</h4>
        {(invites ?? []).length === 0 && (
          <p className="text-xs text-muted-foreground">Nenhum convite registrado.</p>
        )}
        {(invites ?? []).map((i) => (
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
              {new Date(i.expires_at).toLocaleDateString("pt-BR")} • Cadastro{" "}
              {i.registered_at ? "realizado" : "não realizado"}
            </p>
            <div className="flex gap-2 flex-wrap">
              {i.status === "pending" && (
                <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => copyLink(i.email)}>
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

      {/* Membros ativos */}
      <div className="space-y-2">
        <h4 className="font-semibold text-sm">Membros ativos</h4>
        {(staff ?? []).length === 0 && (
          <p className="text-xs text-muted-foreground">Nenhum usuário com papel global cadastrado.</p>
        )}
        {(staff ?? []).map((p: any) => (
          <div key={p.id} className="bg-card border border-border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm truncate">{p.full_name || "Sem nome"}</p>
              <p className="text-xs text-muted-foreground truncate">{p.email}</p>
              <p className="text-[11px] text-muted-foreground">
                Na equipe desde {new Date(p.created_at).toLocaleDateString("pt-BR")} • Empresa: Nenhuma
              </p>
            </div>
            <div className="flex gap-1 flex-wrap">
              <Badge variant="outline" className="text-[10px]">Equipe LLZ</Badge>
              {p.roles.map((r: any) => (
                <Badge key={r.id} variant="secondary" className="text-[10px]">
                  {PLATFORM_ROLE_LABEL[r.role] ?? r.role}
                </Badge>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
