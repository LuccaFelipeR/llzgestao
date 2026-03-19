import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Plus, Pencil } from "lucide-react";

type Product = {
  id: string;
  sku: string;
  description: string;
  unit: string;
  is_active: boolean;
};

const UNITS = ["UN", "KG", "L", "M", "CX", "PC", "PAR"];

export default function Products() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState({ sku: "", description: "", unit: "UN" });

  const { data: products, isLoading } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").order("sku");
      if (error) throw error;
      return data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.sku.trim() || !form.description.trim()) throw new Error("Preencha SKU e descrição.");
      if (editing) {
        const { error } = await supabase.from("products").update({ sku: form.sku.trim(), description: form.description.trim(), unit: form.unit }).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("products").insert({ sku: form.sku.trim(), description: form.description.trim(), unit: form.unit });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast({ title: editing ? "Produto atualizado" : "Produto cadastrado" });
      closeDialog();
    },
    onError: (e: Error) => {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    },
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
    setForm({ sku: "", description: "", unit: "UN" });
    setOpen(true);
  }

  function openEdit(p: Product) {
    setEditing(p);
    setForm({ sku: p.sku, description: p.description, unit: p.unit });
    setOpen(true);
  }

  function closeDialog() {
    setOpen(false);
    setEditing(null);
  }

  return (
    <div className="page-container">
      <div className="flex items-center justify-between mb-6">
        <h1 className="page-title mb-0">Produtos</h1>
        <Button onClick={openNew} size="lg"><Plus size={18} className="mr-1" /> Novo</Button>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Carregando...</p>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr><th>SKU</th><th>Descrição</th><th>Unidade</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {products?.map((p) => (
                <tr key={p.id} className={!p.is_active ? "opacity-50" : ""}>
                  <td className="font-mono font-semibold">{p.sku}</td>
                  <td>{p.description}</td>
                  <td>{p.unit}</td>
                  <td>
                    <button onClick={() => toggleMutation.mutate(p)} className={`text-xs px-2 py-0.5 rounded-md font-medium ${p.is_active ? "bg-accent/15 text-accent" : "bg-muted text-muted-foreground"}`}>
                      {p.is_active ? "Ativo" : "Inativo"}
                    </button>
                  </td>
                  <td>
                    <Button variant="ghost" size="sm" onClick={() => openEdit(p)}><Pencil size={16} /></Button>
                  </td>
                </tr>
              ))}
              {products?.length === 0 && (
                <tr><td colSpan={5} className="text-center text-muted-foreground py-8">Nenhum produto cadastrado.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Produto" : "Novo Produto"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(); }} className="space-y-4">
            <div>
              <Label htmlFor="sku">SKU *</Label>
              <Input id="sku" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder="Ex: PROD-001" maxLength={50} />
            </div>
            <div>
              <Label htmlFor="desc">Descrição *</Label>
              <Input id="desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Ex: Caixa de Parafusos M8" maxLength={200} />
            </div>
            <div>
              <Label>Unidade</Label>
              <Select value={form.unit} onValueChange={(v) => setForm({ ...form, unit: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" className="w-full" size="lg" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
