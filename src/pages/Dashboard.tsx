import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Package, MapPin, Boxes, AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";

const STALE_DAYS = 30;

export default function Dashboard() {
  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const [products, addresses, stockBalance] = await Promise.all([
        supabase.from("products").select("id", { count: "exact", head: true }).eq("is_active", true),
        supabase.from("addresses").select("id", { count: "exact", head: true }).eq("is_active", true),
        supabase.from("stock_balance").select("qty, last_movement_at").gt("qty", 0),
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
      };
    },
  });

  const cards = [
    { label: "Produtos Ativos", value: stats?.products ?? "—", icon: Package, to: "/produtos", color: "text-primary" },
    { label: "Endereços Ativos", value: stats?.addresses ?? "—", icon: MapPin, to: "/enderecos", color: "text-accent" },
    { label: "Total em Estoque", value: stats?.totalItems ?? "—", icon: Boxes, to: "/estoque", color: "text-primary" },
    { label: `Parados > ${STALE_DAYS} dias`, value: stats?.staleCount ?? "—", icon: AlertTriangle, to: "/estoque", color: "text-destructive" },
  ];

  return (
    <div className="page-container">
      <h1 className="page-title">Painel de Controle</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {cards.map((card) => (
          <Link to={card.to} key={card.label} className="stat-card flex flex-col gap-2 animate-fade-in">
            <div className="flex items-center gap-2">
              <card.icon size={20} className={card.color} />
              <span className="text-xs text-muted-foreground font-medium">{card.label}</span>
            </div>
            <span className="text-3xl font-bold text-foreground">{card.value}</span>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { to: "/produtos", label: "Cadastrar Produto", icon: Package },
          { to: "/enderecos", label: "Cadastrar Endereço", icon: MapPin },
          { to: "/movimentacoes", label: "Registrar Movimentação", icon: Boxes },
          { to: "/estoque", label: "Consultar Estoque", icon: Package },
        ].map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="flex items-center gap-3 bg-card border border-border rounded-xl p-4 hover:border-primary/30 hover:shadow-md transition-all font-medium text-sm"
          >
            <item.icon size={20} className="text-primary" />
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
