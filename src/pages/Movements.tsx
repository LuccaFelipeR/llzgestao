import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Plus, Info, AlertTriangle } from "lucide-react";
import { formatAddressDisplay } from "@/lib/address-utils";

type MovementType = "IN" | "OUT" | "TRANSFER";

const TYPE_LABELS: Record<MovementType, string> = { IN: "Entrada", OUT: "Saída", TRANSFER: "Transferência" };

export default function Movements() {
  const { user } = useAuth();
  const { companyId } = useCompany();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<MovementType>("IN");
  const [productId, setProductId] = useState("");
  const [lotId, setLotId] = useState("");
  const [newLot, setNewLot] = useState(false);
  const [lotCode, setLotCode] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [qty, setQty] = useState("");
  const [fromAddressId, setFromAddressId] = useState("");
  const [toAddressId, setToAddressId] = useState("");
  const [note, setNote] = useState("");
  const [filterType, setFilterType] = useState<string>("ALL");
  const [filterProductId, setFilterProductId] = useState("");

  const { data: products } = useQuery({
    queryKey: ["products-active"],
    queryFn: async () => {
      const { data } = await supabase.from("products").select("*").eq("is_active", true).order("sku");
      return data ?? [];
    },
  });

  const { data: addresses } = useQuery({
    queryKey: ["addresses-active"],
    queryFn: async () => {
      const { data } = await supabase.from("addresses").select("*").eq("is_active", true).order("code");
      return data ?? [];
    },
  });

  const { data: lots } = useQuery({
    queryKey: ["lots", productId],
    enabled: !!productId,
    queryFn: async () => {
      const { data } = await supabase.from("lots").select("*").eq("product_id", productId).order("lot_code");
      return data ?? [];
    },
  });

  // Check available stock for selected product+lot+address
  const { data: availableStock } = useQuery({
    queryKey: ["available-stock", productId, lotId, fromAddressId],
    enabled: !!productId && !!lotId && !!fromAddressId && (type === "OUT" || type === "TRANSFER"),
    queryFn: async () => {
      const { data } = await supabase.from("stock_balance")
        .select("qty")
        .eq("product_id", productId)
        .eq("lot_id", lotId)
        .eq("address_id", fromAddressId)
        .single();
      return data?.qty ?? 0;
    },
  });

  const { data: movements } = useQuery({
    queryKey: ["movements", filterType, filterProductId],
    queryFn: async () => {
      let q = supabase.from("movements").select("*, products(sku, description), lots(lot_code), from_addr:addresses!movements_from_address_id_fkey(code), to_addr:addresses!movements_to_address_id_fkey(code)").order("created_at", { ascending: false }).limit(100);
      if (filterType !== "ALL") q = q.eq("type", filterType as "IN" | "OUT" | "TRANSFER");
      if (filterProductId) q = q.eq("product_id", filterProductId);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const qtyNum = Number(qty) || 0;
  const insufficientStock = (type === "OUT" || type === "TRANSFER") && qtyNum > 0 && availableStock !== undefined && qtyNum > Number(availableStock);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!productId) throw new Error("Selecione um produto.");
      if (!qtyNum || qtyNum <= 0) throw new Error("Quantidade deve ser maior que zero.");
      if (insufficientStock) throw new Error(`Saldo insuficiente. Disponível: ${availableStock}, Solicitado: ${qtyNum}`);

      let finalLotId = lotId;

      if (newLot) {
        if (!lotCode.trim()) throw new Error("Informe o código do lote.");
        const { data: lotData, error: lotError } = await supabase.from("lots").insert({
          product_id: productId,
          lot_code: lotCode.trim(),
          expires_at: expiresAt || null,
          company_id: companyId,
        }).select("id").single();
        if (lotError) throw new Error(`Erro ao criar lote: ${lotError.message}`);
        finalLotId = lotData.id;
      }

      if (!finalLotId) throw new Error("Selecione ou crie um lote.");

      const movement: any = {
        type, product_id: productId, lot_id: finalLotId, qty: qtyNum,
        note: note.trim() || null, operator_user_id: user?.id ?? null, company_id: companyId,
      };

      if (type === "IN") {
        if (!toAddressId) throw new Error("Selecione o endereço de destino.");
        movement.to_address_id = toAddressId;
      } else if (type === "OUT") {
        if (!fromAddressId) throw new Error("Selecione o endereço de origem.");
        movement.from_address_id = fromAddressId;
      } else {
        if (!fromAddressId || !toAddressId) throw new Error("Selecione origem e destino.");
        if (fromAddressId === toAddressId) throw new Error("Origem e destino devem ser diferentes.");
        movement.from_address_id = fromAddressId;
        movement.to_address_id = toAddressId;
      }

      const { error } = await supabase.from("movements").insert(movement);
      if (error) {
        if (error.message.includes("Saldo insuficiente")) throw new Error("Saldo insuficiente neste endereço/lote.");
        throw new Error(error.message);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["movements"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast({ title: `${TYPE_LABELS[type]} registrada com sucesso!` });
      resetForm();
      setOpen(false);
    },
    onError: (e: Error) => {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    },
  });

  function resetForm() {
    setProductId(""); setLotId(""); setNewLot(false); setLotCode("");
    setExpiresAt(""); setQty(""); setFromAddressId(""); setToAddressId(""); setNote(""); setType("IN");
  }

  return (
    <div className="page-container">
      <div className="flex items-center justify-between mb-6">
        <h1 className="page-title mb-0">Movimentações</h1>
        <Button onClick={() => { resetForm(); setOpen(true); }} size="lg"><Plus size={18} className="mr-1" /> Nova</Button>
      </div>

      <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 mb-6 flex items-start gap-2 text-sm">
        <Info size={18} className="text-primary mt-0.5 shrink-0" />
        <span>Movimentações são <strong>imutáveis</strong>. Para corrigir, registre uma nova movimentação inversa.</span>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos</SelectItem>
            <SelectItem value="IN">Entrada</SelectItem>
            <SelectItem value="OUT">Saída</SelectItem>
            <SelectItem value="TRANSFER">Transferência</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterProductId || "ALL"} onValueChange={(v) => setFilterProductId(v === "ALL" ? "" : v)}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Produto" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos</SelectItem>
            {products?.map((p) => <SelectItem key={p.id} value={p.id}>{p.sku}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block bg-card border border-border rounded-xl overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr><th>Data</th><th>Tipo</th><th>Produto</th><th>Lote</th><th>Qtd</th><th>Origem</th><th>Destino</th><th>Obs</th></tr>
          </thead>
          <tbody>
            {movements?.map((m: any) => (
              <tr key={m.id}>
                <td className="text-xs whitespace-nowrap">{new Date(m.created_at).toLocaleString("pt-BR")}</td>
                <td><span className={`badge-${m.type.toLowerCase()}`}>{TYPE_LABELS[m.type as MovementType]}</span></td>
                <td className="font-mono text-xs">{m.products?.sku}</td>
                <td className="text-xs">{m.lots?.lot_code}</td>
                <td className="font-semibold">{m.qty}</td>
                <td className="text-xs font-mono">{m.from_addr?.code ? formatAddressDisplay(m.from_addr.code) : "—"}</td>
                <td className="text-xs font-mono">{m.to_addr?.code ? formatAddressDisplay(m.to_addr.code) : "—"}</td>
                <td className="text-xs text-muted-foreground max-w-[150px] truncate">{m.note || "—"}</td>
              </tr>
            ))}
            {movements?.length === 0 && (
              <tr><td colSpan={8} className="text-center text-muted-foreground py-8">Nenhuma movimentação registrada.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {movements?.map((m: any) => (
          <div key={m.id} className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className={`badge-${m.type.toLowerCase()}`}>{TYPE_LABELS[m.type as MovementType]}</span>
              <span className="text-[10px] text-muted-foreground">{new Date(m.created_at).toLocaleString("pt-BR")}</span>
            </div>
            <div className="text-sm">
              <span className="font-mono font-semibold">{m.products?.sku}</span>
              <span className="text-muted-foreground ml-2">Lote: {m.lots?.lot_code}</span>
            </div>
            <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
              <span className="font-bold text-foreground text-base">{m.qty}</span>
              {m.from_addr?.code && <span>De: {formatAddressDisplay(m.from_addr.code)}</span>}
              {m.to_addr?.code && <span>Para: {formatAddressDisplay(m.to_addr.code)}</span>}
            </div>
            {m.note && <p className="text-xs text-muted-foreground mt-1 truncate">{m.note}</p>}
          </div>
        ))}
        {movements?.length === 0 && (
          <p className="text-center text-muted-foreground py-8">Nenhuma movimentação registrada.</p>
        )}
      </div>

      {/* New Movement Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova Movimentação</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(); }} className="space-y-4">
            <div>
              <Label>Tipo *</Label>
              <div className="grid grid-cols-3 gap-2 mt-1">
                {(["IN", "OUT", "TRANSFER"] as MovementType[]).map((t) => (
                  <button key={t} type="button" onClick={() => setType(t)}
                    className={`py-2.5 rounded-lg text-sm font-semibold border transition-colors ${type === t ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-secondary"}`}>
                    {TYPE_LABELS[t]}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label>Produto *</Label>
              <Select value={productId} onValueChange={(v) => { setProductId(v); setLotId(""); setNewLot(false); }}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>{products?.map((p) => <SelectItem key={p.id} value={p.id}>{p.sku} — {p.description}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            {productId && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label>Lote *</Label>
                  <button type="button" onClick={() => setNewLot(!newLot)} className="text-xs text-primary font-medium">
                    {newLot ? "Selecionar existente" : "+ Criar lote"}
                  </button>
                </div>
                {newLot ? (
                  <div className="space-y-2">
                    <Input value={lotCode} onChange={(e) => setLotCode(e.target.value)} placeholder="Código do lote" maxLength={50} />
                    <div>
                      <Label className="text-xs">Validade (opcional)</Label>
                      <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
                    </div>
                  </div>
                ) : (
                  <Select value={lotId} onValueChange={setLotId}>
                    <SelectTrigger><SelectValue placeholder="Selecione o lote..." /></SelectTrigger>
                    <SelectContent>
                      {lots?.map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.lot_code} {l.expires_at ? `(Val: ${new Date(l.expires_at).toLocaleDateString("pt-BR")})` : ""}
                        </SelectItem>
                      ))}
                      {lots?.length === 0 && <div className="px-3 py-2 text-xs text-muted-foreground">Nenhum lote. Clique em "+ Criar lote"</div>}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            <div>
              <Label>Quantidade *</Label>
              <Input type="number" min="1" step="1" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0" />
            </div>

            {(type === "OUT" || type === "TRANSFER") && (
              <div>
                <Label>Endereço de Origem *</Label>
                <Select value={fromAddressId} onValueChange={setFromAddressId}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>{addresses?.map((a) => <SelectItem key={a.id} value={a.id}>{formatAddressDisplay(a.code)} ({a.type})</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}

            {/* Stock warning */}
            {insufficientStock && (
              <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 flex items-start gap-2">
                <AlertTriangle size={16} className="text-destructive mt-0.5 shrink-0" />
                <span className="text-xs text-destructive font-medium">
                  Saldo insuficiente! Disponível: <strong>{availableStock}</strong>, Solicitado: <strong>{qtyNum}</strong>
                </span>
              </div>
            )}

            {/* Available stock info */}
            {(type === "OUT" || type === "TRANSFER") && availableStock !== undefined && !insufficientStock && fromAddressId && lotId && (
              <div className="bg-success/10 border border-success/30 rounded-lg p-2 text-xs text-success font-medium">
                Saldo disponível: {availableStock}
              </div>
            )}

            {(type === "IN" || type === "TRANSFER") && (
              <div>
                <Label>Endereço de Destino *</Label>
                <Select value={toAddressId} onValueChange={setToAddressId}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>{addresses?.map((a) => <SelectItem key={a.id} value={a.id}>{formatAddressDisplay(a.code)} ({a.type})</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label>Observação</Label>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Opcional" maxLength={500} rows={2} />
            </div>

            <Button type="submit" className="w-full" size="lg" disabled={saveMutation.isPending || insufficientStock}>
              {saveMutation.isPending ? "Registrando..." : "Confirmar Movimentação"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
