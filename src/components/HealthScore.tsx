import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import { Activity, AlertTriangle, Clock, TrendingDown, Package, ShieldAlert } from "lucide-react";

interface HealthMetric {
  label: string;
  score: number; // 0-100
  icon: any;
  color: string;
  detail: string;
}

export default function HealthScore() {
  const { data: metrics } = useQuery({
    queryKey: ["health-score"],
    queryFn: async () => {
      const [products, stock, lots] = await Promise.all([
        supabase.from("products").select("id, min_stock, price").eq("is_active", true),
        supabase.from("stock_balance").select("product_id, qty, last_movement_at, lot_id").gt("qty", 0),
        supabase.from("lots").select("id, expires_at"),
      ]);

      const productList = products.data ?? [];
      const stockList = stock.data ?? [];
      const lotList = lots.data ?? [];
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
      const sevenDaysFromNow = new Date(now.getTime() + 7 * 86400000);

      // Aggregate stock by product
      const stockByProduct: Record<string, number> = {};
      stockList.forEach((s) => {
        stockByProduct[s.product_id] = (stockByProduct[s.product_id] || 0) + Number(s.qty);
      });

      // 1. Low stock risk (products below min_stock)
      const productsWithMin = productList.filter((p) => Number(p.min_stock) > 0);
      const belowMin = productsWithMin.filter((p) => (stockByProduct[p.id] || 0) < Number(p.min_stock));
      const lowStockScore = productsWithMin.length > 0 ? Math.max(0, 100 - (belowMin.length / productsWithMin.length) * 100) : 100;

      // 2. Dead stock (no movement > 30 days)
      const deadStock = stockList.filter((s) => new Date(s.last_movement_at) < thirtyDaysAgo);
      const deadStockScore = stockList.length > 0 ? Math.max(0, 100 - (deadStock.length / stockList.length) * 100) : 100;

      // 3. Expiry risk
      const lotsWithExpiry = lotList.filter((l) => l.expires_at);
      const nearExpiry = lotsWithExpiry.filter((l) => new Date(l.expires_at!) <= sevenDaysFromNow && new Date(l.expires_at!) >= now);
      const expired = lotsWithExpiry.filter((l) => new Date(l.expires_at!) < now);
      const expiryScore = lotsWithExpiry.length > 0 ? Math.max(0, 100 - ((nearExpiry.length + expired.length * 2) / lotsWithExpiry.length) * 100) : 100;

      // 4. Capital tied up (products with high stock vs. others)
      const totalValue = productList.reduce((sum, p) => sum + (stockByProduct[p.id] || 0) * Number(p.price || 0), 0);
      const capitalScore = totalValue > 0 ? 75 : 100; // Simplified

      // 5. Coverage (products with zero stock)
      const activeProducts = productList.length;
      const productsWithStock = Object.keys(stockByProduct).length;
      const coverageScore = activeProducts > 0 ? (productsWithStock / activeProducts) * 100 : 100;

      const metrics: HealthMetric[] = [
        { label: "Estoque Mínimo", score: Math.round(lowStockScore), icon: AlertTriangle, color: lowStockScore >= 80 ? "text-green-500" : lowStockScore >= 50 ? "text-yellow-500" : "text-red-500", detail: `${belowMin.length} produto(s) abaixo do mínimo` },
        { label: "Estoque Parado", score: Math.round(deadStockScore), icon: Clock, color: deadStockScore >= 80 ? "text-green-500" : deadStockScore >= 50 ? "text-yellow-500" : "text-red-500", detail: `${deadStock.length} item(ns) sem mov. há 30+ dias` },
        { label: "Validades", score: Math.round(expiryScore), icon: ShieldAlert, color: expiryScore >= 80 ? "text-green-500" : expiryScore >= 50 ? "text-yellow-500" : "text-red-500", detail: `${nearExpiry.length} próx. do vencimento, ${expired.length} vencido(s)` },
        { label: "Cobertura", score: Math.round(coverageScore), icon: Package, color: coverageScore >= 80 ? "text-green-500" : coverageScore >= 50 ? "text-yellow-500" : "text-red-500", detail: `${productsWithStock}/${activeProducts} produtos com saldo` },
      ];

      const overall = Math.round(metrics.reduce((s, m) => s + m.score, 0) / metrics.length);
      return { metrics, overall, totalValue };
    },
  });

  if (!metrics) return null;

  const overallColor = metrics.overall >= 80 ? "text-green-500" : metrics.overall >= 50 ? "text-yellow-500" : "text-red-500";
  const ringPercent = (metrics.overall / 100) * 283; // circumference of circle r=45

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
        <Activity size={16} className="text-primary" /> Saúde do Estoque
      </h3>

      <div className="flex items-center gap-6">
        {/* Overall score circle */}
        <div className="relative w-24 h-24 shrink-0">
          <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
            <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" className="text-border" strokeWidth="8" />
            <motion.circle
              cx="50" cy="50" r="45" fill="none" stroke="currentColor" className={overallColor}
              strokeWidth="8" strokeLinecap="round" strokeDasharray="283"
              initial={{ strokeDashoffset: 283 }}
              animate={{ strokeDashoffset: 283 - ringPercent }}
              transition={{ duration: 1, ease: "easeOut" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`text-2xl font-black ${overallColor}`}>{metrics.overall}</span>
            <span className="text-[9px] text-muted-foreground">/ 100</span>
          </div>
        </div>

        {/* Metrics list */}
        <div className="flex-1 space-y-2">
          {metrics.metrics.map((m) => (
            <div key={m.label} className="flex items-center gap-2">
              <m.icon size={14} className={m.color} />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">{m.label}</span>
                  <span className={`text-xs font-bold ${m.color}`}>{m.score}%</span>
                </div>
                <div className="w-full h-1 bg-border rounded-full mt-0.5">
                  <motion.div
                    className={`h-full rounded-full ${m.score >= 80 ? "bg-green-500" : m.score >= 50 ? "bg-yellow-500" : "bg-red-500"}`}
                    initial={{ width: 0 }}
                    animate={{ width: `${m.score}%` }}
                    transition={{ duration: 0.8, delay: 0.2 }}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">{m.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {metrics.totalValue > 0 && (
        <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <TrendingDown size={12} /> Capital em estoque
          </span>
          <span className="text-sm font-bold text-foreground">
            R$ {metrics.totalValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
          </span>
        </div>
      )}
    </div>
  );
}
