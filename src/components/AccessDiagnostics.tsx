import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Stethoscope, RefreshCw } from "lucide-react";
import { friendlyError } from "@/lib/error-messages";

interface DiagItem {
  code: string;
  severity: string;
  user_id: string | null;
  email: string | null;
  company: string | null;
  situation: string;
  recommendation: string;
}

const SEVERITY_STYLE: Record<string, string> = {
  critical: "border-destructive text-destructive",
  warning: "border-warning text-warning",
  info: "border-muted-foreground text-muted-foreground",
};

const SEVERITY_LABEL: Record<string, string> = {
  critical: "Crítico",
  warning: "Atenção",
  info: "Informativo",
};

export default function AccessDiagnostics() {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["access-diagnostics"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("platform_access_diagnostics");
      if (error) throw error;
      return (data?.items ?? []) as DiagItem[];
    },
  });

  const items = data ?? [];
  const order = ["critical", "warning", "info"];
  const sorted = [...items].sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity));

  return (
    <div className="space-y-3">
      <div className="bg-card border border-border rounded-xl p-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Stethoscope size={16} className="text-primary" /> Diagnóstico de acessos
          </h3>
          <p className="text-[11px] text-muted-foreground mt-1">
            Somente leitura. Nenhum dado é corrigido automaticamente.
          </p>
        </div>
        <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw size={14} /> Atualizar
        </Button>
      </div>

      {isLoading && <p className="text-xs text-muted-foreground">Analisando acessos...</p>}
      {error && <p className="text-xs text-destructive">{friendlyError(error as Error)}</p>}
      {!isLoading && !error && sorted.length === 0 && (
        <p className="text-sm text-muted-foreground py-6 text-center">Nenhuma inconsistência encontrada.</p>
      )}

      <div className="space-y-2">
        {sorted.map((it, i) => (
          <div key={`${it.code}-${i}`} className="bg-card border border-border rounded-xl p-3 text-xs space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className={`text-[10px] ${SEVERITY_STYLE[it.severity] ?? ""}`}>
                {SEVERITY_LABEL[it.severity] ?? it.severity}
              </Badge>
              <span className="font-medium">{it.situation}</span>
            </div>
            <p className="text-muted-foreground">
              {it.email ? `Usuário: ${it.email}` : it.user_id ? `Usuário: ${it.user_id.slice(0, 8)}` : "Usuário: —"}
              {" • "}Empresa: {it.company ?? "—"}
            </p>
            <p className="text-muted-foreground">Recomendação: {it.recommendation}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
