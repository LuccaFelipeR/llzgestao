import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { AlertTriangle, Clock, CalendarX, PackageX, ArrowRight } from "lucide-react";

interface ExceptionItem {
  type: "low_stock" | "near_expiry" | "dead_stock" | "no_stock";
  title: string;
  detail: string;
  count: number;
  icon: any;
  color: string;
  link: string;
}

export default function ExceptionPanel() {
  const { data: exceptions } = useQuery({
    queryKey: ["exceptions"],
    queryFn: async () => {
      const [products, stock, lots] = await Promise.all([
        supabase.from("products").select("id, sku, description, min_stock").eq("is_active", true),
        supabase.from("stock_balance").select("product_id, qty, last_movement_at, lot_id").gt("qty", 0),
        supabase.from("lots").select("id, lot_code, expires_at, product_id"),
      ]);

      const productList = products.data ?? [];
      const stockList = stock.data ?? [];
      const lotList = lots.data ?? [];
      const now = new Date();
      const sevenDays = new Date(now.getTime() + 7 * 86400000);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);

      const stockByProduct: Record<string, number> = {};
      stockList.forEach((s) => {
        stockByProduct[s.product_id] = (stockByProduct[s.product_id] || 0) + Number(s.qty);
      });

      const items: ExceptionItem[] = [];

      // Low stock
      const lowStock = productList.filter((p) => Number(p.min_stock) > 0 && (stockByProduct[p.id] || 0) < Number(p.min_stock));
      if (lowStock.length > 0) {
        items.push({
          type: "low_stock",
          title: "Estoque Abaixo do Mínimo",
          detail: lowStock.slice(0, 3).map((p) => p.sku).join(", ") + (lowStock.length > 3 ? ` +${lowStock.length - 3}` : ""),
          count: lowStock.length,
          icon: AlertTriangle,
          color: "text-red-500 bg-red-500/10",
          link: "/estoque",
        });
      }

      // Near expiry (7 days)
      const nearExpiry = lotList.filter((l) => l.expires_at && new Date(l.expires_at) <= sevenDays && new Date(l.expires_at) >= now);
      if (nearExpiry.length > 0) {
        items.push({
          type: "near_expiry",
          title: "Lotes Próximos do Vencimento",
          detail: `${nearExpiry.length} lote(s) vencem nos próximos 7 dias`,
          count: nearExpiry.length,
          icon: CalendarX,
          color: "text-orange-500 bg-orange-500/10",
          link: "/estoque",
        });
      }

      // Dead stock (30+ days)
      const deadStock = stockList.filter((s) => new Date(s.last_movement_at) < thirtyDaysAgo);
      if (deadStock.length > 0) {
        items.push({
          type: "dead_stock",
          title: "Estoque Parado (30+ dias)",
          detail: `${deadStock.length} posição(ões) sem movimentação`,
          count: deadStock.length,
          icon: Clock,
          color: "text-yellow-500 bg-yellow-500/10",
          link: "/estoque",
        });
      }

      // Products with zero stock
      const productsInStock = new Set(Object.keys(stockByProduct));
      const noStock = productList.filter((p) => !productsInStock.has(p.id));
      if (noStock.length > 0) {
        items.push({
          type: "no_stock",
          title: "Produtos Sem Estoque",
          detail: `${noStock.length} produto(s) ativo(s) com saldo zero`,
          count: noStock.length,
          icon: PackageX,
          color: "text-muted-foreground bg-muted",
          link: "/produtos",
        });
      }

      return items;
    },
  });

  if (!exceptions || exceptions.length === 0) return null;

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
        <AlertTriangle size={16} className="text-destructive" /> Ações Urgentes ({exceptions.reduce((s, e) => s + e.count, 0)})
      </h3>
      <div className="space-y-2">
        {exceptions.map((ex, i) => (
          <motion.div key={ex.type} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }}>
            <Link to={ex.link} className="flex items-center gap-3 p-3 rounded-xl border border-border hover:border-primary/30 hover:bg-secondary/50 transition-all group">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${ex.color}`}>
                <ex.icon size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold flex items-center gap-2">
                  {ex.title}
                  <span className="text-xs font-bold bg-destructive/10 text-destructive px-1.5 py-0.5 rounded">{ex.count}</span>
                </p>
                <p className="text-[11px] text-muted-foreground truncate">{ex.detail}</p>
              </div>
              <ArrowRight size={14} className="text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
            </Link>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
