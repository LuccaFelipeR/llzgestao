import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { LayoutDashboard, Package, MapPin, ArrowRightLeft, Search, Shield, Command } from "lucide-react";

const ROUTES = [
  { path: "/", label: "Painel de Controle", icon: LayoutDashboard, keywords: "dashboard inicio home painel" },
  { path: "/produtos", label: "Produtos", icon: Package, keywords: "produto sku cadastro item" },
  { path: "/enderecos", label: "Endereços", icon: MapPin, keywords: "endereco posição rua andar" },
  { path: "/movimentacoes", label: "Movimentações", icon: ArrowRightLeft, keywords: "movimento entrada saida transferencia" },
  { path: "/estoque", label: "Consulta de Estoque", icon: Search, keywords: "estoque saldo consulta lote" },
  { path: "/admin", label: "Painel Admin", icon: Shield, keywords: "admin usuario aprovacao" },
];

export default function QuickSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const navigate = useNavigate();

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      setOpen((o) => !o);
    }
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const filtered = ROUTES.filter(
    (r) =>
      !query ||
      r.label.toLowerCase().includes(query.toLowerCase()) ||
      r.keywords.includes(query.toLowerCase())
  );

  function go(path: string) {
    navigate(path);
    setOpen(false);
    setQuery("");
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground bg-secondary hover:bg-muted px-3 py-1.5 rounded-lg transition-colors"
      >
        <Command size={12} />
        <span>Busca rápida</span>
        <kbd className="ml-1 text-[10px] bg-background border border-border rounded px-1 py-0.5">⌘K</kbd>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden">
          <div className="p-3 border-b border-border">
            <Input
              placeholder="Buscar página..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
              className="border-0 shadow-none focus-visible:ring-0 h-10 text-base"
            />
          </div>
          <div className="max-h-64 overflow-y-auto p-2">
            {filtered.map((r) => (
              <button
                key={r.path}
                onClick={() => go(r.path)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm hover:bg-secondary transition-colors text-left"
              >
                <r.icon size={18} className="text-primary shrink-0" />
                <span className="font-medium">{r.label}</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="text-center text-muted-foreground text-sm py-6">Nenhum resultado.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
