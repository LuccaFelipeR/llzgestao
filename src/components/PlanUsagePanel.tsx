/* eslint-disable @typescript-eslint/no-explicit-any */
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, XCircle, CreditCard, AlertTriangle, Info } from "lucide-react";
import { useCompanyEntitlements } from "@/hooks/useEntitlements";
import {
  FEATURE_KEYS,
  FEATURE_LABEL,
  limitLabelValue,
  usageList,
  type UsageInfo,
} from "@/lib/entitlements";

const STATE_TEXT: Record<string, string> = {
  normal: "Dentro do plano",
  atencao: "Próximo do limite",
  limite: "Limite atingido",
  acima: "Acima do limite",
};

const STATE_STYLE: Record<string, string> = {
  normal: "border-accent text-accent",
  atencao: "border-warning text-warning",
  limite: "border-destructive text-destructive",
  acima: "border-destructive text-destructive",
};

export function UsageRow({ u }: { u: UsageInfo }) {
  return (
    <div className="p-3 rounded-xl border border-border space-y-1.5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm font-semibold">{u.label}</p>
        <Badge variant="outline" className={`text-[10px] ${STATE_STYLE[u.state]}`}>{STATE_TEXT[u.state]}</Badge>
      </div>
      <p className="text-xs font-mono">
        {u.used.toLocaleString("pt-BR")} / {limitLabelValue(u.unlimited ? -1 : u.limit)}
      </p>
      {!u.unlimited && <Progress value={u.pct} className="h-1.5" />}
      <p className="text-xs text-muted-foreground">{u.text}</p>
    </div>
  );
}

export default function PlanUsagePanel({ companyId }: { companyId: string | null | undefined }) {
  const { data: ent, isLoading } = useCompanyEntitlements(companyId);

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Carregando plano e utilização…</p>;
  }
  if (!ent) {
    return <p className="text-sm text-muted-foreground">Não foi possível carregar as informações do plano.</p>;
  }

  const usage = usageList(ent);
  const alerts = usage.filter((u) => u.state !== "normal");

  return (
    <section className="bg-card border border-border rounded-2xl p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-bold text-sm flex items-center gap-2">
            <CreditCard size={16} /> Plano e utilização
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Plano atual: <span className="font-semibold text-foreground">{ent.plan?.name}</span>
            {ent.plan?.description ? ` — ${ent.plan.description}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px]">
            Situação: {ent.company_status === "trial" ? "Avaliação (trial)" : ent.company_status === "active" ? "Ativo" : ent.company_status}
          </Badge>
          {ent.overrides?.has_any && (
            <Badge variant="outline" className="text-[10px] border-primary text-primary">Condição comercial específica</Badge>
          )}
        </div>
      </div>

      {alerts.length > 0 && (
        <div className="rounded-xl border border-warning/40 bg-warning/5 p-3 space-y-1">
          <p className="text-xs font-semibold flex items-center gap-1.5">
            <AlertTriangle size={13} /> Atenção aos limites
          </p>
          {alerts.map((a) => (
            <p key={a.key} className="text-xs text-muted-foreground">
              {a.label}: {a.text}
              {a.state !== "atencao" && " — novos cadastros deste tipo ficam bloqueados até ajustar o plano."}
            </p>
          ))}
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-2">
        {usage.map((u) => <UsageRow key={u.key} u={u} />)}
      </div>

      <div>
        <p className="text-xs font-semibold mb-2">Recursos do plano</p>
        <div className="grid sm:grid-cols-2 gap-1.5">
          {FEATURE_KEYS.map((f) => {
            const on = ent.features?.[f] === true;
            return (
              <div key={f} className="flex items-center gap-2 text-xs p-2 rounded-lg bg-secondary/40">
                {on ? <CheckCircle2 size={14} className="text-accent" /> : <XCircle size={14} className="text-muted-foreground" />}
                <span className={on ? "font-medium" : "text-muted-foreground"}>{FEATURE_LABEL[f]}</span>
                <span className="ml-auto text-[10px] text-muted-foreground">{on ? "Disponível" : "Não incluso"}</span>
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
        <Info size={12} className="mt-0.5 shrink-0" />
        Atingir um limite não apaga nem bloqueia dados existentes: consulta, edição e movimentação continuam normais.
        Apenas novos cadastros acima do limite ficam impedidos. Para ampliar limites ou recursos, fale com a LLZ pela Central de Suporte.
      </p>
    </section>
  );
}
