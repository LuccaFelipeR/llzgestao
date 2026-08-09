import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { CompanyProvider, useCompany } from "@/contexts/CompanyContext";
import AppLayout from "@/components/AppLayout";
import RequireCompany from "@/components/RequireCompany";
import Dashboard from "@/pages/Dashboard";
import Products from "@/pages/Products";
import Addresses from "@/pages/Addresses";
import Movements from "@/pages/Movements";
import StockQuery from "@/pages/StockQuery";
import AdminPanel from "@/pages/AdminPanel";
import Scanner from "@/pages/Scanner";
import Onboarding from "@/pages/Onboarding";
import NotificationSettings from "@/pages/NotificationSettings";
import Login from "@/pages/Login";
import ResetPassword from "@/pages/ResetPassword";
import PendingApproval from "@/pages/PendingApproval";
import StaffPendingActivation from "@/pages/StaffPendingActivation";

import AIInsights from "@/pages/AIInsights";
import CompanyOnboarding from "@/pages/CompanyOnboarding";
import Documentation from "@/pages/Documentation";
import GuidedReceiving from "@/pages/GuidedReceiving";
import Changelog from "@/pages/Changelog";
import DataQuality from "@/pages/DataQuality";
import AuditLogs from "@/pages/AuditLogs";
import GlobalDashboard from "@/pages/GlobalDashboard";
import PlatformReset from "@/pages/PlatformReset";
import Notifications from "@/pages/Notifications";
import Expedition from "@/pages/Expedition";
import ExpeditionPicking from "@/pages/ExpeditionPicking";
import Support from "@/pages/Support";
import CompanySettings from "@/pages/CompanySettings";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoute({
  children,
  adminOnly = false,
  superAdminOnly = false,
}: { children: React.ReactNode; adminOnly?: boolean; superAdminOnly?: boolean }) {
  const { session, loading, isApproved, isPlatformStaff, isPlatformSuperAdmin, isStaffPendingActivation } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground text-sm">Carregando...</div>
      </div>
    );
  }

  if (!session) return <Navigate to="/login" replace />;
  // Conta da equipe LLZ ainda sem papel global: nunca vai para o fluxo empresarial.
  if (isStaffPendingActivation) return <StaffPendingActivation />;
  if (!isApproved) return <PendingApproval />;
  if (superAdminOnly && !isPlatformSuperAdmin) return <Navigate to="/" replace />;
  if (adminOnly && !isPlatformStaff) return <Navigate to="/" replace />;


  return <>{children}</>;
}

function CompanyGate({ children }: { children: React.ReactNode }) {
  const { company, loading, currentCompanyId } = useCompany();
  const { isStaffAccount } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground text-sm">Carregando empresa...</div>
      </div>
    );
  }

  // Conta da Equipe LLZ: entra sem empresa, nunca vê onboarding de cliente.
  if (isStaffAccount) return <>{children}</>;


  if (company && !company.onboarding_completed) {
    return <CompanyOnboarding />;
  }

  if (!currentCompanyId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-3">
          <h2 className="text-lg font-semibold">Sem empresa vinculada</h2>
          <p className="text-sm text-muted-foreground">
            Sua conta ainda não está vinculada a nenhuma empresa. Contate um administrador.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

/** Home: cliente vê o dashboard da empresa; equipe LLZ vai ao painel global. */
function HomeRoute() {
  const { isPlatformStaff } = useAuth();
  const { currentCompanyId } = useCompany();
  if (isPlatformStaff && !currentCompanyId) return <Navigate to="/admin/global" replace />;
  return <RequireCompany><Dashboard /></RequireCompany>;
}

function AppRoutes() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground text-sm">Carregando...</div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={session ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <CompanyGate>
              <AppLayout>
                <Routes>
                  <Route path="/" element={<HomeRoute />} />
                  {/* Telas operacionais — exigem empresa selecionada */}
                  <Route path="/produtos" element={<RequireCompany><Products /></RequireCompany>} />
                  <Route path="/enderecos" element={<RequireCompany><Addresses /></RequireCompany>} />
                  <Route path="/movimentacoes" element={<RequireCompany><Movements /></RequireCompany>} />
                  <Route path="/estoque" element={<RequireCompany><StockQuery /></RequireCompany>} />
                  <Route path="/scanner" element={<RequireCompany><Scanner /></RequireCompany>} />
                  <Route path="/onboarding" element={<RequireCompany><Onboarding /></RequireCompany>} />
                  <Route path="/recebimento" element={<RequireCompany><GuidedReceiving /></RequireCompany>} />
                  <Route path="/expedicao" element={<RequireCompany><Expedition /></RequireCompany>} />
                  <Route path="/expedicao/:id" element={<RequireCompany><ExpeditionPicking /></RequireCompany>} />
                  <Route path="/configuracoes" element={<RequireCompany><CompanySettings /></RequireCompany>} />
                  <Route path="/notificacoes" element={<RequireCompany><Notifications /></RequireCompany>} />
                  <Route path="/notificacoes/config" element={<RequireCompany><NotificationSettings /></RequireCompany>} />
                  <Route path="/ai-insights" element={<AIInsights />} />
                  {/* Suporte: global para equipe LLZ, por empresa para clientes */}
                  <Route path="/suporte" element={<Support />} />
                  <Route path="/company-onboarding" element={<CompanyOnboarding />} />
                  {/* Telas globais da plataforma */}
                  <Route path="/docs" element={<ProtectedRoute adminOnly><Documentation /></ProtectedRoute>} />
                  <Route path="/admin" element={<ProtectedRoute adminOnly><AdminPanel /></ProtectedRoute>} />
                  <Route path="/admin/global" element={<ProtectedRoute adminOnly><GlobalDashboard /></ProtectedRoute>} />
                  <Route path="/admin/changelog" element={<ProtectedRoute adminOnly><Changelog /></ProtectedRoute>} />
                  <Route path="/admin/data-quality" element={<ProtectedRoute adminOnly><DataQuality /></ProtectedRoute>} />
                  <Route path="/admin/audit-logs" element={<ProtectedRoute adminOnly><AuditLogs /></ProtectedRoute>} />
                  <Route path="/admin/reset" element={<ProtectedRoute superAdminOnly><PlatformReset /></ProtectedRoute>} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </AppLayout>
            </CompanyGate>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <BrowserRouter>
        <AuthProvider>
          <CompanyProvider>
            <AppRoutes />
          </CompanyProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
