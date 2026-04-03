import { useState, useEffect, useCallback, useRef } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Package, MapPin, ArrowRightLeft, Search, Shield,
  ScanLine, Bell, Upload, Sparkles, FileText, Command, MessageSquare,
  Clock, AlertTriangle, TrendingDown, Loader2
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const ROUTES = [
  { path: "/", label: "Painel de Controle", icon: LayoutDashboard, keywords: "dashboard inicio home painel" },
  { path: "/produtos", label: "Produtos", icon: Package, keywords: "produto sku cadastro item" },
  { path: "/enderecos", label: "Endereços", icon: MapPin, keywords: "endereco posição rua andar" },
  { path: "/movimentacoes", label: "Movimentações", icon: ArrowRightLeft, keywords: "movimento entrada saida transferencia" },
  { path: "/estoque", label: "Consulta de Estoque", icon: Search, keywords: "estoque saldo consulta lote" },
  { path: "/scanner", label: "Scanner", icon: ScanLine, keywords: "scanner qr code barcode" },
  { path: "/ai-insights", label: "IA Insights", icon: Sparkles, keywords: "ia inteligencia artificial insights" },
  { path: "/onboarding", label: "Importar", icon: Upload, keywords: "importar csv upload" },
  { path: "/notificacoes", label: "Alertas", icon: Bell, keywords: "notificacao alerta whatsapp" },
  { path: "/admin", label: "Admin", icon: Shield, keywords: "admin usuario aprovacao" },
  { path: "/docs", label: "Documentação", icon: FileText, keywords: "docs documentacao ajuda" },
];

interface SmartResult {
  type: "nav" | "answer";
  icon: any;
  title: string;
  description?: string;
  path?: string;
  data?: any[];
}

const SMART_PATTERNS: { pattern: RegExp; handler: (match: RegExpMatchArray) => Promise<SmartResult> }[] = [
  {
    pattern: /onde\s+(?:est[aá]|fica)\s+(?:o\s+)?(?:produto\s+)?(.+)/i,
    handler: async (match) => {
      const term = match[1].trim();
      const { data: products } = await supabase.from("products").select("id, sku, description").or(`sku.ilike.%${term}%,description.ilike.%${term}%`).limit(5);
      if (!products?.length) return { type: "answer", icon: Package, title: `Produto "${term}" não encontrado` };
      const productIds = products.map(p => p.id);
      const { data: stock } = await supabase.from("stock_balance").select("qty, product_id, addresses(code), lots(lot_code)").in("product_id", productIds).gt("qty", 0);
      const items = (stock as any[])?.map(s => ({
        product: products.find(p => p.id === s.product_id)?.sku,
        address: s.addresses?.code,
        lot: s.lots?.lot_code,
        qty: s.qty,
      })) || [];
      return { type: "answer", icon: MapPin, title: `Localização de "${term}"`, description: items.length ? `${items.length} posição(ões) encontrada(s)` : "Sem estoque", data: items };
    },
  },
  {
    pattern: /(?:o\s+que|quais?\s+(?:produtos?)?)\s+vence[mn]?\s+(?:nos?\s+pr[oó]ximos?\s+)?(\d+)\s*dias?/i,
    handler: async (match) => {
      const days = parseInt(match[1]);
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + days);
      const { data: stock } = await supabase.from("stock_balance").select("qty, products(sku, description), lots(lot_code, expires_at)").gt("qty", 0);
      const now = new Date();
      const expiring = (stock as any[])?.filter(s => {
        if (!s.lots?.expires_at) return false;
        const exp = new Date(s.lots.expires_at);
        const daysLeft = Math.floor((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        return daysLeft >= 0 && daysLeft <= days;
      }).map(s => ({
        product: s.products?.sku,
        lot: s.lots?.lot_code,
        expires: new Date(s.lots.expires_at).toLocaleDateString("pt-BR"),
        qty: s.qty,
        daysLeft: Math.floor((new Date(s.lots.expires_at).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
      })).sort((a, b) => a.daysLeft - b.daysLeft) || [];
      return { type: "answer", icon: AlertTriangle, title: `Vencendo em ${days} dias`, description: `${expiring.length} item(ns)`, data: expiring };
    },
  },
  {
    pattern: /(?:quais?\s+)?(?:produtos?\s+)?(?:sem\s+movimento|parados?)\s+(?:(?:h[aá]|por|nos?\s+[uú]ltimos?)\s+)?(\d+)\s*dias?/i,
    handler: async (match) => {
      const days = parseInt(match[1]);
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      const { data: stock } = await supabase.from("stock_balance").select("qty, last_movement_at, products(sku, description), addresses(code)").gt("qty", 0);
      const stale = (stock as any[])?.filter(s => new Date(s.last_movement_at) < cutoff).map(s => ({
        product: s.products?.sku,
        description: s.products?.description,
        address: s.addresses?.code,
        qty: s.qty,
        daysStopped: Math.floor((Date.now() - new Date(s.last_movement_at).getTime()) / (1000 * 60 * 60 * 24)),
      })).sort((a, b) => b.daysStopped - a.daysStopped) || [];
      return { type: "answer", icon: TrendingDown, title: `Parados há ${days}+ dias`, description: `${stale.length} posição(ões)`, data: stale };
    },
  },
  {
    pattern: /quanto\s+(?:estoque|stock)\s+(?:tem|tenho|existe)\s+(?:no?\s+|em\s+)?(.+)/i,
    handler: async (match) => {
      const term = match[1].trim();
      const { data: addresses } = await supabase.from("addresses").select("id, code").ilike("code", `%${term}%`).limit(5);
      if (!addresses?.length) return { type: "answer", icon: MapPin, title: `Endereço "${term}" não encontrado` };
      const addrIds = addresses.map(a => a.id);
      const { data: stock } = await supabase.from("stock_balance").select("qty, products(sku, description), lots(lot_code)").in("address_id", addrIds).gt("qty", 0);
      const items = (stock as any[])?.map(s => ({
        product: s.products?.sku,
        description: s.products?.description,
        lot: s.lots?.lot_code,
        qty: s.qty,
      })) || [];
      const totalQty = items.reduce((s, i) => s + Number(i.qty), 0);
      return { type: "answer", icon: Package, title: `Estoque em "${term}"`, description: `${items.length} item(ns), total: ${totalQty} un.`, data: items };
    },
  },
  {
    pattern: /(?:qual|quem)\s+(?:endere[cç]o|local)\s+(?:teve|tem)\s+(?:mais|maior)\s+movimenta[cç][aã]o\s+hoje/i,
    handler: async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const { data: movements } = await supabase.from("movements").select("type, from_address_id, to_address_id, addresses!movements_to_address_id_fkey(code)").gte("created_at", today.toISOString());
      if (!movements?.length) return { type: "answer", icon: ArrowRightLeft, title: "Nenhuma movimentação hoje" };
      const addrCount: Record<string, number> = {};
      movements.forEach((m: any) => {
        if (m.to_address_id) addrCount[m.addresses?.code || m.to_address_id] = (addrCount[m.addresses?.code || m.to_address_id] || 0) + 1;
      });
      const sorted = Object.entries(addrCount).sort((a, b) => b[1] - a[1]).slice(0, 5);
      return { type: "answer", icon: TrendingDown, title: "Endereços mais movimentados hoje", data: sorted.map(([addr, count]) => ({ address: addr, movements: count })) };
    },
  },
];

export default function ConversationalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [smartResult, setSmartResult] = useState<SmartResult | null>(null);
  const [searching, setSearching] = useState(false);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      setOpen(o => !o);
    }
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    if (!query) { setSmartResult(null); return; }
    const timer = setTimeout(async () => {
      for (const { pattern, handler } of SMART_PATTERNS) {
        const match = query.match(pattern);
        if (match) {
          setSearching(true);
          try {
            const result = await handler(match);
            setSmartResult(result);
          } catch { setSmartResult(null); }
          setSearching(false);
          return;
        }
      }
      setSmartResult(null);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const filteredRoutes = ROUTES.filter(r =>
    !query || r.label.toLowerCase().includes(query.toLowerCase()) || r.keywords.includes(query.toLowerCase())
  );

  function go(path: string) {
    navigate(path);
    setOpen(false);
    setQuery("");
    setSmartResult(null);
  }

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground bg-secondary hover:bg-muted px-3 py-1.5 rounded-lg transition-colors">
        <Command size={12} />
        <span>Pergunte algo...</span>
        <kbd className="ml-1 text-[10px] bg-background border border-border rounded px-1 py-0.5">⌘K</kbd>
      </button>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setQuery(""); setSmartResult(null); } }}>
        <DialogContent className="sm:max-w-lg p-0 gap-0 overflow-hidden">
          <div className="p-3 border-b border-border flex items-center gap-2">
            <MessageSquare size={16} className="text-primary shrink-0" />
            <Input
              ref={inputRef}
              placeholder="Pergunte: 'Onde está o produto X?' ou busque uma página..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
              className="border-0 shadow-none focus-visible:ring-0 h-10 text-sm"
            />
            {searching && <Loader2 size={16} className="animate-spin text-primary shrink-0" />}
          </div>

          <div className="max-h-80 overflow-y-auto">
            <AnimatePresence mode="wait">
              {smartResult && (
                <motion.div
                  key="smart"
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="p-3 border-b border-border bg-primary/5"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <smartResult.icon size={16} className="text-primary" />
                    <span className="text-sm font-semibold text-foreground">{smartResult.title}</span>
                  </div>
                  {smartResult.description && (
                    <p className="text-xs text-muted-foreground mb-2">{smartResult.description}</p>
                  )}
                  {smartResult.data && smartResult.data.length > 0 && (
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {smartResult.data.slice(0, 8).map((item, i) => (
                        <div key={i} className="flex items-center justify-between text-xs bg-card rounded-lg px-3 py-2 border border-border">
                          <div className="flex items-center gap-2 min-w-0">
                            {item.product && <span className="font-mono font-semibold text-primary">{item.product}</span>}
                            {item.address && <span className="text-muted-foreground">📍 {item.address}</span>}
                            {item.lot && <span className="text-muted-foreground">🏷️ {item.lot}</span>}
                            {item.description && <span className="text-muted-foreground truncate">{item.description}</span>}
                            {item.expires && <span className="text-destructive">⏰ {item.expires}</span>}
                            {item.movements !== undefined && <span className="text-accent">{item.movements} mov.</span>}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {item.qty !== undefined && <span className="font-bold">{item.qty} un.</span>}
                            {item.daysLeft !== undefined && (
                              <span className={`font-semibold ${item.daysLeft <= 7 ? "text-destructive" : "text-warning"}`}>
                                {item.daysLeft}d
                              </span>
                            )}
                            {item.daysStopped !== undefined && <span className="text-destructive font-semibold">{item.daysStopped}d parado</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            <div className="p-2">
              {!smartResult && query && (
                <p className="text-[10px] text-muted-foreground px-3 py-1 mb-1">
                  💡 Tente: "Onde está produto X?", "O que vence em 7 dias?", "Parados há 30 dias"
                </p>
              )}
              {filteredRoutes.map(r => (
                <button key={r.path} onClick={() => go(r.path)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm hover:bg-secondary transition-colors text-left">
                  <r.icon size={18} className="text-primary shrink-0" />
                  <span className="font-medium">{r.label}</span>
                </button>
              ))}
              {filteredRoutes.length === 0 && !smartResult && (
                <p className="text-center text-muted-foreground text-sm py-6">Nenhum resultado.</p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
