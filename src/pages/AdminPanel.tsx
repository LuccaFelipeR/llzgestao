import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Shield, UserCheck, UserX, Users, Activity, Package, MapPin, Boxes, Clock, TrendingUp, ClipboardCheck, Trash2, Settings2, AlertTriangle, Building2, RefreshCw, Copy, BarChart3, Pencil, Ban, PlayCircle, Archive, RotateCcw } from "lucide-react";
import OperationalAudit from "@/components/OperationalAudit";
import { friendlyError } from "@/lib/error-messages";

const ROLE_LABELS: Record<string, string> = {
  operator: "Operador",
  supervisor: "Supervisor",
  admin: "Administrador",
};

const ALL_TABS = [
  { key: "dashboard", label: "Início" },
  { key: "scanner", label: "Scanner" },
  { key: "produtos", label: "Produtos" },
  { key: "enderecos", label: "Endereços" },
  { key: "movimentacoes", label: "Movimentações" },
  { key: "estoque", label: "Estoque" },
  { key: "ai-insights", label: "IA Insights" },
  { key: "onboarding", label: "Importar" },
  { key: "notificacoes", label: "Alertas" },
  { key: "recebimento", label: "Recebimento" },
];

export default function AdminPanel() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"users" | "activity" | "audit" | "system" | "companies">("users");
  const [permDialogUser, setPermDialogUser] = useState<any>(null);
  const [deleteDialogUser, setDeleteDialogUser] = useState<any>(null);
  const [editCompany, setEditCompany] = useState<any>(null);
  const [editCompanyName, setEditCompanyName] = useState("");
  const [deleteCompany, setDeleteCompany] = useState<any>(null);
  const [showAbc, setShowAbc] = useState(false);
  const [companyStatusFilter, setCompanyStatusFilter] = useState<string>("all");
  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [newMemberRole, setNewMemberRole] = useState("member");

  const { data: profiles } = useQuery({
    queryKey: ["admin-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: allRoles } = useQuery({
    queryKey: ["admin-roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("*");
      if (error) throw error;
      return data;
    },
  });

  const { data: allPermissions } = useQuery({
    queryKey: ["admin-tab-permissions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_tab_permissions").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: activities } = useQuery({
    queryKey: ["admin-activity"],
    enabled: tab === "activity",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activity_log")
        .select("*, profiles:user_id(email, full_name)")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  const { data: companiesList } = useQuery({
    queryKey: ["admin-companies"],
    enabled: tab === "companies",
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("companies")
        .select("*, company_members(id, user_id, role, is_main_focal_point, is_active, approved_at, blocked_at)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Load company details + members + profiles when a company is opened
  const { data: companyMembers } = useQuery({
    queryKey: ["admin-company-members", editCompany?.id],
    enabled: !!editCompany?.id,
    queryFn: async () => {
      const { data: members } = await (supabase as any)
        .from("company_members")
        .select("*")
        .eq("company_id", editCompany.id);
      const ids = (members ?? []).map((m: any) => m.user_id);
      if (ids.length === 0) return [];
      const { data: profs } = await supabase.from("profiles").select("id,email,full_name,is_approved").in("id", ids);
      return (members ?? []).map((m: any) => ({ ...m, profile: profs?.find((p) => p.id === m.user_id) }));
    },
  });

  const setFocalPointMutation = useMutation({
    mutationFn: async ({ memberId, companyId }: { memberId: string; companyId: string }) => {
      // Trigger handles uniqueness; just flag this one as main
      const { error } = await (supabase as any)
        .from("company_members")
        .update({ is_main_focal_point: true })
        .eq("id", memberId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-company-members"] });
      queryClient.invalidateQueries({ queryKey: ["admin-companies"] });
      toast({ title: "Focal point definido" });
    },
    onError: (e: Error) => toast({ title: "Erro", description: friendlyError(e), variant: "destructive" }),
  });

  const toggleMemberActiveMutation = useMutation({
    mutationFn: async ({ memberId, active }: { memberId: string; active: boolean }) => {
      const { error } = await (supabase as any)
        .from("company_members")
        .update({ is_active: active, blocked_at: active ? null : new Date().toISOString() })
        .eq("id", memberId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-company-members"] });
      toast({ title: "Membro atualizado" });
    },
    onError: (e: Error) => toast({ title: "Erro", description: friendlyError(e), variant: "destructive" }),
  });

  const addMemberByEmailMutation = useMutation({
    mutationFn: async ({ companyId, email, role }: { companyId: string; email: string; role: string }) => {
      const clean = email.trim().toLowerCase();
      if (!clean) throw new Error("Informe o e-mail.");
      const { data: prof } = await supabase.from("profiles").select("id,email").eq("email", clean).maybeSingle();
      if (!prof) throw new Error("Nenhum usuário com este e-mail encontrado.");
      const { data: existing } = await (supabase as any).from("company_members").select("id").eq("company_id", companyId).eq("user_id", prof.id).maybeSingle();
      if (existing) throw new Error("Usuário já vinculado a esta empresa.");
      const { error } = await (supabase as any).from("company_members").insert({ company_id: companyId, user_id: prof.id, role });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-company-members"] });
      queryClient.invalidateQueries({ queryKey: ["admin-companies"] });
      toast({ title: "Usuário vinculado" });
    },
    onError: (e: Error) => toast({ title: "Erro", description: friendlyError(e), variant: "destructive" }),
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await (supabase as any).from("company_members").delete().eq("id", memberId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-company-members"] });
      queryClient.invalidateQueries({ queryKey: ["admin-companies"] });
      toast({ title: "Vínculo removido" });
    },
    onError: (e: Error) => toast({ title: "Erro", description: friendlyError(e), variant: "destructive" }),
  });

  const changeMemberRoleMutation = useMutation({
    mutationFn: async ({ memberId, role }: { memberId: string; role: string }) => {
      const { error } = await (supabase as any).from("company_members").update({ role }).eq("id", memberId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-company-members"] });
      toast({ title: "Papel atualizado" });
    },
    onError: (e: Error) => toast({ title: "Erro", description: friendlyError(e), variant: "destructive" }),
  });

  const updateCompanyDetailsMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: any }) => {
      const { error } = await (supabase as any)
        .from("companies")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-companies"] });
      toast({ title: "Empresa atualizada" });
    },
    onError: (e: Error) => toast({ title: "Erro", description: friendlyError(e), variant: "destructive" }),
  });

  const regenerateCodeMutation = useMutation({
    mutationFn: async (companyId: string) => {
      const newCode = Math.random().toString(36).substring(2, 10);
      const { error } = await (supabase as any).from("companies").update({ invite_code: newCode }).eq("id", companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-companies"] });
      toast({ title: "Código regenerado" });
    },
    onError: (e: Error) => toast({ title: "Erro", description: friendlyError(e), variant: "destructive" }),
  });

  const updateCompanyMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await (supabase as any).from("companies").update({ name, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-companies"] });
      toast({ title: "Empresa atualizada" });
      setEditCompany(null);
    },
    onError: (e: Error) => toast({ title: "Erro", description: friendlyError(e), variant: "destructive" }),
  });

  const setCompanyStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await (supabase as any)
        .from("companies")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      queryClient.invalidateQueries({ queryKey: ["admin-companies"] });
      const label = v.status === "active" ? "reativada" : v.status === "blocked" ? "bloqueada" : v.status === "inactive" ? "desativada" : "atualizada";
      toast({ title: `Empresa ${label}` });
    },
    onError: (e: Error) => toast({ title: "Erro", description: friendlyError(e), variant: "destructive" }),
  });

  const deleteCompanyMutation = useMutation({
    mutationFn: async (companyId: string) => {
      const { error } = await (supabase as any).from("companies").delete().eq("id", companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-companies"] });
      toast({ title: "Empresa excluída" });
      setDeleteCompany(null);
    },
    onError: (e: Error) => toast({ title: "Não foi possível excluir", description: friendlyError(e), variant: "destructive" }),
  });

  // ABC curve for users — based on their movement activity counts
  const { data: userAbc } = useQuery({
    queryKey: ["admin-user-abc"],
    enabled: showAbc,
    queryFn: async () => {
      const { data } = await supabase.from("activity_log").select("user_id").not("user_id", "is", null);
      const counts: Record<string, number> = {};
      (data ?? []).forEach((r: any) => { counts[r.user_id] = (counts[r.user_id] ?? 0) + 1; });
      const arr = Object.entries(counts).map(([user_id, count]) => ({ user_id, count }));
      arr.sort((a, b) => b.count - a.count);
      const total = arr.reduce((s, r) => s + r.count, 0) || 1;
      let acc = 0;
      return arr.map((r) => {
        acc += r.count;
        const pct = (acc / total) * 100;
        const cls = pct <= 70 ? "A" : pct <= 90 ? "B" : "C";
        return { ...r, pct, cls };
      });
    },
  });
  const { data: systemStats } = useQuery({
    queryKey: ["admin-system-stats"],
    enabled: tab === "system",
    queryFn: async () => {
      const [products, addresses, stock, movements, lots] = await Promise.all([
        supabase.from("products").select("id", { count: "exact", head: true }),
        supabase.from("addresses").select("id", { count: "exact", head: true }),
        supabase.from("stock_balance").select("qty").gt("qty", 0),
        supabase.from("movements").select("id", { count: "exact", head: true }),
        supabase.from("lots").select("id", { count: "exact", head: true }),
      ]);
      const totalQty = stock.data?.reduce((s, r) => s + Number(r.qty), 0) ?? 0;
      return {
        products: products.count ?? 0,
        addresses: addresses.count ?? 0,
        totalQty,
        movements: movements.count ?? 0,
        lots: lots.count ?? 0,
        stockPositions: stock.data?.length ?? 0,
      };
    },
  });

  const approveMutation = useMutation({
    mutationFn: async ({ userId, approved }: { userId: string; approved: boolean }) => {
      const { error } = await supabase.from("profiles").update({ is_approved: approved, updated_at: new Date().toISOString() }).eq("id", userId);
      if (error) throw error;
      if (approved) {
        const existing = allRoles?.find((r) => r.user_id === userId);
        if (!existing) {
          await supabase.from("user_roles").insert({ user_id: userId, role: "operator" });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["admin-roles"] });
      toast({ title: "Usuário atualizado" });
    },
    onError: (e: Error) => toast({ title: "Erro", description: friendlyError(e), variant: "destructive" }),
  });

  const roleMutation = useMutation({
    mutationFn: async ({ userId, newRole }: { userId: string; newRole: string }) => {
      await supabase.from("user_roles").delete().eq("user_id", userId);
      const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: newRole as any });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-roles"] });
      toast({ title: "Papel atualizado" });
    },
    onError: (e: Error) => toast({ title: "Erro", description: friendlyError(e), variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (userId: string) => {
      // Delete user_roles, tab_permissions, company_members, profile
      await Promise.all([
        supabase.from("user_roles").delete().eq("user_id", userId),
        supabase.from("user_tab_permissions").delete().eq("user_id", userId),
        supabase.from("company_members").delete().eq("user_id", userId),
      ]);
      const { error } = await supabase.from("profiles").delete().eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["admin-roles"] });
      queryClient.invalidateQueries({ queryKey: ["admin-tab-permissions"] });
      toast({ title: "Usuário excluído" });
      setDeleteDialogUser(null);
    },
    onError: (e: Error) => toast({ title: "Erro ao excluir", description: friendlyError(e), variant: "destructive" }),
  });

  const permMutation = useMutation({
    mutationFn: async ({ userId, tabKey, allowed }: { userId: string; tabKey: string; allowed: boolean }) => {
      if (allowed) {
        // Remove restriction (delete the row or upsert with true)
        await supabase.from("user_tab_permissions").delete().eq("user_id", userId).eq("tab_key", tabKey);
      } else {
        // Block: upsert with is_allowed = false
        const { error } = await supabase.from("user_tab_permissions").upsert(
          { user_id: userId, tab_key: tabKey, is_allowed: false },
          { onConflict: "user_id,tab_key" }
        );
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-tab-permissions"] });
      toast({ title: "Permissão atualizada" });
    },
    onError: (e: Error) => toast({ title: "Erro", description: friendlyError(e), variant: "destructive" }),
  });

  function getUserRole(userId: string) {
    return allRoles?.find((r) => r.user_id === userId)?.role ?? null;
  }

  function isTabBlocked(userId: string, tabKey: string) {
    const perm = allPermissions?.find((p) => p.user_id === userId && p.tab_key === tabKey);
    return perm?.is_allowed === false;
  }

  const ACTION_LABELS: Record<string, string> = {
    movement_in: "Entrada registrada",
    movement_out: "Saída registrada",
    movement_transfer: "Transferência registrada",
  };

  return (
    <div className="page-container">
      <div className="flex items-center gap-3 mb-6">
        <Shield size={28} className="text-primary" />
        <div>
          <h1 className="page-title mb-0">Painel do Desenvolvedor</h1>
          <p className="text-xs text-muted-foreground">Controle total do sistema</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-secondary rounded-xl p-1 overflow-x-auto">
        {[
          { key: "users" as const, label: "Usuários", icon: Users },
          { key: "activity" as const, label: "Atividade", icon: Activity },
          { key: "audit" as const, label: "Auditoria", icon: ClipboardCheck },
          { key: "companies" as const, label: "Empresas", icon: Building2 },
          { key: "system" as const, label: "Sistema", icon: TrendingUp },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs sm:text-sm font-medium flex-1 justify-center transition-colors whitespace-nowrap ${
              tab === t.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <t.icon size={16} />
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {/* Users Tab */}
      {tab === "users" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">{profiles?.length ?? 0} usuário(s) • {profiles?.filter(p => !p.is_approved).length ?? 0} pendente(s)</p>
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => setShowAbc(s => !s)}>
              <BarChart3 size={14} /> {showAbc ? "Ocultar" : "Curva ABC"}
            </Button>
          </div>
          {showAbc && (
            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="font-semibold text-sm mb-2 flex items-center gap-2"><BarChart3 size={16} className="text-primary" /> Curva ABC de Usuários (por movimentações)</h3>
              <p className="text-[10px] text-muted-foreground mb-3">A: 70% das ações • B: 20% • C: 10%</p>
              <div className="space-y-1.5">
                {userAbc?.length === 0 && <p className="text-xs text-muted-foreground">Sem atividade registrada ainda.</p>}
                {userAbc?.map((u) => {
                  const prof = profiles?.find(p => p.id === u.user_id);
                  const color = u.cls === "A" ? "bg-accent/15 text-accent" : u.cls === "B" ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground";
                  return (
                    <div key={u.user_id} className="flex items-center gap-2 text-xs py-1.5 border-b border-border last:border-0">
                      <span className={`w-7 h-7 rounded-full flex items-center justify-center font-bold ${color}`}>{u.cls}</span>
                      <span className="flex-1 truncate font-medium">{prof?.full_name || prof?.email || u.user_id.slice(0, 8)}</span>
                      <span className="font-mono text-muted-foreground">{u.count} ações</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {profiles?.map((p) => {
            const isMe = p.id === user?.id;
            const userRole = getUserRole(p.id);
            const blockedCount = allPermissions?.filter((perm) => perm.user_id === p.id && !perm.is_allowed).length ?? 0;
            return (
              <div key={p.id} className="bg-card border border-border rounded-xl p-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm truncate">{p.full_name || "Sem nome"}</span>
                      {isMe && <Badge variant="secondary" className="text-[10px]">Você</Badge>}
                      {p.is_approved ? (
                        <Badge className="text-[10px] bg-accent/15 text-accent border-0">Aprovado</Badge>
                      ) : (
                        <Badge variant="destructive" className="text-[10px]">Pendente</Badge>
                      )}
                      {blockedCount > 0 && (
                        <Badge variant="outline" className="text-[10px] border-warning text-warning">{blockedCount} aba(s) bloqueada(s)</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{p.email}</p>
                    <p className="text-[10px] text-muted-foreground">
                      Desde {new Date(p.created_at).toLocaleDateString("pt-BR")}
                      {userRole && ` • ${ROLE_LABELS[userRole]}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
                    {!isMe && (
                      <>
                        <Select
                          value={userRole ?? "none"}
                          onValueChange={(v) => roleMutation.mutate({ userId: p.id, newRole: v })}
                        >
                          <SelectTrigger className="w-28 h-8 text-xs">
                            <SelectValue placeholder="Papel" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="operator">Operador</SelectItem>
                            <SelectItem value="supervisor">Supervisor</SelectItem>
                            <SelectItem value="admin">Administrador</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => setPermDialogUser(p)}>
                          <Settings2 size={14} /> Abas
                        </Button>
                        {p.is_approved ? (
                          <Button size="sm" variant="outline" className="h-8 text-xs text-destructive border-destructive/30" onClick={() => approveMutation.mutate({ userId: p.id, approved: false })}>
                            <UserX size={14} className="mr-1" /> Bloquear
                          </Button>
                        ) : (
                          <Button size="sm" className="h-8 text-xs" onClick={() => approveMutation.mutate({ userId: p.id, approved: true })}>
                            <UserCheck size={14} className="mr-1" /> Aprovar
                          </Button>
                        )}
                        <Button size="sm" variant="outline" className="h-8 text-xs text-destructive border-destructive/30" onClick={() => setDeleteDialogUser(p)}>
                          <Trash2 size={14} />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {profiles?.length === 0 && (
            <p className="text-center text-muted-foreground py-8">Nenhum usuário cadastrado.</p>
          )}
        </div>
      )}

      {/* Activity Tab */}
      {tab === "activity" && (
        <div className="space-y-2">
          {activities?.length === 0 && (
            <p className="text-center text-muted-foreground py-8">Nenhuma atividade registrada.</p>
          )}
          {activities?.map((a: any) => (
            <div key={a.id} className="bg-card border border-border rounded-xl p-3 flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Activity size={14} className="text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{ACTION_LABELS[a.action] ?? a.action}</p>
                <p className="text-xs text-muted-foreground">
                  {a.profiles?.full_name || a.profiles?.email || "Sistema"} •{" "}
                  {new Date(a.created_at).toLocaleString("pt-BR")}
                </p>
                {a.details?.qty && (
                  <p className="text-xs text-muted-foreground mt-0.5">Quantidade: {a.details.qty}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Audit Tab */}
      {tab === "audit" && <OperationalAudit />}

      {/* Companies Tab */}
      {tab === "companies" && (
        <div className="space-y-3">
          {/* Companies without focal point card */}
          {(() => {
            const without = companiesList?.filter((c: any) => !c.main_focal_user_id) ?? [];
            if (without.length === 0) return null;
            return (
              <div className="bg-warning/10 border border-warning/30 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle size={16} className="text-warning" />
                  <h3 className="font-semibold text-sm">Empresas sem focal point ({without.length})</h3>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {without.map((c: any) => (
                    <button
                      key={c.id}
                      onClick={() => { setEditCompany(c); setEditCompanyName(c.name); }}
                      className="text-xs px-2 py-1 rounded-md bg-card border border-border hover:border-warning"
                    >{c.name}</button>
                  ))}
                </div>
              </div>
            );
          })()}

          {companiesList?.map((c: any) => {
            const memberCount = c.company_members?.length ?? 0;
            const hasFocal = !!c.main_focal_user_id;
            return (
              <div key={c.id} className="bg-card border border-border rounded-xl p-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-sm">{c.name}</h3>
                      {c.status && c.status !== "active" && (
                        <Badge variant="outline" className="text-[10px]">{c.status}</Badge>
                      )}
                      {!hasFocal && (
                        <Badge variant="outline" className="text-[10px] border-warning text-warning">Sem focal point</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Tipo: {c.business_type} • Modo: {c.operation_mode} • Plano: {c.plan}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Membros: {memberCount} • Criado: {new Date(c.created_at).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                    <div className="bg-secondary rounded-lg px-3 py-2 flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground">Código:</span>
                      <span className="font-mono font-bold text-sm text-primary">{c.invite_code || "—"}</span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(c.invite_code || "");
                          toast({ title: "Código copiado!" });
                        }}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <Copy size={14} />
                      </button>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs gap-1"
                      onClick={() => regenerateCodeMutation.mutate(c.id)}
                      disabled={regenerateCodeMutation.isPending}
                    >
                      <RefreshCw size={14} /> Novo Código
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => { setEditCompany(c); setEditCompanyName(c.name); }}>
                      <Pencil size={14} /> Detalhes
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 text-xs text-destructive border-destructive/30" onClick={() => setDeleteCompany(c)}>
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
          {(!companiesList || companiesList.length === 0) && (
            <p className="text-center text-muted-foreground py-8">Nenhuma empresa cadastrada.</p>
          )}
        </div>
      )}

      {/* System Tab */}
      {tab === "system" && systemStats && (
        <div>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            {[
              { label: "Produtos", value: systemStats.products, icon: Package, color: "text-primary" },
              { label: "Endereços", value: systemStats.addresses, icon: MapPin, color: "text-accent" },
              { label: "Lotes", value: systemStats.lots, icon: Boxes, color: "text-primary" },
              { label: "Total em Estoque", value: systemStats.totalQty, icon: Boxes, color: "text-accent" },
              { label: "Posições Ocupadas", value: systemStats.stockPositions, icon: MapPin, color: "text-primary" },
              { label: "Movimentações", value: systemStats.movements, icon: Activity, color: "text-primary" },
            ].map((s) => (
              <div key={s.label} className="stat-card flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <s.icon size={18} className={s.color} />
                  <span className="text-xs text-muted-foreground font-medium">{s.label}</span>
                </div>
                <span className="text-2xl font-bold text-foreground">{s.value}</span>
              </div>
            ))}
          </div>
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
              <Clock size={16} className="text-primary" /> Saúde do Sistema
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="flex justify-between py-2 border-b border-border">
                <span className="text-muted-foreground">Versão</span>
                <span className="font-medium">1.0.0 MVP</span>
              </div>
              <div className="flex justify-between py-2 border-b border-border">
                <span className="text-muted-foreground">Banco de dados</span>
                <span className="font-medium text-accent">Conectado ✓</span>
              </div>
              <div className="flex justify-between py-2 border-b border-border">
                <span className="text-muted-foreground">Usuários ativos</span>
                <span className="font-medium">{profiles?.filter((p) => p.is_approved).length ?? 0}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-border">
                <span className="text-muted-foreground">Usuários pendentes</span>
                <span className="font-medium text-warning">{profiles?.filter((p) => !p.is_approved).length ?? 0}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab Permissions Dialog */}
      <Dialog open={!!permDialogUser} onOpenChange={(o) => !o && setPermDialogUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 size={18} className="text-primary" />
              Permissões de Abas — {permDialogUser?.full_name || permDialogUser?.email}
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground mb-4">Desmarque para bloquear o acesso do usuário a uma aba.</p>
          <div className="space-y-3">
            {ALL_TABS.map((t) => {
              const blocked = permDialogUser ? isTabBlocked(permDialogUser.id, t.key) : false;
              return (
                <label key={t.key} className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-secondary cursor-pointer">
                  <Checkbox
                    checked={!blocked}
                    onCheckedChange={(checked) => {
                      if (permDialogUser) {
                        permMutation.mutate({ userId: permDialogUser.id, tabKey: t.key, allowed: !!checked });
                      }
                    }}
                  />
                  <span className="text-sm font-medium">{t.label}</span>
                  {blocked && <Badge variant="destructive" className="text-[9px] ml-auto">Bloqueado</Badge>}
                </label>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteDialogUser} onOpenChange={(o) => !o && setDeleteDialogUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle size={18} /> Excluir Usuário
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Tem certeza que deseja excluir <strong>{deleteDialogUser?.full_name || deleteDialogUser?.email}</strong>?
            Esta ação remove o perfil, permissões e dados de acesso. Não pode ser desfeita.
          </p>
          <div className="flex gap-3 mt-4">
            <Button variant="outline" className="flex-1" onClick={() => setDeleteDialogUser(null)}>Cancelar</Button>
            <Button variant="destructive" className="flex-1" onClick={() => deleteMutation.mutate(deleteDialogUser.id)} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? "Excluindo..." : "Excluir"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Company Dialog */}
      <Dialog open={!!editCompany} onOpenChange={(o) => !o && setEditCompany(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 size={18} className="text-primary" /> {editCompany?.name}
            </DialogTitle>
          </DialogHeader>

          {editCompany && (
            <div className="space-y-6">
              {/* Identification */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase text-muted-foreground">Identificação</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Nome</Label>
                    <Input value={editCompanyName} onChange={(e) => setEditCompanyName(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Razão social</Label>
                    <Input defaultValue={editCompany.legal_name ?? ""} onBlur={(e) => updateCompanyDetailsMutation.mutate({ id: editCompany.id, patch: { legal_name: e.target.value } })} />
                  </div>
                  <div>
                    <Label className="text-xs">CNPJ / Documento</Label>
                    <Input defaultValue={editCompany.document_number ?? ""} onBlur={(e) => updateCompanyDetailsMutation.mutate({ id: editCompany.id, patch: { document_number: e.target.value } })} />
                  </div>
                  <div>
                    <Label className="text-xs">Email</Label>
                    <Input type="email" defaultValue={editCompany.email ?? ""} onBlur={(e) => updateCompanyDetailsMutation.mutate({ id: editCompany.id, patch: { email: e.target.value } })} />
                  </div>
                  <div>
                    <Label className="text-xs">Telefone</Label>
                    <Input defaultValue={editCompany.phone ?? ""} onBlur={(e) => updateCompanyDetailsMutation.mutate({ id: editCompany.id, patch: { phone: e.target.value } })} />
                  </div>
                  <div>
                    <Label className="text-xs">Status</Label>
                    <Select defaultValue={editCompany.status ?? "active"} onValueChange={(v) => updateCompanyDetailsMutation.mutate({ id: editCompany.id, patch: { status: v } })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Ativa</SelectItem>
                        <SelectItem value="inactive">Inativa</SelectItem>
                        <SelectItem value="blocked">Bloqueada</SelectItem>
                        <SelectItem value="trial">Trial</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Focal Point */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase text-muted-foreground">Focal Point principal</h4>
                {(() => {
                  const current = companyMembers?.find((m: any) => m.is_main_focal_point);
                  return (
                    <div className="bg-secondary rounded-lg p-3 text-xs">
                      {current ? (
                        <span><strong>{current.profile?.full_name || current.profile?.email}</strong> ({current.role})</span>
                      ) : (
                        <span className="text-warning">Nenhum focal point definido</span>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Linked users */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase text-muted-foreground">Usuários vinculados ({companyMembers?.length ?? 0})</h4>

                {/* Add member by email */}
                <div className="bg-secondary/40 border border-border rounded-lg p-3 space-y-2">
                  <p className="text-[11px] font-medium text-muted-foreground">Vincular usuário existente por e-mail</p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Input placeholder="usuario@empresa.com" value={newMemberEmail} onChange={(e) => setNewMemberEmail(e.target.value)} className="h-8 text-xs flex-1" />
                    <Select value={newMemberRole} onValueChange={setNewMemberRole}>
                      <SelectTrigger className="h-8 text-xs w-full sm:w-32"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="owner">Owner</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="member">Member</SelectItem>
                        <SelectItem value="focal">Focal</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      className="h-8 text-xs"
                      disabled={addMemberByEmailMutation.isPending || !newMemberEmail.trim()}
                      onClick={() => addMemberByEmailMutation.mutate({ companyId: editCompany.id, email: newMemberEmail, role: newMemberRole }, {
                        onSuccess: () => { setNewMemberEmail(""); setNewMemberRole("member"); },
                      })}
                    >
                      Vincular
                    </Button>
                  </div>
                </div>

                {(!companyMembers || companyMembers.length === 0) && (
                  <p className="text-xs text-muted-foreground">Nenhum membro vinculado.</p>
                )}
                <div className="space-y-1.5">
                  {companyMembers?.map((m: any) => {
                    const approved = m.profile?.is_approved;
                    const active = m.is_active !== false;
                    const owners = companyMembers.filter((x: any) => x.role === "owner").length;
                    const isLastOwner = m.role === "owner" && owners <= 1;
                    return (
                      <div key={m.id} className="flex flex-wrap items-center gap-2 bg-card border border-border rounded-lg p-2 text-xs">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{m.profile?.full_name || m.profile?.email || m.user_id.slice(0, 8)}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{m.profile?.email}</p>
                        </div>
                        <Select value={m.role} onValueChange={(v) => changeMemberRoleMutation.mutate({ memberId: m.id, role: v })}>
                          <SelectTrigger className="h-7 text-[10px] w-24"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="owner">Owner</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="member">Member</SelectItem>
                            <SelectItem value="focal">Focal</SelectItem>
                          </SelectContent>
                        </Select>
                        {m.is_main_focal_point && <Badge className="text-[10px] bg-primary/15 text-primary border-0">Focal</Badge>}
                        {approved
                          ? <Badge className="text-[10px] bg-accent/15 text-accent border-0">Aprovado</Badge>
                          : <Badge variant="destructive" className="text-[10px]">Pendente</Badge>}
                        {!active && <Badge variant="destructive" className="text-[10px]">Bloqueado</Badge>}
                        {!m.is_main_focal_point && (
                          <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => setFocalPointMutation.mutate({ memberId: m.id, companyId: editCompany.id })}>
                            Tornar focal
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-[10px]"
                          onClick={() => toggleMemberActiveMutation.mutate({ memberId: m.id, active: !active })}
                        >
                          {active ? "Bloquear" : "Reativar"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-[10px] text-destructive border-destructive/30"
                          disabled={isLastOwner || removeMemberMutation.isPending}
                          title={isLastOwner ? "Não é possível remover o último owner" : "Remover vínculo"}
                          onClick={() => { if (confirm(`Remover ${m.profile?.email || "usuário"} desta empresa?`)) removeMemberMutation.mutate(m.id); }}
                        >
                          <Trash2 size={12} />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>


              <div className="text-xs text-muted-foreground">Código de convite: <span className="font-mono font-bold">{editCompany?.invite_code}</span></div>

              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setEditCompany(null)}>Fechar</Button>
                <Button className="flex-1" disabled={!editCompanyName.trim() || updateCompanyMutation.isPending}
                  onClick={() => updateCompanyMutation.mutate({ id: editCompany.id, name: editCompanyName.trim() })}>
                  {updateCompanyMutation.isPending ? "Salvando..." : "Salvar nome"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Company Dialog */}
      <Dialog open={!!deleteCompany} onOpenChange={(o) => !o && setDeleteCompany(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle className="flex items-center gap-2 text-destructive"><AlertTriangle size={18} /> Excluir Empresa</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Tem certeza que deseja excluir <strong>{deleteCompany?.name}</strong>?
            Todos os produtos, endereços, lotes, movimentações e estoque desta empresa serão perdidos. Esta ação não pode ser desfeita.
          </p>
          <div className="flex gap-3 mt-4">
            <Button variant="outline" className="flex-1" onClick={() => setDeleteCompany(null)}>Cancelar</Button>
            <Button variant="destructive" className="flex-1" onClick={() => deleteCompanyMutation.mutate(deleteCompany.id)} disabled={deleteCompanyMutation.isPending}>
              {deleteCompanyMutation.isPending ? "Excluindo..." : "Excluir"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
