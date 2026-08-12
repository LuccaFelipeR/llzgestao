/**
 * Fase 6.19A — Motor de planos, recursos e limites.
 *
 * Fonte de verdade ÚNICA das capacidades comerciais no frontend. Nenhum
 * componente deve conter número de limite ou regra de plano hardcoded: tudo
 * vem de `company_entitlements(company_id)` (catálogo `plans` + overrides da
 * empresa) e é interpretado pelas funções puras deste arquivo.
 *
 * Conceitos que NÃO se misturam:
 * - Recurso do plano (`features`)  = direito comercial.
 * - Flag da empresa (`uses_*`)     = preferência operacional.
 *   A empresa só pode ligar a flag quando o plano oferece o recurso.
 * - `status`/`approval_status`/estágio de implantação/tipo de conta seguem
 *   independentes do plano.
 */

export const UNLIMITED = -1;

export type LimitKey = "max_users" | "max_products" | "max_addresses" | "max_monthly_movements";
export type FeatureKey =
  | "csv_import"
  | "addressing"
  | "expedition"
  | "ai_insights"
  | "advanced_reports"
  | "priority_support";

export const LIMIT_KEYS: LimitKey[] = ["max_users", "max_products", "max_addresses", "max_monthly_movements"];
export const FEATURE_KEYS: FeatureKey[] = [
  "csv_import",
  "addressing",
  "expedition",
  "ai_insights",
  "advanced_reports",
  "priority_support",
];

export const LIMIT_LABEL: Record<LimitKey, string> = {
  max_users: "Usuários ativos",
  max_products: "Produtos",
  max_addresses: "Endereços",
  max_monthly_movements: "Movimentações no mês",
};

export const FEATURE_LABEL: Record<FeatureKey, string> = {
  csv_import: "Importação por CSV",
  addressing: "Endereçamento",
  expedition: "Expedição guiada",
  ai_insights: "AI Insights",
  advanced_reports: "Relatórios avançados",
  priority_support: "Suporte prioritário",
};

export type Entitlements = {
  ok: boolean;
  error?: string;
  company_id: string;
  company_name?: string;
  company_status?: string;
  trial_ends_at?: string | null;
  plan: { code: string; name: string; description?: string | null; is_active: boolean; limits: Record<string, number>; features: Record<string, boolean> };
  overrides: { limits: Record<string, number>; features: Record<string, boolean>; note?: string | null; updated_at?: string | null; has_any: boolean };
  limits: Record<LimitKey, number>;
  features: Record<FeatureKey, boolean>;
  usage: Record<LimitKey, number>;
};

export type UsageState = "normal" | "atencao" | "limite" | "acima";

export type UsageInfo = {
  key: LimitKey;
  label: string;
  used: number;
  limit: number;
  unlimited: boolean;
  pct: number;
  remaining: number | null;
  state: UsageState;
  text: string;
};

export function isUnlimited(limit: number | null | undefined): boolean {
  return limit === null || limit === undefined || limit < 0;
}

export const WARN_THRESHOLD = 80;

export function usageState(used: number, limit: number | null | undefined): UsageState {
  if (isUnlimited(limit)) return "normal";
  const max = limit as number;
  if (max <= 0) return used > 0 ? "acima" : "limite";
  if (used > max) return "acima";
  if (used >= max) return "limite";
  return (used / max) * 100 >= WARN_THRESHOLD ? "atencao" : "normal";
}

const NF = new Intl.NumberFormat("pt-BR");
export const fmt = (n: number) => NF.format(n);

/** Texto sempre presente — cor/ícone nunca é a única forma de comunicar estado. */
export function usageText(used: number, limit: number | null | undefined): string {
  if (isUnlimited(limit)) return `${fmt(used)} utilizados — plano ilimitado`;
  const max = limit as number;
  const remaining = max - used;
  if (remaining < 0) return `${fmt(used)} de ${fmt(max)} utilizados — ${fmt(-remaining)} acima do limite do plano`;
  if (remaining === 0) return `${fmt(used)} de ${fmt(max)} utilizados — limite atingido`;
  return `${fmt(used)} de ${fmt(max)} utilizados — ${fmt(remaining)} ${remaining === 1 ? "vaga disponível" : "vagas disponíveis"}`;
}

export function buildUsage(key: LimitKey, used: number, limit: number | null | undefined): UsageInfo {
  const unlimited = isUnlimited(limit);
  const max = unlimited ? UNLIMITED : (limit as number);
  return {
    key,
    label: LIMIT_LABEL[key],
    used,
    limit: max,
    unlimited,
    pct: unlimited || max <= 0 ? 0 : Math.min(100, Math.round((used / max) * 100)),
    remaining: unlimited ? null : max - used,
    state: usageState(used, limit),
    text: usageText(used, limit),
  };
}

export function usageList(ent: Entitlements | null | undefined): UsageInfo[] {
  if (!ent) return [];
  return LIMIT_KEYS.map((k) => buildUsage(k, Number(ent.usage?.[k] ?? 0), ent.limits?.[k]));
}

/** Pode criar mais um registro deste tipo? Nunca afeta leitura/edição do que já existe. */
export function canCreate(ent: Entitlements | null | undefined, key: LimitKey, amount = 1): boolean {
  if (!ent) return true;
  const limit = ent.limits?.[key];
  if (isUnlimited(limit)) return true;
  return Number(ent.usage?.[key] ?? 0) + amount <= (limit as number);
}

export function canUseFeature(ent: Entitlements | null | undefined, feature: FeatureKey): boolean {
  if (!ent) return false;
  return ent.features?.[feature] === true;
}

/** Mescla plano base + overrides da empresa = entitlements efetivos (espelha o SQL). */
export function mergeEntitlements(
  planLimits: Record<string, number>,
  planFeatures: Record<string, boolean>,
  overrideLimits: Record<string, number> = {},
  overrideFeatures: Record<string, boolean> = {},
): { limits: Record<LimitKey, number>; features: Record<FeatureKey, boolean> } {
  const limits = {} as Record<LimitKey, number>;
  LIMIT_KEYS.forEach((k) => {
    const o = overrideLimits?.[k];
    limits[k] = o === undefined || o === null ? Number(planLimits?.[k] ?? UNLIMITED) : Number(o);
  });
  const features = {} as Record<FeatureKey, boolean>;
  FEATURE_KEYS.forEach((k) => {
    const o = overrideFeatures?.[k];
    features[k] = o === undefined || o === null ? planFeatures?.[k] === true : o === true;
  });
  return { limits, features };
}

export function limitLabelValue(limit: number | null | undefined): string {
  return isUnlimited(limit) ? "Ilimitado" : fmt(limit as number);
}
