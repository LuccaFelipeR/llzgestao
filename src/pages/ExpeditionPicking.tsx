import { useMemo, useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { CheckCircle2, ArrowLeft, SkipForward, Package, MapPin, Tag, Hash, PackageCheck, XCircle } from "lucide-react";
import { formatAddressDisplay } from "@/lib/address-utils";

export default function ExpeditionPicking() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { companyId } = useCompany();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: list } = useQuery({
    queryKey: ["picking-list", id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await (supabase as any).from("picking_lists").select("*").eq("id", id).single();
      return data;
    },
  });

  const { data: items, refetch: refetchItems } = useQuery({
    queryKey: ["picking-items", id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("picking_list_items")
        .select("*, products(sku, description, unit)")
        .eq("picking_list_id", id)
        .order("sort_order");
      return data ?? [];
    },
  });

  const pending = useMemo(() => (items ?? []).filter((i: any) => i.status === "pending"), [items]);
  const current = pending[0];
  const total = items?.length ?? 0;
  const done = (items ?? []).filter((i: any) => i.status !== "pending").length;
  const isFinished = list?.status === "done" || list?.status === "cancelled";

  // Fetch stock candidates (lot + address with qty) for current product, FEFO
  const { data: candidates } = useQuery({
    queryKey: ["picking-candidates", current?.product_id, companyId],
    enabled: !!current?.product_id && !!companyId,
    queryFn: async () => {
      const { data: balances } = await (supabase as any)
        .from("stock_balance")
        .select("qty, lot_id, address_id, lots(id, lot_code, expires_at), addresses(id, code, type)")
        .eq("company_id", companyId!)
        .eq("product_id", current!.product_id)
        .gt("qty", 0);
      const list = (balances ?? []).slice().sort((a: any, b: any) => {
        const ea = a.lots?.expires_at ? new Date(a.lots.expires_at).getTime() : Infinity;
        const eb = b.lots?.expires_at ? new Date(b.lots.expires_at).getTime() : Infinity;
        return ea - eb;
      });
      return list;
    },
  });

  const [lotId, setLotId] = useState<string | null>(null);
  const [addressId, setAddressId] = useState<string | null>(null);
  const [pickedQty, setPickedQty] = useState<string>("");

  // Auto-suggest FEFO on candidate change
  useEffect(() => {
    if (!current) { setLotId(null); setAddressId(null); setPickedQty(""); return; }
    setPickedQty(String(current.requested_qty ?? ""));
    const first = candidates?.[0];
    setLotId(first?.lot_id ?? null);
    setAddressId(first?.address_id ?? null);
  }, [current?.id, candidates]);

  // Mark list as in_progress on first render if draft
  useEffect(() => {
    if (list && list.status === "draft") {
      (supabase as any).from("picking_lists").update({ status: "in_progress" }).eq("id", list.id).then(() => {
        qc.invalidateQueries({ queryKey: ["picking-list", id] });
        qc.invalidateQueries({ queryKey: ["picking-lists"] });
      });
    }
  }, [list?.id]);

  const pickMut = useMutation({
    mutationFn: async () => {
      if (!current) throw new Error("Nenhum item pendente");
      const qty = Number(pickedQty);
      if (!(qty > 0)) throw new Error("Quantidade inválida");
      if (!lotId || !addressId) throw new Error("Selecione lote e endereço com saldo");
      const { data: mov, error } = await (supabase as any).from("movements").insert({
        type: "OUT", product_id: current.product_id, lot_id: lotId, qty,
        from_address_id: addressId, operator_user_id: user?.id ?? null, company_id: companyId,
      }).select("id").single();
      if (error) throw new Error(error.message);
      const { error: e2 } = await (supabase as any).from("picking_list_items").update({
        picked_qty: qty, lot_id: lotId, from_address_id: addressId,
        status: "picked", movement_id: mov.id,
      }).eq("id", current.id);
      if (e2) throw new Error(e2.message);
    },
    onSuccess: async () => {
      qc.invalidateQueries({ queryKey: ["picking-candidates"] });
      qc.invalidateQueries({ queryKey: ["movements"] });
      const fresh = await refetchItems();
      const stillPending = (fresh.data ?? []).filter((i: any) => i.status === "pending").length;
      if (stillPending === 0) {
        await (supabase as any).from("picking_lists").update({
          status: "done", completed_at: new Date().toISOString(),
        }).eq("id", id);
        qc.invalidateQueries({ queryKey: ["picking-list", id] });
        qc.invalidateQueries({ queryKey: ["picking-lists"] });
        toast({ title: "Expedição concluída", description: "Todos os itens foram separados." });
      } else {
        toast({ title: "Item separado" });
      }
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const skipMut = useMutation({
    mutationFn: async () => {
      if (!current) return;
      const { error } = await (supabase as any).from("picking_list_items")
        .update({ status: "skipped" }).eq("id", current.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { refetchItems(); toast({ title: "Item pulado" }); },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const cancelMut = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from("picking_lists")
        .update({ status: "cancelled" }).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["picking-list", id] });
      qc.invalidateQueries({ queryKey: ["picking-lists"] });
      toast({ title: "Pedido cancelado" });
    },
  });

  if (!list) return <div className="page-container">Carregando...</div>;

  const currentProduct: any = (current as any)?.products;

  return (
    <div className="page-container max-w-2xl mx-auto">
      <Button asChild variant="ghost" size="sm" className="mb-4"><Link to="/expedicao"><ArrowLeft size={14} /> Voltar</Link></Button>

      <div className="mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <PackageCheck size={20} className="text-primary" />
          <h1 className="text-xl font-bold">{list.reference}</h1>
          <Badge>{list.status === "done" ? "Concluído" : list.status === "cancelled" ? "Cancelado" : list.status === "in_progress" ? "Em andamento" : "Rascunho"}</Badge>
        </div>
        {list.customer && <p className="text-xs text-muted-foreground mt-1">Cliente: {list.customer}</p>}
      </div>

      {/* Progress bar */}
      <div className="mb-4">
        <div className="flex justify-between text-xs mb-1"><span>Progresso</span><span>{done}/{total}</span></div>
        <div className="h-2 bg-muted rounded"><div className="h-2 bg-primary rounded transition-all" style={{ width: `${total ? (done / total) * 100 : 0}%` }} /></div>
      </div>

      {isFinished ? (
        <Card className="p-8 text-center">
          {list.status === "done" ? (
            <>
              <CheckCircle2 size={40} className="text-success mx-auto mb-2" />
              <p className="font-bold">Expedição concluída</p>
              {list.completed_at && <p className="text-xs text-muted-foreground">Em {new Date(list.completed_at).toLocaleString("pt-BR")}</p>}
            </>
          ) : (
            <>
              <XCircle size={40} className="text-destructive mx-auto mb-2" />
              <p className="font-bold">Pedido cancelado</p>
            </>
          )}
        </Card>
      ) : current ? (
        <Card className="p-5 space-y-4">
          <div>
            <p className="text-xs text-muted-foreground">Item {done + 1} de {total}</p>
            <div className="flex items-center gap-2 mt-1">
              <Package size={18} className="text-primary" />
              <div>
                <p className="font-mono font-bold">{currentProduct?.sku}</p>
                <p className="text-xs text-muted-foreground">{currentProduct?.description}</p>
              </div>
            </div>
            <p className="text-sm mt-2">Solicitado: <span className="font-bold text-primary">{current.requested_qty} {currentProduct?.unit || "UN"}</span></p>
          </div>

          <div className="border-t pt-3">
            <Label className="text-xs font-semibold flex items-center gap-1"><Tag size={12} /> Lote / endereço (sugestão FEFO)</Label>
            {!candidates?.length ? (
              <p className="text-xs text-destructive mt-1">Sem estoque disponível para este produto.</p>
            ) : (
              <div className="space-y-1 mt-2 max-h-48 overflow-auto">
                {candidates.map((c: any) => {
                  const active = c.lot_id === lotId && c.address_id === addressId;
                  return (
                    <button key={`${c.lot_id}-${c.address_id}`}
                      onClick={() => { setLotId(c.lot_id); setAddressId(c.address_id); }}
                      className={`w-full flex items-center gap-2 p-2 rounded-lg border text-left text-xs transition ${active ? "border-primary bg-primary/5" : "border-border"}`}>
                      <MapPin size={14} className="text-muted-foreground" />
                      <span className="font-mono">{c.addresses?.code ? formatAddressDisplay(c.addresses.code) : "—"}</span>
                      <span className="text-muted-foreground">·</span>
                      <span>Lote {c.lots?.lot_code || "—"}</span>
                      {c.lots?.expires_at && <span className="text-muted-foreground">(val. {new Date(c.lots.expires_at).toLocaleDateString("pt-BR")})</span>}
                      <span className="ml-auto font-bold">{c.qty}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <Label className="text-xs font-semibold flex items-center gap-1"><Hash size={12} /> Quantidade separada</Label>
            <Input type="number" min="0" step="1" value={pickedQty} onChange={e => setPickedQty(e.target.value)}
              className="mt-1 text-xl font-bold text-center h-12" />
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={() => skipMut.mutate()} className="gap-1"><SkipForward size={14} /> Pular</Button>
            <Button className="flex-1 gap-1 bg-success hover:bg-success/90 text-success-foreground"
              onClick={() => pickMut.mutate()} disabled={pickMut.isPending || !candidates?.length}>
              <CheckCircle2 size={14} /> Confirmar separação
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="p-6 text-center">
          <p className="text-sm mb-3">Todos os itens foram processados (alguns podem ter sido pulados).</p>
          <Button onClick={async () => {
            await (supabase as any).from("picking_lists").update({ status: "done", completed_at: new Date().toISOString() }).eq("id", id);
            qc.invalidateQueries({ queryKey: ["picking-list", id] });
            qc.invalidateQueries({ queryKey: ["picking-lists"] });
          }}>Finalizar pedido</Button>
        </Card>
      )}

      {/* Item list summary */}
      <div className="mt-6">
        <p className="text-xs font-semibold text-muted-foreground mb-2">Itens</p>
        <div className="space-y-1">
          {items?.map((it: any) => (
            <div key={it.id} className="flex items-center gap-2 p-2 rounded border text-xs">
              {it.status === "picked" ? <CheckCircle2 size={14} className="text-success" /> :
               it.status === "skipped" ? <SkipForward size={14} className="text-muted-foreground" /> :
               <div className="w-3.5 h-3.5 rounded-full border-2 border-muted-foreground" />}
              <span className="font-mono">{it.products?.sku}</span>
              <span className="text-muted-foreground">·</span>
              <span>{it.picked_qty || 0}/{it.requested_qty} {it.products?.unit || "UN"}</span>
              <Badge variant="outline" className="ml-auto text-[10px]">
                {it.status === "picked" ? "OK" : it.status === "skipped" ? "Pulado" : "Pendente"}
              </Badge>
            </div>
          ))}
        </div>
      </div>

      {!isFinished && (
        <div className="mt-6 text-center">
          <Button variant="ghost" size="sm" className="text-destructive"
            onClick={() => { if (confirm("Cancelar este pedido?")) cancelMut.mutate(); }}>
            Cancelar pedido
          </Button>
        </div>
      )}
    </div>
  );
}
