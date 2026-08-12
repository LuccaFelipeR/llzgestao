import { describe, it, expect } from "vitest";
import {
  buildUsage,
  canCreate,
  canUseFeature,
  isUnlimited,
  mergeEntitlements,
  usageList,
  usageState,
  usageText,
  UNLIMITED,
  type Entitlements,
} from "@/lib/entitlements";

const PLAN_LIMITS = { max_users: 5, max_products: 500, max_addresses: 100, max_monthly_movements: 5000 };
const PLAN_FEATURES = {
  csv_import: true, addressing: true, expedition: true,
  ai_insights: false, advanced_reports: false, priority_support: false,
};

function makeEnt(over: Partial<Entitlements> = {}, overrideLimits = {}, overrideFeatures = {}): Entitlements {
  const merged = mergeEntitlements(PLAN_LIMITS, PLAN_FEATURES, overrideLimits, overrideFeatures);
  return {
    ok: true,
    company_id: "A",
    plan: { code: "free", name: "Free", is_active: true, limits: PLAN_LIMITS, features: PLAN_FEATURES },
    overrides: { limits: overrideLimits as any, features: overrideFeatures as any, has_any: Object.keys(overrideLimits).length + Object.keys(overrideFeatures).length > 0 },
    limits: merged.limits,
    features: merged.features,
    usage: { max_users: 0, max_products: 0, max_addresses: 0, max_monthly_movements: 0 },
    ...over,
  } as Entitlements;
}

describe("6.19A — motor de entitlements", () => {
  it("1. plano com limite numérico", () => {
    const u = buildUsage("max_products", 320, 500);
    expect(u.unlimited).toBe(false);
    expect(u.limit).toBe(500);
    expect(u.pct).toBe(64);
    expect(u.remaining).toBe(180);
  });

  it("2. plano ilimitado", () => {
    expect(isUnlimited(UNLIMITED)).toBe(true);
    const u = buildUsage("max_products", 8430, UNLIMITED);
    expect(u.state).toBe("normal");
    expect(u.pct).toBe(0);
    expect(u.text).toContain("ilimitado");
  });

  it("3. empresa abaixo de 80%", () => {
    expect(usageState(3, 5)).toBe("normal");
    expect(usageText(3, 5)).toBe("3 de 5 utilizados — 2 vagas disponíveis");
  });

  it("4. empresa acima de 80%", () => {
    expect(usageState(4, 5)).toBe("atencao");
    expect(usageText(4, 5)).toBe("4 de 5 utilizados — 1 vaga disponível");
  });

  it("5. limite atingido bloqueia criação, não leitura", () => {
    const ent = makeEnt({ usage: { max_users: 5, max_products: 500, max_addresses: 0, max_monthly_movements: 0 } as any });
    expect(usageState(5, 5)).toBe("limite");
    expect(canCreate(ent, "max_products")).toBe(false);
    expect(canCreate(ent, "max_addresses")).toBe(true);
  });

  it("6. override aumentando limite", () => {
    const ent = makeEnt({ usage: { max_users: 6, max_products: 0, max_addresses: 0, max_monthly_movements: 0 } as any }, { max_users: 10 });
    expect(ent.limits.max_users).toBe(10);
    expect(canCreate(ent, "max_users")).toBe(true);
  });

  it("7. override reduzindo limite", () => {
    const ent = makeEnt({ usage: { max_users: 3, max_products: 0, max_addresses: 0, max_monthly_movements: 0 } as any }, { max_users: 3 });
    expect(ent.limits.max_users).toBe(3);
    expect(canCreate(ent, "max_users")).toBe(false);
  });

  it("8. recurso permitido pelo plano", () => {
    expect(canUseFeature(makeEnt(), "csv_import")).toBe(true);
  });

  it("9. recurso bloqueado pelo plano", () => {
    expect(canUseFeature(makeEnt(), "ai_insights")).toBe(false);
  });

  it("9b. override libera e bloqueia recurso", () => {
    expect(canUseFeature(makeEnt({}, {}, { ai_insights: true }), "ai_insights")).toBe(true);
    expect(canUseFeature(makeEnt({}, {}, { csv_import: false }), "csv_import")).toBe(false);
  });

  it("10. empresa acima do limite após downgrade preserva dados e sinaliza", () => {
    const ent = makeEnt({ usage: { max_users: 0, max_products: 800, max_addresses: 0, max_monthly_movements: 0 } as any });
    const u = usageList(ent).find((x) => x.key === "max_products")!;
    expect(u.state).toBe("acima");
    expect(u.used).toBe(800); // nada é removido
    expect(u.text).toContain("acima do limite");
    expect(canCreate(ent, "max_products")).toBe(false);
  });

  it("12. troca de plano só recalcula limites — uso permanece", () => {
    const before = makeEnt({ usage: { max_users: 0, max_products: 800, max_addresses: 0, max_monthly_movements: 0 } as any });
    const after = mergeEntitlements({ ...PLAN_LIMITS, max_products: 20000 }, PLAN_FEATURES);
    expect(before.usage.max_products).toBe(800);
    expect(after.limits.max_products).toBe(20000);
  });

  it("13. empresa A não interfere na empresa B", () => {
    const a = makeEnt({ company_id: "A", usage: { max_users: 5, max_products: 0, max_addresses: 0, max_monthly_movements: 0 } as any });
    const b = makeEnt({ company_id: "B", usage: { max_users: 1, max_products: 0, max_addresses: 0, max_monthly_movements: 0 } as any });
    expect(canCreate(a, "max_users")).toBe(false);
    expect(canCreate(b, "max_users")).toBe(true);
  });

  it("mescla: override ausente herda o plano", () => {
    const m = mergeEntitlements(PLAN_LIMITS, PLAN_FEATURES, { max_users: 10 }, {});
    expect(m.limits.max_users).toBe(10);
    expect(m.limits.max_products).toBe(500);
    expect(m.features.expedition).toBe(true);
  });

  it("limite zero e sem entitlements carregados", () => {
    expect(usageState(0, 0)).toBe("limite");
    expect(usageState(1, 0)).toBe("acima");
    expect(canCreate(null, "max_users")).toBe(true); // sem dados não bloqueia UI; backend decide
    expect(canUseFeature(null, "csv_import")).toBe(false);
  });
});
