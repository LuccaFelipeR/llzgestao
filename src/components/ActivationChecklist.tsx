import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { Link } from "react-router-dom";
import { CheckCircle2, Circle, ChevronRight, X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { toast } from "@/hooks/use-toast";

type Item = {
  key: string;
  label: string;
  done: boolean;
  href?: string;
  cta?: string;
};

export default function ActivationChecklist() {
  const { company, currentCompanyId, refetch } = useCompany();
  const qc = useQueryClient();

  const dismissed = !!company?.activation_checklist_dismissed;

  const { data: items } = useQuery({
    queryKey: ["activation-checklist", currentCompanyId, company?.updated_at],
    enabled: !!currentCompanyId && !dismissed,
    queryFn: async (): Promise<Item[]> => {
      const cid = currentCompanyId!;
      const [products, addresses, movements, balance, members] = await Promise.all([
        supabase.from("products").select("id", { count: "exact", head: true }).eq("company_id", cid),
        supabase.from("addresses").select("id", { count: "exact", head: true }).eq("company_id", cid),
        supabase.from("movements").select("id", { count: "exact", head: true }).eq("company_id", cid).eq("type", "IN"),
        supabase.from("stock_balance").select("id", { count: "exact", head: true }).eq("company_id", cid).gt("qty", 0),
        supabase.from("company_members").select("id", { count: "exact", head: true }).eq("company_id", cid).eq("is_active", true),
      ]);

      const list: Item[] = [
        {
          key: "identity",
          label: "Dados básicos da empresa preenchidos",
          done: !!company?.name && company?.name.trim().length > 0 && !!company?.business_type,
          href: "/configuracoes",
          cta: "Editar",
        },
        {
          key: "focal",
          label: "Ponto focal definido",
          done: !!company?.main_focal_user_id,
          href: "/configuracoes",
          cta: "Definir",
        },
        {
          key: "config",
          label: "Configurações operacionais concluídas",
          done: company?.onboarding_status === "completed",
          href: "/company-onboarding",
          cta: "Configurar",
        },
        {
          key: "product",
          label: "Primeiro produto cadastrado",
          done: (products.count ?? 0) > 0,
          href: "/produtos",
          cta: "Cadastrar",
        },
        ...(company?.uses_addressing !== false
          ? [{
              key: "address",
              label: "Primeiro endereço cadastrado",
              done: (addresses.count ?? 0) > 0,
              href: "/enderecos",
              cta: "Cadastrar",
            } as Item]
          : []),
        {
          key: "movement",
          label: "Primeira entrada registrada",
          done: (movements.count ?? 0) > 0,
          href: "/recebimento",
          cta: "Registrar",
        },
        {
          key: "balance",
          label: "Primeiro saldo positivo",
          done: (balance.count ?? 0) > 0,
          href: "/estoque",
          cta: "Ver estoque",
        },
        {
          key: "team",
          label: "Outro usuário vinculado à empresa",
          done: (members.count ?? 0) > 1,
          href: "/admin",
          cta: "Convidar",
        },
        ...(company?.plans_csv_import
          ? [{
              key: "import",
              label: "Importação CSV concluída",
              done: (products.count ?? 0) >= 5 || (addresses.count ?? 0) >= 5,
              href: "/onboarding",
              cta: "Importar",
            } as Item]
          : []),
        {
          key: "support",
          label: "Central de suporte conhecida",
          done: false,
          href: "/suporte",
          cta: "Abrir",
        },
      ];

      return list;
    },
  });

  const dismiss = useMutation({
    mutationFn: async () => {
      if (!currentCompanyId) return;
      const { error } = await (supabase as any)
        .from("companies")
        .update({ activation_checklist_dismissed: true })
        .eq("id", currentCompanyId);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast({ title: "Checklist ocultado" });
      await refetch();
      qc.invalidateQueries({ queryKey: ["activation-checklist"] });
    },
  });

  if (dismissed || !items || !currentCompanyId) return null;

  const done = items.filter((i) => i.done).length;
  const total = items.length;
  const pct = Math.round((done / total) * 100);
  const allDone = done === total;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card border border-border rounded-2xl p-5 mb-5"
    >
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center shrink-0">
          <Sparkles size={18} className="text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-sm">Ativação da empresa</h3>
          <p className="text-xs text-muted-foreground">
            {allDone
              ? "Tudo pronto! Sua empresa está ativa."
              : `${done} de ${total} etapas concluídas`}
          </p>
        </div>
        <div className="text-right">
          <div className="text-lg font-black text-primary">{pct}%</div>
          {allDone && (
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => dismiss.mutate()}>
              <X size={12} /> Ocultar
            </Button>
          )}
        </div>
      </div>

      <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden mb-4">
        <motion.div
          className="h-full bg-gradient-to-r from-primary to-accent"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6 }}
        />
      </div>

      <ul className="space-y-1.5">
        {items.map((it) => (
          <li key={it.key} className="flex items-center gap-3 text-sm">
            {it.done ? (
              <CheckCircle2 size={16} className="text-primary shrink-0" />
            ) : (
              <Circle size={16} className="text-muted-foreground shrink-0" />
            )}
            <span className={`flex-1 ${it.done ? "text-muted-foreground line-through" : "text-foreground"}`}>
              {it.label}
            </span>
            {!it.done && it.href && (
              <Link to={it.href} className="text-xs text-primary hover:underline flex items-center gap-0.5">
                {it.cta || "Abrir"} <ChevronRight size={12} />
              </Link>
            )}
          </li>
        ))}
      </ul>
    </motion.div>
  );
}

// Helper for admin panel - synchronous calculation from a company row + counts
export function calcActivationPct(company: any, counts: {
  products: number; addresses: number; movements: number; balance: number; members: number;
}): number {
  const usesAddr = company?.uses_addressing !== false;
  const wantsCsv = !!company?.plans_csv_import;
  const items = [
    !!company?.name && !!company?.business_type,
    !!company?.main_focal_user_id,
    company?.onboarding_status === "completed",
    counts.products > 0,
    ...(usesAddr ? [counts.addresses > 0] : []),
    counts.movements > 0,
    counts.balance > 0,
    counts.members > 1,
    ...(wantsCsv ? [counts.products >= 5 || counts.addresses >= 5] : []),
  ];
  const done = items.filter(Boolean).length;
  return Math.round((done / items.length) * 100);
}
