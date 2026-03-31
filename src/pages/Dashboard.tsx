import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Package, MapPin, Boxes, AlertTriangle, ArrowRightLeft, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
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
        supabase.from("stock_balance").select("qty, last_movement_at").gt("qty", 0),
        supabase.from("movements").select("id, type, created_at").order("created_at", { ascending: false }).limit(5),
      ]);

      const totalItems = stockBalance.data?.reduce((sum, r) => sum + Number(r.qty), 0) ?? 0;
      const staleDate = new Date();
      staleDate.setDate(staleDate.getDate() - STALE_DAYS);
      const staleCount = stockBalance.data?.filter(
        (r) => new Date(r.last_movement_at) < staleDate
      ).length ?? 0;

      return {
        products: products.count ?? 0,
        addresses: addresses.count ?? 0,
        totalItems,
        staleCount,
        recentMovements: recentMovements.data ?? [],
      };
    },
  });

  const cards = [
    { label: "Produtos Ativos", value: stats?.products ?? "—", icon: Package, to: "/produtos", color: "text-primary" },
    { label: "Endereços Ativos", value: stats?.addresses ?? "—", icon: MapPin, to: "/enderecos", color: "text-accent" },
    { label: "Total em Estoque", value: stats?.totalItems ?? "—", icon: Boxes, to: "/estoque", color: "text-primary" },
    { label: `Parados > ${STALE_DAYS} dias`, value: stats?.staleCount ?? "—", icon: AlertTriangle, to: "/estoque", color: "text-destructive" },
  ];

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Bom dia";
    if (h < 18) return "Boa tarde";
    return "Boa noite";
  };

  return (
    <div className="page-container">
      {/* Greeting */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mb-6"
      >
        <h1 className="text-2xl font-bold text-foreground">
          {greeting()}, {profile?.full_name?.split(" ")[0] || "Usuário"} 👋
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Aqui está o resumo do seu estoque.</p>
      </motion.div>

      {/* Expiry Alerts */}
      <ExpiryAlerts />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {cards.map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: i * 0.1 }}
          >
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

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        {[
          { to: "/produtos", label: "Cadastrar Produto", icon: Package },
          { to: "/enderecos", label: "Cadastrar Endereço", icon: MapPin },
          { to: "/movimentacoes", label: "Registrar Movimentação", icon: ArrowRightLeft },
          { to: "/estoque", label: "Consultar Estoque", icon: Boxes },
        ].map((item, i) => (
          <motion.div
            key={item.to}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3, delay: 0.4 + i * 0.05 }}
          >
            <Link
              to={item.to}
              className="flex items-center gap-3 bg-card border border-border rounded-xl p-4 hover:border-primary/30 hover:shadow-md transition-all font-medium text-sm"
            >
              <item.icon size={20} className="text-primary" />
              {item.label}
            </Link>
          </motion.div>
        ))}
      </div>

      {/* Recent Activity */}
      {stats?.recentMovements && stats.recentMovements.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="bg-card border border-border rounded-xl p-5"
        >
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <TrendingUp size={16} className="text-primary" />
            Últimas Movimentações
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
          <Link to="/movimentacoes" className="text-xs text-primary font-medium hover:underline mt-3 inline-block">
            Ver todas →
          </Link>
        </motion.div>
      )}
    </div>
  );
}
