import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { CompanyProvider, useCompany } from "@/contexts/CompanyContext";
import AppLayout from "@/components/AppLayout";
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
import AIInsights from "@/pages/AIInsights";
import CompanyOnboarding from "@/pages/CompanyOnboarding";
import Documentation from "@/pages/Documentation";
import GuidedReceiving from "@/pages/GuidedReceiving";
import Changelog from "@/pages/Changelog";
import DataQuality from "@/pages/DataQuality";
import AuditLogs from "@/pages/AuditLogs";
import GlobalDashboard from "@/pages/GlobalDashboard";
import Notifications from "@/pages/Notifications";
import Expedition from "@/pages/Expedition";
import ExpeditionPicking from "@/pages/ExpeditionPicking";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoute({ children, adminOnly = false }: { children: React.ReactNode; adminOnly?: boolean }) {
  const { session, loading, isApproved, isAdmin } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground text-sm">Carregando...</div>
      </div>
    );
  }

  if (!session) return <Navigate to="/login" replace />;
  if (!isApproved) return <PendingApproval />;
  if (adminOnly && !isAdmin) return <Navigate to="/" replace />;

  return <>{children}</>;
}

function CompanyGate({ children }: { children: React.ReactNode }) {
  const { company, loading, currentCompanyId, isSuperAdmin } = useCompany();
  const { isAdmin } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground text-sm">Carregando empresa...</div>
      </div>
    );
  }

  if (company && !company.onboarding_completed) {
    return <CompanyOnboarding />;
  }

  // Block when there's no company selected, unless super admin (who can still reach /admin)
  if (!currentCompanyId && !isSuperAdmin && !isAdmin) {
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
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/produtos" element={<Products />} />
                  <Route path="/enderecos" element={<Addresses />} />
                  <Route path="/movimentacoes" element={<Movements />} />
                  <Route path="/estoque" element={<StockQuery />} />
                  <Route path="/scanner" element={<Scanner />} />
                  <Route path="/onboarding" element={<Onboarding />} />
                  <Route path="/notificacoes" element={<Notifications />} />
                  <Route path="/notificacoes/config" element={<NotificationSettings />} />
                  <Route path="/ai-insights" element={<AIInsights />} />
                  <Route path="/recebimento" element={<GuidedReceiving />} />
                  <Route path="/expedicao" element={<Expedition />} />
                  <Route path="/expedicao/:id" element={<ExpeditionPicking />} />
                  <Route path="/docs" element={<ProtectedRoute adminOnly><Documentation /></ProtectedRoute>} />
                  <Route path="/admin" element={<ProtectedRoute adminOnly><AdminPanel /></ProtectedRoute>} />
                  <Route path="/admin/global" element={<ProtectedRoute adminOnly><GlobalDashboard /></ProtectedRoute>} />
                  <Route path="/admin/changelog" element={<ProtectedRoute adminOnly><Changelog /></ProtectedRoute>} />
                  <Route path="/admin/data-quality" element={<ProtectedRoute adminOnly><DataQuality /></ProtectedRoute>} />
                  <Route path="/admin/audit-logs" element={<ProtectedRoute adminOnly><AuditLogs /></ProtectedRoute>} />
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
