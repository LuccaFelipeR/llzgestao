/**
 * Fase 6.18A — Central de Implantação (fechamento em 6.18A.1).
 *
 * Fonte de verdade ÚNICA do progresso de implantação: o mesmo checklist de
 * ativação exibido ao cliente (`ActivationChecklist`). Nada aqui é mantido
 * manualmente: estágio, percentual, próxima ação e nível de atenção são
 * derivados de evidências reais do banco.
 *
 * 6.18A.1 — decisões:
 * - `rejeitada` é estágio próprio; empresa rejeitada nunca aparece como
 *   "Aguardando aprovação" e não conta como implantação avançando.
 * - O estágio `cadastro` foi removido: no fluxo real o criador já vira `owner`,
 *   então `members_total = 0` era inalcançável e o estado apenas duplicava
 *   "Aguardando aprovação".
 * - Primeira saída e validação assistida são marcos operacionais e NÃO entram
 *   no percentual do checklist.
 */


export type DeploymentCounts = {
  products: number;
  addresses: number;
  movementsIn: number;
  movementsOut: number;
  balance: number;
  csvImports: number;
  supportSeen: number;
};

export type ChecklistItem = { key: string; label: string; done: boolean; href?: string; cta?: string };

/** Prazos (dias) usados nas regras objetivas de atenção. Configuráveis no código. */
export const DEPLOYMENT_SLA = {
  approvalPendingDays: 2,
  onboardingStalledDays: 7,
  noActivityDays: 7,
  readyWithoutValidationDays: 14,
};

/**
 * Itens do checklist de ativação — adaptados à configuração de cada empresa.
 * Ex.: sem endereçamento não existe requisito de endereço; sem plano de
 * importação CSV não existe requisito de importação.
 */
export function buildActivationItems(company: any, counts: DeploymentCounts): ChecklistItem[] {
  const usesAddressing = company?.uses_addressing !== false;
  const wantsCsv = !!company?.plans_csv_import;

  return [
    {
      key: "identity",
      label: "Dados básicos da empresa preenchidos",
      done: !!company?.name && String(company.name).trim().length > 0 && !!company?.business_type,
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
      done: counts.products > 0,
      href: "/produtos",
      cta: "Cadastrar",
    },
    ...(usesAddressing
      ? [{ key: "address", label: "Primeiro endereço cadastrado", done: counts.addresses > 0, href: "/enderecos", cta: "Cadastrar" }]
      : []),
    {
      key: "movement",
      label: "Primeira entrada registrada",
      done: counts.movementsIn > 0,
      href: "/recebimento",
      cta: "Registrar",
    },
    {
      key: "balance",
      label: "Primeiro saldo positivo",
      done: counts.balance > 0,
      href: "/estoque",
      cta: "Ver estoque",
    },
    ...(wantsCsv
      ? [{ key: "import", label: "Importação CSV concluída", done: counts.csvImports > 0, href: "/onboarding", cta: "Importar" }]
      : []),
    {
      key: "support",
      label: "Central de suporte conhecida",
      done: counts.supportSeen > 0,
      href: "/suporte",
      cta: "Abrir",
    },
  ];
}

export function activationPct(items: ChecklistItem[]): number {
  if (items.length === 0) return 0;
  return Math.round((items.filter((i) => i.done).length / items.length) * 100);
}

export type DeploymentStage =
  | "rejeitada"
  | "aguardando_aprovacao"
  | "configuracao"
  | "preparacao_dados"
  | "primeira_movimentacao"
  | "validacao_operacional"
  | "pronta"
  | "em_operacao";

export const STAGE_LABEL: Record<DeploymentStage, string> = {
  rejeitada: "Cadastro rejeitado",
  aguardando_aprovacao: "Aguardando aprovação",
  configuracao: "Configuração inicial",
  preparacao_dados: "Preparação de dados",
  primeira_movimentacao: "Primeira movimentação",
  validacao_operacional: "Validação operacional",
  pronta: "Pronta para operar",
  em_operacao: "Em operação",
};

export const STAGE_ORDER: DeploymentStage[] = [
  "rejeitada",
  "aguardando_aprovacao",
  "configuracao",
  "preparacao_dados",
  "primeira_movimentacao",
  "validacao_operacional",
  "pronta",
  "em_operacao",
];

/** Estágios que NÃO representam avanço normal na implantação. */
export const NON_PROGRESSING_STAGES: DeploymentStage[] = ["rejeitada"];


export type AttentionLevel = "normal" | "atencao" | "critico";

export type DeploymentComputed = {
  stage: DeploymentStage;
  stageLabel: string;
  items: ChecklistItem[];
  pct: number;
  nextAction: string;
  attention: AttentionLevel;
  attentionReason: string | null;
  validated: boolean;
};

function daysSince(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.now() - new Date(value).getTime();
  return ms / 86_400_000;
}

/** Calcula estágio, percentual, próxima ação e atenção a partir da linha agregada. */
export function computeDeployment(row: any): DeploymentComputed {
  const counts: DeploymentCounts = {
    products: Number(row.products ?? 0),
    addresses: Number(row.addresses ?? 0),
    movementsIn: Number(row.movements_in ?? 0),
    movementsOut: Number(row.movements_out ?? 0),
    balance: Number(row.stock_positions ?? 0),
    csvImports: Number(row.csv_imports ?? 0),
    supportSeen: Number(row.support_seen ?? 0),
  };

  const items = buildActivationItems(row, counts);
  const pct = activationPct(items);
  const usesAddressing = row.uses_addressing !== false;
  const approval = row.approval_status ?? "pending";
  const approved = approval === "approved";
  const onboardingDone = row.onboarding_status === "completed";
  const dataReady = counts.products > 0 && (!usesAddressing || counts.addresses > 0);
  const validated = !!row.assisted_validation_at;
  const checklistDone = pct === 100;

  const activityAfterValidation =
    validated &&
    [row.last_movement_at, row.last_activity_at].some(
      (d) => d && new Date(d).getTime() > new Date(row.assisted_validation_at).getTime()
    );

  let stage: DeploymentStage;
  if (approval === "rejected") stage = "rejeitada";
  else if (!approved) stage = "aguardando_aprovacao";
  else if (!onboardingDone) stage = "configuracao";
  else if (!dataReady) stage = "preparacao_dados";
  else if (counts.movementsIn === 0) stage = "primeira_movimentacao";
  else if (!checklistDone || counts.movementsOut === 0) stage = "validacao_operacional";
  else if (!validated || !activityAfterValidation) stage = "pronta";
  else stage = "em_operacao";


  // Próxima ação = primeira pendência real
  let nextAction: string;
  if (approval === "rejected") nextAction = "Revisar rejeição da empresa";
  else if (!approved) nextAction = "Aprovar empresa";
  else if (!onboardingDone) nextAction = "Concluir onboarding";
  else if (counts.products === 0) nextAction = "Cadastrar produtos";
  else if (usesAddressing && counts.addresses === 0) nextAction = "Cadastrar endereços";
  else if (counts.movementsIn === 0) nextAction = "Registrar primeira entrada";
  else if (counts.balance === 0) nextAction = "Validar estoque";
  else if (counts.movementsOut === 0) nextAction = "Registrar primeira saída";
  else if (!checklistDone) {
    const pending = items.find((i) => !i.done);
    nextAction = pending ? pending.label : "Finalizar validação";
  } else if (!validated) nextAction = "Concluir validação assistida";
  else if (!activityAfterValidation) nextAction = "Acompanhar início da operação";
  else nextAction = "Nenhuma ação pendente";

  // Atenção — regras objetivas
  let attention: AttentionLevel = "normal";
  let attentionReason: string | null = null;

  const sinceCreated = daysSince(row.created_at) ?? 0;
  const sinceActivity = daysSince(row.last_activity_at ?? row.created_at) ?? 0;

  if ((row.status ?? "active") === "blocked") {
    attention = "critico";
    attentionReason = "Empresa bloqueada — não consegue operar";
  } else if (approval === "rejected") {
    attention = "critico";
    attentionReason = "Cadastro rejeitado";
  } else if (!approved && sinceCreated > DEPLOYMENT_SLA.approvalPendingDays) {
    attention = "critico";
    attentionReason = `Aguardando aprovação há ${Math.floor(sinceCreated)} dias`;
  } else if (approved && !onboardingDone && sinceCreated > DEPLOYMENT_SLA.onboardingStalledDays) {
    attention = "atencao";
    attentionReason = "Onboarding parado após aprovação";
  } else if (approved && onboardingDone && counts.movementsIn === 0 && sinceActivity > DEPLOYMENT_SLA.noActivityDays) {
    attention = "atencao";
    attentionReason = "Configurada, mas ainda sem operação";
  } else if (stage !== "em_operacao" && sinceActivity > DEPLOYMENT_SLA.noActivityDays) {
    attention = "atencao";
    attentionReason = `Sem atividade há ${Math.floor(sinceActivity)} dias`;
  } else if (checklistDone && !validated && (daysSince(row.created_at) ?? 0) > DEPLOYMENT_SLA.readyWithoutValidationDays) {
    attention = "atencao";
    attentionReason = "Pronta para operar sem validação assistida";
  }

  return {
    stage,
    stageLabel: STAGE_LABEL[stage],
    items,
    pct,
    nextAction,
    attention,
    attentionReason,
    validated,
  };
}

export const NOTE_CATEGORIES = [
  { value: "geral", label: "Geral" },
  { value: "treinamento", label: "Treinamento" },
  { value: "dados", label: "Dados" },
  { value: "operacao", label: "Operação" },
  { value: "pendencia", label: "Pendência" },
  { value: "suporte", label: "Suporte" },
];

export const NOTE_CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  NOTE_CATEGORIES.map((c) => [c.value, c.label])
);
