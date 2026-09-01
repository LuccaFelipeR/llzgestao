# Fase 6.21 — Arquitetura Canônica (Mapa de Fontes de Verdade)

Este documento define, para cada decisão do sistema, **qual é a fonte única de
verdade**. Quando houver conflito entre código, documentação e banco, vale o que
está aqui. Toda divergência ainda existente está marcada como **DÍVIDA** e
consta em `docs/STRUCTURAL_AUDIT_6_21.md`.

---

## 1. Identidade

| Pergunta | Fonte canônica |
| --- | --- |
| Quem é a pessoa? | `auth.users` (imutável pela aplicação) + `public.profiles` |
| A conta é cliente ou equipe LLZ? | `profiles.account_type` (`customer` \| `llz_staff`) |
| A conta da equipe LLZ está ativa? | `profiles.staff_activated_at IS NOT NULL` |
| É super administrador? | `public.is_platform_super_admin(uid)` |
| Tem acesso interno? | `public.is_platform_staff(uid)` |
| A conta cliente está aprovada? | `profiles.is_approved` |

**Regras invioláveis**

- Uma pessoa = uma conta. Empresa é **vínculo**, nunca identidade.
- "Cliente sem empresa" é estado válido.
- `profiles` e `auth.users` **nunca** são apagados por limpeza ou reset.

**DÍVIDA (F-01/F-02/F-03):** `is_platform_super_admin` ainda aceita o papel
legado `admin`, e `user_roles` guarda papéis de empresa (`supervisor`). O
`AuthContext` ainda aceita `PLATFORM_ROLES` como segunda porta de acesso.
`user_roles` deve ser esvaziado de tudo que não seja `super_admin`.

## 2. Vínculo empresarial

| Pergunta | Fonte canônica |
| --- | --- |
| A pessoa pertence à empresa? | `company_members` + `public.is_member_of(uid, company_id)` |
| Qual o papel na empresa? | `company_members.role` (`owner`, `admin`, `supervisor`, `member`) |
| Quem administra a empresa? | `public.is_company_admin_of(uid, company_id)` |
| Quem é o ponto focal? | `company_members.is_main_focal_point`, espelhado em `companies.main_focal_user_id` pelo trigger `sync_main_focal_point` |

**RPCs canônicas — a interface nunca grava direto em `company_members`:**
`company_member_link`, `company_member_unlink`, `company_member_set_role`,
`company_member_set_active`, `company_member_set_focal`,
`company_member_add_by_email`, `company_transfer_ownership`.

**DÍVIDA (F-10):** `AdminPanel.tsx` ainda faz `insert`/`update`/`delete` direto.

## 3. Fronteira multi-tenant

- Toda linha operacional carrega `company_id`.
- Toda policy de leitura/escrita usa `is_member_of(auth.uid(), company_id)` com
  bypass explícito de staff.
- 21/21 tabelas com RLS habilitada; 90 policies auditadas na Fase 6.21.
- O frontend **também** filtra por `currentCompanyId` — defesa em profundidade,
  nunca substituto da RLS.
- Qualquer código servidor (Edge Function com service role) **precisa** resolver
  a empresa a partir da membership validada do chamador, jamais de `limit(1)`.

## 4. Estoque e movimentação

| Regra | Onde é garantida |
| --- | --- |
| Estoque nunca negativo | `check_stock_before_movement` (trigger) + UI |
| Saldo atualizado atomicamente | `process_movement` (trigger) |
| Movimento é imutável | policies `USING (false)` para UPDATE/DELETE + `prevent_movement_mutation` |
| Sem movimento entre empresas | `validate_movement_cross_company` |
| Empresa bloqueada não escreve | `block_writes_for_blocked_companies` |

**Fonte de verdade de lote/validade: o PRODUTO** (`products.controls_batch`,
`controls_expiration`, `is_perishable`). A configuração da empresa é apenas
default de UX para novos cadastros e nunca reescreve produto existente.

**DÍVIDA (F-08):** só o Recebimento Guiado aplica essa regra; Scanner e
Movimentações não.

## 5. Planos, recursos e limites

Precedência: `company_entitlement_overrides` → `companies.max_*` (legado) →
`plans` → ilimitado (`-1`).

| Pergunta | Fonte canônica |
| --- | --- |
| Qual o limite efetivo? | `public.effective_limit(company_id, key)` |
| A empresa tem o recurso? | `public.has_feature(company_id, feature)` |
| Como o frontend lê? | `useEntitlements()` + `src/lib/entitlements.ts` |
| Como o backend impede? | `assert_within_limit` nos triggers de `products`, `addresses`, `company_members`, `movements` |

- **Proibido** limite numérico ou nome de plano hardcoded em componente.
- Limite atingido nunca apaga nem degrada dado existente — só impede criação.
- `uses_addressing` / `uses_expedition` / `plans_csv_import` = **preferência da
  empresa**. `plans.features` = **direito comercial**. Nunca misturar.

**DÍVIDA (F-11):** apenas IA Insights tem gate de entitlement; CSV, endereçamento
e expedição não. A partir da Fase 6.21, `ai-insights` valida no backend.

## 6. Onboarding e implantação

| Pergunta | Fonte canônica |
| --- | --- |
| Itens do checklist | `buildActivationItems()` em `src/lib/deployment.ts` — **fonte única** para `ActivationChecklist`, `calcActivationPct` e `computeDeployment` |
| Estágio de implantação | `computeDeployment()` |
| Progresso real do onboarding | `companies.onboarding_status` |
| Portão de navegação | `companies.onboarding_completed` |

`skipped` (pulado) ≠ `completed` (concluído): por isso os dois campos coexistem.

## 7. Autorização em Edge Functions

- Toda função valida o JWT do chamador com o client anônimo e obtém `callerId`.
- O client de service role é usado **apenas depois** da autorização, nunca para
  autenticar.
- Papel de staff é resolvido por `is_platform_staff(callerId)` — nunca por
  leitura direta de `user_roles`.
- Empresa alvo é validada contra `company_members` do chamador.
- Entitlement é validado por `has_feature` no backend.
- `_caller_id` das RPCs de reset/limpeza vem sempre do JWT validado, nunca do
  corpo da requisição.

## 8. Auditoria

- `activity_log` é alimentado por triggers de banco; a interface nunca é a única
  fonte de registro.
- `system_changelog` registra mudanças de produto (público e/ou interno).
- Nenhum dos dois aceita UPDATE ou DELETE.

## 9. Erros para o usuário

Todo erro exibido passa por `friendlyError()` em `src/lib/error-messages.ts`.
Mensagem crua de Postgres, PostgREST ou RLS nunca chega à tela.
