import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Shield, UserCheck, UserX, Users, Activity, Package, MapPin, Boxes, Clock, TrendingUp, ClipboardCheck } from "lucide-react";
import OperationalAudit from "@/components/OperationalAudit";

const ROLE_LABELS: Record<string, string> = {
  operator: "Operador",
  supervisor: "Supervisor",
  admin: "Administrador",
};

export default function AdminPanel() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"users" | "activity" | "system">("users");

  // Fetch all profiles (admin only)
  const { data: profiles } = useQuery({
    queryKey: ["admin-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Fetch all roles
  const { data: allRoles } = useQuery({
    queryKey: ["admin-roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("*");
      if (error) throw error;
      return data;
    },
  });

  // Fetch activity log
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

  // System stats
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

  // Approve/reject user
  const approveMutation = useMutation({
    mutationFn: async ({ userId, approved }: { userId: string; approved: boolean }) => {
      const { error } = await supabase.from("profiles").update({ is_approved: approved, updated_at: new Date().toISOString() }).eq("id", userId);
      if (error) throw error;
      // If approving and no role, assign operator
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

  // Change role
  const roleMutation = useMutation({
    mutationFn: async ({ userId, newRole }: { userId: string; newRole: string }) => {
      // Delete existing role
      await supabase.from("user_roles").delete().eq("user_id", userId);
      // Insert new role
      const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: newRole as any });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-roles"] });
      toast({ title: "Papel atualizado" });
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  function getUserRole(userId: string) {
    return allRoles?.find((r) => r.user_id === userId)?.role ?? null;
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
      <div className="flex gap-1 mb-6 bg-secondary rounded-xl p-1">
        {[
          { key: "users" as const, label: "Usuários", icon: Users },
          { key: "activity" as const, label: "Atividade", icon: Activity },
          { key: "system" as const, label: "Sistema", icon: TrendingUp },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium flex-1 justify-center transition-colors ${
              tab === t.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <t.icon size={16} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Users Tab */}
      {tab === "users" && (
        <div className="space-y-3">
          {profiles?.map((p) => {
            const isMe = p.id === user?.id;
            const userRole = getUserRole(p.id);
            return (
              <div key={p.id} className="bg-card border border-border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm truncate">{p.full_name || "Sem nome"}</span>
                    {isMe && <Badge variant="secondary" className="text-[10px]">Você</Badge>}
                    {p.is_approved ? (
                      <Badge className="text-[10px] bg-accent/15 text-accent border-0">Aprovado</Badge>
                    ) : (
                      <Badge variant="destructive" className="text-[10px]">Pendente</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{p.email}</p>
                  <p className="text-[10px] text-muted-foreground">
                    Desde {new Date(p.created_at).toLocaleDateString("pt-BR")}
                    {userRole && ` • ${ROLE_LABELS[userRole]}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {!isMe && (
                    <>
                      <Select
                        value={userRole ?? "none"}
                        onValueChange={(v) => roleMutation.mutate({ userId: p.id, newRole: v })}
                      >
                        <SelectTrigger className="w-32 h-8 text-xs">
                          <SelectValue placeholder="Papel" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="operator">Operador</SelectItem>
                          <SelectItem value="supervisor">Supervisor</SelectItem>
                          <SelectItem value="admin">Administrador</SelectItem>
                        </SelectContent>
                      </Select>
                      {p.is_approved ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs text-destructive border-destructive/30"
                          onClick={() => approveMutation.mutate({ userId: p.id, approved: false })}
                        >
                          <UserX size={14} className="mr-1" /> Bloquear
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() => approveMutation.mutate({ userId: p.id, approved: true })}
                        >
                          <UserCheck size={14} className="mr-1" /> Aprovar
                        </Button>
                      )}
                    </>
                  )}
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

          {/* Surprise: System health */}
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
    </div>
  );
}
