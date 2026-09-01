# Fase 6.21 — Mapa de Depreciação do Legado

Cada linha mapeia um elemento legado para o seu substituto canônico e registra o
estado real da migração. Estado possível: **REMOVIDO**, **NEUTRALIZADO**
(existe, sem efeito), **ATIVO** (ainda em uso — dívida) ou **AGUARDA APROVAÇÃO**.

---

## Identidade e autorização

| Legado | Canônico | Estado | Observação |
| --- | --- | --- | --- |
| `user_roles.role = 'admin'` | `is_platform_super_admin` por `super_admin` | **ATIVO — AGUARDA APROVAÇÃO** | 3 contas possuem `admin`; a função ainda o aceita (F-01). |
| `user_roles.role = 'supervisor'` (global) | `company_members.role` | **ATIVO — AGUARDA APROVAÇÃO** | 3 contas cliente com papel de empresa na tabela global (F-02). |
| `platform_admin`, `support_agent`, `developer` | `profiles.staff_activated_at` | **NEUTRALIZADO no banco / ATIVO no frontend** | 0 linhas no banco; ainda declarados em `AuthContext.PLATFORM_ROLES` (F-03). |
| `has_role(uid, role)` | `is_platform_staff` / `is_member_of` / `is_company_admin_of` | **NEUTRALIZADO** | 0 policies usam. Função mantida por compatibilidade; `EXECUTE` restrito na 6.21. |
| `get_user_company_id(uid)` | `is_member_of(uid, company_id)` | **NEUTRALIZADO** | Sem uso em `src/`. `EXECUTE` restrito na 6.21. |
| Checagem `role='admin'` na Edge `ai-insights` | `is_platform_staff(callerId)` | **REMOVIDO (6.21)** | — |
| "Acesso Desenvolvedor" no Login | login normal | **REMOVIDO (6.16.2)** | — |
| `auth.admin.deleteUser` no reset | preservação de identidade | **REMOVIDO (6.20)** | Verificado: 0 ocorrências. |
| `platform_protected_company_names/emails` | seleção manual no `/admin/reset` | **REMOVIDO (6.16.4)** | — |

## Vínculo empresarial

| Legado | Canônico | Estado |
| --- | --- | --- |
| `company_members.insert` direto (`AdminPanel.tsx:170`) | `company_member_link` | **ATIVO — AGUARDA APROVAÇÃO** (F-10) |
| `company_members.delete` direto (`:183`) | `company_member_unlink` | **ATIVO — AGUARDA APROVAÇÃO** (F-10) |
| `company_members.update({role})` (`:196`) | `company_member_set_role` | **ATIVO — AGUARDA APROVAÇÃO** (F-10) |
| `company_members.update({is_main_focal_point})` (`:135`) | `company_member_set_focal` | **ATIVO — AGUARDA APROVAÇÃO** (F-10) |
| `companies.delete()` (`:265`) | `platform_cleanup_preview` / `platform_cleanup_execute` | **ATIVO — AGUARDA APROVAÇÃO** (F-10, viola "nunca apagar") |
| Exclusão de conta no painel | desvincular empresa | **REMOVIDO (6.20)** |

## Planos e limites

| Legado | Canônico | Estado |
| --- | --- | --- |
| `companies.max_users/max_products/max_addresses` | `plans` + `company_entitlement_overrides` via `effective_limit` | **NEUTRALIZADO** — mantido só como degrau de precedência; nenhum componente lê direto. |
| Limite hardcoded em componente | `useEntitlements()` | **REMOVIDO (6.19A)** — verificado: 0 ocorrências. |

## Endereçamento

| Legado | Canônico | Estado |
| --- | --- | --- |
| Parser `split("-")` em `Onboarding.tsx:189` | `parseAddressCode` de `src/lib/address-utils.ts` | **ATIVO — AGUARDA APROVAÇÃO** (F-07). Há endereços gravados nos dois formatos; consolidar exige decisão de formato canônico + migração de dados. |
| Template `enderecos-exemplo.csv` em `R-P-A-L-F` | formato canônico a definir | **ATIVO** — depende de F-07. |

## Estágios e checklist

| Legado | Canônico | Estado |
| --- | --- | --- |
| Estágio `cadastro` | `aguardando_aprovacao` | **REMOVIDO (6.18A.1)** |
| Item "Outro usuário vinculado" no checklist | — | **REMOVIDO (6.16)** |
| `calcActivationPct` próprio | `buildActivationItems()` | **REMOVIDO (6.18A.1)** — fonte única confirmada. |

## Código morto

| Arquivo | Estado |
| --- | --- |
| `src/components/NavLink.tsx` | **REMOVIDO (6.21)** — nunca importado. |
| `src/components/QuickSearch.tsx` | **REMOVIDO (6.21)** — substituído por `ConversationalSearch`. |
| `src/pages/Index.tsx` | **REMOVIDO (6.21)** — rota inexistente. |
| `bun.lockb` | **REMOVIDO (6.21)** — redundante com `bun.lock`. |
| Funções de banco sem uso | **Nenhuma** — 74/74 referenciadas. |

## Permissões residuais

| Legado | Estado |
| --- | --- |
| `EXECUTE` para `anon` em `deployment_overview/detail/set_owner/complete_validation` | **REMOVIDO (6.21)** |
| `EXECUTE` para `PUBLIC` em `has_role`, `get_user_company_id` | **REMOVIDO (6.21)** |
| `user_tab_permissions` sem `company_id` | **ATIVO — AGUARDA APROVAÇÃO** (F-14). Tabela vazia; decidir entre escopar por empresa ou remover. |
| Lista de rotas própria em `ConversationalSearch` | **ATIVO — AGUARDA APROVAÇÃO** (F-15). |
