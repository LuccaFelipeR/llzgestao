# Estado canônico — Fase 6.21 (Auditoria Forense Integral)

Este arquivo estava parado na Fase 6.11. Substituído pelo estado real
verificado na auditoria de 6.21.

## Documentos de referência desta fase

- `docs/STRUCTURAL_AUDIT_6_21.md` — inventário completo e 19 achados com evidência.
- `docs/CANONICAL_ARCHITECTURE_6_21.md` — fonte única de verdade por decisão.
- `docs/LEGACY_DEPRECATION_MAP_6_21.md` — legado → canônico, com estado de migração.

## Baseline verificado

Commit `fadcf46` · typecheck PASS · build PASS · 34 testes PASS ·
lint com 354 problemas preexistentes · 21 tabelas (100% com RLS) ·
90 policies · 74 funções · 41 triggers · 2 Edge Functions.

## Aplicado na 6.21 (classificado como seguro)

1. `ai-insights` deixou de autorizar por papel legado `admin` e passou a usar
   `is_platform_staff`.
2. `ai-insights` passou a respeitar a empresa selecionada, revalidando a
   membership ativa do chamador no backend (antes usava a primeira membership).
3. `ai-insights` passou a exigir `has_feature(company_id,'ai_insights')` no
   backend; o gate visual do frontend não é mais a única barreira.
4. `EXECUTE` revogado de `anon`/`PUBLIC` em **todas** as funções
   `SECURITY DEFINER` do schema `public` (22 → 0 expostas a visitante).
5. Código morto removido: `NavLink.tsx`, `QuickSearch.tsx`, `Index.tsx`,
   `bun.lockb`.

Nenhuma policy foi enfraquecida, nenhum dado foi apagado, nenhum privilégio de
conta real foi alterado.

## Pendente — exige aprovação humana explícita

| # | Assunto | Risco de agir sem aprovação |
| --- | --- | --- |
| F-01 | `is_platform_super_admin` ainda aceita papel legado `admin`; 2 contas de staff são super admin de fato | Altera privilégio de contas reais |
| F-02 | 3 contas cliente com papel `supervisor` na tabela **global** `user_roles` | Altera privilégio de contas reais |
| F-03 | `AuthContext` mantém `PLATFORM_ROLES` como segunda porta de acesso interno | Pode derrubar acesso de staff (encadeado com F-01) |
| F-07 | Dois parsers de endereço divergentes, com dados reais nos dois formatos | Exige decisão de formato canônico + migração de dados |
| F-08 | Regra de lote/validade só é aplicada no Recebimento Guiado; Scanner e Movimentações não validam | Muda comportamento de operadores em produção |
| F-09 | Picking e criação de listas não são atômicos (movimento é imutável) | Exige RPC transacional nova |
| F-10 | `AdminPanel` grava direto em `company_members` e chega a fazer `companies.delete()` | Reescrita de mutações administrativas |
| F-11 | Gate de plano só existe em IA Insights; CSV/endereçamento/expedição sem gate | Muda navegação e acesso comercial |
| F-12 | Operador de empresa é empurrado para o onboarding que não pode concluir | Muda roteamento pós-login |
| F-14 | `user_tab_permissions` sem `company_id` (escopo global por pessoa) | Decidir entre escopar por empresa ou remover |
| F-15 | `ConversationalSearch` tem lista própria de rotas e permissões | Muda navegação |

## Aviso de cobertura (KS-22)

Os 34 testes são unitários e puros. **Não** cobrem RLS, integração com o banco,
Edge Functions nem fluxo E2E multiempresa. O isolamento multi-tenant permanece
validado apenas por leitura de políticas.
