import { useState, useEffect, useRef } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Camera, CameraOff, Package, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";

export default function Scanner() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [scanning, setScanning] = useState(false);
  const [scannedCode, setScannedCode] = useState("");
  const [product, setProduct] = useState<any>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [action, setAction] = useState<"IN" | "OUT">("IN");
  const [qty, setQty] = useState("1");
  const [addressId, setAddressId] = useState("");
  const [lotId, setLotId] = useState("");
  const [newLotCode, setNewLotCode] = useState("");
  const [useNewLot, setUseNewLot] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const divId = "scanner-region";

  const { data: addresses } = useQuery({
    queryKey: ["addresses-active"],
    queryFn: async () => {
      const { data } = await supabase.from("addresses").select("*").eq("is_active", true).order("code");
      return data ?? [];
    },
  });

  const { data: lots } = useQuery({
    queryKey: ["lots-for-product", product?.id],
    enabled: !!product?.id,
    queryFn: async () => {
      const { data } = await supabase.from("lots").select("*").eq("product_id", product.id).order("lot_code");
      return data ?? [];
    },
  });

  async function startScanner() {
    try {
      const scanner = new Html5Qrcode(divId);
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (text) => {
          handleScan(text);
          stopScanner();
        },
        () => {}
      );
      setScanning(true);
    } catch (err: any) {
      toast({ title: "Erro na câmera", description: err?.message || "Não foi possível acessar a câmera.", variant: "destructive" });
    }
  }

  function stopScanner() {
    if (scannerRef.current?.isScanning) {
      scannerRef.current.stop().catch(() => {});
    }
    setScanning(false);
  }

  async function handleScan(code: string) {
    setScannedCode(code);
    const { data } = await supabase
      .from("products")
      .select("*")
      .or(`barcode.eq.${code},sku.eq.${code}`)
      .eq("is_active", true)
      .limit(1)
      .single();

    if (data) {
      setProduct(data);
      setModalOpen(true);
    } else {
      toast({ title: "Produto não encontrado", description: `Código: ${code}`, variant: "destructive" });
    }
  }

  const moveMutation = useMutation({
    mutationFn: async () => {
      const qtyNum = Number(qty);
      if (!qtyNum || qtyNum <= 0) throw new Error("Quantidade inválida.");
      if (!addressId) throw new Error("Selecione um endereço.");

      let finalLotId = lotId;
      if (useNewLot) {
        if (!newLotCode.trim()) throw new Error("Informe o código do lote.");
        const { data: lotData, error: lotErr } = await supabase
          .from("lots")
          .insert({ product_id: product.id, lot_code: newLotCode.trim() })
          .select("id")
          .single();
        if (lotErr) throw new Error(lotErr.message);
        finalLotId = lotData.id;
      }
      if (!finalLotId) throw new Error("Selecione ou crie um lote.");

      const movement: any = {
        type: action,
        product_id: product.id,
        lot_id: finalLotId,
        qty: qtyNum,
        operator_user_id: user?.id ?? null,
      };
      if (action === "IN") movement.to_address_id = addressId;
      else movement.from_address_id = addressId;

      const { error } = await supabase.from("movements").insert(movement);
      if (error) throw new Error(error.message.includes("Saldo insuficiente") ? "Saldo insuficiente!" : error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["movements"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast({ title: action === "IN" ? "Entrada registrada!" : "Separação registrada!" });
      setModalOpen(false);
      resetForm();
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  function resetForm() {
    setQty("1");
    setAddressId("");
    setLotId("");
    setNewLotCode("");
    setUseNewLot(false);
    setProduct(null);
  }

  useEffect(() => {
    return () => { stopScanner(); };
  }, []);

  return (
    <div className="page-container">
      <h1 className="page-title">Scanner de Operações</h1>
      <p className="text-sm text-muted-foreground mb-4">Aponte a câmera para o código de barras ou QR Code do produto.</p>

      <div className="flex flex-col items-center gap-4">
        <div id={divId} className="w-full max-w-md rounded-xl overflow-hidden bg-muted aspect-square" />

        <div className="flex gap-2">
          {!scanning ? (
            <Button onClick={startScanner} size="lg" className="gap-2">
              <Camera size={20} /> Iniciar Scanner
            </Button>
          ) : (
            <Button onClick={stopScanner} variant="destructive" size="lg" className="gap-2">
              <CameraOff size={20} /> Parar Scanner
            </Button>
          )}
        </div>

        {/* Manual input */}
        <div className="w-full max-w-md mt-4">
          <Label>Ou digite o código manualmente:</Label>
          <div className="flex gap-2 mt-1">
            <Input
              value={scannedCode}
              onChange={(e) => setScannedCode(e.target.value)}
              placeholder="SKU ou código de barras"
            />
            <Button onClick={() => handleScan(scannedCode)} disabled={!scannedCode.trim()}>
              Buscar
            </Button>
          </div>
        </div>
      </div>

      {/* Action Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package size={20} className="text-primary" />
              {product?.sku} — {product?.description}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Action buttons */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setAction("IN")}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${action === "IN" ? "border-green-500 bg-green-500/10 text-green-600" : "border-border text-muted-foreground hover:bg-secondary"}`}
              >
                <ArrowDownToLine size={28} />
                <span className="font-semibold text-sm">Dar Entrada</span>
              </button>
              <button
                onClick={() => setAction("OUT")}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${action === "OUT" ? "border-orange-500 bg-orange-500/10 text-orange-600" : "border-border text-muted-foreground hover:bg-secondary"}`}
              >
                <ArrowUpFromLine size={28} />
                <span className="font-semibold text-sm">Fazer Separação</span>
              </button>
            </div>

            {/* Lot */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label>Lote *</Label>
                <button type="button" onClick={() => setUseNewLot(!useNewLot)} className="text-xs text-primary font-medium">
                  {useNewLot ? "Selecionar existente" : "+ Novo lote"}
                </button>
              </div>
              {useNewLot ? (
                <Input value={newLotCode} onChange={(e) => setNewLotCode(e.target.value)} placeholder="Código do lote" />
              ) : (
                <Select value={lotId} onValueChange={setLotId}>
                  <SelectTrigger><SelectValue placeholder="Selecione o lote..." /></SelectTrigger>
                  <SelectContent>
                    {lots?.map((l) => <SelectItem key={l.id} value={l.id}>{l.lot_code}</SelectItem>)}
                    {lots?.length === 0 && <div className="px-3 py-2 text-xs text-muted-foreground">Nenhum lote. Crie um novo.</div>}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div>
              <Label>Quantidade *</Label>
              <Input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} />
            </div>

            <div>
              <Label>{action === "IN" ? "Endereço de Destino *" : "Endereço de Origem *"}</Label>
              <Select value={addressId} onValueChange={setAddressId}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {addresses?.map((a) => <SelectItem key={a.id} value={a.id}>{a.code}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <Button onClick={() => moveMutation.mutate()} className="w-full" size="lg" disabled={moveMutation.isPending}>
              {moveMutation.isPending ? "Registrando..." : "Confirmar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
