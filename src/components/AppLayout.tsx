import { Link, useLocation } from "react-router-dom";
import { Package, MapPin, ArrowRightLeft, Search, LayoutDashboard } from "lucide-react";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Início" },
  { to: "/produtos", icon: Package, label: "Produtos" },
  { to: "/enderecos", icon: MapPin, label: "Endereços" },
  { to: "/movimentacoes", icon: ArrowRightLeft, label: "Movimentações" },
  { to: "/estoque", icon: Search, label: "Estoque" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="bg-card border-b border-border sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center h-14 gap-4">
          <Link to="/" className="font-bold text-lg text-primary tracking-tight">
            LLZ
          </Link>
          <span className="text-xs text-muted-foreground hidden sm:inline">Gestão de Estoque</span>
        </div>
      </header>

      {/* Bottom nav (mobile) / Side nav (desktop) */}
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
        </nav>

        {/* Main content */}
        <main className="flex-1 pb-20 md:pb-6">
          {children}
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-card border-t border-border z-50 flex justify-around py-1.5 px-2">
        {navItems.map((item) => {
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
