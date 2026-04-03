import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, CheckCircle2, XCircle, AlertOctagon, PackageX, MapPinOff, DollarSign, Tag, Loader2 } from "lucide-react";
import { motion } from "framer-motion";

interface AuditIssue {
  severity: "critical" | "warning" | "info";
  category: string;
  title: string;
  description: string;
  count: number;
  icon: any;
}

export default function OperationalAudit() {
  const { data: audit, isLoading } = useQuery({
    queryKey: ["operational-audit"],
    queryFn: async () => {
      const issues: AuditIssue[] = [];

      // 1. Negative stock
      const { data: negStock } = await supabase.from("stock_balance").select("qty, products(sku)").lt("qty", 0);
      if (negStock?.length) {
        issues.push({ severity: "critical", category: "Integridade", title: "Estoque Negativo", description: `${negStock.length} posição(ões) com quantidade negativa`, count: negStock.length, icon: XCircle });
      }

      // 2. Products without price
      const { data: noPriceProducts } = await supabase.from("products").select("id").eq("is_active", true).eq("price", 0);
      if (noPriceProducts?.length) {
        issues.push({ severity: "warning", category: "Cadastro", title: "Produtos Sem Preço", description: `${noPriceProducts.length} produto(s) ativo(s) sem preço definido`, count: noPriceProducts.length, icon: DollarSign });
      }

      // 3. Lots without expiry
      const { data: noExpiryLots } = await supabase.from("lots").select("id").is("expires_at", null);
      if (noExpiryLots?.length) {
        issues.push({ severity: "info", category: "Rastreabilidade", title: "Lotes Sem Validade", description: `${noExpiryLots.length} lote(s) sem data de validade`, count: noExpiryLots.length, icon: Tag });
      }

      // 4. Products without min_stock
      const { data: noMinProducts } = await supabase.from("products").select("id").eq("is_active", true).eq("min_stock", 0);
      if (noMinProducts?.length) {
        issues.push({ severity: "warning", category: "Parâmetros", title: "Sem Estoque Mínimo", description: `${noMinProducts.length} produto(s) sem estoque mínimo definido`, count: noMinProducts.length, icon: PackageX });
      }

      // 5. Inactive addresses with stock
      const { data: inactiveWithStock } = await supabase.from("stock_balance").select("address_id, qty, addresses(is_active, code)").gt("qty", 0);
      const inactiveCount = (inactiveWithStock as any[])?.filter(s => s.addresses && !s.addresses.is_active).length || 0;
      if (inactiveCount > 0) {
        issues.push({ severity: "critical", category: "Operacional", title: "Estoque em Endereço Inativo", description: `${inactiveCount} posição(ões) com estoque em endereços desativados`, count: inactiveCount, icon: MapPinOff });
      }

      // 6. Duplicate SKUs
      const { data: allProducts } = await supabase.from("products").select("sku").eq("is_active", true);
      if (allProducts) {
        const skuCount: Record<string, number> = {};
        allProducts.forEach(p => { skuCount[p.sku] = (skuCount[p.sku] || 0) + 1; });
        const dupes = Object.entries(skuCount).filter(([, c]) => c > 1);
        if (dupes.length) {
          issues.push({ severity: "critical", category: "Cadastro", title: "SKUs Duplicados", description: `${dupes.length} SKU(s) com duplicatas: ${dupes.map(([s]) => s).join(", ")}`, count: dupes.length, icon: AlertOctagon });
        }
      }

      // 7. Dead stock (>60 days)
      const { data: deadStock } = await supabase.from("stock_balance").select("id").gt("qty", 0);
      if (deadStock) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 60);
        const { data: oldStock } = await supabase.from("stock_balance").select("id").gt("qty", 0).lt("last_movement_at", cutoff.toISOString());
        if (oldStock?.length) {
          issues.push({ severity: "warning", category: "Operacional", title: "Estoque Morto (60+ dias)", description: `${oldStock.length} posição(ões) sem movimentação há mais de 60 dias`, count: oldStock.length, icon: AlertTriangle });
        }
      }

      return issues.sort((a, b) => {
        const order = { critical: 0, warning: 1, info: 2 };
        return order[a.severity] - order[b.severity];
      });
    },
    refetchInterval: 60000,
  });

  const score = audit ? Math.max(0, 100 - (audit.filter(i => i.severity === "critical").length * 20 + audit.filter(i => i.severity === "warning").length * 5 + audit.filter(i => i.severity === "info").length * 1)) : 100;
  const severityColors = { critical: "border-destructive/30 bg-destructive/5", warning: "border-warning/30 bg-warning/5", info: "border-primary/20 bg-primary/5" };
  const severityTextColors = { critical: "text-destructive", warning: "text-warning", info: "text-primary" };
  const severityLabels = { critical: "Crítico", warning: "Atenção", info: "Info" };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={24} className="animate-spin text-primary" />
        <span className="ml-2 text-sm text-muted-foreground">Auditando sistema...</span>
      </div>
    );
  }

  return (
    <div>
      {/* Score */}
      <div className="flex items-center gap-4 mb-6 p-5 glass-card">
        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-black ${
          score >= 80 ? "bg-success/15 text-success" : score >= 50 ? "bg-warning/15 text-warning" : "bg-destructive/15 text-destructive"
        }`}>
          {score}
        </div>
        <div>
          <h3 className="font-bold text-foreground">Score de Auditoria</h3>
          <p className="text-sm text-muted-foreground">
            {score >= 80 ? "Sistema saudável" : score >= 50 ? "Atenção necessária" : "Problemas críticos detectados"}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">{audit?.length || 0} problema(s) encontrado(s)</p>
        </div>
        {score === 100 && <CheckCircle2 size={32} className="text-success ml-auto" />}
      </div>

      {/* Issues */}
      {audit && audit.length === 0 && (
        <div className="text-center py-8">
          <CheckCircle2 size={48} className="text-success mx-auto mb-3" />
          <p className="font-semibold text-foreground">Nenhum problema encontrado!</p>
          <p className="text-sm text-muted-foreground">Seu sistema está limpo e organizado.</p>
        </div>
      )}

      <div className="space-y-3">
        {audit?.map((issue, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            className={`border rounded-xl p-4 ${severityColors[issue.severity]}`}>
            <div className="flex items-start gap-3">
              <issue.icon size={20} className={severityTextColors[issue.severity]} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-semibold text-sm text-foreground">{issue.title}</span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${severityTextColors[issue.severity]} bg-background/50`}>
                    {severityLabels[issue.severity]}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{issue.description}</p>
                <p className="text-[10px] text-muted-foreground mt-1">Categoria: {issue.category}</p>
              </div>
              <span className={`text-lg font-black ${severityTextColors[issue.severity]}`}>{issue.count}</span>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
