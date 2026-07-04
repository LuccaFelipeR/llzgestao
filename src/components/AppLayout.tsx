import { Link, useLocation } from "react-router-dom";
import {
  Package, MapPin, ArrowRightLeft, Search, LayoutDashboard, Shield, LogOut, User,
  ScanLine, Bell, Upload, Boxes, Sparkles, FileText, ClipboardList, Building2,
  FileClock, ShieldAlert, Activity, Crown, PackageCheck, Workflow, ClipboardType,
  BrainCircuit, ShieldCheck,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import ThemeToggle from "@/components/ThemeToggle";
import ConversationalSearch from "@/components/ConversationalSearch";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type NavItem = { to: string; key: string; icon: any; label: string };
type NavGroup = { key: string; label: string; icon: any; items: NavItem[] };

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { user, profile, isAdmin, signOut } = useAuth();
  const { company, availableCompanies, switchCompany, isSuperAdmin, currentCompanyId } = useCompany();
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  const { data: tabPermissions } = useQuery({
    queryKey: ["my-tab-permissions", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase.from("user_tab_permissions").select("tab_key, is_allowed").eq("user_id", user!.id);
      return data ?? [];
    },
  });

  const isAllowed = (key: string) => {
    if (isAdmin) return true;
    const blocked = tabPermissions?.find((p) => p.tab_key === key && !p.is_allowed);
    return !blocked;
  };

  const groups: NavGroup[] = [
    {
      key: "operacao", label: "Operação", icon: Workflow,
      items: [
        { to: "/estoque", key: "estoque", icon: Search, label: "Estoque" },
        { to: "/movimentacoes", key: "movimentacoes", icon: ArrowRightLeft, label: "Movimentações" },
        { to: "/recebimento", key: "recebimento", icon: ClipboardList, label: "Recebimento" },
        { to: "/expedicao", key: "expedicao", icon: PackageCheck, label: "Expedição" },
        { to: "/scanner", key: "scanner", icon: ScanLine, label: "Scanner" },
      ],
    },
    {
      key: "cadastros", label: "Cadastros", icon: ClipboardType,
      items: [
        { to: "/produtos", key: "produtos", icon: Package, label: "Produtos" },
        { to: "/enderecos", key: "enderecos", icon: MapPin, label: "Endereços" },
        { to: "/onboarding", key: "onboarding", icon: Upload, label: "Importar CSV" },
      ],
    },
    {
      key: "inteligencia", label: "Inteligência", icon: BrainCircuit,
      items: [
        { to: "/", key: "dashboard", icon: LayoutDashboard, label: "Dashboard" },
        { to: "/ai-insights", key: "ai-insights", icon: Sparkles, label: "IA Insights" },
        { to: "/notificacoes", key: "notificacoes", icon: Bell, label: "Alertas" },
      ],
    },
    ...(isAdmin ? [{
      key: "admin", label: "Administração", icon: ShieldCheck,
      items: [
        { to: "/admin/global", key: "global", icon: Crown, label: "Painel Global" },
        { to: "/admin", key: "admin", icon: Shield, label: "Admin" },
        { to: "/admin/data-quality", key: "data-quality", icon: ShieldAlert, label: "Data Quality" },
        { to: "/admin/audit-logs", key: "audit-logs", icon: Activity, label: "Auditoria" },
        { to: "/admin/changelog", key: "changelog", icon: FileClock, label: "Changelog" },
        { to: "/docs", key: "docs", icon: FileText, label: "Documentação" },
      ],
    } as NavGroup] : []),
  ];

  // filter items per group by permissions
  const visibleGroups = groups
    .map((g) => ({ ...g, items: g.items.filter((i) => isAllowed(i.key)) }))
    .filter((g) => g.items.length > 0);

  const isActive = (path: string) => location.pathname === path;
  const groupActive = (g: NavGroup) => g.items.some((i) => isActive(i.to));

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="bg-card/80 backdrop-blur-xl border-b border-border/50 sticky top-0 z-40">
        <div className="w-full px-4 sm:px-6 flex items-center h-14 gap-3">
          <Link to="/" className="flex items-center gap-2.5 shrink-0">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-sm">
              <Boxes size={16} className="text-primary-foreground" />
            </div>
            <div className="flex flex-col">
              <span className="font-black text-lg tracking-tight text-foreground leading-none">LLZ</span>
              {company?.name && <span className="text-[9px] text-muted-foreground leading-none truncate max-w-[120px]">{company.name}</span>}
            </div>
          </Link>

          <div className="hidden md:block flex-1 max-w-2xl">
            <ConversationalSearch />
          </div>

          <div className="ml-auto flex items-center gap-2">
            {(isSuperAdmin || availableCompanies.length > 1) && currentCompanyId && (
              <Select value={currentCompanyId} onValueChange={(v) => switchCompany(v)}>
                <SelectTrigger className="h-8 w-[160px] text-xs">
                  <Building2 size={14} className="text-primary mr-1" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableCompanies.map((c) => (
                    <SelectItem key={c.id} value={c.id} className="text-xs">
                      {c.name}{c.role === "super_admin" ? " ★" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <ThemeToggle />
            <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                <User size={14} className="text-primary" />
              </div>
              <span className="truncate max-w-[120px] font-medium text-foreground text-[11px]">
                {profile?.full_name || user?.email}
              </span>
            </div>
            <Button variant="ghost" size="sm" onClick={signOut} className="text-muted-foreground hover:text-foreground h-8 w-8 p-0">
              <LogOut size={16} />
            </Button>
          </div>
        </div>
      </header>

      {/* Full-width main content */}
      <main className="flex-1 w-full px-3 sm:px-6 lg:px-10 pb-28 pt-4">
        {children}
      </main>

      {/* Footer nav with grouped popovers */}
      <nav className="fixed bottom-0 inset-x-0 z-50 bg-card/90 backdrop-blur-xl border-t border-border/50">
        <div className="max-w-3xl mx-auto flex items-center justify-around px-2 py-2">
          {visibleGroups.map((g) => {
            const active = groupActive(g);
            const Icon = g.icon;
            return (
              <Popover key={g.key} open={openGroup === g.key} onOpenChange={(o) => setOpenGroup(o ? g.key : null)}>
                <PopoverTrigger asChild>
                  <button
                    className={`flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-xl text-[10px] font-semibold transition-all ${
                      active ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon size={20} />
                    <span className="hidden sm:inline">{g.label}</span>
                  </button>
                </PopoverTrigger>
                <PopoverContent side="top" align="center" sideOffset={12} className="w-56 p-1.5">
                  <p className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                    {g.label}
                  </p>
                  <div className="flex flex-col gap-0.5">
                    {g.items.map((item) => {
                      const ItemIcon = item.icon;
                      const itemActive = isActive(item.to);
                      return (
                        <Link
                          key={item.to}
                          to={item.to}
                          onClick={() => setOpenGroup(null)}
                          className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                            itemActive ? "bg-primary/10 text-primary" : "text-foreground hover:bg-secondary"
                          }`}
                        >
                          <ItemIcon size={16} />
                          {item.label}
                        </Link>
                      );
                    })}
                  </div>
                </PopoverContent>
              </Popover>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
