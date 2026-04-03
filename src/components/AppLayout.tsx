import { Link, useLocation } from "react-router-dom";
import { Package, MapPin, ArrowRightLeft, Search, LayoutDashboard, Shield, LogOut, User, ScanLine, Bell, Upload, Boxes, Sparkles, FileText } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import ThemeToggle from "@/components/ThemeToggle";
import ConversationalSearch from "@/components/ConversationalSearch";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { user, profile, isAdmin, role, signOut } = useAuth();
  const { company } = useCompany();

  const navItems = [
    { to: "/", icon: LayoutDashboard, label: "Início" },
    { to: "/scanner", icon: ScanLine, label: "Scanner" },
    { to: "/produtos", icon: Package, label: "Produtos" },
    { to: "/enderecos", icon: MapPin, label: "Endereços" },
    { to: "/movimentacoes", icon: ArrowRightLeft, label: "Movimentações" },
    { to: "/estoque", icon: Search, label: "Estoque" },
    { to: "/ai-insights", icon: Sparkles, label: "IA Insights" },
    { to: "/onboarding", icon: Upload, label: "Importar" },
    { to: "/notificacoes", icon: Bell, label: "Alertas" },
    ...(isAdmin ? [
      { to: "/admin", icon: Shield, label: "Admin" },
      { to: "/docs", icon: FileText, label: "Documentação" },
    ] : []),
  ];

  const ROLE_LABELS: Record<string, string> = { operator: "Operador", supervisor: "Supervisor", admin: "Administrador" };
  const ROLE_COLORS: Record<string, string> = { operator: "bg-primary/10 text-primary", supervisor: "bg-accent/10 text-accent", admin: "bg-success/10 text-success" };

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card/80 backdrop-blur-xl border-b border-border/50 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center h-14 gap-4">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-sm">
              <Boxes size={16} className="text-primary-foreground" />
            </div>
            <div className="flex flex-col">
              <span className="font-black text-lg tracking-tight text-foreground leading-none">LLZ</span>
              {company?.name && <span className="text-[9px] text-muted-foreground leading-none truncate max-w-[100px]">{company.name}</span>}
            </div>
          </Link>

          <QuickSearch />

          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                <User size={14} className="text-primary" />
              </div>
              <div className="flex flex-col">
                <span className="truncate max-w-[120px] font-medium text-foreground text-[11px]">{profile?.full_name || user?.email}</span>
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
          </div>
        </div>
      </header>

      <div className="flex">
        <nav className="hidden md:flex flex-col w-56 border-r border-border/50 bg-card/50 min-h-[calc(100vh-3.5rem)] p-3 gap-0.5 sticky top-14">
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

      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-card/90 backdrop-blur-xl border-t border-border/50 z-50 flex justify-around py-1.5 px-1">
        {navItems.slice(0, 5).map((item) => {
          const active = location.pathname === item.to;
          return (
            <Link key={item.to} to={item.to}
              className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-xl text-[10px] font-semibold transition-all ${active ? "text-primary" : "text-muted-foreground"}`}>
              <item.icon size={20} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
