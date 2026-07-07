import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, Package, MapPin, Hash, Tag, ArrowRight, RotateCcw, Boxes } from "lucide-react";
import { formatAddressDisplay } from "@/lib/address-utils";

const STEPS = [
  { id: 1, title: "Produto", description: "Selecione o produto a receber", icon: Package },
  { id: 2, title: "Lote", description: "Informe ou selecione o lote", icon: Tag },
  { id: 3, title: "Quantidade", description: "Quantidade recebida", icon: Hash },
  { id: 4, title: "Destino", description: "Endereço de armazenagem", icon: MapPin },
  { id: 5, title: "Confirmar", description: "Revise e confirme", icon: CheckCircle2 },
];

export default function GuidedReceiving() {
  const { user } = useAuth();
  const { companyId, loading: companyLoading } = useCompany();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const [productId, setProductId] = useState("");
  const [lotMode, setLotMode] = useState<"existing" | "new">("new");
  const [lotId, setLotId] = useState("");
  const [lotCode, setLotCode] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [manufacturingDate, setManufacturingDate] = useState("");
  const [supplier, setSupplier] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [qty, setQty] = useState("");
  const [addressId, setAddressId] = useState("");
  const [success, setSuccess] = useState(false);

  const { data: products } = useQuery({
    queryKey: ["products-active", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await supabase.from("products").select("*").eq("company_id", companyId!).eq("is_active", true).order("sku");
      return data ?? [];
    },
  });

  const { data: addresses } = useQuery({
    queryKey: ["addresses-active", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await supabase.from("addresses").select("*").eq("company_id", companyId!).eq("is_active", true).order("code");
      return data ?? [];
    },
  });

  const { data: lots } = useQuery({
    queryKey: ["lots", productId, companyId],
    enabled: !!productId && !!companyId,
    queryFn: async () => {
      const { data } = await supabase.from("lots").select("*").eq("company_id", companyId!).eq("product_id", productId).order("lot_code");
      return data ?? [];
    },
  });

  const selectedProduct: any = products?.find(p => p.id === productId);
  const selectedAddress = addresses?.find(a => a.id === addressId);
  const selectedLot = lots?.find(l => l.id === lotId);

  // product control rules
  const requiresLot = !!(selectedProduct?.controls_batch);
  const requiresExpiration = !!(selectedProduct?.controls_expiration || selectedProduct?.is_perishable);

  // expiration warnings
  const expDate = expiresAt ? new Date(expiresAt) : null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const isExpired = !!(expDate && expDate < today);
  const isNearExpiry = !!(expDate && !isExpired && (expDate.getTime() - today.getTime()) / 86400000 <= 30);
  const manufAfterExpiry = !!(manufacturingDate && expiresAt && new Date(manufacturingDate) > new Date(expiresAt));

  const saveMutation = useMutation({
    mutationFn: async () => {
      let finalLotId = lotId;
      if (lotMode === "new") {
        if (requiresLot && !lotCode.trim()) throw new Error("Este produto exige código de lote.");
        if (requiresExpiration && !expiresAt) throw new Error("Este produto exige data de validade.");
        if (manufAfterExpiry) throw new Error("Data de fabricação não pode ser posterior à validade.");
        // Reuse existing lot if same code already exists for this product/company
        const lotCodeFinal = lotCode.trim() || `AUTO-${Date.now()}`;
        const { data: existingLot } = await supabase.from("lots")
          .select("id").eq("product_id", productId).ilike("lot_code", lotCodeFinal).maybeSingle();
        if (existingLot) {
          finalLotId = existingLot.id;
        } else {
          const { data: lotData, error: lotError } = await supabase.from("lots").insert({
            product_id: productId, lot_code: lotCodeFinal,
            expires_at: expiresAt || null,
            manufacturing_date: manufacturingDate || null,
            supplier: supplier.trim() || null,
            invoice_number: invoiceNumber.trim() || null,
            company_id: companyId,
          }).select("id").single();
          if (lotError) throw new Error(lotError.message);
          finalLotId = lotData.id;
        }
      }
      const { error } = await supabase.from("movements").insert({
        type: "IN" as const, product_id: productId, lot_id: finalLotId, qty: Number(qty),
        to_address_id: addressId, operator_user_id: user?.id ?? null, company_id: companyId,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["movements"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      setSuccess(true);
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  function reset() {
    setStep(1); setProductId(""); setLotMode("new"); setLotId(""); setLotCode("");
    setExpiresAt(""); setManufacturingDate(""); setSupplier(""); setInvoiceNumber("");
    setQty(""); setAddressId(""); setSuccess(false);
  }

  function canAdvance() {
    if (step === 1) return !!productId;
    if (step === 2) {
      if (lotMode === "existing") return !!lotId;
      if (requiresLot && !lotCode.trim()) return false;
      if (requiresExpiration && !expiresAt) return false;
      if (manufAfterExpiry) return false;
      if (isExpired) return false; // block expired lot creation
      return true;
    }
    if (step === 3) return Number(qty) > 0;
    if (step === 4) return !!addressId;
    return true;
  }

  if (success) {
    return (
      <div className="page-container flex flex-col items-center justify-center min-h-[60vh]">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 200 }}
          className="w-20 h-20 rounded-full bg-success/15 flex items-center justify-center mb-4">
          <CheckCircle2 size={40} className="text-success" />
        </motion.div>
        <h2 className="text-xl font-bold text-foreground mb-1">Recebimento Registrado!</h2>
        <p className="text-sm text-muted-foreground mb-6">
          {qty}x {selectedProduct?.sku} → {selectedAddress?.code ? formatAddressDisplay(selectedAddress.code) : ""}
        </p>
        <div className="flex gap-3">
          <Button onClick={reset} size="lg" className="gap-2"><RotateCcw size={16} /> Novo Recebimento</Button>
          <Button onClick={() => window.history.back()} variant="outline" size="lg">Voltar</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Boxes size={24} className="text-primary" />
        <div>
          <h1 className="text-xl font-bold text-foreground">Recebimento Guiado</h1>
          <p className="text-xs text-muted-foreground">Passo a passo para registrar entrada de mercadoria</p>
        </div>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-1 mb-8">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex items-center flex-1">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
              step > s.id ? "bg-success text-success-foreground" : step === s.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            }`}>
              {step > s.id ? <CheckCircle2 size={16} /> : s.id}
            </div>
            {i < STEPS.length - 1 && <div className={`flex-1 h-1 mx-1 rounded transition-all ${step > s.id ? "bg-success" : "bg-muted"}`} />}
          </div>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
          className="glass-card p-6">
          <h2 className="text-lg font-bold text-foreground mb-1">{STEPS[step - 1].title}</h2>
          <p className="text-sm text-muted-foreground mb-4">{STEPS[step - 1].description}</p>

          {step === 1 && (
            <div className="space-y-3">
              {products?.map(p => (
                <button key={p.id} onClick={() => setProductId(p.id)}
                  className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-left ${
                    productId === p.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
                  }`}>
                  <Package size={20} className={productId === p.id ? "text-primary" : "text-muted-foreground"} />
                  <div>
                    <p className="font-mono font-semibold text-sm">{p.sku}</p>
                    <p className="text-xs text-muted-foreground">{p.description}</p>
                  </div>
                </button>
              ))}
              {!products?.length && <p className="text-center text-muted-foreground py-4">Nenhum produto cadastrado.</p>}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              {/* Product rules summary */}
              {(requiresLot || requiresExpiration || selectedProduct?.is_perishable) && (
                <div className="bg-warning/10 border border-warning/30 rounded-lg p-3 text-xs space-y-1">
                  <p className="font-bold text-warning">Regras deste produto:</p>
                  {selectedProduct?.is_perishable && <p>• Produto perecível — validade obrigatória.</p>}
                  {requiresLot && <p>• Código de lote obrigatório.</p>}
                  {requiresExpiration && <p>• Data de validade obrigatória.</p>}
                  {selectedProduct?.shelf_life_days && <p>• Vida útil sugerida: {selectedProduct.shelf_life_days} dias.</p>}
                </div>
              )}

              <div className="flex gap-2 mb-3">
                <button onClick={() => setLotMode("new")}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border-2 transition-all ${lotMode === "new" ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground"}`}>
                  Criar Novo Lote
                </button>
                <button onClick={() => setLotMode("existing")}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border-2 transition-all ${lotMode === "existing" ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground"}`}>
                  Lote Existente
                </button>
              </div>
              {lotMode === "new" ? (
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs font-semibold">Código do Lote {requiresLot && "*"}</Label>
                    <Input value={lotCode} onChange={e => setLotCode(e.target.value)} placeholder={requiresLot ? "Obrigatório" : "Opcional — gerado automaticamente se vazio"} className="mt-1" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs font-semibold">Fabricação</Label>
                      <Input type="date" value={manufacturingDate} onChange={e => setManufacturingDate(e.target.value)} className="mt-1" />
                    </div>
                    <div>
                      <Label className="text-xs font-semibold">Validade {requiresExpiration && "*"}</Label>
                      <Input type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} className="mt-1" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs font-semibold">Fornecedor</Label>
                      <Input value={supplier} onChange={e => setSupplier(e.target.value)} maxLength={120} className="mt-1" />
                    </div>
                    <div>
                      <Label className="text-xs font-semibold">Nota fiscal</Label>
                      <Input value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} maxLength={50} className="mt-1" />
                    </div>
                  </div>

                  {manufAfterExpiry && <p className="text-xs font-bold text-destructive">⚠ Fabricação não pode ser posterior à validade.</p>}
                  {isExpired && <p className="text-xs font-bold text-destructive">⚠ Lote já vencido — não é permitido receber.</p>}
                  {isNearExpiry && !isExpired && <p className="text-xs font-bold text-warning">⚠ Vencimento em ≤30 dias.</p>}
                </div>
              ) : (
                <Select value={lotId} onValueChange={setLotId}>
                  <SelectTrigger><SelectValue placeholder="Selecione o lote..." /></SelectTrigger>
                  <SelectContent>
                    {lots?.map(l => <SelectItem key={l.id} value={l.id}>{l.lot_code} {l.expires_at ? `(${new Date(l.expires_at).toLocaleDateString("pt-BR")})` : ""}</SelectItem>)}
                    {!lots?.length && <div className="px-3 py-2 text-xs text-muted-foreground">Nenhum lote. Crie um novo.</div>}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {step === 3 && (
            <div>
              <Label className="text-xs font-semibold">Quantidade Recebida *</Label>
              <Input type="number" min="1" step="1" value={qty} onChange={e => setQty(e.target.value)}
                placeholder="0" className="mt-1 text-3xl font-bold text-center h-16" autoFocus />
              <p className="text-xs text-muted-foreground mt-2 text-center">Unidade: {selectedProduct?.unit || "UN"}</p>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3">
              {addresses?.map(a => (
                <button key={a.id} onClick={() => setAddressId(a.id)}
                  className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-left ${
                    addressId === a.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
                  }`}>
                  <MapPin size={20} className={addressId === a.id ? "text-primary" : "text-muted-foreground"} />
                  <div>
                    <p className="font-mono font-semibold text-sm">{formatAddressDisplay(a.code)}</p>
                    <p className="text-xs text-muted-foreground">{a.type}</p>
                  </div>
                </button>
              ))}
              {!addresses?.length && <p className="text-center text-muted-foreground py-4">Nenhum endereço cadastrado.</p>}
            </div>
          )}

          {step === 5 && (
            <div className="space-y-3">
              <div className="bg-secondary rounded-xl p-4 space-y-2">
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Produto</span><span className="font-semibold">{selectedProduct?.sku} — {selectedProduct?.description}</span></div>
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Lote</span><span className="font-semibold">{lotMode === "new" ? lotCode : selectedLot?.lot_code}</span></div>
                {expiresAt && <div className="flex justify-between text-sm"><span className="text-muted-foreground">Validade</span><span className="font-semibold">{new Date(expiresAt).toLocaleDateString("pt-BR")}</span></div>}
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Quantidade</span><span className="font-bold text-lg text-primary">{qty} {selectedProduct?.unit || "UN"}</span></div>
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Destino</span><span className="font-mono font-semibold">{selectedAddress?.code ? formatAddressDisplay(selectedAddress.code) : ""}</span></div>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex justify-between mt-6">
            <Button variant="outline" onClick={() => step > 1 ? setStep(step - 1) : window.history.back()} size="lg">
              {step === 1 ? "Cancelar" : "Voltar"}
            </Button>
            {step < 5 ? (
              <Button onClick={() => setStep(step + 1)} disabled={!canAdvance()} size="lg" className="gap-2">
                Próximo <ArrowRight size={16} />
              </Button>
            ) : (
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} size="lg" className="gap-2 bg-success hover:bg-success/90 text-success-foreground">
                {saveMutation.isPending ? "Registrando..." : "Confirmar Entrada"}
                <CheckCircle2 size={16} />
              </Button>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
