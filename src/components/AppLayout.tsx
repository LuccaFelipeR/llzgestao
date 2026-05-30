import { Link, useLocation } from "react-router-dom";
import { Package, MapPin, ArrowRightLeft, Search, LayoutDashboard, Shield, LogOut, User, ScanLine, Bell, Upload, Boxes, Sparkles, FileText, ClipboardList, Menu, X, Building2, FileClock, ShieldAlert, Activity } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ThemeToggle from "@/components/ThemeToggle";
import ConversationalSearch from "@/components/ConversationalSearch";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { user, profile, isAdmin, role, signOut } = useAuth();
  const { company, availableCompanies, switchCompany, isSuperAdmin, currentCompanyId } = useCompany();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Fetch user's tab permissions
  const { data: tabPermissions } = useQuery({
    queryKey: ["my-tab-permissions", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase.from("user_tab_permissions").select("tab_key, is_allowed").eq("user_id", user!.id);
      return data ?? [];
    },
  });

  const allNavItems = [
    { to: "/", key: "dashboard", icon: LayoutDashboard, label: "Início" },
    { to: "/scanner", key: "scanner", icon: ScanLine, label: "Scanner" },
    { to: "/produtos", key: "produtos", icon: Package, label: "Produtos" },
    { to: "/enderecos", key: "enderecos", icon: MapPin, label: "Endereços" },
    { to: "/movimentacoes", key: "movimentacoes", icon: ArrowRightLeft, label: "Movimentações" },
    { to: "/estoque", key: "estoque", icon: Search, label: "Estoque" },
    { to: "/recebimento", key: "recebimento", icon: ClipboardList, label: "Recebimento" },
    { to: "/ai-insights", key: "ai-insights", icon: Sparkles, label: "IA Insights" },
    { to: "/onboarding", key: "onboarding", icon: Upload, label: "Importar" },
    { to: "/notificacoes", key: "notificacoes", icon: Bell, label: "Alertas" },
    ...(isAdmin ? [
      { to: "/admin", key: "admin", icon: Shield, label: "Admin" },
      { to: "/admin/data-quality", key: "data-quality", icon: ShieldAlert, label: "Data Quality" },
      { to: "/admin/audit-logs", key: "audit-logs", icon: Activity, label: "Auditoria" },
      { to: "/admin/changelog", key: "changelog", icon: FileClock, label: "Changelog" },
      { to: "/docs", key: "docs", icon: FileText, label: "Documentação" },
    ] : []),
  ];

  // Filter items based on tab permissions (admins see all)
  const navItems = isAdmin ? allNavItems : allNavItems.filter((item) => {
    const blocked = tabPermissions?.find((p) => p.tab_key === item.key && !p.is_allowed);
    return !blocked;
  });

  const ROLE_LABELS: Record<string, string> = { operator: "Operador", supervisor: "Supervisor", admin: "Administrador" };
  const ROLE_COLORS: Record<string, string> = { operator: "bg-primary/10 text-primary", supervisor: "bg-accent/10 text-accent", admin: "bg-success/10 text-success" };

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card/80 backdrop-blur-xl border-b border-border/50 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center h-14 gap-3">
          <Link to="/" className="flex items-center gap-2.5 shrink-0">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-sm">
              <Boxes size={16} className="text-primary-foreground" />
            </div>
            <div className="flex flex-col">
              <span className="font-black text-lg tracking-tight text-foreground leading-none">LLZ</span>
              {company?.name && <span className="text-[9px] text-muted-foreground leading-none truncate max-w-[80px]">{company.name}</span>}
            </div>
          </Link>

          <div className="hidden md:block flex-1">
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
              <div className="flex flex-col">
                <span className="truncate max-w-[100px] font-medium text-foreground text-[11px]">{profile?.full_name || user?.email}</span>
                {role && (
                  <span className={`${ROLE_COLORS[role] ?? "bg-muted text-muted-foreground"} px-1.5 py-0 rounded text-[9px] font-bold w-fit`}>
                    {ROLE_LABELS[role] ?? role}
                  </span>
                )}
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={signOut} className="text-muted-foreground hover:text-foreground h-8 w-8 p-0">
              <LogOut size={16} />
            </Button>
            {/* Mobile menu toggle */}
            <button className="md:hidden text-muted-foreground hover:text-foreground p-1" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile slide-out menu */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-background/95 backdrop-blur-xl pt-14">
          <nav className="flex flex-col p-4 gap-1 max-h-[calc(100vh-3.5rem)] overflow-y-auto">
            {navItems.map((item) => {
              const active = location.pathname === item.to;
              return (
                <Link key={item.to} to={item.to} onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}>
                  <item.icon size={20} />
                  {item.label}
                </Link>
              );
            })}
            <div className="mt-4 pt-4 border-t border-border">
              <div className="px-4 py-2 text-xs text-muted-foreground">
                <p className="font-semibold text-foreground">{profile?.full_name || "Usuário"}</p>
                <p className="truncate text-[10px]">{user?.email}</p>
              </div>
            </div>
          </nav>
        </div>
      )}

      <div className="flex">
        <nav className="hidden md:flex flex-col w-56 border-r border-border/50 bg-card/50 min-h-[calc(100vh-3.5rem)] p-3 gap-0.5 sticky top-14 overflow-y-auto">
          {navItems.map((item) => {
            const active = location.pathname === item.to;
            return (
              <Link key={item.to} to={item.to}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${active ? "bg-primary/10 text-primary shadow-sm" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}>
                <item.icon size={18} />
                {item.label}
              </Link>
            );
          })}
          <div className="mt-auto pt-4 border-t border-border/50">
            <div className="px-3 py-2 text-xs text-muted-foreground">
              <p className="font-semibold text-foreground truncate">{profile?.full_name || "Usuário"}</p>
              <p className="truncate text-[10px]">{user?.email}</p>
            </div>
          </div>
        </nav>

        <main className="flex-1 pb-20 md:pb-6">{children}</main>
      </div>

      {/* Mobile bottom nav — scrollable */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-card/90 backdrop-blur-xl border-t border-border/50 z-50 overflow-x-auto">
        <div className="flex py-1.5 px-1 min-w-max">
          {navItems.slice(0, 7).map((item) => {
            const active = location.pathname === item.to;
            return (
              <Link key={item.to} to={item.to}
                className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl text-[10px] font-semibold transition-all shrink-0 ${active ? "text-primary" : "text-muted-foreground"}`}>
                <item.icon size={18} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
