import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Shield, UserCheck, UserX, Users, Activity, Package, MapPin, Boxes, Clock, TrendingUp, ClipboardCheck, Trash2, Settings2, AlertTriangle, Building2, RefreshCw, Copy } from "lucide-react";
import OperationalAudit from "@/components/OperationalAudit";

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
      const { data, error } = await (supabase as any).from("companies").select("*, company_members(user_id, role)").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
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
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
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
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
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
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
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
    onError: (e: Error) => toast({ title: "Erro ao excluir", description: e.message, variant: "destructive" }),
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
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
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
    </div>
  );
}
