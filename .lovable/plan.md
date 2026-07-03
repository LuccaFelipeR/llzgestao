# Fase 6 — Correções, Expedição Guiada e Redesign de Navegação

Escopo consolidado a partir do seu review. Entregue em sub-etapas, com aprovação sua entre cada uma.

## 6.1 — Correções críticas (bugs + gaps administrativos)

**Admin Panel — vínculo usuário↔empresa**
- No detalhe da empresa, adicionar aba "Membros" com:
  - Adicionar usuário existente pelo e-mail (busca em `profiles`) → cria linha em `company_members`.
  - Alterar papel (owner / admin / member / focal).
  - Remover vínculo (com confirmação; bloqueia remoção do último owner).
- Espelho no detalhe do usuário: listar empresas vinculadas e permitir vincular a outra empresa.

**Exclusão de produtos e endereços (hard delete com bloqueio)**
- Botão "Excluir" em `Products.tsx` e `Addresses.tsx`.
- Trigger SQL `prevent_delete_if_referenced` bloqueia DELETE quando:
  - produto: existe `stock_balance.qty > 0`, `movements`, ou `lots` vinculados.
  - endereço: existe `stock_balance.qty > 0` ou `movements` (from/to).
- Confirmação dupla no frontend com listagem dos vínculos que impedem exclusão.

**AI Insights**
- Corrigir "Visão Global" → `tipo de análise inválido`: a edge function só aceita `global-companies` quando `globalView===true`; o cliente precisa enviar `scope:"global"` E o tipo correto. Ajustar mapeamento no botão e no switch da edge function.
- Reescrever o renderer de markdown (`AIInsights.tsx`) usando `react-markdown` + `remark-gfm` para eliminar bugs de listas aninhadas, tabelas e negrito. Manter os estilos atuais via `prose`.

## 6.2 — Expedição guiada (baseada em lista de separação)

**Banco**
- Nova tabela `picking_lists` (id, company_id, reference, customer, status: draft/in_progress/done/cancelled, notes, created_by).
- Nova tabela `picking_list_items` (id, picking_list_id, product_id, requested_qty, picked_qty, lot_id, from_address_id, status).
- RLS por `company_id`; GRANTs para authenticated + service_role; triggers de `updated_at` e `block_writes_for_blocked_companies`.

**UI**
- `/expedicao` — lista de pedidos, criar pedido (manual: cliente + itens com SKU e quantidade).
- `/expedicao/:id` — modo guiado: percorre item por item, sugere lote FEFO e endereço com saldo, escanear/confirmar, registra movimento `OUT` via lógica atual (mantém imutabilidade e bloqueio de estoque negativo). Ao finalizar, marca pedido como `done`.

## 6.3 — CSV: templates de exemplo

- Adicionar botão "Baixar modelo" em cada aba do `Onboarding.tsx`.
- Gerar CSVs estáticos em `public/templates/`:
  - `produtos-exemplo.csv` — colunas exatas aceitas pelo importer, com 3 linhas exemplo (perecível, não perecível, com lote).
  - `enderecos-exemplo.csv` — colunas `code, type, is_active`.
- Texto de ajuda inline explicando cada coluna e regras (SKU único por empresa, formato de data etc.).

## 6.4 — Dashboard: enxugar

- Remover o card "Últimas movimentações" do `Dashboard.tsx`.
- Manter KPIs, alertas de vencimento, health score e uso do plano.

## 6.5 — Nova navegação: footer com pop-ups + layout full-width

- Remover a sidebar atual (`AppLayout.tsx`).
- Novo componente `FooterNav`: barra fixa no rodapé com ícones de tópicos:
  - Operação (Estoque, Movimentos, Recebimento, Expedição, Scanner)
  - Cadastros (Produtos, Endereços)
  - Inteligência (Dashboard, IA, Notificações)
  - Administração (Painel, Auditoria, Data Quality, Changelog, Global)
- Ao clicar num tópico, abre um popover vertical acima do ícone com os itens do grupo.
- Conteúdo principal ocupa 100vw com padding lateral confortável e `padding-bottom` para não ficar atrás da barra.
- Preservar company switcher e theme toggle num header fino no topo.
- Responsivo: no mobile o comportamento é o mesmo, só reduz labels.

## 6.6 — README completo

Reescrever `README.md` com:
- O que é o LLZ Gestão de Estoque
- Dor que resolve (controle multi-tenant, rastreabilidade, FEFO, expedição/recebimento guiados)
- Problema identificado no mercado brasileiro de PMEs
- O que já existe hoje (concorrentes) e o diferencial
- Stack técnica e arquitetura multi-tenant
- Funcionalidades por módulo
- Como rodar / deploy
- Roadmap

## Entrega faseada

Sugestão de ordem para aprovar uma etapa por vez:

1. **6.1** Correções (admin membros + exclusões + fix IA)
2. **6.2** Expedição guiada
3. **6.3 + 6.4** CSV templates + dashboard enxuto
4. **6.5** Redesign navegação footer
5. **6.6** README

## Fora de escopo desta fase

- Novos módulos de IA.
- Alterações em regras de estoque negativo / imutabilidade de movimentos.
- Planos comerciais / billing.
- Migração ou exclusão de dados existentes.

## Detalhes técnicos

- Migrações SQL seguem padrão Fase 1–5: CREATE TABLE → GRANT → ENABLE RLS → POLICY → triggers.
- Triggers de bloqueio de delete usam `RAISE EXCEPTION` para caírem no toast do frontend.
- `react-markdown` e `remark-gfm` via `bun add`.
- Novos itens de changelog inseridos em `system_changelog` ao final de cada sub-etapa (is_public=true para o que o usuário final vê, false para detalhes técnicos).

Confirma começar pela **6.1**?
