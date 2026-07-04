import { useState, useCallback } from "react";
import Papa from "papaparse";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Package, MapPin, Download } from "lucide-react";

// =====================================================
// Field definitions
// =====================================================

type Field = { key: string; label: string; required?: boolean; type?: "text" | "number" | "boolean" };

const PRODUCT_FIELDS: Field[] = [
  { key: "sku", label: "SKU", required: true },
  { key: "description", label: "Descrição", required: true },
  { key: "barcode", label: "Código de Barras" },
  { key: "unit", label: "Unidade" },
  { key: "price", label: "Preço", type: "number" },
  { key: "min_stock", label: "Estoque Mínimo", type: "number" },
  { key: "product_type", label: "Tipo de Produto" },
  { key: "classification", label: "Classificação" },
  { key: "is_perishable", label: "É Perecível?", type: "boolean" },
  { key: "controls_batch", label: "Controla Lote?", type: "boolean" },
  { key: "controls_expiration", label: "Controla Validade?", type: "boolean" },
  { key: "shelf_life_days", label: "Vida Útil (dias)", type: "number" },
  { key: "storage_condition", label: "Condição de Armaz." },
  { key: "temperature_control_required", label: "Requer Temperatura?", type: "boolean" },
  { key: "min_temperature", label: "Temp. Mínima", type: "number" },
  { key: "max_temperature", label: "Temp. Máxima", type: "number" },
  { key: "brand", label: "Marca" },
  { key: "category", label: "Categoria" },
  { key: "subcategory", label: "Subcategoria" },
  { key: "internal_code", label: "Código Interno" },
  { key: "ncm", label: "NCM" },
  { key: "notes", label: "Observações" },
];

const ADDRESS_FIELDS: Field[] = [
  { key: "code", label: "Código (R-P-A-L-F)", required: true },
  { key: "type", label: "Tipo (ARMAZENAGEM/PICKING/...)" },
  { key: "is_active", label: "Ativo?", type: "boolean" },
];

type Result = { created: number; updated: number; skipped: number; failed: number; errors: string[] };

// =====================================================
// Importer hook factory
// =====================================================

function coerce(val: any, type?: Field["type"]) {
  if (val === undefined || val === null || val === "") return null;
  const s = String(val).trim();
  if (type === "number") {
    const n = Number(s.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  if (type === "boolean") {
    const t = s.toLowerCase();
    if (["1", "true", "sim", "s", "yes", "y", "x"].includes(t)) return true;
    if (["0", "false", "nao", "não", "n", "no"].includes(t)) return false;
    return null;
  }
  return s;
}

function Importer({
  entity,
  fields,
  companyId,
  templateUrl,
  templateFilename,
  helpText,
}: {
  entity: "products" | "addresses";
  fields: Field[];
  companyId: string | null;
  templateUrl: string;
  templateFilename: string;
  helpText: React.ReactNode;
}) {
  const [csvData, setCsvData] = useState<any[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [previewErrors, setPreviewErrors] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);

  function reset() {
    setCsvData([]); setCsvHeaders([]); setMapping({}); setResult(null); setProgress(0); setPreviewErrors([]);
  }

  function handleFile(file: File) {
    if (!file.name.endsWith(".csv")) {
      toast({ title: "Formato inválido", description: "Envie um arquivo .csv", variant: "destructive" });
      return;
    }
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: (res) => {
        if (res.data.length === 0) {
          toast({ title: "Arquivo vazio", variant: "destructive" }); return;
        }
        setCsvData(res.data as any[]);
        setCsvHeaders(res.meta.fields ?? []);
        setResult(null); setProgress(0);
        // Auto-map by header similarity
        const autoMap: Record<string, string> = {};
        for (const f of fields) {
          const match = (res.meta.fields ?? []).find(
            (h) => h.toLowerCase().replace(/[^a-z]/g, "") === f.key.toLowerCase().replace(/[^a-z]/g, "") ||
              h.toLowerCase().includes(f.label.toLowerCase().split(" ")[0])
          );
          if (match) autoMap[f.key] = match;
        }
        setMapping(autoMap);
        validatePreview(res.data as any[], autoMap);
      },
    });
  }

  function validatePreview(rows: any[], map: Record<string, string>) {
    const errors: string[] = [];
    const required = fields.filter((f) => f.required);
    for (const f of required) {
      if (!map[f.key]) errors.push(`Campo obrigatório não mapeado: ${f.label}`);
    }
    if (map.sku || map.code) {
      const seen = new Set<string>();
      const dupes = new Set<string>();
      const keyCol = entity === "products" ? map.sku : map.code;
      rows.forEach((r) => {
        const v = String(r[keyCol] ?? "").trim();
        if (!v) return;
        if (seen.has(v)) dupes.add(v); else seen.add(v);
      });
      if (dupes.size > 0) errors.push(`Duplicados no arquivo (${dupes.size}): ${Array.from(dupes).slice(0, 5).join(", ")}`);
    }
    setPreviewErrors(errors);
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files[0]; if (file) handleFile(file);
  }, []);

  async function startImport() {
    if (!companyId) { toast({ title: "Empresa não definida", variant: "destructive" }); return; }
    validatePreview(csvData, mapping);
    const required = fields.filter((f) => f.required);
    for (const f of required) {
      if (!mapping[f.key]) {
        toast({ title: `Mapeie o campo: ${f.label}`, variant: "destructive" }); return;
      }
    }
    setImporting(true); setProgress(0);
    const res: Result = { created: 0, updated: 0, skipped: 0, failed: 0, errors: [] };
    const total = csvData.length;

    // Fetch existing keys for this company (dedupe by company_id + sku/code)
    const keyField = entity === "products" ? "sku" : "code";
    const { data: existing } = await supabase.from(entity as any).select(`id, ${keyField}, company_id`).eq("company_id", companyId);
    const existingMap = new Map<string, string>();
    (existing ?? []).forEach((r: any) => existingMap.set(String(r[keyField]), r.id));

    for (let i = 0; i < total; i++) {
      const row = csvData[i];
      const payload: any = { company_id: companyId };
      for (const f of fields) {
        const col = mapping[f.key];
        if (!col) continue;
        const v = coerce(row[col], f.type);
        if (v !== null && v !== undefined && v !== "") payload[f.key] = v;
      }
      const keyValRaw = payload[keyField];
      if (!keyValRaw) { res.skipped++; setProgress(Math.round(((i + 1) / total) * 100)); continue; }
      const keyVal = String(keyValRaw).trim();
      payload[keyField] = keyVal;

      // Address-specific: derive rua/posicao/andar/lado/face
      if (entity === "addresses" && payload.code) {
        const parts = String(payload.code).split("-");
        if (parts.length === 5) {
          payload.rua = parts[0]; payload.posicao = parts[1]; payload.andar = parts[2]; payload.lado = parts[3]; payload.face = parts[4];
        } else {
          res.failed++; res.errors.push(`Linha ${i + 2}: código de endereço inválido (${payload.code})`);
          setProgress(Math.round(((i + 1) / total) * 100)); continue;
        }
        if (!payload.type) payload.type = "ARMAZENAGEM";
      }

      try {
        const existingId = existingMap.get(keyVal);
        if (existingId) {
          // Never update across companies — already filtered by company_id above
          const { error } = await supabase.from(entity as any).update(payload).eq("id", existingId).eq("company_id", companyId);
          if (error) { res.failed++; res.errors.push(`Linha ${i + 2}: ${error.message}`); }
          else res.updated++;
        } else {
          const { error } = await supabase.from(entity as any).insert(payload);
          if (error) { res.failed++; res.errors.push(`Linha ${i + 2}: ${error.message}`); }
          else res.created++;
        }
      } catch (e: any) {
        res.failed++; res.errors.push(`Linha ${i + 2}: ${e.message ?? e}`);
      }
      setProgress(Math.round(((i + 1) / total) * 100));
    }

    setResult(res);
    setImporting(false);
    toast({ title: "Importação concluída", description: `${res.created} criados • ${res.updated} atualizados • ${res.skipped} ignorados • ${res.failed} falhas` });
  }

  return (
    <div>
      <div className="mb-4 bg-primary/5 border border-primary/20 rounded-xl p-4 flex items-start gap-3">
        <FileSpreadsheet size={20} className="text-primary shrink-0 mt-0.5" />
        <div className="flex-1 text-xs space-y-2">
          <p className="font-semibold text-foreground text-sm">Modelo de planilha</p>
          <div className="text-muted-foreground">{helpText}</div>
          <a href={templateUrl} download={templateFilename}
            className="inline-flex items-center gap-1.5 text-primary font-semibold hover:underline">
            <Download size={14} /> Baixar modelo CSV com exemplos
          </a>
        </div>
      </div>

      {csvData.length === 0 && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors cursor-pointer ${dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
          onClick={() => document.getElementById(`csv-input-${entity}`)?.click()}
        >
          <Upload size={40} className="mx-auto text-muted-foreground mb-3" />
          <p className="font-medium text-foreground">Arraste seu CSV aqui</p>
          <p className="text-sm text-muted-foreground mt-1">ou clique para selecionar</p>
          <input id={`csv-input-${entity}`} type="file" accept=".csv" className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
        </div>
      )}


      {csvData.length > 0 && !result && (
        <div className="space-y-5">
          <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
            <FileSpreadsheet size={24} className="text-primary" />
            <div>
              <p className="font-semibold text-sm">{csvData.length} linha(s) encontradas</p>
              <p className="text-xs text-muted-foreground">{csvHeaders.length} colunas: {csvHeaders.join(", ")}</p>
            </div>
          </div>

          {previewErrors.length > 0 && (
            <div className="bg-destructive/5 border border-destructive/20 rounded-xl p-3 text-xs space-y-1">
              <p className="font-bold text-destructive flex items-center gap-1"><AlertCircle size={14} /> Avisos da prévia</p>
              {previewErrors.map((e, i) => <p key={i} className="text-destructive">• {e}</p>)}
            </div>
          )}

          <div className="space-y-2">
            <h3 className="font-semibold text-sm">Mapeamento de Colunas</h3>
            <div className="grid sm:grid-cols-2 gap-2">
              {fields.map((f) => (
                <div key={f.key} className="flex items-center gap-2">
                  <Label className="w-44 text-xs">
                    {f.label} {f.required && <span className="text-destructive">*</span>}
                  </Label>
                  <Select value={mapping[f.key] || "NONE"} onValueChange={(v) => {
                    const m = { ...mapping, [f.key]: v === "NONE" ? "" : v };
                    setMapping(m); validatePreview(csvData, m);
                  }}>
                    <SelectTrigger className="flex-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NONE">— Ignorar —</SelectItem>
                      {csvHeaders.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>

          {importing && (
            <div className="space-y-2">
              <Progress value={progress} className="h-3" />
              <p className="text-xs text-center text-muted-foreground">{progress}% concluído</p>
            </div>
          )}

          <div className="flex gap-2">
            <Button variant="outline" onClick={reset}>Cancelar</Button>
            <Button onClick={startImport} disabled={importing || previewErrors.some((e) => e.startsWith("Campo obrigatório"))} className="flex-1" size="lg">
              {importing ? "Importando..." : `Importar ${csvData.length} linha(s)`}
            </Button>
          </div>
        </div>
      )}

      {result && (
        <div className="bg-card border border-border rounded-xl p-6 space-y-3">
          <div className="flex items-center gap-3">
            <CheckCircle2 size={32} className="text-green-500" />
            <h3 className="font-bold text-lg">Importação Concluída</h3>
          </div>
          <div className="grid grid-cols-4 gap-2 text-center text-xs">
            <div className="bg-success/10 rounded-lg p-3"><p className="text-2xl font-bold text-success">{result.created}</p><p className="text-muted-foreground">Criados</p></div>
            <div className="bg-primary/10 rounded-lg p-3"><p className="text-2xl font-bold text-primary">{result.updated}</p><p className="text-muted-foreground">Atualizados</p></div>
            <div className="bg-muted rounded-lg p-3"><p className="text-2xl font-bold">{result.skipped}</p><p className="text-muted-foreground">Ignorados</p></div>
            <div className="bg-destructive/10 rounded-lg p-3"><p className="text-2xl font-bold text-destructive">{result.failed}</p><p className="text-muted-foreground">Falhas</p></div>
          </div>
          {result.errors.length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer font-semibold text-destructive">Ver {result.errors.length} erro(s)</summary>
              <div className="mt-2 space-y-1 max-h-40 overflow-y-auto bg-muted/50 rounded p-2">
                {result.errors.slice(0, 100).map((e, i) => <p key={i}>{e}</p>)}
              </div>
            </details>
          )}
          <Button onClick={reset} variant="outline">Importar Outro</Button>
        </div>
      )}
    </div>
  );
}

// =====================================================
// Page
// =====================================================

export default function Onboarding() {
  const { companyId } = useCompany();

  return (
    <div className="page-container max-w-3xl mx-auto">
      <h1 className="page-title">Importação CSV</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Importe produtos e endereços em massa. Os dados serão atribuídos automaticamente à sua empresa atual.
      </p>

      <Tabs defaultValue="products">
        <TabsList className="mb-4">
          <TabsTrigger value="products" className="gap-1"><Package size={14} /> Produtos</TabsTrigger>
          <TabsTrigger value="addresses" className="gap-1"><MapPin size={14} /> Endereços</TabsTrigger>
        </TabsList>
        <TabsContent value="products">
          <Importer entity="products" fields={PRODUCT_FIELDS} companyId={companyId}
            templateUrl="/templates/produtos-exemplo.csv" templateFilename="produtos-exemplo.csv"
            helpText={<>Campos obrigatórios: <strong>sku</strong> e <strong>description</strong>. Colunas booleanas aceitam <code>sim/nao</code> ou <code>true/false</code>. SKU é único por empresa — reimportar mesma SKU atualiza o produto. Datas no formato ISO (AAAA-MM-DD).</>} />
        </TabsContent>
        <TabsContent value="addresses">
          <Importer entity="addresses" fields={ADDRESS_FIELDS} companyId={companyId}
            templateUrl="/templates/enderecos-exemplo.csv" templateFilename="enderecos-exemplo.csv"
            helpText={<>Campo obrigatório: <strong>code</strong> no formato <code>R-P-A-L-F</code> (rua-posição-andar-lado-face). Tipo pode ser <code>ARMAZENAGEM</code>, <code>PICKING</code>, <code>RECEBIMENTO</code> ou <code>EXPEDICAO</code>. Se omitido, assume <code>ARMAZENAGEM</code>.</>} />
        </TabsContent>

      </Tabs>
    </div>
  );
}
