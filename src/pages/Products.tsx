import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { friendlyError } from "@/lib/error-messages";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Plus, Pencil, Boxes, Snowflake, AlertTriangle, Trash2 } from "lucide-react";
import NoCompanySelected from "@/components/NoCompanySelected";


type Product = any;

const UNITS = ["UN", "KG", "L", "M", "CX", "PC", "PAR"];
const PRODUCT_TYPES = [
  { v: "raw_material", l: "Matéria-prima" },
  { v: "finished_product", l: "Produto acabado" },
  { v: "resale_product", l: "Revenda" },
  { v: "consumable", l: "Consumível" },
  { v: "packaging", l: "Embalagem" },
  { v: "spare_part", l: "Peça de reposição" },
  { v: "service_item", l: "Item de serviço" },
  { v: "other", l: "Outro" },
];
const CLASSIFICATIONS = [
  { v: "perishable", l: "Perecível" },
  { v: "non_perishable", l: "Não-perecível" },
  { v: "consumer_good", l: "Bem de consumo" },
  { v: "controlled_validity", l: "Validade controlada" },
  { v: "technical_item", l: "Técnico" },
  { v: "fragile", l: "Frágil" },
  { v: "hazardous", l: "Perigoso" },
  { v: "frozen", l: "Congelado" },
  { v: "refrigerated", l: "Refrigerado" },
  { v: "dry_storage", l: "Armazenagem seca" },
  { v: "other", l: "Outro" },
];

const emptyForm = {
  sku: "", description: "", unit: "UN", barcode: "", min_stock: "0", price: "0",
  product_type: "other", classification: "" as string,
  controls_batch: false, controls_expiration: false, is_perishable: false,
  shelf_life_days: "", storage_condition: "",
  temperature_control_required: false, min_temperature: "", max_temperature: "",
  brand: "", category: "", subcategory: "", internal_code: "", ncm: "", notes: "",
};

export default function Products() {
  const { companyId, loading: companyLoading } = useCompany();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [stockOpen, setStockOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [editing, setEditing] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data: products, isLoading } = useQuery({
    queryKey: ["products", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("company_id", companyId!)
        .order("sku");
      if (error) throw error;
      return data as Product[];
    },
  });

  const { data: productStock } = useQuery({
    queryKey: ["product-stock", selectedProduct?.id],
    enabled: !!selectedProduct?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("stock_balance")
        .select("qty, address_id, lot_id, addresses(code, type), lots(lot_code)")
        .eq("product_id", selectedProduct!.id)
        .gt("qty", 0);
      return data ?? [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.sku.trim() || !form.description.trim()) throw new Error("Preencha SKU e descrição.");
      const payload: any = {
        sku: form.sku.trim(), description: form.description.trim(), unit: form.unit,
        barcode: form.barcode.trim() || null,
        min_stock: Number(form.min_stock) || 0, price: Number(form.price) || 0,
        product_type: form.product_type,
        classification: form.classification || null,
        controls_batch: form.controls_batch,
        controls_expiration: form.controls_expiration || form.is_perishable,
        is_perishable: form.is_perishable,
        shelf_life_days: form.shelf_life_days ? Number(form.shelf_life_days) : null,
        storage_condition: form.storage_condition.trim() || null,
        temperature_control_required: form.temperature_control_required,
        min_temperature: form.temperature_control_required && form.min_temperature !== "" ? Number(form.min_temperature) : null,
        max_temperature: form.temperature_control_required && form.max_temperature !== "" ? Number(form.max_temperature) : null,
        brand: form.brand.trim() || null,
        category: form.category.trim() || null,
        subcategory: form.subcategory.trim() || null,
        internal_code: form.internal_code.trim() || null,
        ncm: form.ncm.trim() || null,
        notes: form.notes.trim() || null,
      };
      if (editing) {
        const { error } = await supabase.from("products").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        payload.company_id = companyId;
        const { error } = await supabase.from("products").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast({ title: editing ? "Produto atualizado" : "Produto cadastrado" });
      closeDialog();
    },
    onError: (e: Error) => toast({ title: "Erro", description: friendlyError(e), variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: async (p: Product) => {
      const { error } = await supabase.from("products").update({ is_active: !p.is_active }).eq("id", p.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["products"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (p: Product) => {
      const { error } = await supabase.from("products").delete().eq("id", p.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast({ title: "Produto excluído" });
      setDeleting(null);
    },
    onError: (e: Error) => toast({ title: "Não foi possível excluir", description: friendlyError(e), variant: "destructive" }),
  });

  function openNew() { setEditing(null); setForm(emptyForm); setOpen(true); }

  function openEdit(p: Product) {
    setEditing(p);
    setForm({
      sku: p.sku, description: p.description, unit: p.unit,
      barcode: p.barcode || "", min_stock: String(p.min_stock || 0), price: String(p.price || 0),
      product_type: p.product_type || "other",
      classification: p.classification || "",
      controls_batch: !!p.controls_batch,
      controls_expiration: !!p.controls_expiration,
      is_perishable: !!p.is_perishable,
      shelf_life_days: p.shelf_life_days ? String(p.shelf_life_days) : "",
      storage_condition: p.storage_condition || "",
      temperature_control_required: !!p.temperature_control_required,
      min_temperature: p.min_temperature != null ? String(p.min_temperature) : "",
      max_temperature: p.max_temperature != null ? String(p.max_temperature) : "",
      brand: p.brand || "", category: p.category || "", subcategory: p.subcategory || "",
      internal_code: p.internal_code || "", ncm: p.ncm || "", notes: p.notes || "",
    });
    setOpen(true);
  }

  function closeDialog() { setOpen(false); setEditing(null); }

  // dynamic: perishable forces expiration control
  function setPerishable(v: boolean) {
    setForm(f => ({ ...f, is_perishable: v, controls_expiration: v ? true : f.controls_expiration, classification: v && !f.classification ? "perishable" : f.classification }));
  }

  if (!companyLoading && !companyId) return <NoCompanySelected />;

  return (
    <div className="page-container">
      <div className="flex items-center justify-between mb-6">
        <h1 className="page-title mb-0">Produtos</h1>
        <Button onClick={openNew} size="lg"><Plus size={18} className="mr-1" /> Novo</Button>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Carregando...</p>
      ) : (
        <>
          <div className="hidden md:block bg-card border border-border rounded-xl overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr><th>SKU</th><th>Descrição</th><th>Tipo / Class.</th><th>Un</th><th>Preço</th><th>Mín</th><th>Controles</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {products?.map((p) => (
                  <tr key={p.id} className={!p.is_active ? "opacity-50" : ""}>
                    <td className="font-mono font-semibold">{p.sku}</td>
                    <td>{p.description}</td>
                    <td className="text-xs">
                      <div>{PRODUCT_TYPES.find(t => t.v === p.product_type)?.l || "—"}</div>
                      {p.classification && <div className="text-muted-foreground">{CLASSIFICATIONS.find(c => c.v === p.classification)?.l}</div>}
                    </td>
                    <td>{p.unit}</td>
                    <td className="text-xs">R$ {Number(p.price || 0).toFixed(2)}</td>
                    <td className="text-xs">{p.min_stock || 0}</td>
                    <td className="text-xs">
                      <div className="flex flex-wrap gap-1">
                        {p.is_perishable && <span className="bg-warning/15 text-warning px-1.5 py-0.5 rounded text-[10px] font-bold">PER</span>}
                        {p.controls_batch && <span className="bg-primary/15 text-primary px-1.5 py-0.5 rounded text-[10px] font-bold">LOTE</span>}
                        {p.controls_expiration && <span className="bg-accent/15 text-accent px-1.5 py-0.5 rounded text-[10px] font-bold">VAL</span>}
                        {p.temperature_control_required && <Snowflake size={12} className="text-primary" />}
                      </div>
                    </td>
                    <td>
                      <button onClick={() => toggleMutation.mutate(p)} className={`text-xs px-2 py-0.5 rounded-md font-medium ${p.is_active ? "bg-accent/15 text-accent" : "bg-muted text-muted-foreground"}`}>
                        {p.is_active ? "Ativo" : "Inativo"}
                      </button>
                    </td>
                    <td className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => { setSelectedProduct(p); setStockOpen(true); }}><Boxes size={16} /></Button>
                      <Button variant="ghost" size="sm" onClick={() => openEdit(p)}><Pencil size={16} /></Button>
                      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeleting(p)}><Trash2 size={16} /></Button>
                    </td>
                  </tr>
                ))}
                {products?.length === 0 && (
                  <tr><td colSpan={9} className="text-center text-muted-foreground py-8">Nenhum produto cadastrado.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {products?.map((p) => (
              <div key={p.id} className={`bg-card border border-border rounded-xl p-4 ${!p.is_active ? "opacity-50" : ""}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono font-bold text-sm">{p.sku}</span>
                  <button onClick={() => toggleMutation.mutate(p)} className={`text-[10px] px-2 py-0.5 rounded-md font-medium ${p.is_active ? "bg-accent/15 text-accent" : "bg-muted text-muted-foreground"}`}>
                    {p.is_active ? "Ativo" : "Inativo"}
                  </button>
                </div>
                <p className="text-sm text-foreground mb-1">{p.description}</p>
                <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                  <span>{p.unit}</span>
                  <span>R$ {Number(p.price || 0).toFixed(2)}</span>
                  <span>Mín: {p.min_stock || 0}</span>
                  {p.is_perishable && <span className="bg-warning/15 text-warning px-1.5 py-0.5 rounded text-[10px] font-bold">PER</span>}
                  {p.controls_batch && <span className="bg-primary/15 text-primary px-1.5 py-0.5 rounded text-[10px] font-bold">LOTE</span>}
                  {p.controls_expiration && <span className="bg-accent/15 text-accent px-1.5 py-0.5 rounded text-[10px] font-bold">VAL</span>}
                </div>
                <div className="flex gap-2 mt-2">
                  <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => { setSelectedProduct(p); setStockOpen(true); }}>
                    <Boxes size={14} className="mr-1" /> Estoque
                  </Button>
                  <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => openEdit(p)}>
                    <Pencil size={14} className="mr-1" /> Editar
                  </Button>
                  <Button variant="outline" size="sm" className="text-xs h-7 text-destructive border-destructive/30" onClick={() => setDeleting(p)}>
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            ))}
            {products?.length === 0 && (
              <p className="text-center text-muted-foreground py-8">Nenhum produto cadastrado.</p>
            )}
          </div>
        </>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Editar Produto" : "Novo Produto"}</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(); }} className="space-y-5">
            {/* Identificação */}
            <section className="space-y-3">
              <h3 className="text-xs font-bold uppercase text-muted-foreground tracking-wider">Identificação</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="sku">SKU *</Label>
                  <Input id="sku" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder="PROD-001" maxLength={50} />
                </div>
                <div>
                  <Label htmlFor="barcode">Cód. Barras</Label>
                  <Input id="barcode" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} placeholder="EAN-13" maxLength={50} />
                </div>
              </div>
              <div>
                <Label htmlFor="desc">Descrição *</Label>
                <Input id="desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Caixa de Parafusos M8" maxLength={200} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Marca</Label>
                  <Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} maxLength={100} />
                </div>
                <div>
                  <Label>Categoria</Label>
                  <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} maxLength={100} />
                </div>
                <div>
                  <Label>Subcategoria</Label>
                  <Input value={form.subcategory} onChange={(e) => setForm({ ...form, subcategory: e.target.value })} maxLength={100} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Cód. interno</Label>
                  <Input value={form.internal_code} onChange={(e) => setForm({ ...form, internal_code: e.target.value })} maxLength={50} />
                </div>
                <div>
                  <Label>NCM</Label>
                  <Input value={form.ncm} onChange={(e) => setForm({ ...form, ncm: e.target.value })} maxLength={20} />
                </div>
              </div>
            </section>

            {/* Comercial */}
            <section className="space-y-3">
              <h3 className="text-xs font-bold uppercase text-muted-foreground tracking-wider">Comercial</h3>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Unidade</Label>
                  <Select value={form.unit} onValueChange={(v) => setForm({ ...form, unit: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Preço (R$)</Label>
                  <Input type="number" step="0.01" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
                </div>
                <div>
                  <Label>Mín.</Label>
                  <Input type="number" min="0" value={form.min_stock} onChange={(e) => setForm({ ...form, min_stock: e.target.value })} />
                </div>
              </div>
            </section>

            {/* Classificação */}
            <section className="space-y-3">
              <h3 className="text-xs font-bold uppercase text-muted-foreground tracking-wider">Classificação</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Tipo do produto</Label>
                  <Select value={form.product_type} onValueChange={(v) => setForm({ ...form, product_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{PRODUCT_TYPES.map(t => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Classificação</Label>
                  <Select value={form.classification || "none"} onValueChange={(v) => setForm({ ...form, classification: v === "none" ? "" : v })}>
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Não definida —</SelectItem>
                      {CLASSIFICATIONS.map(c => <SelectItem key={c.v} value={c.v}>{c.l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </section>

            {/* Regras de controle */}
            <section className="space-y-3 bg-secondary/40 rounded-xl p-4">
              <h3 className="text-xs font-bold uppercase text-muted-foreground tracking-wider flex items-center gap-2">
                <AlertTriangle size={14} className="text-warning" /> Regras de controle
              </h3>

              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm">Produto perecível</Label>
                  <p className="text-xs text-muted-foreground">Forçará controle de validade no recebimento.</p>
                </div>
                <Switch checked={form.is_perishable} onCheckedChange={setPerishable} />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm">Controla lote/batch</Label>
                  <p className="text-xs text-muted-foreground">Recebimento exigirá código de lote.</p>
                </div>
                <Switch checked={form.controls_batch} onCheckedChange={(v) => setForm({ ...form, controls_batch: v })} />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm">Controla validade</Label>
                  <p className="text-xs text-muted-foreground">Recebimento exigirá data de validade.</p>
                </div>
                <Switch checked={form.controls_expiration || form.is_perishable} disabled={form.is_perishable} onCheckedChange={(v) => setForm({ ...form, controls_expiration: v })} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Vida útil (dias)</Label>
                  <Input type="number" min="0" value={form.shelf_life_days} onChange={(e) => setForm({ ...form, shelf_life_days: e.target.value })} />
                </div>
                <div>
                  <Label>Condição de armazenagem</Label>
                  <Input value={form.storage_condition} onChange={(e) => setForm({ ...form, storage_condition: e.target.value })} placeholder="Seco, ambiente, etc." maxLength={120} />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm flex items-center gap-1"><Snowflake size={12} /> Controle de temperatura</Label>
                </div>
                <Switch checked={form.temperature_control_required} onCheckedChange={(v) => setForm({ ...form, temperature_control_required: v })} />
              </div>

              {form.temperature_control_required && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Temp. mín. (°C)</Label>
                    <Input type="number" step="0.1" value={form.min_temperature} onChange={(e) => setForm({ ...form, min_temperature: e.target.value })} />
                  </div>
                  <div>
                    <Label>Temp. máx. (°C)</Label>
                    <Input type="number" step="0.1" value={form.max_temperature} onChange={(e) => setForm({ ...form, max_temperature: e.target.value })} />
                  </div>
                </div>
              )}
            </section>

            <div>
              <Label>Observações</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} maxLength={1000} rows={2} />
            </div>

            <Button type="submit" className="w-full" size="lg" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={stockOpen} onOpenChange={setStockOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Boxes size={20} className="text-primary" /> Estoque — {selectedProduct?.sku}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {productStock?.map((s: any, i: number) => (
              <div key={i} className="flex items-center justify-between bg-secondary/50 rounded-lg px-3 py-2">
                <div>
                  <span className="font-mono text-xs">{s.addresses?.code}</span>
                  <span className={`ml-2 text-[10px] font-medium px-1.5 py-0.5 rounded ${s.addresses?.type === "ARMAZENAGEM" ? "bg-primary/10 text-primary" : "bg-accent/10 text-accent"}`}>{s.addresses?.type}</span>
                </div>
                <div className="text-right">
                  <span className="text-xs text-muted-foreground mr-2">{s.lots?.lot_code}</span>
                  <span className="font-bold">{s.qty}</span>
                </div>
              </div>
            ))}
            {(!productStock || productStock.length === 0) && (
              <p className="text-center text-muted-foreground py-4 text-sm">Sem estoque registrado.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle className="flex items-center gap-2 text-destructive"><AlertTriangle size={18} /> Excluir produto</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Excluir <strong>{deleting?.sku}</strong> — {deleting?.description}?
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            A exclusão só será permitida se o produto <strong>não tiver estoque, movimentos ou lotes vinculados</strong>. Caso contrário, use "Desativar".
          </p>
          <div className="flex gap-3 mt-4">
            <Button variant="outline" className="flex-1" onClick={() => setDeleting(null)}>Cancelar</Button>
            <Button variant="destructive" className="flex-1" onClick={() => deleting && deleteMutation.mutate(deleting)} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? "Excluindo..." : "Excluir permanentemente"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
