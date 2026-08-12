/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery } from "@tanstack/react-query";
import { sb } from "@/lib/db-any";
import { useCompany } from "@/contexts/CompanyContext";
import type { Entitlements, FeatureKey, LimitKey } from "@/lib/entitlements";
import { canCreate, canUseFeature, usageList } from "@/lib/entitlements";

/** Entitlements de uma empresa qualquer (uso interno da equipe LLZ). */
export function useCompanyEntitlements(companyId: string | null | undefined) {
  return useQuery({
    queryKey: ["entitlements", companyId],
    enabled: !!companyId,
    staleTime: 30_000,
    queryFn: async (): Promise<Entitlements | null> => {
      const { data, error } = await sb.rpc("company_entitlements", { _company_id: companyId });
      if (error) throw error;
      if (!data || data.ok === false) return null;
      return data as Entitlements;
    },
  });
}

/** Entitlements da empresa atualmente selecionada + helpers prontos. */
export function useEntitlements() {
  const { currentCompanyId } = useCompany();
  const query = useCompanyEntitlements(currentCompanyId);
  const ent = query.data ?? null;
  return {
    ...query,
    entitlements: ent,
    usage: usageList(ent),
    can: (feature: FeatureKey) => canUseFeature(ent, feature),
    canCreate: (key: LimitKey, amount = 1) => canCreate(ent, key, amount),
  };
}
