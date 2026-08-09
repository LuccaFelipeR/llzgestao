import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Crown, RefreshCw, LogOut } from "lucide-react";

/** Membro da Equipe LLZ que já criou a conta, mas ainda não foi ativado. */
export default function StaffPendingActivation() {
  const { profile, refreshProfile, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-4 bg-card border border-border rounded-2xl p-8">
        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
          <Crown size={22} className="text-primary" />
        </div>
        <h1 className="text-lg font-semibold">Cadastro recebido — aguardando ativação da equipe LLZ</h1>
        <p className="text-sm text-muted-foreground">
          Sua conta foi identificada como <strong>Equipe LLZ</strong> ({profile?.email}). Nenhuma empresa é
          necessária. Assim que o super administrador ativar seu acesso, as ferramentas internas ficarão
          disponíveis.
        </p>
        <div className="flex gap-2 justify-center">
          <Button size="sm" variant="outline" className="gap-1" onClick={() => refreshProfile()}>
            <RefreshCw size={14} /> Verificar novamente
          </Button>
          <Button size="sm" variant="ghost" className="gap-1" onClick={() => signOut()}>
            <LogOut size={14} /> Sair
          </Button>
        </div>
      </div>
    </div>
  );
}
