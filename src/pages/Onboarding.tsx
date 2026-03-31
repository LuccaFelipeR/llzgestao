import { useState, useCallback } from "react";
import Papa from "papaparse";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/hooks/use-toast";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle } from "lucide-react";

const DB_FIELDS = [
  { key: "sku", label: "SKU", required: true },
  { key: "description", label: "Descrição", required: true },
  { key: "barcode", label: "Código de Barras", required: false },
  { key: "unit", label: "Unidade", required: false },
  { key: "min_stock", label: "Estoque Mínimo", required: false },
  { key: "price", label: "Preço", required: false },
];

export default function Onboarding() {
  const [csvData, setCsvData] = useState<any[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ success: number; errors: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);

  function handleFile(file: File) {
    if (!file.name.endsWith(".csv")) {
      toast({ title: "Formato inválido", description: "Envie um arquivo .csv", variant: "destructive" });
      return;
    }
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        if (res.data.length === 0) {
          toast({ title: "Arquivo vazio", variant: "destructive" });
          return;
        }
        setCsvData(res.data);
        setCsvHeaders(res.meta.fields ?? []);
        setResult(null);
        setProgress(0);
        // Auto-map by similar names
        const autoMap: Record<string, string> = {};
        for (const field of DB_FIELDS) {
          const match = (res.meta.fields ?? []).find(
            (h) => h.toLowerCase().replace(/[^a-z]/g, "") === field.key.toLowerCase().replace(/[^a-z]/g, "") ||
              h.toLowerCase().includes(field.label.toLowerCase())
          );
          if (match) autoMap[field.key] = match;
        }
        setMapping(autoMap);
      },
    });
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, []);

  async function startImport() {
    const skuCol = mapping.sku;
    const descCol = mapping.description;
    if (!skuCol || !descCol) {
      toast({ title: "Mapeie pelo menos SKU e Descrição", variant: "destructive" });
      return;
    }

    setImporting(true);
    setProgress(0);
    let success = 0, errors = 0;
    const total = csvData.length;

    for (let i = 0; i < total; i++) {
      const row = csvData[i];
      const product: any = {
        sku: String(row[skuCol] ?? "").trim(),
        description: String(row[descCol] ?? "").trim(),
      };
      if (!product.sku || !product.description) { errors++; continue; }
      if (mapping.barcode && row[mapping.barcode]) product.barcode = String(row[mapping.barcode]).trim();
      if (mapping.unit && row[mapping.unit]) product.unit = String(row[mapping.unit]).trim().toUpperCase();
      if (mapping.min_stock && row[mapping.min_stock]) product.min_stock = Number(row[mapping.min_stock]) || 0;
      if (mapping.price && row[mapping.price]) product.price = Number(row[mapping.price]) || 0;

      const { error } = await supabase.from("products").insert(product);
      if (error) errors++;
      else success++;
      setProgress(Math.round(((i + 1) / total) * 100));
    }

    setResult({ success, errors });
    setImporting(false);
    if (success > 0) toast({ title: `${success} produtos importados!` });
  }

  return (
    <div className="page-container max-w-2xl mx-auto">
      <h1 className="page-title">Configuração Inicial</h1>
      <p className="text-sm text-muted-foreground mb-6">Importe seus produtos em massa a partir de um arquivo CSV.</p>

      {/* Drag & Drop zone */}
      {csvData.length === 0 && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors cursor-pointer ${dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
          onClick={() => document.getElementById("csv-input")?.click()}
        >
          <Upload size={40} className="mx-auto text-muted-foreground mb-3" />
          <p className="font-medium text-foreground">Arraste seu arquivo CSV aqui</p>
          <p className="text-sm text-muted-foreground mt-1">ou clique para selecionar</p>
          <input
            id="csv-input"
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
        </div>
      )}

      {/* Mapping interface */}
      {csvData.length > 0 && !result && (
        <div className="space-y-6">
          <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
            <FileSpreadsheet size={24} className="text-primary" />
            <div>
              <p className="font-semibold text-sm">{csvData.length} linhas encontradas</p>
              <p className="text-xs text-muted-foreground">{csvHeaders.length} colunas: {csvHeaders.join(", ")}</p>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="font-semibold text-sm">Mapeamento de Colunas</h3>
            {DB_FIELDS.map((field) => (
              <div key={field.key} className="flex items-center gap-3">
                <Label className="w-36 text-sm">
                  {field.label} {field.required && <span className="text-destructive">*</span>}
                </Label>
                <Select value={mapping[field.key] || "NONE"} onValueChange={(v) => setMapping({ ...mapping, [field.key]: v === "NONE" ? "" : v })}>
                  <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">— Ignorar —</SelectItem>
                    {csvHeaders.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>

          {/* Preview */}
          <div className="bg-muted/50 rounded-xl p-3 overflow-x-auto">
            <p className="text-xs font-semibold mb-2 text-muted-foreground">Prévia (primeiras 3 linhas):</p>
            <table className="text-xs w-full">
              <thead>
                <tr>{DB_FIELDS.filter(f => mapping[f.key]).map(f => <th key={f.key} className="text-left px-2 py-1">{f.label}</th>)}</tr>
              </thead>
              <tbody>
                {csvData.slice(0, 3).map((row, i) => (
                  <tr key={i} className="border-t border-border">
                    {DB_FIELDS.filter(f => mapping[f.key]).map(f => <td key={f.key} className="px-2 py-1">{row[mapping[f.key]] || "—"}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {importing && (
            <div className="space-y-2">
              <Progress value={progress} className="h-3" />
              <p className="text-xs text-center text-muted-foreground">{progress}% concluído</p>
            </div>
          )}

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => { setCsvData([]); setCsvHeaders([]); setMapping({}); }}>Cancelar</Button>
            <Button onClick={startImport} disabled={importing} className="flex-1" size="lg">
              {importing ? "Importando..." : `Importar ${csvData.length} Produtos`}
            </Button>
          </div>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="bg-card border border-border rounded-xl p-6 text-center space-y-3">
          <CheckCircle2 size={48} className="mx-auto text-green-500" />
          <h3 className="font-bold text-lg">Importação Concluída</h3>
          <p className="text-sm text-muted-foreground">
            <span className="text-green-600 font-semibold">{result.success}</span> importados com sucesso
            {result.errors > 0 && <>, <span className="text-destructive font-semibold">{result.errors}</span> com erro</>}
          </p>
          <Button onClick={() => { setCsvData([]); setResult(null); setMapping({}); }} variant="outline">Importar Outro</Button>
        </div>
      )}
    </div>
  );
}
