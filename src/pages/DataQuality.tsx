import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShieldAlert, Loader2, AlertTriangle, CheckCircle2, ExternalLink } from "lucide-react";

type Severity = "low" | "medium" | "high" | "critical";
type Issue = {
  id: string;
  category: string;
  title: string;
  severity: Severity;
  count: number;
  description: string;
  suggestedAction: string;
  affectedCompanyId?: string | null;
  goTo?: string;
};

const SEV_META: Record<Severity, { color: string; label: string }> = {
  low: { color: "bg-muted text-muted-foreground border-border", label: "Baixa" },
  medium: { color: "bg-primary/10 text-primary border-primary/20", label: "Média" },
  high: { color: "bg-warning/10 text-warning border-warning/20", label: "Alta" },
  critical: { color: "bg-destructive/10 text-destructive border-destructive/20", label: "Crítica" },
};

export default function DataQuality() {
  const navigate = useNavigate();
  const { isSuperAdmin } = useCompany();

  const { data: issues, isLoading } = useQuery({
    queryKey: ["data-quality-checks"],
    queryFn: async (): Promise<Issue[]> => {
      const out: Issue[] = [];

      const [
        companies, members, products, lots, addresses, stock, movements,
      ] = await Promise.all([
        supabase.from("companies").select("*"),
        supabase.from("company_members").select("*"),
        supabase.from("products").select("*"),
        supabase.from("lots").select("*"),
        supabase.from("addresses").select("*"),
        supabase.from("stock_balance").select("*, addresses(is_active, code), products(controls_batch, controls_expiration, sku)"),
        supabase.from("movements").select("id, company_id, product_id, lot_id, from_address_id, to_address_id, created_at, lot_id"),
      ]);

      const C = companies.data ?? [];
      const M = members.data ?? [];
      const P = products.data ?? [];
      const L = lots.data ?? [];
      const A = addresses.data ?? [];
      const S = stock.data ?? [];
      const Mv = movements.data ?? [];

      // 1) Companies without focal point
      const noFocal = C.filter((c: any) => !c.main_focal_user_id);
      if (noFocal.length) out.push({
        id: "no-focal", category: "Empresas", title: "Empresas sem focal point",
        severity: "high", count: noFocal.length,
        description: "Estas empresas não têm um ponto focal definido.",
        suggestedAction: "Defina um focal point no Painel Admin.",
        goTo: "/admin",
      });

      // 2) Companies without active admin
      const adminMembersByCompany = new Map<string, number>();
      M.filter((m: any) => m.role === "admin" || m.role === "owner")
        .filter((m: any) => m.is_active !== false)
        .forEach((m: any) => adminMembersByCompany.set(m.company_id, (adminMembersByCompany.get(m.company_id) ?? 0) + 1));
      const noAdmin = C.filter((c: any) => !adminMembersByCompany.get(c.id));
      if (noAdmin.length) out.push({
        id: "no-admin", category: "Empresas", title: "Empresas sem admin ativo",
        severity: "high", count: noAdmin.length,
        description: "Sem admin ativo, ninguém consegue gerenciar a empresa.",
        suggestedAction: "Promova um membro a admin no Painel Admin.",
        goTo: "/admin",
      });

      // 3) Users without valid company relationship
      const usersWithoutCompany = M.filter((m: any) => !C.find((c: any) => c.id === m.company_id));
      if (usersWithoutCompany.length) out.push({
        id: "orphan-users", category: "Usuários", title: "Membros vinculados a empresa inexistente",
        severity: "critical", count: usersWithoutCompany.length,
        description: "Registros em company_members apontam para empresa removida.",
        suggestedAction: "Remova vínculos órfãos manualmente.",
      });

      // 4) Products without classification
      const noClass = P.filter((p: any) => !p.classification && p.is_active);
      if (noClass.length) out.push({
        id: "no-class", category: "Produtos", title: "Produtos sem classificação",
        severity: "low", count: noClass.length,
        description: "Produtos ativos sem classificação definida.",
        suggestedAction: "Edite os produtos e defina a classificação.",
        goTo: "/produtos",
      });

      // 5) Perishable without expiration control
      const perishableNoExp = P.filter((p: any) => p.is_perishable && !p.controls_expiration);
      if (perishableNoExp.length) out.push({
        id: "perish-no-exp", category: "Produtos", title: "Perecíveis sem controle de validade",
        severity: "high", count: perishableNoExp.length,
        description: "Produtos marcados como perecíveis mas sem controle de validade.",
        suggestedAction: "Ative 'controls_expiration' no cadastro.",
        goTo: "/produtos",
      });

      // 6) Products requiring batch but stock without lot
      const batchNoLot = S.filter((s: any) => s.products?.controls_batch && !s.lot_id && Number(s.qty) > 0);
      if (batchNoLot.length) out.push({
        id: "batch-no-lot", category: "Estoque", title: "Estoque sem lote em produto com controle",
        severity: "high", count: batchNoLot.length,
        description: "Existem saldos sem lote para produtos que exigem controle de lote.",
        suggestedAction: "Faça um ajuste de inventário atribuindo lote.",
      });

      // 7) Lots without expiration when product requires
      const lotsByProduct = new Map<string, any[]>();
      L.forEach((l: any) => {
        const arr = lotsByProduct.get(l.product_id) ?? [];
        arr.push(l); lotsByProduct.set(l.product_id, arr);
      });
      const lotsMissingExp = L.filter((l: any) => {
        const p = P.find((p: any) => p.id === l.product_id);
        return p?.controls_expiration && !l.expires_at;
      });
      if (lotsMissingExp.length) out.push({
        id: "lot-no-exp", category: "Lotes", title: "Lotes sem validade em produtos que exigem",
        severity: "high", count: lotsMissingExp.length,
        description: "Lotes sem expires_at em produtos com controle de validade ativo.",
        suggestedAction: "Edite o lote e informe a validade.",
      });

      // 8) Lots with manufacturing > expiration
      const badDates = L.filter((l: any) => l.manufacturing_date && l.expires_at && l.manufacturing_date > l.expires_at);
      if (badDates.length) out.push({
        id: "lot-bad-dates", category: "Lotes", title: "Lotes com fabricação após validade",
        severity: "critical", count: badDates.length,
        description: "Datas inconsistentes detectadas (gatilho deveria bloquear).",
        suggestedAction: "Corrija as datas do lote.",
      });

      // 9) Expired lots still active
      const today = new Date().toISOString().slice(0, 10);
      const expiredActive = L.filter((l: any) => l.status === "active" && l.expires_at && l.expires_at < today);
      if (expiredActive.length) out.push({
        id: "lot-expired-active", category: "Lotes", title: "Lotes vencidos ainda ativos",
        severity: "high", count: expiredActive.length,
        description: "Lotes com validade no passado ainda marcados como 'active'.",
        suggestedAction: "Atualize o status para 'expired'.",
      });

      // 10–14) Orphans without company_id
      const orphanAddr = A.filter((a: any) => !a.company_id);
      if (orphanAddr.length) out.push({ id: "orphan-addr", category: "Integridade", title: "Endereços sem company_id", severity: "medium", count: orphanAddr.length, description: "Registros antigos sem vinculação de empresa.", suggestedAction: "Atribua company_id ou arquive." });
      const orphanProd = P.filter((p: any) => !p.company_id);
      if (orphanProd.length) out.push({ id: "orphan-prod", category: "Integridade", title: "Produtos sem company_id", severity: "medium", count: orphanProd.length, description: "Produtos não vinculados a empresa.", suggestedAction: "Atribua company_id ou desative." });
      const orphanLot = L.filter((l: any) => !l.company_id);
      if (orphanLot.length) out.push({ id: "orphan-lot", category: "Integridade", title: "Lotes sem company_id", severity: "medium", count: orphanLot.length, description: "Lotes sem empresa vinculada.", suggestedAction: "Atribua company_id." });
      const orphanStock = S.filter((s: any) => !s.company_id);
      if (orphanStock.length) out.push({ id: "orphan-stock", category: "Integridade", title: "Saldos sem company_id", severity: "high", count: orphanStock.length, description: "Saldos sem empresa vinculada.", suggestedAction: "Atribua company_id." });
      const orphanMv = Mv.filter((m: any) => !m.company_id);
      if (orphanMv.length) out.push({ id: "orphan-mv", category: "Integridade", title: "Movimentos sem company_id", severity: "high", count: orphanMv.length, description: "Movimentos antigos sem empresa.", suggestedAction: "Atribua company_id (movimentos são imutáveis — usar role admin)." });

      // 15) Movements with cross-company mismatch
      const productMap = new Map(P.map((p: any) => [p.id, p.company_id]));
      const lotMap = new Map(L.map((l: any) => [l.id, l.company_id]));
      const addrMap = new Map(A.map((a: any) => [a.id, a.company_id]));
      const cross = Mv.filter((m: any) => {
        if (!m.company_id) return false;
        if (m.product_id && productMap.get(m.product_id) && productMap.get(m.product_id) !== m.company_id) return true;
        if (m.lot_id && lotMap.get(m.lot_id) && lotMap.get(m.lot_id) !== m.company_id) return true;
        if (m.from_address_id && addrMap.get(m.from_address_id) && addrMap.get(m.from_address_id) !== m.company_id) return true;
        if (m.to_address_id && addrMap.get(m.to_address_id) && addrMap.get(m.to_address_id) !== m.company_id) return true;
        return false;
      });
      if (cross.length) out.push({ id: "cross-mv", category: "Integridade", title: "Movimentos cross-company", severity: "critical", count: cross.length, description: "Movimentos referenciam entidades de outra empresa.", suggestedAction: "Investigar manualmente. Trigger atual bloqueia novos casos." });

      // 16) Duplicate-like records (case-insensitive SKU within company)
      const dupMap = new Map<string, number>();
      P.forEach((p: any) => {
        const k = `${p.company_id}|${(p.sku ?? "").toUpperCase()}`;
        dupMap.set(k, (dupMap.get(k) ?? 0) + 1);
      });
      const dupes = Array.from(dupMap.values()).filter((n) => n > 1).length;
      if (dupes) out.push({ id: "dup-sku", category: "Cadastro", title: "Possíveis SKUs duplicados por empresa", severity: "medium", count: dupes, description: "SKUs case-insensitive aparecem múltiplas vezes dentro da mesma empresa.", suggestedAction: "Revisar produtos e renomear duplicatas." });

      // 17) Products without price
      const noPrice = P.filter((p: any) => p.is_active && Number(p.price) === 0);
      if (noPrice.length) out.push({ id: "no-price", category: "Cadastro", title: "Produtos sem preço", severity: "low", count: noPrice.length, description: "Produtos ativos com preço zero.", suggestedAction: "Defina o preço no cadastro.", goTo: "/produtos" });

      // 18) Products without min stock
      const noMin = P.filter((p: any) => p.is_active && Number(p.min_stock) === 0);
      if (noMin.length) out.push({ id: "no-min", category: "Cadastro", title: "Produtos sem estoque mínimo", severity: "low", count: noMin.length, description: "Sem mínimo, alertas de ruptura não disparam.", suggestedAction: "Defina min_stock no cadastro.", goTo: "/produtos" });

      // 19) Inactive addresses with stock
      const inactiveWithStock = S.filter((s: any) => s.addresses && !s.addresses.is_active && Number(s.qty) > 0);
      if (inactiveWithStock.length) out.push({ id: "inactive-addr", category: "Operacional", title: "Endereços inativos com saldo", severity: "high", count: inactiveWithStock.length, description: "Há estoque em endereços desativados.", suggestedAction: "Reative o endereço ou transfira o estoque.", goTo: "/enderecos" });

      // 20) Blocked companies with recent writes
      const blockedIds = new Set(C.filter((c: any) => c.status === "blocked").map((c: any) => c.id));
      if (blockedIds.size) {
        const since = new Date(Date.now() - 7 * 86400000).toISOString();
        const recent = Mv.filter((m: any) => blockedIds.has(m.company_id) && m.created_at > since);
        if (recent.length) out.push({ id: "blocked-writes", category: "Segurança", title: "Empresas bloqueadas com escritas recentes", severity: "critical", count: recent.length, description: "Movimentos criados nos últimos 7 dias para empresas bloqueadas.", suggestedAction: "Auditar manualmente — trigger atual deve bloquear novos casos." });
      }

      const sev = { critical: 0, high: 1, medium: 2, low: 3 };
      return out.sort((a, b) => sev[a.severity] - sev[b.severity]);
    },
    refetchInterval: 120000,
  });

  const grouped = (issues ?? []).reduce<Record<string, Issue[]>>((acc, i) => {
    (acc[i.category] = acc[i.category] ?? []).push(i);
    return acc;
  }, {});

  const totalCritical = (issues ?? []).filter((i) => i.severity === "critical").length;
  const totalHigh = (issues ?? []).filter((i) => i.severity === "high").length;

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <ShieldAlert className="text-primary" size={20} />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-black tracking-tight">Data Quality Center</h1>
          <p className="text-sm text-muted-foreground">
            {isSuperAdmin ? "Inconsistências em todas as empresas." : "Inconsistências da sua empresa."}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Críticos</div><div className="text-2xl font-black text-destructive">{totalCritical}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Altos</div><div className="text-2xl font-black text-warning">{totalHigh}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Total problemas</div><div className="text-2xl font-black">{issues?.length ?? 0}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Categorias</div><div className="text-2xl font-black">{Object.keys(grouped).length}</div></CardContent></Card>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin text-primary" /></div>
      )}

      {!isLoading && (issues?.length ?? 0) === 0 && (
        <Card><CardContent className="py-12 text-center">
          <CheckCircle2 size={48} className="text-success mx-auto mb-3" />
          <p className="font-semibold">Nenhuma inconsistência detectada!</p>
          <p className="text-sm text-muted-foreground">Sua base de dados está limpa.</p>
        </CardContent></Card>
      )}

      <div className="space-y-6">
        {Object.entries(grouped).map(([cat, list]) => (
          <div key={cat} className="space-y-2">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">{cat}</h2>
            <div className="grid gap-3">
              {list.map((i) => {
                const meta = SEV_META[i.severity];
                return (
                  <Card key={i.id}>
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-2">
                          <AlertTriangle size={16} className="text-warning" />
                          <CardTitle className="text-sm">{i.title}</CardTitle>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={`text-[10px] border ${meta.color}`}>{meta.label}</Badge>
                          <Badge variant="outline" className="text-[10px] font-mono">{i.count}</Badge>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0 space-y-2">
                      <p className="text-xs text-muted-foreground">{i.description}</p>
                      <p className="text-xs"><span className="font-semibold">Ação sugerida:</span> {i.suggestedAction}</p>
                      {i.goTo && (
                        <Button size="sm" variant="outline" onClick={() => navigate(i.goTo!)}>
                          <ExternalLink size={14} className="mr-1" /> Abrir módulo
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
