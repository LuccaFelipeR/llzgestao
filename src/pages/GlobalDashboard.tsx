import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate, Link } from "react-router-dom";
import { Building2, Users, Package, MapPin, ArrowRightLeft, AlertTriangle, ShieldAlert, Crown, Activity } from "lucide-react";
import { motion } from "framer-motion";

const STALE_DAYS = 30;

export default function GlobalDashboard() {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <Navigate to="/" replace />;

  const { data, isLoading } = useQuery({
    queryKey: ["global-dashboard"],
    queryFn: async () => {
      const [companies, members, products, addresses, movements, profiles] = await Promise.all([
        supabase.from("companies").select("id, name, status, plan, main_focal_user_id, trial_ends_at, created_at"),
        supabase.from("company_members").select("company_id, user_id, is_active, role"),
        supabase.from("products").select("id, company_id"),
        supabase.from("addresses").select("id, company_id"),
        supabase.from("movements").select("id, company_id, created_at, type"),
        supabase.from("profiles").select("id, is_approved"),
      ]);
      const C = companies.data ?? [];
      const M = members.data ?? [];
      const P = products.data ?? [];
      const A = addresses.data ?? [];
      const Mv = movements.data ?? [];
      const PR = profiles.data ?? [];

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
      }));

      return {
        totalCompanies: C.length,
        activeCompanies: C.filter((c: any) => c.status === "active").length,
        trialCompanies: C.filter((c: any) => c.status === "trial" || c.trial_ends_at).length,
        blockedCompanies: C.filter((c: any) => c.status === "blocked").length,
        noFocalPoint: C.filter((c: any) => !c.main_focal_user_id).length,
        noAdmin: companyEnriched.filter((c) => c.adminCount === 0).length,
        noRecentActivity: companyEnriched.filter((c) => !c.lastMovement || c.lastMovement < recentCutoff).length,
        totalUsers: PR.length,
        activeUsers: PR.filter((p: any) => p.is_approved).length,
        totalProducts: P.length,
        totalAddresses: A.length,
        totalMovements: Mv.length,
        companies: companyEnriched,
      };
    },
  });

  if (isLoading) return <div className="page-container">Carregando...</div>;

  const kpis = [
    { label: "Empresas Totais", value: data?.totalCompanies ?? 0, icon: Building2, color: "text-primary" },
    { label: "Ativas", value: data?.activeCompanies ?? 0, icon: Building2, color: "text-success" },
    { label: "Trial", value: data?.trialCompanies ?? 0, icon: Crown, color: "text-accent" },
    { label: "Bloqueadas", value: data?.blockedCompanies ?? 0, icon: ShieldAlert, color: "text-destructive" },
    { label: "Sem Focal Point", value: data?.noFocalPoint ?? 0, icon: AlertTriangle, color: "text-destructive" },
    { label: "Sem Admin Ativo", value: data?.noAdmin ?? 0, icon: AlertTriangle, color: "text-destructive" },
    { label: `Sem mov. > ${STALE_DAYS}d`, value: data?.noRecentActivity ?? 0, icon: Activity, color: "text-destructive" },
    { label: "Usuários Totais", value: data?.totalUsers ?? 0, icon: Users, color: "text-primary" },
    { label: "Usuários Aprovados", value: data?.activeUsers ?? 0, icon: Users, color: "text-success" },
    { label: "Produtos (total)", value: data?.totalProducts ?? 0, icon: Package, color: "text-primary" },
    { label: "Endereços (total)", value: data?.totalAddresses ?? 0, icon: MapPin, color: "text-primary" },
    { label: "Movimentações", value: data?.totalMovements ?? 0, icon: ArrowRightLeft, color: "text-primary" },
  ];

  return (
    <div className="page-container">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <h1 className="page-title flex items-center gap-2">
          <Crown size={22} className="text-primary" /> Painel Global (Super Admin)
        </h1>
        <p className="text-sm text-muted-foreground">Visão consolidada de todas as empresas do SaaS.</p>
      </motion.div>

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

      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Building2 size={16} className="text-primary" /> Empresas</h3>
        <div className="overflow-x-auto">
          <table className="data-table text-xs">
            <thead>
              <tr>
                <th>Empresa</th><th>Plano</th><th>Status</th><th>Focal</th>
                <th>Admins</th><th>Usuários</th><th>Produtos</th><th>Endereços</th><th>Última Mov.</th>
              </tr>
            </thead>
            <tbody>
              {(data?.companies ?? []).map((c: any) => (
                <tr key={c.id}>
                  <td className="font-semibold">{c.name}</td>
                  <td><span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] uppercase">{c.plan}</span></td>
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
                  <td>{c.addressCount}</td>
                  <td>{c.lastMovement ? new Date(c.lastMovement).toLocaleDateString("pt-BR") : <span className="text-destructive">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Link to="/admin" className="text-xs text-primary font-medium hover:underline mt-3 inline-block">Gerenciar empresas →</Link>
      </div>
    </div>
  );
}
