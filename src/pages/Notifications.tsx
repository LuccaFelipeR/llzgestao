import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/contexts/AuthContext";
import { Bell, AlertTriangle, CalendarClock, Tag, UserX, Building2, ShieldAlert, Crown, Settings } from "lucide-react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";

interface Alert {
  id: string;
  title: string;
  message: string;
  severity: "info" | "warning" | "critical";
  category: string;
  icon: any;
  link?: string;
}

const EXPIRY_DAYS = 30;

export default function Notifications() {
  const { currentCompanyId, company, isSuperAdmin } = useCompany();
  const { user } = useAuth();

  const { data: alerts } = useQuery({
    queryKey: ["alerts", currentCompanyId, isSuperAdmin],
    enabled: !!currentCompanyId || isSuperAdmin,
    queryFn: async (): Promise<Alert[]> => {
      const out: Alert[] = [];
      const cid = currentCompanyId;

      // Trial ending
      if (company && (company as any).trial_ends_at) {
        const trial = new Date((company as any).trial_ends_at);
        const days = Math.ceil((trial.getTime() - Date.now()) / 86400000);
        if (days <= 14) {
          out.push({
            id: "trial",
            title: days <= 0 ? "Trial encerrado" : `Trial termina em ${days} dia(s)`,
            message: `Sua avaliação gratuita termina em ${trial.toLocaleDateString("pt-BR")}.`,
            severity: days <= 3 ? "critical" : "warning",
            category: "plan",
            icon: Crown,
          });
        }
      }

      if (cid) {
        // Critical stock
        const { data: prods } = await supabase
          .from("products").select("id, sku, description, min_stock, classification")
          .eq("company_id", cid).eq("is_active", true);
        const { data: balances } = await supabase
          .from("stock_balance").select("product_id, qty").eq("company_id", cid).gt("qty", 0);
        const sumByProduct: Record<string, number> = {};
        balances?.forEach((b: any) => { sumByProduct[b.product_id] = (sumByProduct[b.product_id] || 0) + Number(b.qty); });
        const critical = (prods ?? []).filter((p: any) => Number(p.min_stock) > 0 && (sumByProduct[p.id] || 0) <= Number(p.min_stock));
        if (critical.length > 0) {
          out.push({
            id: "critical-stock",
            title: `${critical.length} produto(s) abaixo do mínimo`,
            message: critical.slice(0, 3).map((p: any) => `${p.sku} (${sumByProduct[p.id] || 0}/${p.min_stock})`).join(", ") + (critical.length > 3 ? "..." : ""),
            severity: "critical", category: "stock", icon: AlertTriangle, link: "/estoque",
          });
        }

        // Missing classification
        const noClass = (prods ?? []).filter((p: any) => !p.classification);
        if (noClass.length > 0) {
          out.push({
            id: "no-class",
            title: `${noClass.length} produto(s) sem classificação`,
            message: "Classificação ajuda na rastreabilidade e análise FEFO/ABC.",
            severity: "warning", category: "data-quality", icon: Tag, link: "/produtos",
          });
        }

        // Lots expiring & expired
        const { data: lots } = await supabase
          .from("lots").select("id, lot_code, expires_at, status").eq("company_id", cid);
        const now = new Date();
        const soon = new Date(Date.now() + EXPIRY_DAYS * 86400000);
        const expiring = (lots ?? []).filter((l: any) => l.expires_at && new Date(l.expires_at) >= now && new Date(l.expires_at) <= soon);
        const expired = (lots ?? []).filter((l: any) => l.expires_at && new Date(l.expires_at) < now);
        if (expiring.length > 0) {
          out.push({
            id: "expiring", title: `${expiring.length} lote(s) vencendo em ${EXPIRY_DAYS} dias`,
            message: expiring.slice(0, 3).map((l: any) => `${l.lot_code} (${new Date(l.expires_at).toLocaleDateString("pt-BR")})`).join(", "),
            severity: "warning", category: "expiry", icon: CalendarClock, link: "/estoque",
          });
        }
        if (expired.length > 0) {
          out.push({
            id: "expired", title: `${expired.length} lote(s) vencido(s)`,
            message: "Retire ou destine esses lotes imediatamente.",
            severity: "critical", category: "expiry", icon: CalendarClock, link: "/estoque",
          });
        }

        // Focal point
        if (company && !(company as any).main_focal_user_id) {
          out.push({
            id: "no-focal", title: "Sua empresa não tem focal point definido",
            message: "Defina um responsável principal pelo cadastro.",
            severity: "warning", category: "company", icon: UserX, link: "/admin",
          });
        }
      }

      // Super admin extras
      if (isSuperAdmin) {
        const { data: companies } = await supabase.from("companies").select("id, name, main_focal_user_id, status");
        const { data: pendings } = await supabase.from("profiles").select("id").eq("is_approved", false);
        const noFocal = (companies ?? []).filter((c: any) => !c.main_focal_user_id);
        if (noFocal.length) {
          out.push({
            id: "global-no-focal", title: `${noFocal.length} empresa(s) sem focal point`,
            message: noFocal.slice(0, 3).map((c: any) => c.name).join(", "),
            severity: "warning", category: "global", icon: Building2, link: "/admin",
          });
        }
        if (pendings && pendings.length) {
          out.push({
            id: "pending-users", title: `${pendings.length} usuário(s) pendente(s) de aprovação`,
            message: "Revise o painel admin.",
            severity: "warning", category: "global", icon: UserX, link: "/admin",
          });
        }
        const blocked = (companies ?? []).filter((c: any) => c.status === "blocked");
        if (blocked.length) {
          out.push({
            id: "blocked", title: `${blocked.length} empresa(s) bloqueada(s)`,
            message: blocked.slice(0, 3).map((c: any) => c.name).join(", "),
            severity: "info", category: "global", icon: ShieldAlert, link: "/admin",
          });
        }
      }

      return out;
    },
    refetchInterval: 60000,
  });

  // Persisted notifications
  const { data: persisted } = useQuery({
    queryKey: ["persisted-notifications", currentCompanyId, user?.id],
    queryFn: async () => {
      const q = (supabase as any).from("notifications").select("*").order("created_at", { ascending: false }).limit(50);
      const { data } = await q;
      return data ?? [];
    },
  });

  const sevColor = (s: string) =>
    s === "critical" ? "border-destructive/40 bg-destructive/5" :
    s === "warning" ? "border-accent/40 bg-accent/5" :
    "border-border bg-card";

  return (
    <div className="page-container">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="page-title flex items-center gap-2"><Bell size={20} className="text-primary" /> Alertas</h1>
          <p className="text-sm text-muted-foreground">Alertas operacionais e do sistema.</p>
        </div>
        <Link to="/notificacoes/config" className="text-xs text-primary hover:underline flex items-center gap-1">
          <Settings size={14} /> Preferências
        </Link>
      </div>

      <div className="space-y-2">
        {(alerts ?? []).length === 0 ? (
          <div className="text-center py-12 text-sm text-muted-foreground">
            🎉 Tudo limpo por aqui! Nenhum alerta no momento.
          </div>
        ) : (
          alerts!.map((a, i) => (
            <motion.div
              key={a.id}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
              className={`rounded-xl border p-4 flex items-start gap-3 ${sevColor(a.severity)}`}
            >
              <a.icon size={18} className={a.severity === "critical" ? "text-destructive" : a.severity === "warning" ? "text-accent" : "text-primary"} />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">{a.title}</h3>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">{a.severity}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{a.message}</p>
                {a.link && <Link to={a.link} className="text-xs text-primary font-medium hover:underline mt-2 inline-block">Abrir →</Link>}
              </div>
            </motion.div>
          ))
        )}
      </div>

      {persisted && persisted.length > 0 && (
        <div className="mt-8">
          <h3 className="text-sm font-semibold mb-2">Notificações Registradas</h3>
          <div className="space-y-1.5">
            {persisted.map((n: any) => (
              <div key={n.id} className={`rounded-lg border p-3 text-xs ${sevColor(n.severity)}`}>
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{n.title}</span>
                  <span className="text-muted-foreground text-[10px]">{new Date(n.created_at).toLocaleString("pt-BR")}</span>
                </div>
                {n.message && <p className="text-muted-foreground mt-1">{n.message}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
