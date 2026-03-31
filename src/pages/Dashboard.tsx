import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Package, MapPin, Boxes, AlertTriangle, ArrowRightLeft, TrendingUp, ShoppingCart, Download, BarChart3 } from "lucide-react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import ExpiryAlerts from "@/components/ExpiryAlerts";

const STALE_DAYS = 30;

function AnimatedNumber({ value }: { value: number | string }) {
  return (
    <motion.span
      key={String(value)}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="text-3xl font-bold text-foreground"
    >
      {value}
    </motion.span>
  );
}

export default function Dashboard() {
  const { profile } = useAuth();

  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const [products, addresses, stockBalance, recentMovements] = await Promise.all([
        supabase.from("products").select("id", { count: "exact", head: true }).eq("is_active", true),
        supabase.from("addresses").select("id", { count: "exact", head: true }).eq("is_active", true),
        supabase.from("stock_balance").select("qty, last_movement_at, product_id").gt("qty", 0),
        supabase.from("movements").select("id, type, created_at").order("created_at", { ascending: false }).limit(5),
      ]);

      const totalItems = stockBalance.data?.reduce((sum, r) => sum + Number(r.qty), 0) ?? 0;
      const staleDate = new Date();
      staleDate.setDate(staleDate.getDate() - STALE_DAYS);
      const staleCount = stockBalance.data?.filter((r) => new Date(r.last_movement_at) < staleDate).length ?? 0;

      return {
        products: products.count ?? 0,
        addresses: addresses.count ?? 0,
        totalItems,
        staleCount,
        recentMovements: recentMovements.data ?? [],
      };
    },
  });

  // Critical stock query
  const { data: criticalStock } = useQuery({
    queryKey: ["critical-stock"],
    queryFn: async () => {
      const { data: products } = await supabase
        .from("products")
        .select("id, sku, description, min_stock")
        .eq("is_active", true)
        .gt("min_stock", 0);
      if (!products?.length) return [];

      const { data: balances } = await supabase
        .from("stock_balance")
        .select("product_id, qty")
        .gt("qty", 0);

      const stockByProduct: Record<string, number> = {};
      balances?.forEach((b) => {
        stockByProduct[b.product_id] = (stockByProduct[b.product_id] || 0) + Number(b.qty);
      });

      return products
        .map((p) => ({
          ...p,
          current_qty: stockByProduct[p.id] || 0,
          min_stock: Number((p as any).min_stock),
        }))
        .filter((p) => p.current_qty <= p.min_stock)
        .sort((a, b) => a.current_qty - b.current_qty);
    },
  });

  // ABC Curve
  const { data: abcData } = useQuery({
    queryKey: ["abc-curve"],
    queryFn: async () => {
      const { data: movements } = await supabase
        .from("movements")
        .select("product_id, qty")
        .eq("type", "OUT");
      if (!movements?.length) return [];

      const outByProduct: Record<string, number> = {};
      movements.forEach((m) => {
        outByProduct[m.product_id] = (outByProduct[m.product_id] || 0) + Number(m.qty);
      });

      const { data: products } = await supabase
        .from("products")
        .select("id, sku, description, price")
        .eq("is_active", true);

      const items = (products ?? [])
        .map((p) => ({
          ...p,
          totalOut: outByProduct[p.id] || 0,
          revenue: (outByProduct[p.id] || 0) * Number((p as any).price || 0),
        }))
        .filter((p) => p.totalOut > 0)
        .sort((a, b) => b.revenue - a.revenue);

      const totalRevenue = items.reduce((s, i) => s + i.revenue, 0);
      let cumulative = 0;
      return items.map((item) => {
        cumulative += item.revenue;
        const pct = totalRevenue > 0 ? (cumulative / totalRevenue) * 100 : 0;
        return { ...item, curve: pct <= 80 ? "A" : pct <= 95 ? "B" : "C" };
      });
    },
  });

  function exportPurchaseList() {
    if (!criticalStock?.length) {
      toast({ title: "Nenhum item com estoque crítico" });
      return;
    }
    const csv = ["SKU,Descrição,Estoque Atual,Estoque Mínimo,Comprar"]
      .concat(criticalStock.map((p) =>
        `"${p.sku}","${p.description}",${p.current_qty},${p.min_stock},${Math.max(0, p.min_stock - p.current_qty)}`
      ))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lista-compras-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Lista de compras exportada!" });
  }

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Bom dia";
    if (h < 18) return "Boa tarde";
    return "Boa noite";
  };

  const cards = [
    { label: "Produtos Ativos", value: stats?.products ?? "—", icon: Package, to: "/produtos", color: "text-primary" },
    { label: "Endereços Ativos", value: stats?.addresses ?? "—", icon: MapPin, to: "/enderecos", color: "text-accent" },
    { label: "Total em Estoque", value: stats?.totalItems ?? "—", icon: Boxes, to: "/estoque", color: "text-primary" },
    { label: `Parados > ${STALE_DAYS}d`, value: stats?.staleCount ?? "—", icon: AlertTriangle, to: "/estoque", color: "text-destructive" },
  ];

  return (
    <div className="page-container">
      {/* Greeting */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">
          {greeting()}, {profile?.full_name?.split(" ")[0] || "Usuário"} 👋
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Torre de Controle — resumo do seu estoque.</p>
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

      {/* Critical Stock */}
      {criticalStock && criticalStock.length > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
          className="bg-destructive/5 border border-destructive/20 rounded-xl p-5 mb-6">
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
                <div>
                  <span className="font-mono font-semibold text-xs">{p.sku}</span>
                  <span className="text-muted-foreground ml-2 text-xs">{p.description}</span>
                </div>
                <div className="text-right">
                  <span className="text-destructive font-bold">{p.current_qty}</span>
                  <span className="text-muted-foreground text-xs"> / {p.min_stock}</span>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        {[
          { to: "/scanner", label: "Scanner", icon: Package },
          { to: "/produtos", label: "Produtos", icon: Package },
          { to: "/movimentacoes", label: "Movimentar", icon: ArrowRightLeft },
          { to: "/estoque", label: "Estoque", icon: Boxes },
          { to: "/onboarding", label: "Importar CSV", icon: ShoppingCart },
        ].map((item, i) => (
          <motion.div key={item.to} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.4 + i * 0.05 }}>
            <Link to={item.to} className="flex items-center gap-3 bg-card border border-border rounded-xl p-4 hover:border-primary/30 hover:shadow-md transition-all font-medium text-sm">
              <item.icon size={20} className="text-primary" />
              {item.label}
            </Link>
          </motion.div>
        ))}
      </div>

      {/* ABC Curve */}
      {abcData && abcData.length > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
          className="bg-card border border-border rounded-xl p-5 mb-6">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <BarChart3 size={16} className="text-primary" /> Curva ABC — Produtos mais movimentados
          </h3>
          <p className="text-xs text-muted-foreground mb-3">Produtos A devem ficar próximos à área de expedição.</p>
          <div className="overflow-x-auto">
            <table className="data-table text-xs">
              <thead>
                <tr><th>Curva</th><th>SKU</th><th>Descrição</th><th>Saídas</th><th>Receita</th></tr>
              </thead>
              <tbody>
                {abcData.slice(0, 10).map((item) => (
                  <tr key={item.id}>
                    <td>
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${
                        item.curve === "A" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                        item.curve === "B" ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" :
                        "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                      }`}>{item.curve}</span>
                    </td>
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
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}
          className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <TrendingUp size={16} className="text-primary" /> Últimas Movimentações
          </h3>
          <div className="space-y-2">
            {stats.recentMovements.map((m: any) => (
              <div key={m.id} className="flex items-center justify-between text-xs py-1.5 border-b border-border last:border-0">
                <span className={`badge-${m.type.toLowerCase()} inline-block`}>
                  {m.type === "IN" ? "Entrada" : m.type === "OUT" ? "Saída" : "Transferência"}
                </span>
                <span className="text-muted-foreground">
                  {new Date(m.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            ))}
          </div>
          <Link to="/movimentacoes" className="text-xs text-primary font-medium hover:underline mt-3 inline-block">Ver todas →</Link>
        </motion.div>
      )}
    </div>
  );
}
