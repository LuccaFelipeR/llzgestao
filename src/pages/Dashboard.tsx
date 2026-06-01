import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { Package, MapPin, Boxes, AlertTriangle, ArrowRightLeft, TrendingUp, Download, BarChart3, ClipboardList, CalendarClock, Tag, DollarSign, Users, Crown } from "lucide-react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import ExpiryAlerts from "@/components/ExpiryAlerts";
import HealthScore from "@/components/HealthScore";
import ExceptionPanel from "@/components/ExceptionPanel";

const STALE_DAYS = 30;
const EXPIRY_DAYS = 30;

function AnimatedNumber({ value }: { value: number | string }) {
  return (
    <motion.span key={String(value)} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="text-3xl font-bold text-foreground">
      {value}
    </motion.span>
  );
}

export default function Dashboard() {
  const { profile } = useAuth();
  const { company, currentCompanyId } = useCompany();

  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats", currentCompanyId],
    enabled: !!currentCompanyId,
    queryFn: async () => {
      const cid = currentCompanyId!;
      const [products, addresses, stockBalance, recentMovements, lots, members] = await Promise.all([
        supabase.from("products").select("id, sku, description, classification, price, min_stock, is_perishable, controls_expiration", { count: "exact" }).eq("company_id", cid).eq("is_active", true),
        supabase.from("addresses").select("id", { count: "exact", head: true }).eq("company_id", cid).eq("is_active", true),
        supabase.from("stock_balance").select("address_id, qty, last_movement_at, product_id").eq("company_id", cid).gt("qty", 0),
        supabase.from("movements").select("id, type, created_at").eq("company_id", cid).order("created_at", { ascending: false }).limit(5),
        supabase.from("lots").select("id, expires_at, status").eq("company_id", cid),
        supabase.from("company_members").select("id", { count: "exact", head: true }).eq("company_id", cid).eq("is_active", true),
      ]);
      const productList = products.data ?? [];
      const totalItems = stockBalance.data?.reduce((sum, r) => sum + Number(r.qty), 0) ?? 0;
      const staleDate = new Date();
      staleDate.setDate(staleDate.getDate() - STALE_DAYS);
      const staleCount = stockBalance.data?.filter((r) => new Date(r.last_movement_at) < staleDate).length ?? 0;

      const occupied = new Set((stockBalance.data ?? []).map((s) => s.address_id)).size;
      const addrCount = addresses.count ?? 0;

      const noClassification = productList.filter((p: any) => !p.classification).length;
      const noPrice = productList.filter((p: any) => !Number(p.price)).length;
      const noMinStock = productList.filter((p: any) => !Number(p.min_stock)).length;

      const now = new Date();
      const soon = new Date(now.getTime() + EXPIRY_DAYS * 86400000);
      const lotsList = lots.data ?? [];
      const expiringLots = lotsList.filter((l: any) => l.expires_at && new Date(l.expires_at) >= now && new Date(l.expires_at) <= soon).length;
      const expiredLots = lotsList.filter((l: any) => l.expires_at && new Date(l.expires_at) < now).length;

      return {
        products: products.count ?? 0,
        addresses: addrCount,
        addressesOccupied: occupied,
        addressesEmpty: Math.max(0, addrCount - occupied),
        totalItems,
        staleCount,
        recentMovements: recentMovements.data ?? [],
        productList,
        noClassification,
        noPrice,
        noMinStock,
        expiringLots,
        expiredLots,
        membersCount: members.count ?? 0,
      };
    },
  });

  const { data: criticalStock } = useQuery({
    queryKey: ["critical-stock", currentCompanyId],
    enabled: !!currentCompanyId,
    queryFn: async () => {
      const cid = currentCompanyId!;
      const { data: products } = await supabase.from("products").select("id, sku, description, min_stock").eq("company_id", cid).eq("is_active", true).gt("min_stock", 0);
      if (!products?.length) return [];
      const { data: balances } = await supabase.from("stock_balance").select("product_id, qty").eq("company_id", cid).gt("qty", 0);
      const stockByProduct: Record<string, number> = {};
      balances?.forEach((b) => { stockByProduct[b.product_id] = (stockByProduct[b.product_id] || 0) + Number(b.qty); });
      return products.map((p) => ({ ...p, current_qty: stockByProduct[p.id] || 0, min_stock: Number(p.min_stock) })).filter((p) => p.current_qty <= p.min_stock).sort((a, b) => a.current_qty - b.current_qty);
    },
  });

  const { data: abcData } = useQuery({
    queryKey: ["abc-curve", currentCompanyId],
    enabled: !!currentCompanyId,
    queryFn: async () => {
      const cid = currentCompanyId!;
      const { data: movements } = await supabase.from("movements").select("product_id, qty").eq("company_id", cid).eq("type", "OUT");
      if (!movements?.length) return [];
      const outByProduct: Record<string, number> = {};
      movements.forEach((m) => { outByProduct[m.product_id] = (outByProduct[m.product_id] || 0) + Number(m.qty); });
      const { data: products } = await supabase.from("products").select("id, sku, description, price").eq("company_id", cid).eq("is_active", true);
      const items = (products ?? []).map((p) => ({ ...p, totalOut: outByProduct[p.id] || 0, revenue: (outByProduct[p.id] || 0) * Number(p.price || 0) })).filter((p) => p.totalOut > 0).sort((a, b) => b.revenue - a.revenue);
      const totalRevenue = items.reduce((s, i) => s + i.revenue, 0);
      let cumulative = 0;
      return items.map((item) => { cumulative += item.revenue; const pct = totalRevenue > 0 ? (cumulative / totalRevenue) * 100 : 0; return { ...item, curve: pct <= 80 ? "A" : pct <= 95 ? "B" : "C" }; });
    },
  });

  function exportPurchaseList() {
    if (!criticalStock?.length) { toast({ title: "Nenhum item com estoque crítico" }); return; }
    const csv = ["SKU,Descrição,Estoque Atual,Estoque Mínimo,Comprar"].concat(criticalStock.map((p) => `"${p.sku}","${p.description}",${p.current_qty},${p.min_stock},${Math.max(0, p.min_stock - p.current_qty)}`)).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lista-compras-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Lista de compras exportada!" });
  }

  const greeting = () => { const h = new Date().getHours(); if (h < 12) return "Bom dia"; if (h < 18) return "Boa tarde"; return "Boa noite"; };

  const cards = [
    { label: "Produtos Ativos", value: stats?.products ?? "—", icon: Package, to: "/produtos", color: "text-primary" },
    { label: "Endereços Ativos", value: stats?.addresses ?? "—", icon: MapPin, to: "/enderecos", color: "text-accent" },
    { label: "Total em Estoque", value: stats?.totalItems ?? "—", icon: Boxes, to: "/estoque", color: "text-primary" },
    { label: `Parados > ${STALE_DAYS}d`, value: stats?.staleCount ?? "—", icon: AlertTriangle, to: "/estoque", color: "text-destructive" },
  ];

  const dataQualityCards = [
    { label: "Sem classificação", value: stats?.noClassification ?? 0, icon: Tag },
    { label: "Sem preço", value: stats?.noPrice ?? 0, icon: DollarSign },
    { label: "Sem estoque mínimo", value: stats?.noMinStock ?? 0, icon: AlertTriangle },
    { label: "Lotes vencendo", value: stats?.expiringLots ?? 0, icon: CalendarClock },
    { label: "Lotes vencidos", value: stats?.expiredLots ?? 0, icon: AlertTriangle },
    { label: "Endereços ocupados", value: stats?.addressesOccupied ?? 0, icon: MapPin },
    { label: "Endereços vazios", value: stats?.addressesEmpty ?? 0, icon: MapPin },
  ];

  const plan = company?.plan ?? "free";
  const maxUsers = (company as any)?.max_users ?? null;
  const maxProducts = (company as any)?.max_products ?? null;
  const maxAddresses = (company as any)?.max_addresses ?? null;
  const trialEndsAt = (company as any)?.trial_ends_at;

  const usage = (used: number, max: number | null) => {
    if (!max) return { pct: 0, warn: false };
    const pct = Math.min(100, Math.round((used / max) * 100));
    return { pct, warn: pct >= 80 };
  };
  const uUsers = usage(stats?.membersCount ?? 0, maxUsers);
  const uProducts = usage(stats?.products ?? 0, maxProducts);
  const uAddresses = usage(stats?.addresses ?? 0, maxAddresses);

  return (
    <div className="page-container">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">
          {greeting()}, {profile?.full_name?.split(" ")[0] || "Usuário"} 👋
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {company?.name || "Torre de Controle"} — resumo do seu estoque.
        </p>
      </motion.div>

      <ExpiryAlerts />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {cards.map((card, i) => (
          <motion.div key={card.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
            <Link to={card.to} className="stat-card flex flex-col gap-2 block">
              <div className="flex items-center gap-2">
                <card.icon size={20} className={card.color} />
                <span className="text-xs text-muted-foreground font-medium">{card.label}</span>
              </div>
              <AnimatedNumber value={card.value} />
            </Link>
          </motion.div>
        ))}
      </div>

      {/* Plan + Status card */}
      <div className="bg-card border border-border rounded-xl p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold flex items-center gap-2"><Crown size={16} className="text-primary" /> Plano & Uso</h3>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-xs rounded bg-primary/10 text-primary font-bold uppercase">{plan}</span>
            <span className={`px-2 py-0.5 text-xs rounded font-bold uppercase ${
              company?.status === "active" ? "bg-success/10 text-success" :
              company?.status === "trial" ? "bg-accent/10 text-accent" :
              "bg-destructive/10 text-destructive"
            }`}>{company?.status ?? "active"}</span>
            {trialEndsAt && <span className="text-[10px] text-muted-foreground">Trial até {new Date(trialEndsAt).toLocaleDateString("pt-BR")}</span>}
          </div>
        </div>
        <div className="grid sm:grid-cols-3 gap-3 text-xs">
          {[
            { label: "Usuários", icon: Users, u: uUsers, used: stats?.membersCount ?? 0, max: maxUsers },
            { label: "Produtos", icon: Package, u: uProducts, used: stats?.products ?? 0, max: maxProducts },
            { label: "Endereços", icon: MapPin, u: uAddresses, used: stats?.addresses ?? 0, max: maxAddresses },
          ].map((row) => (
            <div key={row.label} className="bg-muted/30 rounded-lg p-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="flex items-center gap-1.5 text-muted-foreground"><row.icon size={12} /> {row.label}</span>
                <span className={`font-bold ${row.u.warn ? "text-destructive" : "text-foreground"}`}>
                  {row.used}{row.max ? ` / ${row.max}` : ""}
                </span>
              </div>
              {row.max ? (
                <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                  <div className={`h-full ${row.u.warn ? "bg-destructive" : "bg-primary"}`} style={{ width: `${row.u.pct}%` }} />
                </div>
              ) : <span className="text-[10px] text-muted-foreground">Sem limite</span>}
              {row.u.warn && <p className="text-[10px] text-destructive mt-1">⚠ Próximo do limite do plano</p>}
            </div>
          ))}
        </div>
      </div>

      {/* Health Score + Exceptions */}
      <div className="grid lg:grid-cols-2 gap-4 mb-6">
        <HealthScore />
        <ExceptionPanel />
      </div>

      {/* Data Quality mini cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 mb-6">
        {dataQualityCards.map((c) => (
          <div key={c.label} className="bg-card border border-border rounded-lg p-3">
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-1">
              <c.icon size={12} /> <span className="truncate">{c.label}</span>
            </div>
            <p className="text-lg font-bold text-foreground">{c.value}</p>
          </div>
        ))}
      </div>

      {/* Critical Stock */}
      {criticalStock && criticalStock.length > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="bg-destructive/5 border border-destructive/20 rounded-xl p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold flex items-center gap-2 text-destructive">
              <AlertTriangle size={16} /> Estoque Crítico ({criticalStock.length})
            </h3>
            <Button variant="outline" size="sm" onClick={exportPurchaseList} className="gap-1 text-xs">
              <Download size={14} /> Gerar Lista de Compras
            </Button>
          </div>
          <div className="space-y-2">
            {criticalStock.slice(0, 5).map((p) => (
              <div key={p.id} className="flex items-center justify-between text-sm bg-card rounded-lg px-3 py-2 border border-border">
                <div><span className="font-mono font-semibold text-xs">{p.sku}</span><span className="text-muted-foreground ml-2 text-xs">{p.description}</span></div>
                <div className="text-right"><span className="text-destructive font-bold">{p.current_qty}</span><span className="text-muted-foreground text-xs"> / {p.min_stock}</span></div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        {[
          { to: "/recebimento", label: "Receber", icon: ClipboardList },
          { to: "/scanner", label: "Scanner", icon: Package },
          { to: "/produtos", label: "Produtos", icon: Package },
          { to: "/movimentacoes", label: "Movimentar", icon: ArrowRightLeft },
          { to: "/estoque", label: "Estoque", icon: Boxes },
        ].map((item, i) => (
          <motion.div key={item.to} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.4 + i * 0.05 }}>
            <Link to={item.to} className="flex items-center gap-3 bg-card border border-border rounded-xl p-4 hover:border-primary/30 hover:shadow-md transition-all font-medium text-sm">
              <item.icon size={20} className="text-primary" /> {item.label}
            </Link>
          </motion.div>
        ))}
      </div>

      {/* ABC Curve */}
      {abcData && abcData.length > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className="bg-card border border-border rounded-xl p-5 mb-6">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><BarChart3 size={16} className="text-primary" /> Curva ABC</h3>
          <div className="overflow-x-auto">
            <table className="data-table text-xs">
              <thead><tr><th>Curva</th><th>SKU</th><th>Descrição</th><th>Saídas</th><th>Receita</th></tr></thead>
              <tbody>
                {abcData.slice(0, 10).map((item) => (
                  <tr key={item.id}>
                    <td><span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${item.curve === "A" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : item.curve === "B" ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}`}>{item.curve}</span></td>
                    <td className="font-mono font-semibold">{item.sku}</td>
                    <td>{item.description}</td>
                    <td>{item.totalOut}</td>
                    <td>R$ {item.revenue.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {/* Recent Activity */}
      {stats?.recentMovements && stats.recentMovements.length > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><TrendingUp size={16} className="text-primary" /> Últimas Movimentações</h3>
          <div className="space-y-2">
            {stats.recentMovements.map((m: any) => (
              <div key={m.id} className="flex items-center justify-between text-xs py-1.5 border-b border-border last:border-0">
                <span className={`badge-${m.type.toLowerCase()} inline-block`}>{m.type === "IN" ? "Entrada" : m.type === "OUT" ? "Saída" : "Transferência"}</span>
                <span className="text-muted-foreground">{new Date(m.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
              </div>
            ))}
          </div>
          <Link to="/movimentacoes" className="text-xs text-primary font-medium hover:underline mt-3 inline-block">Ver todas →</Link>
        </motion.div>
      )}
    </div>
  );
}
