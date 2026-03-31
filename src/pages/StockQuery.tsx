import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatAddressDisplay } from "@/lib/address-utils";
import { Download } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const STALE_DAYS_DEFAULT = 30;

export default function StockQuery() {
  const [filterSku, setFilterSku] = useState("");
  const [filterAddress, setFilterAddress] = useState("");
  const [filterType, setFilterType] = useState("ALL");
  const [staleDays, setStaleDays] = useState(STALE_DAYS_DEFAULT);

  const { data: stock } = useQuery({
    queryKey: ["stock-query"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_balance")
        .select("*, products(sku, description, unit), addresses(code, type), lots(lot_code, expires_at)")
        .gt("qty", 0);
      if (error) throw error;
      return data;
    },
  });

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
    if (!filtered || filtered.length === 0) {
      toast({ title: "Nada para exportar", variant: "destructive" });
      return;
    }
    const headers = ["SKU", "Produto", "Endereço", "Tipo", "Lote", "Validade", "Saldo", "Unidade", "Última Mov.", "Dias Parado"];
    const rows = filtered.map((s: any) => [
      s.products?.sku,
      s.products?.description,
      s.addresses?.code ? formatAddressDisplay(s.addresses.code) : "",
      s.addresses?.type,
      s.lots?.lot_code,
      s.lots?.expires_at ? new Date(s.lots.expires_at).toLocaleDateString("pt-BR") : "",
      s.qty,
      s.products?.unit,
      new Date(s.last_movement_at).toLocaleDateString("pt-BR"),
      s.daysStale,
    ]);

    const csv = [headers, ...rows].map((r) => r.map((c: any) => `"${c ?? ""}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `estoque_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "CSV exportado com sucesso!" });
  }

  return (
    <div className="page-container">
      <div className="flex items-center justify-between mb-6">
        <h1 className="page-title mb-0">Consulta de Estoque</h1>
        <Button onClick={exportCSV} variant="outline" size="sm" className="gap-2">
          <Download size={16} /> Exportar CSV
        </Button>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <Input placeholder="Buscar SKU ou produto..." value={filterSku} onChange={(e) => setFilterSku(e.target.value)} className="w-56" />
        <Input placeholder="Buscar endereço..." value={filterAddress} onChange={(e) => setFilterAddress(e.target.value)} className="w-40" />
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos os tipos</SelectItem>
            <SelectItem value="ARMAZENAGEM">Armazenagem</SelectItem>
            <SelectItem value="TECNICO">Técnico</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground whitespace-nowrap">Dias parado:</span>
          <Input type="number" min={1} value={staleDays} onChange={(e) => setStaleDays(Number(e.target.value) || 30)} className="w-16" />
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Produto</th>
              <th>Endereço</th>
              <th>Tipo End.</th>
              <th>Lote</th>
              <th>Validade</th>
              <th>Saldo</th>
              <th>Última Mov.</th>
              <th>Dias Parado</th>
            </tr>
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
                <td className={`font-semibold ${s.daysStale >= staleDays ? "text-destructive" : ""}`}>
                  {s.daysStale}
                </td>
              </tr>
            ))}
            {filtered?.length === 0 && (
              <tr><td colSpan={9} className="text-center text-muted-foreground py-8">Nenhum item em estoque encontrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {filtered && filtered.length > 0 && (
        <div className="mt-3 text-xs text-muted-foreground">
          {filtered.length} registro(s) • {filtered.filter((s: any) => s.daysStale >= staleDays).length} item(ns) parado(s) há mais de {staleDays} dias
        </div>
      )}
    </div>
  );
}
