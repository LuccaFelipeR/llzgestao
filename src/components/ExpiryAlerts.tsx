import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, Calendar } from "lucide-react";

export default function ExpiryAlerts() {
  const { data: expiringLots } = useQuery({
    queryKey: ["expiring-lots"],
    queryFn: async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);

      const { data } = await supabase
        .from("stock_balance")
        .select("qty, lots(lot_code, expires_at), products(sku, description)")
        .gt("qty", 0);

      if (!data) return [];

      const now = new Date();
      return (data as any[])
        .filter((s) => s.lots?.expires_at)
        .map((s) => {
          const expiresAt = new Date(s.lots.expires_at);
          const daysUntilExpiry = Math.floor((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          return { ...s, daysUntilExpiry, expiresAt };
        })
        .filter((s) => s.daysUntilExpiry <= 30)
        .sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
    },
  });

  if (!expiringLots || expiringLots.length === 0) return null;

  return (
    <div className="bg-destructive/5 border border-destructive/20 rounded-xl p-4 mb-6">
      <h3 className="text-sm font-semibold text-destructive flex items-center gap-2 mb-3">
        <AlertTriangle size={16} />
        Alertas de Validade ({expiringLots.length})
      </h3>
      <div className="space-y-2 max-h-40 overflow-y-auto">
        {expiringLots.map((lot: any, i: number) => (
          <div key={i} className="flex items-center justify-between text-xs bg-background/50 rounded-lg px-3 py-2">
            <div className="flex items-center gap-2">
              <Calendar size={12} className="text-destructive" />
              <span className="font-mono font-medium">{lot.products?.sku}</span>
              <span className="text-muted-foreground">Lote: {lot.lots?.lot_code}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Qtd: {lot.qty}</span>
              <span className={`font-semibold ${lot.daysUntilExpiry <= 0 ? "text-destructive" : lot.daysUntilExpiry <= 7 ? "text-destructive" : "text-warning"}`}>
                {lot.daysUntilExpiry <= 0 ? "VENCIDO" : `${lot.daysUntilExpiry}d`}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
