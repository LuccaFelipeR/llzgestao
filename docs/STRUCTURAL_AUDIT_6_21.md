# Fase 6.21 — Auditoria Forense Integral

> Documento gerado por auditoria **read-only** executada antes de qualquer
> alteração. Cada achado abaixo tem evidência direta (arquivo:linha, saída de
> `psql` ou catálogo do Postgres). Nada foi inferido de documentação.

## ETAPA 0 — Baseline verificado

| Sinal | Resultado |
| --- | --- |
| Commit | `fadcf46` ("Work in progress") |
| Typecheck (`tsgo --noEmit`) | **PASS** (0 erros) |
| Build (`vite build`) | **PASS** (bundle único de 1.687 kB — aviso de chunk) |
| Testes (`vitest run`) | **PASS** — 34 testes / 3 arquivos |
| Lint (`eslint .`) | **354 problemas** (328 erros, 26 warnings) — dívida conhecida |

### Inventário quantitativo

| Categoria | Quantidade |
| --- | --- |
| Arquivos em `src/` | 124 |
| Páginas / componentes próprios / componentes `ui` | 29 / 22 / 49 |
| Hooks / libs / contexts / testes | 3 / 6 / 2 / 4 |
| Migrations em `supabase/migrations/` | 57 |
| Edge Functions | 2 (`admin-reset`, `ai-insights`) |
| Tabelas em `public` | 21 (100% com RLS habilitada) |
| Views em `public` | 0 |
| Funções em `public` | 74 |
| Triggers não internos | 41 |
| Políticas RLS | 90 |
| Enums | 15 |

**Cobertura da auditoria:** `src/` (100%), `supabase/functions` (100%),
catálogo do banco (100%), `docs/` (100%), configuração de raiz (100%).
**Não auditável neste ambiente:** histórico de execução das Edge Functions em
produção, `auth.users` além do que `profiles` expõe, e comportamento E2E com
navegador autenticado por múltiplos tenants simultâneos.

---

## Estado real de identidade (evidência de banco)

```
email                          | tipo      | staff_ativo | papéis globais | vínculos
leandrom.yamasaki@gmail.com    | customer  | não         | supervisor     | Lemon Haze Floricultura:owner
magraoautopecascbm@gmail.com   | customer  | não         | supervisor     | Magrao Auto Peças:owner
marco.sartorio@hotmail.com     | customer  | não         | supervisor     | Congelados Sartorio:owner
abel.beleleu@gmail.com         | llz_staff | sim         | admin          | —
luccafelipe99@gmail.com        | llz_staff | sim         | admin,super_admin | —
manus2silva01@gmail.com        | llz_staff | sim         | admin          | —
```

3 empresas, todas `approval_status = 'approved'`.

---

## Achados classificados

### F-01 · `LEGACY_PRIVILEGE_ESCALATION_RISK` · **CRÍTICO (latente)**

`is_platform_super_admin()` ainda aceita o papel legado `admin`:

```sql
SELECT EXISTS (SELECT 1 FROM public.user_roles
  WHERE user_id = _user_id AND role::text IN ('super_admin','admin'))
```

Hoje `abel.beleleu@` e `manus2silva01@` possuem `admin` e portanto são
**super administradores de fato no banco**, embora o modelo da Fase 6.20 e a
interface tratem apenas `luccafelipe99@` como super admin. Divergência real
entre autorização efetiva e modelo declarado.

*Não corrigido nesta fase:* remover o papel legado altera privilégios de contas
reais e exige aprovação humana explícita (regra de intervenção do `AGENTS.md`).

### F-02 · `LEGACY_ROLE_IN_GLOBAL_TABLE` · **ALTO**

`user_roles` contém 3 linhas `supervisor` pertencentes a contas **cliente**
(`leandrom.yamasaki@`, `magraoautopecascbm@`, `marco.sartorio@`). `supervisor` é
papel de **empresa** e nunca deveria existir na tabela global. Hoje é inofensivo
(`supervisor` não está em `PLATFORM_ROLES` e nenhuma policy usa `has_role`), mas
é uma mina: qualquer ampliação de `PLATFORM_ROLES` promove três clientes.

*Não corrigido:* alteração de privilégio de contas reais.

### F-03 · `DUPLICATED_SOURCE_OF_TRUTH` · **ALTO** — KS-03

`src/contexts/AuthContext.tsx:10-27` ainda declara `PLATFORM_ROLES`
(`platform_admin`, `support_agent`, `developer`) e, na linha ~150,
`isPlatformStaff = isPlatformSuperAdmin || isStaffActivated || platformRoles.length > 0`.
A Fase 6.20 definiu `staff_activated_at` como fonte única. Existem hoje **duas**
portas para acesso interno no frontend.

### F-04 · `TENANT_BOUNDARY_BUG` · **CRÍTICO** — KS-11

`supabase/functions/ai-insights/index.ts:47-49`: para um usuário não super
admin, a empresa analisada é resolvida como a **primeira membership por
`created_at`**, ignorando a empresa selecionada no `CompanyContext`. Um cliente
vinculado a duas empresas recebe insights da empresa errada.

### F-05 · `LEGACY_AUTHORIZATION` · **ALTO** — KS-10

Mesma função, linha 37: a checagem de staff é
`user_roles.role = 'admin'` — papel legado, não `is_platform_staff()`.

### F-06 · `MISSING_BACKEND_ENFORCEMENT` · **ALTO** — KS-12

`ai-insights` não valida `has_feature(company_id, 'ai_insights')`. O bloqueio
existe apenas em `src/pages/AIInsights.tsx:94` (`FeatureLockedCard`). Chamada
direta à Edge Function contorna o entitlement.

### F-07 · `DUPLICATED_IMPLEMENTATION` · **ALTO** — KS-16

Dois parsers de endereço divergentes, com **dados reais já corrompidos** pelos
dois formatos:

- `src/lib/address-utils.ts` — regex clássica `^([A-Z])(\d{2})(\d{3})(\d{3})(\d{3})([A-Z])$`, usada por `src/pages/Addresses.tsx:43`.
- `src/pages/Onboarding.tsx:189-191` — parser próprio: `String(payload.code).split("-")` esperando `R-P-A-L-F`.

Evidência no banco:

```
P01002003001A     | 01  | 002 | 003 | 001 | A   <- formulário
A01-001-001-001-A | A01 | 001 | 001 | 001 | A   <- CSV
```

O template `public/templates/enderecos-exemplo.csv` usa
`R01-P01-A01-L01-F01`, que a regex clássica rejeita e `parseAddressCode`
fatiaria incorretamente (`rua="R0"`, `posicao="1-P"`).

### F-08 · `INCONSISTENT_VALIDATION` · **ALTO** — KS-13

Regras de lote/validade aplicadas em apenas um dos três pontos de entrada:

| Tela | Exige lote/validade conforme o produto |
| --- | --- |
| `src/pages/GuidedReceiving.tsx:74-75` | **Sim** (`controls_batch`, `controls_expiration`, `is_perishable`) |
| `src/pages/Scanner.tsx:111` | **Não** — cria lote sem validar |
| `src/pages/Movements.tsx:135-136` | **Não** — `expires_at` sempre opcional |

### F-09 · `NON_ATOMIC_OPERATION` · **MÉDIO** — KS-14 / KS-15

- `src/pages/ExpeditionPicking.tsx:101-118`: `movements.insert` → `picking_list_items.update` → `picking_lists.update` em três chamadas separadas. Falha intermediária deixa movimento gravado e item pendente.
- `src/pages/Expedition.tsx:71-83`: criação da lista e dos itens em duas chamadas. Falha deixa lista vazia órfã.

Movimentações são imutáveis, portanto a inconsistência **não é reversível** pela
aplicação.

### F-10 · `BYPASSES_CANONICAL_RPC` · **ALTO** — KS-01 / KS-07 / KS-19

`src/pages/AdminPanel.tsx` grava direto onde a Fase 6.20 definiu RPCs canônicas:

| Linha | Operação | RPC canônica ignorada |
| --- | --- | --- |
| 135 | `company_members.update({is_main_focal_point:true})` | `company_member_set_focal` |
| 170 | `company_members.insert(...)` | `company_member_link` |
| 183 | `company_members.delete()` | `company_member_unlink` |
| 196 | `company_members.update({role})` | `company_member_set_role` |
| 265 | `companies.delete()` | fluxo `platform_cleanup_*` |

A linha 265 viola diretamente a regra "nunca apagar empresa fora do fluxo
seguro". Hoje é contida por `prevent_delete_company_if_referenced` e por RLS,
mas o caminho existe na interface.

### F-11 · `MISSING_ENTITLEMENT_GATE` · **MÉDIO** — KS-18 / KS-09

`FeatureLockedCard` é usado **apenas** em `AIInsights.tsx`. As rotas
`/onboarding` (CSV), `/enderecos` e `/expedicao` (`src/App.tsx:136-143`) têm
somente `RequireCompany`. `src/components/AppLayout.tsx:158-175` decide
visibilidade por `company.uses_addressing` / `uses_expedition` (preferência da
empresa), nunca por `features` do plano (direito comercial) — dois critérios
para a mesma decisão.

### F-12 · `UNREACHABLE_ROLE_STATE` · **MÉDIO** — KS-05

`src/App.tsx:83`: `if (company && !company.onboarding_completed) return <CompanyOnboarding />`.
Qualquer membro cliente — inclusive `member`/operador — é empurrado para o
assistente de onboarding. Como as gravações dependem de `is_company_admin_of`,
o operador entra em uma tela que não consegue concluir.

### F-13 · `DUPLICATED_SOURCE_OF_TRUTH` · **BAIXO** — KS-06

Dois campos descrevem o mesmo fato:
`onboarding_completed` (portão de navegação, `src/App.tsx:83`) e
`onboarding_status` (progresso real, `src/lib/deployment.ts:67,185`).
`CompanyOnboarding.tsx:180-181` grava `status='skipped'` **com**
`onboarding_completed=true`. A divergência é **intencional e documentada**
(pular ≠ concluir); mantida, apenas registrada.

### F-14 · `SCOPE_MISMATCH` · **MÉDIO** — KS-08

`user_tab_permissions` não possui `company_id` (colunas: `id`, `user_id`,
`tab_key`, `is_allowed`, `created_at`). Numa plataforma multiempresa a
permissão de aba é global por pessoa, não por vínculo. Tabela hoje **vazia (0
linhas)**, mas ativa em `AppLayout.tsx:109` e `AdminPanel.tsx:81,323,326`.

### F-15 · `DUPLICATED_SOURCE_OF_TRUTH` · **BAIXO** — KS-26

`src/components/ConversationalSearch.tsx:15-25` mantém a própria lista de rotas
e rótulos, independente de `AppLayout`. Oferece `/enderecos`, `/onboarding` e
`/admin` sem respeitar configuração da empresa nem tipo de conta.

### F-16 · `INSECURE_GRANT` · **MÉDIO**

Quatro RPCs `SECURITY DEFINER` de implantação estão com `EXECUTE` concedido a
`anon`: `deployment_overview`, `deployment_detail`, `deployment_set_owner`,
`deployment_complete_validation`. As quatro validam internamente
`is_platform_staff`/`is_platform_client_admin`, então **não há vazamento**, mas
a superfície é desnecessária. `has_role` e `get_user_company_id` seguem com
`EXECUTE` para `PUBLIC`.

### F-17 · `DEAD_LEGACY` · **BAIXO**

Arquivos nunca importados: `src/components/NavLink.tsx`,
`src/components/QuickSearch.tsx`, `src/pages/Index.tsx`.
Nenhuma função de banco ficou sem uso (verificado contra `prosrc` de todas as
funções e contra `qual`/`with_check` de todas as policies).

### F-18 · `BUILD_HYGIENE` · **BAIXO** — KS-23 / KS-24

Quatro lockfiles coexistem: `bun.lock`, `bun.lockb`, `package-lock.json`,
`deno.lock`. `bun.lockb` é o formato binário legado, redundante com `bun.lock`.
`.env` não está em `.gitignore`, porém contém apenas chaves publicáveis
(`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`)
— nenhum segredo.

### F-19 · `STALE_DOCUMENT` · **BAIXO** — KS-21

`.lovable/plan.md` estava na Fase 6.11 — dez fases atrás.

---

## Itens verificados e **aprovados** (sem achado)

| Suspeita | Resultado |
| --- | --- |
| KS-02 — telas lendo `companies.max_*` direto | **Limpo.** Nenhum componente lê limite bruto; tudo passa por `src/lib/entitlements.ts`. `AdminPanel.tsx:520` apenas exibe o nome do plano. |
| KS-04 — hardcode de identidade em `handle_new_user` | **Limpo.** Nenhum e-mail ou papel fixo na função atual. |
| KS-19b — exclusão de `profiles`/`auth.users` | **Limpo.** Nenhuma ocorrência de `auth.admin.deleteUser` em `src/` ou `supabase/`. |
| KS-20 — `invite_code` gerado no cliente | **Limpo.** Gerado por `DEFAULT substr(md5(random()::text),1,8)` no banco. |
| KS-25 — telas globais sem guarda | **Limpo.** `/admin/*` protegidas por `ProtectedRoute adminOnly`/`superAdminOnly` (`src/App.tsx:152-158`) e por RLS de staff. |
| Imutabilidade de movimentações | **Confirmada.** Policies `movements UPDATE` e `DELETE` com `USING (false)`. |
| Fronteira de tenant nas policies | **Confirmada.** Das 90 policies, as 8 que não citam `is_member_of`/`is_platform*`/`auth.uid()` são negações explícitas (`false`) ou leitura pública intencional (`plans`, `system_changelog` público). |
| RLS habilitada | **100%** — 21 de 21 tabelas. |

---

## KS-22 — honestidade sobre cobertura de testes

Os 34 testes que passam são **exclusivamente unitários e puros**
(`deployment.test.ts`, `entitlements.test.ts`, `example.test.ts`). Eles não
cobrem RLS, não cobrem integração com o banco, não cobrem Edge Functions e não
cobrem nenhum fluxo E2E multiempresa. **Nenhuma afirmação de isolamento
multi-tenant neste projeto está validada por teste automatizado** — apenas por
leitura de políticas, como feito acima.

---

## Correções aplicadas nesta fase (classificadas como seguras)

1. **F-16** — `REVOKE EXECUTE ... FROM anon` nas quatro RPCs de implantação e de `has_role`/`get_user_company_id` em `PUBLIC`. Sem mudança de comportamento para usuários autenticados.
2. **F-17** — remoção dos três arquivos órfãos.
3. **F-18** — remoção do `bun.lockb` redundante.
4. **F-04 / F-05 / F-06** — `ai-insights` passou a usar `is_platform_staff`, a respeitar a empresa selecionada validando a membership do chamador, e a exigir `has_feature(company_id,'ai_insights')`.
5. **F-19** — `.lovable/plan.md` atualizado.

## Correções **não** aplicadas — exigem aprovação humana

| Achado | Motivo |
| --- | --- |
| F-01, F-02 | Alteram privilégios de contas reais em produção. |
| F-03 | Remover `platformRoles.length > 0` derruba o acesso interno de quem depende do papel legado; encadeado com F-01. |
| F-07 | Consolidar parsers exige decisão de negócio sobre o formato canônico e migração dos endereços já gravados nos dois formatos. |
| F-08 | Unificar validação de lote/validade muda o comportamento de Scanner e Movimentações para operadores em produção. |
| F-09 | Exige RPC transacional nova para picking. |
| F-10 | Reescrita das mutações do AdminPanel para as RPCs canônicas. |
| F-11, F-12, F-14, F-15 | Mudanças de navegação e de modelo de permissão. |
