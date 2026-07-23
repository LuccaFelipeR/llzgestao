
# Fase 6.11 — Configurações operacionais reais + correções + docs

Escopo grande, entregue em ordem estável. Nada aqui enfraquece RLS,
apaga dados ou altera o motor de estoque.

## Princípio central (hierarquia)

1. **Empresa** = padrão de experiência (defaults do formulário, seções
   destacadas, checklist, orientações). **Nunca** sobrescreve produto
   existente.
2. **Produto** = fonte da verdade para lote / validade / perecível.
3. **Recebimento** aplica a regra do produto (já está assim; vamos
   reforçar mensagens e nunca esconder campo ativo do produto).
4. **Dados históricos** nunca são apagados por mudança de configuração.

## 6.11.1 — Fix rota CSV do onboarding

- `CompanyOnboarding.handleFinish()` hoje redireciona para
  `/onboarding` quando `plansCsv`. `/onboarding` é a **própria** tela
  de importação CSV (`src/pages/Onboarding.tsx`), rota existente. O
  problema real é que `onboarding_completed` fica `true`, então
  qualquer guard que use `onboarding_status !== "completed"` não
  reabre — mas o link do menu "Onboarding" leva o usuário à tela de
  importação, o que confunde por reusar o mesmo nome.
- Correções:
  - Renomear no sidebar/menu "Onboarding" → "Importar CSV" quando
    aponta para `/onboarding`.
  - Após concluir com `plansCsv=true`: navegar para `/onboarding`
    com toast "Importe seu primeiro CSV". Se `plansCsv=false`:
    navegar para `/produtos` com toast "Cadastre seu primeiro produto".
  - Garantir que ao entrar em `/company-onboarding` já concluído, a
    página vira modo "Revisar respostas" (não zera passo, não força
    novo `completed_at`).

## 6.11.2 — Hierarquia empresa × produto no formulário de Produtos

`src/pages/Products.tsx`:

- Ler `company.controls_batch/controls_expiration/handles_perishables`
  do `CompanyContext`.
- **Novo produto**: usar as flags da empresa como *defaults iniciais*
  do `emptyForm` (hoje tudo começa `false`). Se a empresa tiver
  `handles_perishables=true`, sugerir classificação inicial vazia
  mas destacar o toggle "Perecível" com um badge "Recomendado".
- **Produto existente** com `controls_batch` / `controls_expiration` /
  `is_perishable` = true: **sempre** mostrar os campos, mesmo se a
  empresa desligou depois. Nunca alterar valores silenciosamente.
- Seção "Regras de controle" fica visível quando qualquer flag da
  empresa OU do produto estiver ativa; caso contrário fica colapsada
  atrás de um botão "Configurações avançadas do produto".
- Adicionar os textos de ajuda pedidos (lote, validade, perecível).
- Nada de sobrescrever `controls_batch/expiration/is_perishable` de
  produtos existentes ao mudar configuração da empresa (nenhuma
  migração toca produtos).

## 6.11.3 — Recebimento respeita produto

`src/pages/GuidedReceiving.tsx` já usa `selectedProduct.controls_batch`
e `controls_expiration || is_perishable`. Ajustes:

- Se o produto NÃO controla lote, esconder o toggle "Criar novo /
  Lote existente" e usar geração automática silenciosa (comportamento
  atual já suporta via `AUTO-`).
- Se o produto NÃO controla validade, ocultar o campo Validade e não
  exigir. Se a empresa tem `controls_expiration=true` mas o produto
  não, exibir dica "Este produto não exige validade — ajustável no
  cadastro do produto".
- Não mudar movements/triggers.

## 6.11.4 — ActivationChecklist real

`src/components/ActivationChecklist.tsx`:

- Remover o item genérico "Importação CSV concluída" baseado em
  contagem >= 5 (falso positivo). Substituir por evidência real:
  contar linhas em `activity_log` com
  `action='csv_import_completed'` e `company_id=cid`. Sem registro,
  fica pendente.
- Instrumentar `src/pages/Onboarding.tsx` (importer) para inserir uma
  linha em `activity_log` ao final de cada importação bem-sucedida,
  com `entity_type='import'` e `details` contendo total importado.
- Item aparece só quando `plans_csv_import=true`.
- Item "Central de suporte conhecida" hoje é sempre `done: false` —
  ou marcar como concluído quando existir pelo menos um ticket da
  empresa, ou remover. Vou marcar concluído quando houver ticket.
- Demais itens já filtram por `currentCompanyId` — manter.
- `calcActivationPct` (usado no AdminPanel) atualizado com a mesma
  lógica, recebendo `imports` e `tickets` nos counts.

## 6.11.5 — Permissões em /configuracoes

`src/pages/CompanySettings.tsx` já esconde botões para não-admin
(`canEdit = isCompanyAdmin || isFocalPoint`), mas RLS de `companies`
precisa garantir que UPDATE nas colunas operacionais só passe para
owner/admin/focal + super admin. Vou:

- Ler a policy atual de UPDATE em `companies` via
  `supabase--read_query`.
- Se estiver ampla (ex.: qualquer membro), migrar para uma policy
  restrita a `is_company_admin_of(auth.uid(), companies.id) OR
  is_focal_point OR has_role(admin)` usando helpers existentes.
- Nunca usar `USING (true)`.

Sem criar policy nova ampla; se já for restrita, apenas documento.

## 6.11.6 — Melhorias do onboarding

- Botão "Pular" hoje grava `onboarding_completed=true`. Trocar para
  `onboarding_status='skipped'` **sem** `onboarding_completed=true` e
  **sem** `onboarding_completed_at`, para diferenciar de conclusão
  real. `CompanySettings` já mostra os dois status.
- Ao entrar em `/company-onboarding` com `onboarding_status='completed'`
  e nada mudado, iniciar em modo revisão (começa no step 1, não
  zera step no banco até o usuário salvar). Se apenas `skipped`,
  seguir do último passo.
- Textos: reescrever step 4 (configurações operacionais) para deixar
  claro "Isso pode ser mudado depois em Configurações e cada produto
  pode ter regra própria".
- Empresas antigas com `onboarding_completed=true` não são forçadas
  a refazer (guard em `App.tsx`/redirects já respeita isso; conferir
  e não mexer se estiver ok).

## 6.11.7 — Lotes e validade

`src/pages/GuidedReceiving.tsx` já:
- passa `company_id` no insert de lote,
- reaproveita lote existente por (product_id, lot_code),
- valida fabricação < validade,
- bloqueia vencido.

Único ajuste: comparação de duplicidade adicionar `.eq("company_id", companyId!)`
(hoje só filtra por `product_id`; unique index já é `(company_id, product_id, lot_code)`
então o insert falharia, mas o read pode achar registro de outra empresa se RLS
não bloqueasse — RLS bloqueia, mas explicitar).

## 6.11.8 — Documentação

Criar / atualizar em uma única leva:

- `AGENTS.md` — nova regra permanente da hierarquia empresa×produto
  e a obrigação de conferir consequência real.
- `README.md` — nota sobre a Fase 6.11 no roadmap resumido.
- `docs/CURRENT_STATE.md` (novo) — três seções pedidas.
- `docs/REGRAS_NEGOCIO.md` (novo) — hierarquia e regras de lote /
  validade / perecível / endereçamento / expedição / importação /
  onboarding / checklist / permissões.
- `docs/TESTES_MANUAIS.md` (novo) — roteiro com os 20 casos listados.
- `docs/ROADMAP.md` (novo/atualizado) — mover concluídos, manter
  pendências (piloto, franquias, billing, LGPD, integrações, monitoramento).

## 6.11.9 — Changelog

Duas entradas via `supabase--insert`:

- `6.11` público — feature/fix/ui/documentation
- `6.11-internal` interno — feature/fix/security/documentation

## Ordem de execução

1. Migration mínima (nenhuma nova tabela; talvez ajuste de policy
   `companies` UPDATE se necessário). Só depois de conferir schema.
2. Ajustes de front (`Products`, `GuidedReceiving`, `CompanyOnboarding`,
   `CompanySettings`, `ActivationChecklist`, `Onboarding` importer).
3. Sidebar rename ("Onboarding" → "Importar CSV" quando pertinente).
4. Docs.
5. Changelog.
6. `bun tsgo` typecheck.

## Fora de escopo

- Franquias, pagamentos, WhatsApp, e-mail real.
- Alterar motor de estoque, triggers `process_movement` /
  `check_stock_before_movement`.
- Refactor grande de RLS. Só ajustar a policy de UPDATE de
  `companies` se estiver hoje mais permissiva do que o pedido.
- Redesign visual.

Confirma?
