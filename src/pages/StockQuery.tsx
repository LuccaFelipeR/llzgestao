import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatAddressDisplay } from "@/lib/address-utils";
import { Download } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useCompany } from "@/contexts/CompanyContext";
import NoCompanySelected from "@/components/NoCompanySelected";

const STALE_DAYS_DEFAULT = 30;

export default function StockQuery() {
  const { companyId, isSuperAdmin, loading: companyLoading } = useCompany();
  const [filterSku, setFilterSku] = useState("");
  const [filterAddress, setFilterAddress] = useState("");
  const [filterType, setFilterType] = useState("ALL");
  const [staleDays, setStaleDays] = useState(STALE_DAYS_DEFAULT);

  const { data: stock } = useQuery({
    queryKey: ["stock-query", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_balance")
        .select("*, products(sku, description, unit), addresses(code, type), lots(lot_code, expires_at)")
        .eq("company_id", companyId!)
        .gt("qty", 0);
      if (error) throw error;
      return data;
    },
  });

  if (!companyLoading && !companyId) return <NoCompanySelected />;

  const now = new Date();

  const filtered = stock?.filter((s: any) => {
    if (filterSku && !s.products?.sku?.toLowerCase().includes(filterSku.toLowerCase()) && !s.products?.description?.toLowerCase().includes(filterSku.toLowerCase())) return false;
    if (filterAddress && !s.addresses?.code?.toLowerCase().includes(filterAddress.toLowerCase())) return false;
    if (filterType !== "ALL" && s.addresses?.type !== filterType) return false;
    return true;
  }).map((s: any) => {
    const lastMov = new Date(s.last_movement_at);
    const daysStale = Math.floor((now.getTime() - lastMov.getTime()) / (1000 * 60 * 60 * 24));
    return { ...s, daysStale };
  }).sort((a: any, b: any) => b.daysStale - a.daysStale);

  function exportCSV() {
    if (!filtered || filtered.length === 0) { toast({ title: "Nada para exportar", variant: "destructive" }); return; }
    const headers = ["SKU", "Produto", "Endereço", "Tipo", "Lote", "Validade", "Saldo", "Unidade", "Última Mov.", "Dias Parado"];
    const rows = filtered.map((s: any) => [
      s.products?.sku, s.products?.description, s.addresses?.code ? formatAddressDisplay(s.addresses.code) : "",
      s.addresses?.type, s.lots?.lot_code, s.lots?.expires_at ? new Date(s.lots.expires_at).toLocaleDateString("pt-BR") : "",
      s.qty, s.products?.unit, new Date(s.last_movement_at).toLocaleDateString("pt-BR"), s.daysStale,
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c: any) => `"${c ?? ""}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `estoque_${new Date().toISOString().split("T")[0]}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast({ title: "CSV exportado!" });
  }

  return (
    <div className="page-container">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="page-title mb-0">Consulta de Estoque</h1>
        <Button onClick={exportCSV} variant="outline" size="sm" className="gap-2">
          <Download size={16} /> CSV
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:flex gap-3 mb-4">
        <Input placeholder="Buscar SKU..." value={filterSku} onChange={(e) => setFilterSku(e.target.value)} className="col-span-2 sm:w-48" />
        <Input placeholder="Endereço..." value={filterAddress} onChange={(e) => setFilterAddress(e.target.value)} className="sm:w-36" />
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="sm:w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos</SelectItem>
            <SelectItem value="ARMAZENAGEM">Armazenagem</SelectItem>
            <SelectItem value="TECNICO">Técnico</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block bg-card border border-border rounded-xl overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr><th>SKU</th><th>Produto</th><th>Endereço</th><th>Tipo</th><th>Lote</th><th>Validade</th><th>Saldo</th><th>Última Mov.</th><th>Dias</th></tr>
          </thead>
          <tbody>
            {filtered?.map((s: any) => (
              <tr key={s.id} className={s.daysStale >= staleDays ? "stale-stock" : ""}>
                <td className="font-mono font-semibold text-xs">{s.products?.sku}</td>
                <td className="text-sm">{s.products?.description}</td>
                <td className="font-mono text-xs">{s.addresses?.code ? formatAddressDisplay(s.addresses.code) : "—"}</td>
                <td className="text-xs">{s.addresses?.type}</td>
                <td className="text-xs">{s.lots?.lot_code}</td>
                <td className="text-xs">{s.lots?.expires_at ? new Date(s.lots.expires_at).toLocaleDateString("pt-BR") : "—"}</td>
                <td className="font-bold text-lg">{s.qty} <span className="text-xs font-normal text-muted-foreground">{s.products?.unit}</span></td>
                <td className="text-xs">{new Date(s.last_movement_at).toLocaleDateString("pt-BR")}</td>
                <td className={`font-semibold ${s.daysStale >= staleDays ? "text-destructive" : ""}`}>{s.daysStale}</td>
              </tr>
            ))}
            {filtered?.length === 0 && (
              <tr><td colSpan={9} className="text-center text-muted-foreground py-8">Nenhum item encontrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {filtered?.map((s: any) => (
          <div key={s.id} className={`bg-card border border-border rounded-xl p-4 ${s.daysStale >= staleDays ? "border-destructive/30 bg-destructive/5" : ""}`}>
            <div className="flex items-center justify-between mb-1">
              <span className="font-mono font-bold text-sm">{s.products?.sku}</span>
              <span className="font-bold text-lg">{s.qty} <span className="text-xs font-normal text-muted-foreground">{s.products?.unit}</span></span>
            </div>
            <p className="text-sm text-muted-foreground mb-2">{s.products?.description}</p>
            <div className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
              <span>📍 {s.addresses?.code ? formatAddressDisplay(s.addresses.code) : "—"}</span>
              <span>📦 Lote: {s.lots?.lot_code}</span>
              <span>🏷️ {s.addresses?.type}</span>
              <span>📅 {s.lots?.expires_at ? new Date(s.lots.expires_at).toLocaleDateString("pt-BR") : "—"}</span>
              <span className={s.daysStale >= staleDays ? "text-destructive font-semibold" : ""}>⏱️ {s.daysStale}d parado</span>
            </div>
          </div>
        ))}
        {filtered?.length === 0 && (
          <p className="text-center text-muted-foreground py-8">Nenhum item encontrado.</p>
        )}
      </div>

      {filtered && filtered.length > 0 && (
        <div className="mt-3 text-xs text-muted-foreground">
          {filtered.length} registro(s) • {filtered.filter((s: any) => s.daysStale >= staleDays).length} parado(s) há +{staleDays}d
        </div>
      )}
    </div>
  );
}
