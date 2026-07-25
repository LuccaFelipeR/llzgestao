import { Building2 } from "lucide-react";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "react-router-dom";

/**
 * Guard de telas OPERACIONAIS: exige empresa explicitamente selecionada.
 * Telas globais da equipe LLZ não usam este componente.
 */
export default function RequireCompany({ children }: { children: React.ReactNode }) {
  const { currentCompanyId, loading } = useCompany();
  const { isPlatformStaff } = useAuth();

  if (loading) {
    return <div className="page-container text-sm text-muted-foreground">Carregando...</div>;
  }

  if (!currentCompanyId) {
    return (
      <div className="max-w-xl mx-auto p-6">
        <div className="bg-card border border-border rounded-2xl p-8 text-center">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Building2 className="text-primary" size={24} />
          </div>
          <h2 className="text-lg font-bold mb-1">Selecione uma empresa para acessar os dados operacionais.</h2>
          <p className="text-sm text-muted-foreground mb-4">
            {isPlatformStaff
              ? "Use o seletor de empresa no topo da tela para entrar em modo de manutenção de uma empresa específica."
              : "Sua conta ainda não está vinculada a nenhuma empresa ativa. Fale com o administrador da sua empresa."}
          </p>
          {isPlatformStaff && (
            <Link to="/admin/global" className="inline-flex items-center gap-2 text-xs font-semibold text-primary hover:underline">
              Voltar ao painel global
            </Link>
          )}
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
