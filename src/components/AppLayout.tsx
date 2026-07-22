import { Link, NavLink, useLocation } from "react-router-dom";
import {
  Package, MapPin, ArrowRightLeft, Search, LayoutDashboard, Shield, LogOut, User,
  ScanLine, Bell, Upload, Boxes, Sparkles, FileText, ClipboardList, Building2,
  FileClock, ShieldAlert, Activity, Crown, PackageCheck, Workflow, ClipboardType,
  BrainCircuit, ShieldCheck, LifeBuoy, Settings,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger,
  SidebarHeader, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import ThemeToggle from "@/components/ThemeToggle";
import ConversationalSearch from "@/components/ConversationalSearch";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type NavItem = { to: string; key: string; icon: any; label: string };
type NavGroup = { key: string; label: string; icon: any; items: NavItem[] };

function AppSidebarInner({ groups }: { groups: NavGroup[] }) {
  const { state } = useSidebar();
  const { pathname } = useLocation();
  const { user, profile } = useAuth();
  const { company } = useCompany();
  const collapsed = state === "collapsed";

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Link to="/" className="flex items-center gap-2.5 px-2 py-1.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-sm shrink-0">
            <Boxes size={16} className="text-primary-foreground" />
          </div>
          {!collapsed && (
            <div className="flex flex-col min-w-0">
              <span className="font-black text-base tracking-tight text-foreground leading-none">LLZ</span>
              {company?.name && (
                <span className="text-[9px] text-muted-foreground leading-none truncate">{company.name}</span>
              )}
            </div>
          )}
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {groups.map((g) => {
          const GroupIcon = g.icon;
          return (
            <SidebarGroup key={g.key}>
              <SidebarGroupLabel className="flex items-center gap-2">
                <GroupIcon size={12} /> {g.label}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {g.items.map((item) => {
                    const ItemIcon = item.icon;
                    const active = pathname === item.to;
                    return (
                      <SidebarMenuItem key={item.to}>
                        <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                          <NavLink to={item.to} className="flex items-center gap-2">
                            <ItemIcon className="h-4 w-4" />
                            <span>{item.label}</span>
                          </NavLink>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarFooter>
        {!collapsed && (
          <div className="px-2 py-2 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <User size={14} className="text-primary" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-foreground truncate text-[11px]">{profile?.full_name || "Usuário"}</p>
                <p className="text-muted-foreground truncate text-[10px]">{user?.email}</p>
              </div>
            </div>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, isAdmin, signOut } = useAuth();
  const { availableCompanies, switchCompany, isSuperAdmin, currentCompanyId, company } = useCompany();

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

  const rawGroups: NavGroup[] = [
    {
      key: "inteligencia", label: "Inteligência", icon: BrainCircuit,
      items: [
        { to: "/", key: "dashboard", icon: LayoutDashboard, label: "Dashboard" },
        { to: "/ai-insights", key: "ai-insights", icon: Sparkles, label: "IA Insights" },
        { to: "/notificacoes", key: "notificacoes", icon: Bell, label: "Alertas" },
        { to: "/suporte", key: "suporte", icon: LifeBuoy, label: "Suporte" },
      ],
    },
    {
      key: "operacao", label: "Operação", icon: Workflow,
      items: [
        { to: "/estoque", key: "estoque", icon: Search, label: "Estoque" },
        { to: "/movimentacoes", key: "movimentacoes", icon: ArrowRightLeft, label: "Movimentações" },
        { to: "/recebimento", key: "recebimento", icon: ClipboardList, label: "Recebimento" },
        ...(company?.uses_expedition !== false
          ? [{ to: "/expedicao", key: "expedicao", icon: PackageCheck, label: "Expedição" }]
          : []),
        { to: "/scanner", key: "scanner", icon: ScanLine, label: "Scanner" },
      ],
    },
    {
      key: "cadastros", label: "Cadastros", icon: ClipboardType,
      items: [
        { to: "/produtos", key: "produtos", icon: Package, label: "Produtos" },
        ...(company?.uses_addressing !== false
          ? [{ to: "/enderecos", key: "enderecos", icon: MapPin, label: "Endereços" }]
          : []),
        { to: "/onboarding", key: "onboarding", icon: Upload, label: "Importar CSV" },
        { to: "/configuracoes", key: "configuracoes", icon: Settings, label: "Configurações" },
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

  const groups = rawGroups
    .map((g) => ({ ...g, items: g.items.filter((i) => isAllowed(i.key)) }))
    .filter((g) => g.items.length > 0);

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebarInner groups={groups} />

        <div className="flex-1 flex flex-col min-w-0">
          <header className="bg-card/80 backdrop-blur-xl border-b border-border/50 sticky top-0 z-30">
            <div className="w-full px-3 sm:px-6 flex items-center h-14 gap-3">
              <SidebarTrigger className="shrink-0" />

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
                <Button variant="ghost" size="sm" onClick={signOut} className="text-muted-foreground hover:text-foreground h-8 w-8 p-0">
                  <LogOut size={16} />
                </Button>
              </div>
            </div>
          </header>

          <main className="flex-1 w-full px-3 sm:px-6 lg:px-10 py-4">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
