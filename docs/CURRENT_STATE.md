# Estado Atual — LLZ Gestão de Estoque

_Atualizado na Fase 6.15A (consolidação do estado real antes da homologação)._
Roteiro de homologação: `HOMOLOGACAO_USUARIO_REAL.md`. Histórico: `HOMOLOGACAO_6_13.md`.

> **Implementado ≠ homologado.** Um módulo só sai de
> `IMPLEMENTED_BUT_NOT_E2E_VALIDATED` depois de teste humano registrado.

## CONFIRMED_IMPLEMENTED

| Módulo | Observação |
|---|---|
| Multi-tenant + RLS | `is_member_of` + super admin em todas as tabelas operacionais. |
| Produtos / Endereços / Lotes | Delete físico bloqueado quando há histórico; unicidade por empresa. |
| Movimentações | Imutáveis (UPDATE/DELETE bloqueados por RLS). |
| Estoque | Saldo transacional por trigger; negativo bloqueado na UI e no banco. |
| Recebimento guiado | Respeita `controls_batch`, `controls_expiration` e `is_perishable` **do produto**. |
| Expedição guiada (picking FEFO) | Visível apenas se `companies.uses_expedition = true`. |
| Endereçamento | Menu escondido se `companies.uses_addressing = false`. |
| Onboarding da empresa | Multi-etapas, salva parcial, gera consequências reais na UI. |
| Checklist de ativação | Usa evidências reais (contagens, `activity_log`, tickets). |
| Configurações da Empresa | Editável apenas por owner / admin / ponto focal. |
| Central de Suporte | UI completa: tickets, mensagens, notas internas, auditoria. |
| Administração global | `/admin/global`, papéis globais, `RequireCompany`. |
| Modo de manutenção | Banner persistente + auditoria de entrada/saída. |
| Aprovação por empresa | `approval_status` + `approve_company` / `reject_company`. |
| CSV Import | Templates públicos em `/public/templates`. |
| AI Insights | Escopo por empresa e global; markdown com `react-markdown`. |
| Dashboards | Operacional + global. |
| Auditoria | `activity_log` alimentado por triggers. |
| Menu global (6.15A) | Equipe LLZ sem empresa vê apenas módulos globais. |
| Estados de e-mail (6.15A) | Confirmação de e-mail e aprovação tratadas separadamente. |

## IMPLEMENTED_BUT_NOT_E2E_VALIDATED

- Isolamento multiempresa com duas empresas e usuários reais.
- Aprovação/rejeição de empresa ponta a ponta.
- Gestão de membros e papéis pelo AdminPanel.
- Aba "Equipe LLZ" (papéis globais) separada dos usuários de empresa.
- Importação CSV com arquivos reais de cliente.
- Expedição guiada FEFO em operação real.
- Modo de manutenção com empresa de cliente real.
- Reset de ambiente (mecanismo validado apenas por preview).

## NOT_IMPLEMENTED

- Envio real de e-mail transacional da aplicação.
- Template de e-mail de autenticação personalizado em pt-BR.
- Cobrança / limites de plano aplicados.
- Franquias com hierarquia matriz→filial (ver `ROADMAP.md`).
- Notificações WhatsApp reais (só UI e agendamento).
- Badge de confirmação de e-mail no painel global (exige Edge Function).

## KNOWN_RISKS

- E-mails de auth ainda em inglês e com remetente padrão da plataforma.
- `profiles` sem leitura cruzada entre membros comuns (nomes vazios em logs).
- ~252 erros de lint preexistentes (`no-explicit-any`).
- Reset nunca executado; exige checklist prévio (`RESET_AMBIENTE.md`).
- Nenhuma classificação de "pronto para produção" foi emitida.

## Hierarquia de regras de controle

**Configurações da Empresa = padrão de UX. Produto = fonte da verdade.**

- Novos produtos herdam `controls_batch` / `controls_expiration` da empresa.
- O usuário pode alterar em qualquer produto.
- Recebimento, expedição e alertas sempre olham para o produto.
- Alterar as configurações da empresa **nunca reescreve** produtos existentes.

## RLS e permissões atuais

- `companies` UPDATE: apenas `owner`, `admin` ou ponto focal (`is_company_admin_of`).
- `companies` SELECT: qualquer membro ativo + equipe LLZ.
- Tabelas operacionais: `is_member_of(auth.uid(), company_id)` + super admin.
- `movements`: UPDATE e DELETE bloqueados (`USING false`).
- `products`, `addresses`, `lots`: DELETE só para owner/admin e bloqueado por
  trigger quando há histórico.
- Nenhuma policy foi alterada ou enfraquecida na Fase 6.15A.

## Fase 6.15B — Homologação do cadastro e ativação (2026-07)

- Estados do fluxo de ativação formalizados e separados: `AUTH_EMAIL_UNCONFIRMED`,
  `AUTH_EMAIL_CONFIRMED`, `COMPANY_PENDING`, `COMPANY_APPROVED`,
  `COMPANY_REJECTED`, `MEMBERSHIP_PENDING`, `MEMBERSHIP_ACTIVE`, `USER_BLOCKED`.
- Cadastro: confirmação de senha, mensagens de Auth em pt-BR (`friendlyError`),
  proteção contra duplo envio e tela pós-cadastro com o e-mail informado,
  reenvio de confirmação e "Já confirmei, verificar".
- `PendingApproval` mostra dois indicadores independentes (E-mail / Empresa),
  botão "Verificar status da aprovação" e revalidação automática a cada 20s —
  elimina a necessidade de logout/login após a aprovação da equipe LLZ.
- Regra confirmada em `approve_company`: o criador permanece `owner`, ativo e
  ponto focal principal; a aprovação **não** altera o papel do fundador.
- Novo funcionário via `invite_code`: entra como `member` ativo na empresa
  existente, sem aprovação da equipe LLZ (mapeado, não alterado).
- Pendência: template de e-mail de autenticação segue em inglês com remetente
  padrão — depende de domínio de e-mail próprio configurado no projeto.

## Fase 6.16 — ajustes finais, staff normalizada e preparação do piloto

- **Checklist de ativação corrigido**: o item "Central de suporte conhecida" agora
  é concluído por evidência real — a primeira visita válida do próprio cliente a
  `/suporte` registra `support_center_viewed` em `activity_log`
  (função `mark_support_center_viewed`, idempotente por empresa). Equipe LLZ,
  inclusive em modo de manutenção, não marca o item.
- **Item "Outro usuário vinculado à empresa" removido** do checklist e de
  `calcActivationPct`. Uma empresa com apenas o owner atinge **100%**.
  Convites e gestão de membros continuam existindo.
- **Staff LLZ normalizada**: única conta com papel global é
  `luccafelipe99@gmail.com` (`super_admin`). Papel legado `admin` removido;
  todos os demais papéis globais (inclusive de `retailtech@gmail.com`) foram
  apagados. Papel de empresa nunca torna alguém equipe LLZ.
- **Aprovar usuário de empresa não cria mais papel global** (`operator` em
  `user_roles`) no AdminPanel.
- **Reset de ambiente: preview gerado, execução NÃO realizada** — exige o JWT do
  super admin autenticado na Edge Function `admin-reset`. Detalhes e passo a
  passo em `docs/RESET_AMBIENTE.md`.
- **Piloto**: roteiro e checklist técnico em `docs/PILOTO_GO_LIVE.md`.
  Ambiente ainda **não** classificado como limpo/validado.

## 6.16.1 — Autorização do super administrador (corrigida)

- 53 policies migradas de `has_role(auth.uid(),'admin')` para
  `is_platform_super_admin(auth.uid())`.
- Helper novo `is_platform_client_admin` separando `platform_admin` de
  `support_agent`/`developer`.
- `AuthContext` expõe `isPlatformAdmin`; AdminPanel alinhado ao backend.
- `luccafelipe99@gmail.com`: `super_admin` + `admin` legado (compat temporária).
- Reset **não** executado. Typecheck e build PASS.

## Fase 6.16.2 — correção do reset e remoção do acesso automático

- RPCs de reset passaram a receber `_caller_id` validado pela Edge Function
  (antes falhavam porque `auth.uid()` é nulo em chamadas via service role).
- `EXECUTE` das RPCs revogado de `anon`/`authenticated`; somente `service_role`.
- Edge Function `admin-reset` com status HTTP padronizados (401/403/400/500) e
  mensagens em português, sem stack nem SQL.
- `/admin/reset` não quebra mais em caso de erro: card de erro + "Tentar
  novamente", preview preservado, sem execução automática.
- "Acesso Desenvolvedor" removido do login; credenciais fixas removidas do
  código. Equipe LLZ usa login normal.
- Nenhum dado excluído: usuários, perfis, papéis, memberships, empresas e
  contas Auth preservados. Reset **não executado**.

## 6.16.3 — Limpeza seletiva de empresas

Implementada a limpeza seletiva por empresa em `/admin/reset` (preview + execução
manual). Reset completo mantido em aba separada. Regras de preservação de empresas e
usuários documentadas em `docs/RESET_AMBIENTE.md`.
**Nenhuma empresa, usuário ou conta Auth foi excluída nesta fase.**

## Fase 6.16.4
Limpeza seletiva passou a ser 100% dinâmica: a seleção manual é a única fonte de verdade.
Listas fixas de empresas/e-mails protegidos removidas. Histórico e vínculos órfãos viraram
warnings (não bloqueiam). Preview separa warnings de blockers e a UI mostra o checklist de
liberação com o motivo exato do botão desabilitado. Nenhuma limpeza executada.

## Fase 6.18A — Central de Implantação (interna LLZ)
- Nova aba **Implantações** no Painel do Desenvolvedor (somente empresas com contas `customer`).
- Estágio, próxima ação e nível de atenção são **calculados** a partir de evidências reais
  (aprovação, onboarding, produtos, endereços, movimentos, saldo, suporte, atividade).
- Percentual = mesma fonte de verdade do checklist de ativação (`src/lib/deployment.ts`,
  reutilizado por `ActivationChecklist`).
- `companies.deployment_owner_id` (responsável LLZ, sem criar `company_members`) e
  `assisted_validation_at/by/note` (homologação assistida).
- Tabela `company_deployment_notes`: notas internas, RLS restrita a `is_platform_staff`.
- RPCs: `deployment_overview`, `deployment_detail`, `deployment_set_owner`,
  `deployment_complete_validation` (todas SECURITY DEFINER, restritas à equipe LLZ).
- Limpeza seletiva já executada; documentação anterior que a tratava como pendente está superada.

## Atualização 6.18A / 6.18A.1

CONFIRMED_IMPLEMENTED (adições):

| Módulo | Observação |
|---|---|
| Tipos de conta | `customer` / `llz_staff` em `profiles`; equipe LLZ sem `company_members`. |
| Central de Contas | Visão global de contas, tipo e cargos. |
| Usuários das Empresas | Gestão de membros, papéis e ponto focal por empresa. |
| Equipe LLZ | Convites, ativação e cargos globais com seleção explícita. |
| Central de Implantação | Estágio, percentual, próxima ação e atenção derivados do banco. |
| Responsável LLZ | `companies.deployment_owner_id`; não gera vínculo empresarial. |
| Notas internas | `company_deployment_notes`, visíveis só para equipe LLZ. |
| Homologação assistida | `deployment_complete_validation` — confirmação humana registrada. |
| Limpeza seletiva | **Executada**; empresas de teste indesejadas removidas. |
| Estágio `rejeitada` (6.18A.1) | Empresa rejeitada não é mais exibida como pendente. |

Reset completo continua **não executado**. Nenhuma regra de estoque foi alterada.

## Atualização 6.19A — Motor de planos, recursos e limites

CONFIRMED_IMPLEMENTED (adições):

| Item | Observação |
|---|---|
| Catálogo `plans` | `code/name/description/is_active/sort_order/limits/features`. Planos: free, starter, pro, enterprise. Leitura para autenticados; escrita só `is_platform_client_admin`. |
| Overrides | `company_entitlement_overrides` (limites + recursos + motivo). Cliente lê o próprio; só plataforma escreve. |
| Fonte única (SQL) | `effective_limit`, `has_feature`, `company_usage`, `company_entitlements`. Precedência: override → coluna legada `companies.max_*` → plano → ilimitado (-1). |
| Fonte única (frontend) | `src/lib/entitlements.ts` + `src/hooks/useEntitlements.ts`. Nenhum limite hardcoded em componente. |
| Limites | `max_users`, `max_products`, `max_addresses`, `max_monthly_movements`. `-1` = ilimitado. |
| Recursos | `csv_import`, `addressing`, `expedition`, `ai_insights`, `advanced_reports`, `priority_support`. |
| Enforcement backend | Triggers BEFORE INSERT em `products`, `addresses`, `movements` e BEFORE INSERT/UPDATE em `company_members` (só ativação). `pg_advisory_xact_lock` por empresa+limite evita corrida. Bypass apenas em `app.cleanup_mode='on'`. |
| Preferência x direito | `uses_addressing`/`uses_expedition`/`plans_csv_import` continuam sendo preferência; trigger impede ligar flag sem o recurso no plano. |
| Usuários contados | Somente `company_members.is_active` com `profiles.account_type <> 'llz_staff'`. |
| Tela do cliente | "Plano e utilização" em `/configuracoes` (`PlanUsagePanel`): plano, situação, recursos, barras e texto de estado (0–79% normal, 80–99% atenção, 100% limite, acima do limite). |
| Painel do Desenvolvedor | `CompanyPlanManager` no cadastro da empresa: uso, recursos, troca de plano com preview e overrides. Auditado em `activity_log` (`plan_changed`, `plan_override_applied`, `plan_override_removed`). |
| Central de Implantação | Bloco "Comercial": plano, uso de usuários, exceção e limites em atenção. Sem painel financeiro. |
| Downgrade | Nunca apaga dados. Empresa acima do limite mantém tudo e só perde a criação de novos registros. |

TRIAL (estado atual, não alterado nesta fase): `companies.status = 'trial'` e
`trial_ends_at` são apenas rótulos operacionais — geram aviso em Notificações,
KPI no painel global e filtro no admin. Não existe ciclo de assinatura, cobrança
ou expiração automática. O plano é independente do status. Ciclo comercial
(`trial → active → past_due → canceled`) fica para a Fase 6.19B.

NOT_IMPLEMENTED: gateway de pagamento, checkout, autoserviço de upgrade,
faturamento e expiração automática de trial.

Grandfathering aplicado: `Magrao Auto Peças` recebeu override de `max_addresses`
por já operar acima do limite padrão do plano Free.
