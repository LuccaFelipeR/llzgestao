import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Clock, LogOut } from "lucide-react";

export default function PendingApproval() {
  const { signOut, profile } = useAuth();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        <div className="bg-card border border-border rounded-2xl p-8 shadow-sm">
          <div className="w-16 h-16 rounded-full bg-warning/15 flex items-center justify-center mx-auto mb-4">
            <Clock size={32} className="text-warning" />
          </div>
          <h2 className="text-xl font-bold text-foreground mb-2">Aguardando Aprovação</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Sua conta <strong>{profile?.email}</strong> foi criada com sucesso.
            O administrador precisa aprovar seu acesso antes de continuar.
          </p>
          <Button variant="outline" onClick={signOut} className="gap-2">
            <LogOut size={16} /> Sair
          </Button>
        </div>
      </div>
    </div>
  );
}
