import { Link, useLocation } from "react-router-dom";
import { Package, MapPin, ArrowRightLeft, Search, LayoutDashboard, Shield, LogOut, User, ScanLine, Bell, Upload } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import ThemeToggle from "@/components/ThemeToggle";
import QuickSearch from "@/components/QuickSearch";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { user, profile, isAdmin, role, signOut } = useAuth();

  const navItems = [
    { to: "/", icon: LayoutDashboard, label: "Início" },
    { to: "/scanner", icon: ScanLine, label: "Scanner" },
    { to: "/produtos", icon: Package, label: "Produtos" },
    { to: "/enderecos", icon: MapPin, label: "Endereços" },
    { to: "/movimentacoes", icon: ArrowRightLeft, label: "Movimentações" },
    { to: "/estoque", icon: Search, label: "Estoque" },
    { to: "/onboarding", icon: Upload, label: "Importar" },
    { to: "/notificacoes", icon: Bell, label: "Alertas" },
    ...(isAdmin ? [{ to: "/admin", icon: Shield, label: "Admin" }] : []),
  ];

  const ROLE_LABELS: Record<string, string> = {
    operator: "Operador",
    supervisor: "Supervisor",
    admin: "Administrador",
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="bg-card border-b border-border sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center h-14 gap-4">
          <Link to="/" className="font-bold text-lg text-primary tracking-tight">
            LLZ
          </Link>
          <span className="text-xs text-muted-foreground hidden sm:inline">Gestão de Estoque</span>
          
          <QuickSearch />
          
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
              <User size={14} />
              <span className="truncate max-w-[150px]">{profile?.full_name || user?.email}</span>
              {role && (
                <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded text-[10px] font-semibold">
                  {ROLE_LABELS[role] ?? role}
                </span>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={signOut} className="text-muted-foreground hover:text-foreground h-8 px-2">
              <LogOut size={16} />
            </Button>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Desktop sidebar */}
        <nav className="hidden md:flex flex-col w-56 border-r border-border bg-card min-h-[calc(100vh-3.5rem)] p-3 gap-1 sticky top-14">
          {navItems.map((item) => {
            const active = location.pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                <item.icon size={20} />
                {item.label}
              </Link>
            );
          })}

          <div className="mt-auto pt-4 border-t border-border">
            <div className="px-3 py-2 text-xs text-muted-foreground">
              <p className="font-medium text-foreground truncate">{profile?.full_name || "Usuário"}</p>
              <p className="truncate">{user?.email}</p>
            </div>
          </div>
        </nav>

        <main className="flex-1 pb-20 md:pb-6">
          {children}
        </main>
      </div>

      {/* Mobile bottom nav - show top 5 items */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-card border-t border-border z-50 flex justify-around py-1.5 px-2">
        {navItems.slice(0, 5).map((item) => {
          const active = location.pathname === item.to;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg text-xs font-medium transition-colors ${
                active ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <item.icon size={20} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
