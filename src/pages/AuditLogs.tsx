import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Activity, Loader2 } from "lucide-react";

export default function AuditLogs() {
  const { isSuperAdmin, availableCompanies, currentCompanyId } = useCompany();
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [companyFilter, setCompanyFilter] = useState<string>(isSuperAdmin ? "all" : currentCompanyId ?? "all");

  const { data: logs, isLoading } = useQuery({
    queryKey: ["audit-logs", companyFilter, actionFilter, currentCompanyId, isSuperAdmin],
    enabled: isSuperAdmin || !!currentCompanyId,
    queryFn: async () => {
      let q = supabase
        .from("activity_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      // Super admin can pick "all" or a specific company; non-super admin is
      // forced to their current company via RLS + explicit filter.
      if (isSuperAdmin) {
        if (companyFilter !== "all") q = q.eq("company_id", companyFilter);
      } else if (currentCompanyId) {
        q = q.eq("company_id", currentCompanyId);
      }
      if (actionFilter !== "all") q = q.eq("action", actionFilter);
      const { data, error } = await q;
      if (error) throw error;
      const rows = data ?? [];

      // Fetch profiles separately (profiles has no FK relationship declared to
      // activity_log.user_id, so PostgREST embedding is unreliable).
      const userIds = Array.from(
        new Set(rows.map((r: any) => r.user_id).filter(Boolean))
      );
      let profilesById: Record<string, { email: string; full_name: string | null }> = {};
      if (userIds.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, email, full_name")
          .in("id", userIds as string[]);
        (profs ?? []).forEach((p: any) => {
          profilesById[p.id] = { email: p.email, full_name: p.full_name };
        });
      }
      return rows.map((r: any) => ({ ...r, profiles: r.user_id ? profilesById[r.user_id] : null }));
    },
  });

  const { data: actions } = useQuery({
    queryKey: ["audit-distinct-actions", currentCompanyId, isSuperAdmin],
    enabled: isSuperAdmin || !!currentCompanyId,
    queryFn: async () => {
      let q = supabase.from("activity_log").select("action").limit(1000);
      if (!isSuperAdmin && currentCompanyId) q = q.eq("company_id", currentCompanyId);
      const { data } = await q;
      return Array.from(new Set((data ?? []).map((d: any) => d.action))).sort();
    },
  });

  const filtered = (logs ?? []).filter((l: any) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      l.action?.toLowerCase().includes(s) ||
      l.entity_type?.toLowerCase().includes(s) ||
      l.entity_id?.toLowerCase().includes(s) ||
      l.profiles?.email?.toLowerCase().includes(s)
    );
  });

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Activity className="text-primary" size={20} />
        </div>
        <div>
          <h1 className="text-2xl font-black tracking-tight">Logs de Auditoria</h1>
          <p className="text-sm text-muted-foreground">
            {isSuperAdmin ? "Visão global de todas as empresas." : "Atividades da sua empresa."}
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Input placeholder="Buscar por ação, entidade, email..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger><SelectValue placeholder="Ação" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas ações</SelectItem>
              {actions?.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
          {isSuperAdmin && (
            <Select value={companyFilter} onValueChange={setCompanyFilter}>
              <SelectTrigger><SelectValue placeholder="Empresa" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas empresas</SelectItem>
                {availableCompanies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </CardContent>
      </Card>

      {isLoading && (
        <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin text-primary" /></div>
      )}

      <div className="space-y-2">
        {filtered.map((log: any) => (
          <Card key={log.id}>
            <CardContent className="p-3 flex items-start gap-3 flex-wrap">
              <Badge variant="outline" className="font-mono text-[10px]">{log.action}</Badge>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">{log.profiles?.full_name || log.profiles?.email || "Sistema"}</span>
                  {log.entity_type && <> · {log.entity_type}</>}
                  {log.entity_id && <> · <span className="font-mono">{log.entity_id.slice(0, 8)}</span></>}
                </div>
                {log.details && Object.keys(log.details).length > 0 && (
                  <pre className="text-[10px] text-muted-foreground mt-1 font-mono overflow-x-auto bg-secondary/50 p-2 rounded">
                    {JSON.stringify(log.details, null, 2)}
                  </pre>
                )}
              </div>
              <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                {new Date(log.created_at).toLocaleString("pt-BR")}
              </span>
            </CardContent>
          </Card>
        ))}
        {!isLoading && filtered.length === 0 && (
          <div className="text-center py-12 text-sm text-muted-foreground">Nenhum log encontrado.</div>
        )}
      </div>
    </div>
  );
}
