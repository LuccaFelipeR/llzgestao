import { describe, it, expect } from "vitest";
import { computeDeployment, buildActivationItems, activationPct } from "@/lib/deployment";

const DAY = 86_400_000;
const ago = (d: number) => new Date(Date.now() - d * DAY).toISOString();

/** Empresa totalmente configurada e operando — base para variações. */
const base = {
  name: "Empresa Teste",
  business_type: "retail",
  status: "active",
  approval_status: "approved",
  onboarding_status: "completed",
  uses_addressing: true,
  plans_csv_import: false,
  main_focal_user_id: "focal-1",
  members_total: 1,
  created_at: ago(1),
  last_activity_at: ago(0),
  products: 5,
  addresses: 3,
  movements_in: 2,
  movements_out: 1,
  stock_positions: 2,
  csv_imports: 0,
  support_seen: 1,
  assisted_validation_at: null,
  last_movement_at: ago(0),
};

describe("computeDeployment — matriz de estágios", () => {
  it("empresa pendente de aprovação", () => {
    const r = computeDeployment({ ...base, approval_status: "pending", created_at: ago(0) });
    expect(r.stage).toBe("aguardando_aprovacao");
    expect(r.nextAction).toBe("Aprovar empresa");
    expect(r.attention).toBe("normal");
  });

  it("empresa pendente há muitos dias vira crítica", () => {
    const r = computeDeployment({ ...base, approval_status: "pending", created_at: ago(10) });
    expect(r.stage).toBe("aguardando_aprovacao");
    expect(r.attention).toBe("critico");
  });

  it("empresa rejeitada tem estágio próprio, atenção crítica e ação de revisão", () => {
    const r = computeDeployment({ ...base, approval_status: "rejected" });
    expect(r.stage).toBe("rejeitada");
    expect(r.stageLabel).toBe("Cadastro rejeitado");
    expect(r.nextAction).toBe("Revisar rejeição da empresa");
    expect(r.attention).toBe("critico");
  });

  it("aprovada sem onboarding concluído", () => {
    const r = computeDeployment({ ...base, onboarding_status: "in_progress" });
    expect(r.stage).toBe("configuracao");
    expect(r.nextAction).toBe("Concluir onboarding");
  });

  it("onboarding completo sem produtos", () => {
    const r = computeDeployment({ ...base, products: 0, stock_positions: 0, movements_in: 0, movements_out: 0 });
    expect(r.stage).toBe("preparacao_dados");
    expect(r.nextAction).toBe("Cadastrar produtos");
  });

  it("empresa sem endereçamento não exige endereços", () => {
    const r = computeDeployment({ ...base, uses_addressing: false, addresses: 0 });
    expect(r.items.some((i) => i.key === "address")).toBe(false);
    expect(r.stage).toBe("em_operacao");
  });

  it("empresa com endereçamento e sem endereços fica em preparação de dados", () => {
    const r = computeDeployment({ ...base, addresses: 0 });
    expect(r.stage).toBe("preparacao_dados");
    expect(r.nextAction).toBe("Cadastrar endereços");
  });

  it("produtos cadastrados mas sem entrada", () => {
    const r = computeDeployment({
      ...base, movements_in: 0, movements_out: 0, stock_positions: 0, last_activity_at: ago(0),
    });
    expect(r.stage).toBe("primeira_movimentacao");
    expect(r.nextAction).toBe("Registrar primeira entrada");
  });

  it("primeira entrada registrada, ainda sem saída", () => {
    const r = computeDeployment({ ...base, movements_out: 0 });
    expect(r.stage).toBe("validacao_operacional");
    expect(r.nextAction).toBe("Registrar primeira saída");
  });

  it("checklist completo sem validação assistida", () => {
    const r = computeDeployment(base);
    expect(r.pct).toBe(100);
    expect(r.stage).toBe("pronta");
    expect(r.nextAction).toBe("Concluir validação assistida");
    expect(r.validated).toBe(false);
  });

  it("validação assistida sem atividade posterior", () => {
    const r = computeDeployment({
      ...base,
      assisted_validation_at: ago(0.5),
      last_movement_at: ago(2),
      last_activity_at: ago(2),
    });
    expect(r.stage).toBe("pronta");
    expect(r.nextAction).toBe("Acompanhar início da operação");
    expect(r.validated).toBe(true);
  });

  it("empresa em operação", () => {
    const r = computeDeployment({
      ...base,
      assisted_validation_at: ago(2),
      last_movement_at: ago(0),
      last_activity_at: ago(0),
    });
    expect(r.stage).toBe("em_operacao");
    expect(r.nextAction).toBe("Nenhuma ação pendente");
    expect(r.attention).toBe("normal");
  });

  it("empresa bloqueada é sempre crítica", () => {
    const r = computeDeployment({ ...base, status: "blocked" });
    expect(r.attention).toBe("critico");
    expect(r.attentionReason).toContain("bloqueada");
  });

  it("é determinístico para a mesma entrada", () => {
    const row = { ...base, approval_status: "pending" };
    expect(computeDeployment(row)).toEqual(computeDeployment(row));
  });
});

describe("buildActivationItems — fonte única do checklist", () => {
  const counts = {
    products: 1, addresses: 1, movementsIn: 1, movementsOut: 0,
    balance: 1, csvImports: 0, supportSeen: 1,
  };

  it("requisito CSV só existe quando a empresa planeja importar", () => {
    expect(buildActivationItems({ ...base }, counts).some((i) => i.key === "import")).toBe(false);
    expect(buildActivationItems({ ...base, plans_csv_import: true }, counts).some((i) => i.key === "import")).toBe(true);
  });

  it("primeira saída não é item do checklist (marco operacional)", () => {
    const items = buildActivationItems(base, counts);
    expect(items.some((i) => i.key === "movement_out")).toBe(false);
    expect(activationPct(items)).toBe(100);
  });

  it("validação assistida não é item do checklist", () => {
    const items = buildActivationItems({ ...base, assisted_validation_at: null }, counts);
    expect(items.some((i) => i.key.includes("valida"))).toBe(false);
  });

  it("checklist do computeDeployment usa exatamente buildActivationItems", () => {
    const row = { ...base, products: 1, addresses: 1, movements_in: 1, stock_positions: 1, support_seen: 1 };
    const direct = buildActivationItems(row, {
      products: 1, addresses: 1, movementsIn: 1, movementsOut: 1, balance: 1, csvImports: 0, supportSeen: 1,
    });
    expect(computeDeployment(row).items).toEqual(direct);
  });
});
