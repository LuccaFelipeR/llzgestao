import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Plus, Trash2, PackageCheck, Play, ClipboardList, ChevronRight } from "lucide-react";

const STATUS_LABEL: Record<string, string> = {
  draft: "Rascunho", in_progress: "Em andamento", done: "Concluído", cancelled: "Cancelado",
};
const STATUS_COLOR: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  in_progress: "bg-primary/15 text-primary",
  done: "bg-success/15 text-success",
  cancelled: "bg-destructive/15 text-destructive",
};

type ItemDraft = { product_id: string; requested_qty: string };

export default function Expedition() {
  const { user } = useAuth();
  const { companyId } = useCompany();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reference, setReference] = useState("");
  const [customer, setCustomer] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<ItemDraft[]>([{ product_id: "", requested_qty: "" }]);

  const { data: lists, isLoading } = useQuery({
    queryKey: ["picking-lists", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("picking_lists")
        .select("*, picking_list_items(id, status)")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: products } = useQuery({
    queryKey: ["products-active-exp", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await supabase.from("products").select("id, sku, description, unit").eq("company_id", companyId!).eq("is_active", true).order("sku");
      return data ?? [];
    },
  });

  const createMut = useMutation({
    mutationFn: async () => {
      if (!reference.trim()) throw new Error("Referência é obrigatória.");
      const validItems = items.filter(i => i.product_id && Number(i.requested_qty) > 0);
      if (!validItems.length) throw new Error("Adicione ao menos um item válido.");

      const { data: list, error } = await (supabase as any).from("picking_lists").insert({
        company_id: companyId, reference: reference.trim(),
        customer: customer.trim() || null, notes: notes.trim() || null,
        created_by: user?.id ?? null,
      }).select("id").single();
      if (error) throw new Error(error.message);

      const rows = validItems.map((it, idx) => ({
        picking_list_id: list.id, company_id: companyId,
        product_id: it.product_id, requested_qty: Number(it.requested_qty),
        sort_order: idx,
      }));
      const { error: e2 } = await (supabase as any).from("picking_list_items").insert(rows);
      if (e2) throw new Error(e2.message);
      return list.id as string;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ["picking-lists"] });
      toast({ title: "Pedido criado" });
      setOpen(false); setReference(""); setCustomer(""); setNotes("");
      setItems([{ product_id: "", requested_qty: "" }]);
      navigate(`/expedicao/${id}`);
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("picking_lists").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["picking-lists"] }); toast({ title: "Pedido excluído" }); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="page-container max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <PackageCheck size={24} className="text-primary" />
          <div>
            <h1 className="text-xl font-bold">Expedição</h1>
            <p className="text-xs text-muted-foreground">Pedidos de separação e picking guiado</p>
          </div>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1"><Plus size={16} /> Novo pedido</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Novo pedido de separação</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Referência *</Label>
                <Input value={reference} onChange={e => setReference(e.target.value)} placeholder="Ex: PED-001" />
              </div>
              <div>
                <Label className="text-xs">Cliente</Label>
                <Input value={customer} onChange={e => setCustomer(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Observações</Label>
                <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label className="text-xs">Itens *</Label>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setItems([...items, { product_id: "", requested_qty: "" }])}>
                    <Plus size={14} /> Item
                  </Button>
                </div>
                <div className="space-y-2 max-h-64 overflow-auto">
                  {items.map((it, idx) => (
                    <div key={idx} className="flex gap-2 items-start">
                      <Select value={it.product_id} onValueChange={v => {
                        const next = [...items]; next[idx].product_id = v; setItems(next);
                      }}>
                        <SelectTrigger className="flex-1 text-xs"><SelectValue placeholder="Produto..." /></SelectTrigger>
                        <SelectContent>
                          {products?.map(p => <SelectItem key={p.id} value={p.id} className="text-xs">{p.sku} — {p.description}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Input type="number" min="0" step="1" value={it.requested_qty} placeholder="Qtd"
                        onChange={e => { const next = [...items]; next[idx].requested_qty = e.target.value; setItems(next); }}
                        className="w-20" />
                      <Button type="button" variant="ghost" size="icon" onClick={() => setItems(items.filter((_, i) => i !== idx))} disabled={items.length === 1}>
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={() => createMut.mutate()} disabled={createMut.isPending}>Criar e iniciar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : !lists?.length ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          <ClipboardList size={32} className="mx-auto mb-2 opacity-50" />
          Nenhum pedido de expedição ainda. Crie o primeiro para começar.
        </Card>
      ) : (
        <div className="space-y-2">
          {lists.map((l: any) => {
            const total = l.picking_list_items?.length ?? 0;
            const done = l.picking_list_items?.filter((i: any) => i.status === "picked").length ?? 0;
            return (
              <Card key={l.id} className="p-4 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-semibold text-sm">{l.reference}</span>
                    <Badge className={STATUS_COLOR[l.status]}>{STATUS_LABEL[l.status]}</Badge>
                    <span className="text-xs text-muted-foreground">{done}/{total} itens</span>
                  </div>
                  {l.customer && <p className="text-xs text-muted-foreground mt-0.5">Cliente: {l.customer}</p>}
                  <p className="text-[10px] text-muted-foreground">Criado em {new Date(l.created_at).toLocaleString("pt-BR")}</p>
                </div>
                {l.status !== "done" && l.status !== "cancelled" && (
                  <Button asChild size="sm" className="gap-1">
                    <Link to={`/expedicao/${l.id}`}><Play size={14} /> Separar</Link>
                  </Button>
                )}
                {(l.status === "done" || l.status === "cancelled") && (
                  <Button asChild variant="outline" size="sm" className="gap-1">
                    <Link to={`/expedicao/${l.id}`}>Ver <ChevronRight size={14} /></Link>
                  </Button>
                )}
                <Button variant="ghost" size="icon" onClick={() => {
                  if (confirm("Excluir este pedido?")) deleteMut.mutate(l.id);
                }}>
                  <Trash2 size={14} className="text-destructive" />
                </Button>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
