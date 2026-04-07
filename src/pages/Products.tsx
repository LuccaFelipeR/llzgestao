import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Plus, Pencil, Boxes } from "lucide-react";

type Product = {
  id: string; sku: string; description: string; unit: string; is_active: boolean;
  barcode?: string; min_stock?: number; price?: number;
};

const UNITS = ["UN", "KG", "L", "M", "CX", "PC", "PAR"];

export default function Products() {
  const { companyId } = useCompany();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [stockOpen, setStockOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState({ sku: "", description: "", unit: "UN", barcode: "", min_stock: "0", price: "0" });

  const { data: products, isLoading } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").order("sku");
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
        barcode: form.barcode.trim() || null, min_stock: Number(form.min_stock) || 0, price: Number(form.price) || 0,
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
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: async (p: Product) => {
      const { error } = await supabase.from("products").update({ is_active: !p.is_active }).eq("id", p.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["products"] }),
  });

  function openNew() {
    setEditing(null);
    setForm({ sku: "", description: "", unit: "UN", barcode: "", min_stock: "0", price: "0" });
    setOpen(true);
  }

  function openEdit(p: Product) {
    setEditing(p);
    setForm({ sku: p.sku, description: p.description, unit: p.unit, barcode: (p as any).barcode || "", min_stock: String((p as any).min_stock || 0), price: String((p as any).price || 0) });
    setOpen(true);
  }

  function closeDialog() { setOpen(false); setEditing(null); }

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
          {/* Desktop table */}
          <div className="hidden md:block bg-card border border-border rounded-xl overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr><th>SKU</th><th>Descrição</th><th>Cód. Barras</th><th>Un</th><th>Preço</th><th>Mín</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {products?.map((p) => (
                  <tr key={p.id} className={!p.is_active ? "opacity-50" : ""}>
                    <td className="font-mono font-semibold">{p.sku}</td>
                    <td>{p.description}</td>
                    <td className="text-xs font-mono">{(p as any).barcode || "—"}</td>
                    <td>{p.unit}</td>
                    <td className="text-xs">R$ {Number((p as any).price || 0).toFixed(2)}</td>
                    <td className="text-xs">{(p as any).min_stock || 0}</td>
                    <td>
                      <button onClick={() => toggleMutation.mutate(p)} className={`text-xs px-2 py-0.5 rounded-md font-medium ${p.is_active ? "bg-accent/15 text-accent" : "bg-muted text-muted-foreground"}`}>
                        {p.is_active ? "Ativo" : "Inativo"}
                      </button>
                    </td>
                    <td className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => { setSelectedProduct(p); setStockOpen(true); }}><Boxes size={16} /></Button>
                      <Button variant="ghost" size="sm" onClick={() => openEdit(p)}><Pencil size={16} /></Button>
                    </td>
                  </tr>
                ))}
                {products?.length === 0 && (
                  <tr><td colSpan={8} className="text-center text-muted-foreground py-8">Nenhum produto cadastrado.</td></tr>
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
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{p.unit}</span>
                  <span>R$ {Number((p as any).price || 0).toFixed(2)}</span>
                  <span>Mín: {(p as any).min_stock || 0}</span>
                </div>
                <div className="flex gap-2 mt-2">
                  <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => { setSelectedProduct(p); setStockOpen(true); }}>
                    <Boxes size={14} className="mr-1" /> Estoque
                  </Button>
                  <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => openEdit(p)}>
                    <Pencil size={14} className="mr-1" /> Editar
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
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Editar Produto" : "Novo Produto"}</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(); }} className="space-y-4">
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
    </div>
  );
}
