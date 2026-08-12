/* eslint-disable @typescript-eslint/no-explicit-any */
import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEntitlements } from "@/hooks/useEntitlements";
import { FEATURE_LABEL, type FeatureKey } from "@/lib/entitlements";

/** Estado claro (sem erro técnico) quando o plano não inclui o recurso. */
export function FeatureLockedCard({ feature, planName }: { feature: FeatureKey; planName?: string }) {
  return (
    <div className="max-w-lg mx-auto bg-card border border-border rounded-2xl p-6 text-center space-y-3">
      <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mx-auto">
        <Lock size={22} className="text-muted-foreground" />
      </div>
      <div>
        <h2 className="font-bold">Este recurso não está disponível no plano atual.</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Recurso: <span className="font-semibold text-foreground">{FEATURE_LABEL[feature]}</span>
          {planName ? <> • Plano atual: <span className="font-semibold text-foreground">{planName}</span></> : null}
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          Existe upgrade disponível que inclui este recurso. A contratação é feita com a equipe LLZ.
        </p>
      </div>
      <div className="flex items-center justify-center gap-2">
        <Button asChild variant="outline" size="sm"><Link to="/configuracoes">Ver plano</Link></Button>
        <Button asChild size="sm"><Link to="/suporte">Falar com a LLZ</Link></Button>
      </div>
    </div>
  );
}

/** Envolve uma tela/bloco e troca por um estado claro quando o plano não permite. */
export default function FeatureGate({ feature, children }: { feature: FeatureKey; children: ReactNode }) {
  const { entitlements, isLoading, can } = useEntitlements();
  if (isLoading || !entitlements) return <>{children}</>;
  if (can(feature)) return <>{children}</>;
  return <FeatureLockedCard feature={feature} planName={entitlements.plan?.name} />;
}
