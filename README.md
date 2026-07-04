# LLZ Gestão de Estoque

Plataforma SaaS multi-tenant de gestão de estoque para pequenas e médias empresas brasileiras, com foco em rastreabilidade, controle de validade (FEFO), expedição/recebimento guiados e inteligência operacional.

## O que é

O LLZ é um WMS/ERP leve entregue como aplicação web. Cada empresa opera em um ambiente isolado (multi-tenant real, com Row Level Security no banco), com endereços de armazenagem, produtos, lotes, movimentos imutáveis e permissões por papel.

## A dor que resolvemos

PMEs brasileiras geralmente vivem em uma destas três realidades:

- **Planilha Excel** que ninguém sabe se está atualizada, sem histórico e sem rastreabilidade de lote.
- **ERP genérico** (Bling, Tiny, Omie) que trata estoque como um contador simples, sem endereçamento, sem FEFO, sem picking guiado.
- **WMS corporativo** (SAP EWM, Manhattan) caro demais e complexo demais para quem tem 1 galpão e 3 operadores.

O LLZ ocupa o espaço no meio: fluxo operacional real de armazém (endereçamento R-P-A-L-F, lote, validade, expedição por lista de separação) sem a complexidade nem o preço de um WMS enterprise.

## Problema identificado no mercado

- Perda por vencimento por não seguir FEFO na separação.
- Estoque "fantasma" — sistema diz que tem, prateleira diz que não.
- Falta de rastreabilidade quando há recall ou reclamação de cliente por lote.
- Recebimento e expedição no papel, sem conferência item a item.
- Zero visibilidade gerencial: o dono só descobre problema quando falta produto.

## Diferenciais

- **Multi-tenant nativo** com RLS no PostgreSQL — dados de uma empresa nunca vazam para outra.
- **Movimentos imutáveis**: nenhum registro de entrada/saída/transferência pode ser editado ou apagado. Correções entram como novos movimentos.
- **Estoque negativo bloqueado** em duas camadas (UI + trigger no banco).
- **Expedição guiada FEFO**: o operador recebe o pedido item a item já com sugestão de lote e endereço priorizados por data de vencimento.
- **Recebimento guiado** com conferência.
- **Scanner mobile** para leitura de código de barras e QR em qualquer operação.
- **IA de insights** conectada aos dados operacionais (curva ABC, alertas de vencimento, saúde do estoque).
- **Importação CSV** com mapeamento automático de colunas e templates de exemplo.
- **Painel Super Admin global** para gerir todas as empresas, planos e usuários.
- **Auditoria completa** de ações críticas e changelog público das versões.

## Stack técnica

- **Frontend**: React 18 + Vite + TypeScript + Tailwind + shadcn/ui + Framer Motion + TanStack Query.
- **Backend**: Lovable Cloud (PostgreSQL gerenciado, Auth, Edge Functions).
- **Segurança**: Row Level Security por `company_id` em todas as tabelas de domínio, papéis armazenados em tabela separada (`user_roles`) com função `has_role` SECURITY DEFINER.
- **Integridade transacional**: triggers em PL/pgSQL para bloquear estoque negativo, impedir exclusão de produto/endereço com histórico, validar vínculos cross-company, e forçar imutabilidade de movimentos.
- **IA**: Edge Function `ai-insights` consumindo a Lovable AI Gateway.

## Arquitetura multi-tenant

```text
auth.users ─┬─ profiles (perfil pessoal)
            └─ user_roles (super admin)

companies ──┬─ company_members (vínculo user↔empresa + papel)
            ├─ products
            ├─ addresses
            ├─ lots
            ├─ stock_balance   (saldo por produto × endereço × lote)
            ├─ movements       (imutável — IN / OUT / TRANSFER)
            ├─ picking_lists ─ picking_list_items
            ├─ notifications
            └─ activity_log
```

Cada tabela de domínio tem `company_id NOT NULL` e políticas RLS que só liberam linhas onde `company_id` pertence ao usuário via `company_members` (ou super admin).

## Funcionalidades por módulo

### Inteligência
- **Dashboard** com KPIs, health score, alertas de vencimento, uso do plano, curva ABC e estoque crítico com gerador de lista de compras.
- **IA Insights** com análises geradas sob demanda (empresa ou global).
- **Alertas** com fila de notificações e configurações por canal.

### Operação
- **Estoque** — consulta por produto, endereço, lote e canal.
- **Movimentações** — entrada, saída e transferência, sempre com origem/destino e lote quando aplicável.
- **Recebimento guiado** — conferência item a item na entrada.
- **Expedição guiada** — cria pedido/lista de separação e conduz o operador item a item com sugestão FEFO.
- **Scanner** — leitor de código de barras/QR para acelerar cadastros e movimentos.

### Cadastros
- **Produtos** — SKU único por empresa, perecível/não perecível, classificação, controle de lote e validade, temperatura, mínimo, marca, categoria.
- **Endereços** — código no padrão `R-P-A-L-F`, tipos (armazenagem, picking, recebimento, expedição).
- **Importar CSV** — planilhas de produtos e endereços com download de modelos com exemplos.

### Administração (Super Admin)
- **Painel Global** — todas as empresas, planos, status.
- **Admin** — gerenciar empresas, membros, papéis e permissões de aba por usuário.
- **Data Quality** — inconsistências de dados (produtos sem preço, lotes sem validade etc.).
- **Auditoria** — log de ações críticas.
- **Changelog** — histórico público de versões do produto.
- **Documentação** — manual interno com exportação em PDF.

## Regras de negócio fundamentais

- Estoque nunca pode ficar negativo (bloqueio na UI e via trigger `check_stock_before_movement`).
- Movimentos são imutáveis — não há UPDATE nem DELETE.
- Produto/endereço não pode ser excluído se possuir saldo, movimentos ou lotes.
- Vencidos entram automaticamente como `expired`.
- Perecível força controle de validade.
- Operações são bloqueadas para empresas com status `blocked`.

## Como rodar localmente

```bash
bun install
bun dev
```

A aplicação já vem conectada à Lovable Cloud — as credenciais do backend são injetadas automaticamente via variáveis `VITE_SUPABASE_*` no `.env`.

## Deploy

Publicação com um clique via Lovable. Domínio customizável nas configurações do projeto.

## Roadmap

- Módulo comercial (planos, cobrança, limites reais).
- Integrações fiscais (NF-e de entrada e saída).
- App mobile nativo para operadores.
- Previsão de demanda com IA.
- Marketplace de conectores (Bling, Tiny, Shopify, VTEX).

## Licença

Proprietário — LLZ.
