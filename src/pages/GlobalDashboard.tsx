import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate, Link } from "react-router-dom";
import {
  Building2, Users, Package, MapPin, ArrowRightLeft, AlertTriangle, ShieldAlert,
  Crown, Activity, LifeBuoy, CheckCircle2, XCircle, Clock, ShieldCheck, FileClock, Trash2,
} from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { friendlyError } from "@/lib/error-messages";

const STALE_DAYS = 30;

export default function GlobalDashboard() {
  const { isPlatformStaff, isPlatformSuperAdmin } = useAuth();
  const qc = useQueryClient();
  const [rejectTarget, setRejectTarget] = useState<{ id: string; name: string } | null>(null);
  const [reason, setReason] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["global-dashboard"],
    enabled: isPlatformStaff,
    queryFn: async () => {
      const [companies, members, products, addresses, movements, profiles, tickets, activity] = await Promise.all([
        supabase.from("companies").select("id, name, status, plan, main_focal_user_id, trial_ends_at, created_at, approval_status, approval_reason"),
        supabase.from("company_members").select("company_id, user_id, is_active, role"),
        supabase.from("products").select("id, company_id"),
        supabase.from("addresses").select("id, company_id"),
        supabase.from("movements").select("id, company_id, created_at, type"),
        supabase.from("profiles").select("id, email, full_name, is_approved, created_at"),
        supabase.from("support_tickets").select("id, title, status, priority, company_id, assigned_to, created_at"),
        supabase.from("activity_log").select("id, action, entity_type, user_id, company_id, created_at").order("created_at", { ascending: false }).limit(15),
      ]);
      const C = companies.data ?? [];
      const M = members.data ?? [];
      const P = products.data ?? [];
      const A = addresses.data ?? [];
      const Mv = movements.data ?? [];
      const PR = profiles.data ?? [];
      const T = (tickets.data ?? []) as any[];
      const AL = (activity.data ?? []) as any[];

      const recentCutoff = new Date(Date.now() - STALE_DAYS * 86400000);
      const movementsByCompany: Record<string, Date> = {};
      Mv.forEach((m: any) => {
        const d = new Date(m.created_at);
        if (!movementsByCompany[m.company_id] || d > movementsByCompany[m.company_id]) {
          movementsByCompany[m.company_id] = d;
        }
      });

      const adminsByCompany: Record<string, number> = {};
      M.forEach((m: any) => {
        if ((m.role === "admin" || m.role === "owner") && m.is_active) {
          adminsByCompany[m.company_id] = (adminsByCompany[m.company_id] || 0) + 1;
        }
      });

      const companyEnriched = C.map((c: any) => ({
        ...c,
        productCount: P.filter((p: any) => p.company_id === c.id).length,
        addressCount: A.filter((a: any) => a.company_id === c.id).length,
        memberCount: M.filter((m: any) => m.company_id === c.id && m.is_active).length,
        lastMovement: movementsByCompany[c.id] ?? null,
        adminCount: adminsByCompany[c.id] ?? 0,
        owners: M.filter((m: any) => m.company_id === c.id && m.role === "owner").map((m: any) => m.user_id),
      }));

      const profileById: Record<string, any> = {};
      PR.forEach((p: any) => (profileById[p.id] = p));

      const pendingCompanies = companyEnriched
        .filter((c: any) => c.approval_status === "pending")
        .map((c: any) => ({
          ...c,
          ownerProfile: profileById[c.owners[0]] ?? null,
        }));

      return {
        totalCompanies: C.length,
        activeCompanies: C.filter((c: any) => c.status === "active").length,
        trialCompanies: C.filter((c: any) => c.status === "trial" || c.trial_ends_at).length,
        blockedCompanies: C.filter((c: any) => c.status === "blocked").length,
        inactiveCompanies: C.filter((c: any) => c.status === "inactive").length,
        pendingCompanyCount: pendingCompanies.length,
        rejectedCompanies: C.filter((c: any) => c.approval_status === "rejected").length,
        pendingCompanies,
        noFocalPoint: C.filter((c: any) => !c.main_focal_user_id).length,
        noAdmin: companyEnriched.filter((c) => c.adminCount === 0).length,
        noRecentActivity: companyEnriched.filter((c) => !c.lastMovement || c.lastMovement < recentCutoff).length,
        totalUsers: PR.length,
        pendingUsers: PR.filter((p: any) => !p.is_approved),
        activeUsers: PR.filter((p: any) => p.is_approved).length,
        totalProducts: P.length,
        totalAddresses: A.length,
        totalMovements: Mv.length,
        openTickets: T.filter((t) => !["closed", "resolved"].includes(t.status)).length,
        criticalTickets: T.filter((t) => t.priority === "critical" && !["closed", "resolved"].includes(t.status)).length,
        unassignedTickets: T.filter((t) => !t.assigned_to && t.status === "open").length,
        companies: companyEnriched,
        activity: AL,
        profileById,
      };
    },
  });

  const approve = useMutation({
    mutationFn: async (companyId: string) => {
      const { error } = await (supabase as any).rpc("approve_company", { _company_id: companyId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cadastro aprovado.");
      qc.invalidateQueries({ queryKey: ["global-dashboard"] });
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const reject = useMutation({
    mutationFn: async ({ companyId, motivo }: { companyId: string; motivo: string }) => {
      const { error } = await (supabase as any).rpc("reject_company", { _company_id: companyId, _reason: motivo });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cadastro rejeitado. Nenhum dado foi apagado.");
      setRejectTarget(null);
      setReason("");
      qc.invalidateQueries({ queryKey: ["global-dashboard"] });
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  if (!isPlatformStaff) return <Navigate to="/" replace />;
  if (isLoading) return <div className="page-container">Carregando...</div>;

  const kpis = [
    { label: "Cadastros pendentes", value: data?.pendingCompanyCount ?? 0, icon: Clock, color: "text-warning" },
    { label: "Usuários pendentes", value: data?.pendingUsers?.length ?? 0, icon: Users, color: "text-warning" },
    { label: "Tickets abertos", value: data?.openTickets ?? 0, icon: LifeBuoy, color: "text-primary" },
    { label: "Tickets críticos", value: data?.criticalTickets ?? 0, icon: AlertTriangle, color: "text-destructive" },
    { label: "Sem atendimento", value: data?.unassignedTickets ?? 0, icon: Clock, color: "text-destructive" },
    { label: "Empresas totais", value: data?.totalCompanies ?? 0, icon: Building2, color: "text-primary" },
    { label: "Ativas", value: data?.activeCompanies ?? 0, icon: Building2, color: "text-success" },
    { label: "Trial", value: data?.trialCompanies ?? 0, icon: Crown, color: "text-accent" },
    { label: "Bloqueadas", value: data?.blockedCompanies ?? 0, icon: ShieldAlert, color: "text-destructive" },
    { label: "Inativas", value: data?.inactiveCompanies ?? 0, icon: Building2, color: "text-muted-foreground" },
    { label: "Sem ponto focal", value: data?.noFocalPoint ?? 0, icon: AlertTriangle, color: "text-destructive" },
    { label: "Sem admin ativo", value: data?.noAdmin ?? 0, icon: AlertTriangle, color: "text-destructive" },
    { label: `Sem mov. > ${STALE_DAYS}d`, value: data?.noRecentActivity ?? 0, icon: Activity, color: "text-destructive" },
    { label: "Usuários totais", value: data?.totalUsers ?? 0, icon: Users, color: "text-primary" },
    { label: "Produtos (total)", value: data?.totalProducts ?? 0, icon: Package, color: "text-primary" },
    { label: "Endereços (total)", value: data?.totalAddresses ?? 0, icon: MapPin, color: "text-primary" },
    { label: "Movimentações", value: data?.totalMovements ?? 0, icon: ArrowRightLeft, color: "text-primary" },
  ];

  return (
    <div className="page-container">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <h1 className="page-title flex items-center gap-2">
          <Crown size={22} className="text-primary" /> Painel Global — Equipe LLZ
        </h1>
        <p className="text-sm text-muted-foreground">
          Visão consolidada da plataforma. Não requer empresa selecionada.
        </p>
      </motion.div>

      {/* Atalhos administrativos */}
      <div className="flex flex-wrap gap-2 mb-5">
        <Button asChild variant="outline" size="sm"><Link to="/admin"><ShieldCheck size={14} className="mr-1" /> Empresas e usuários</Link></Button>
        <Button asChild variant="outline" size="sm"><Link to="/suporte"><LifeBuoy size={14} className="mr-1" /> Suporte global</Link></Button>
        <Button asChild variant="outline" size="sm"><Link to="/admin/data-quality"><ShieldAlert size={14} className="mr-1" /> Data Quality</Link></Button>
        <Button asChild variant="outline" size="sm"><Link to="/admin/audit-logs"><Activity size={14} className="mr-1" /> Auditoria</Link></Button>
        <Button asChild variant="outline" size="sm"><Link to="/admin/changelog"><FileClock size={14} className="mr-1" /> Changelog</Link></Button>
        {isPlatformSuperAdmin && (
          <Button asChild variant="outline" size="sm" className="border-destructive/40 text-destructive">
            <Link to="/admin/reset"><Trash2 size={14} className="mr-1" /> Reset de ambiente</Link>
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
        {kpis.map((k) => (
          <div key={k.label} className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-1">
              <k.icon size={12} className={k.color} /> <span className="truncate">{k.label}</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{k.value}</p>
          </div>
        ))}
      </div>

      {/* Aprovações */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock size={16} className="text-warning" /> Cadastros aguardando aprovação
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(data?.pendingCompanies ?? []).length === 0 && (
            <p className="text-xs text-muted-foreground">Nenhum cadastro pendente no momento.</p>
          )}
          {(data?.pendingCompanies ?? []).map((c: any) => (
            <div key={c.id} className="flex flex-wrap items-center gap-2 border border-border rounded-xl p-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate">{c.name}</p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {c.ownerProfile?.full_name || "—"} · {c.ownerProfile?.email || "sem responsável"} ·
                  {" "}criada em {new Date(c.created_at).toLocaleDateString("pt-BR")}
                </p>
              </div>
              <Button size="sm" className="h-8" disabled={approve.isPending} onClick={() => approve.mutate(c.id)}>
                <CheckCircle2 size={14} className="mr-1" /> Aprovar
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-destructive border-destructive/40"
                onClick={() => setRejectTarget({ id: c.id, name: c.name })}>
                <XCircle size={14} className="mr-1" /> Rejeitar
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3 mb-6">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Building2 size={16} className="text-primary" /> Empresas</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="data-table text-xs">
                <thead>
                  <tr>
                    <th>Empresa</th><th>Aprovação</th><th>Status</th><th>Focal</th>
                    <th>Admins</th><th>Usuários</th><th>Produtos</th><th>Última Mov.</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.companies ?? []).map((c: any) => (
                    <tr key={c.id}>
                      <td className="font-semibold">{c.name}</td>
                      <td>
                        <Badge variant={c.approval_status === "approved" ? "secondary" : c.approval_status === "rejected" ? "destructive" : "default"} className="text-[10px]">
                          {c.approval_status ?? "approved"}
                        </Badge>
                      </td>
                      <td>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase ${
                          c.status === "active" ? "bg-success/10 text-success" :
                          c.status === "trial" ? "bg-accent/10 text-accent" :
                          "bg-destructive/10 text-destructive"
                        }`}>{c.status ?? "active"}</span>
                      </td>
                      <td>{c.main_focal_user_id ? "✓" : <span className="text-destructive">—</span>}</td>
                      <td className={c.adminCount === 0 ? "text-destructive font-bold" : ""}>{c.adminCount}</td>
                      <td>{c.memberCount}</td>
                      <td>{c.productCount}</td>
                      <td>{c.lastMovement ? new Date(c.lastMovement).toLocaleDateString("pt-BR") : <span className="text-destructive">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Link to="/admin" className="text-xs text-primary font-medium hover:underline mt-3 inline-block">Gerenciar empresas →</Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Activity size={16} className="text-primary" /> Atividade recente</CardTitle></CardHeader>
          <CardContent className="space-y-2 max-h-96 overflow-y-auto">
            {(data?.activity ?? []).map((a: any) => (
              <div key={a.id} className="text-[11px] border-b border-border/50 pb-1.5">
                <p className="font-medium truncate">{a.action}</p>
                <p className="text-muted-foreground truncate">
                  {data?.profileById?.[a.user_id]?.email ?? "sistema"} · {new Date(a.created_at).toLocaleString("pt-BR")}
                </p>
              </div>
            ))}
            {(data?.activity ?? []).length === 0 && <p className="text-xs text-muted-foreground">Sem atividade registrada.</p>}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!rejectTarget} onOpenChange={(o) => { if (!o) { setRejectTarget(null); setReason(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Rejeitar cadastro — {rejectTarget?.name}</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">
            O motivo é obrigatório e ficará visível ao cliente. Nenhum dado é apagado; o cadastro pode ser corrigido e reanalisado.
          </p>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={4} placeholder="Motivo da rejeição..." />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={reason.trim().length < 5 || reject.isPending}
              onClick={() => rejectTarget && reject.mutate({ companyId: rejectTarget.id, motivo: reason.trim() })}
            >
              Rejeitar cadastro
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
