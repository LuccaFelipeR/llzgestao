# Estado Atual — LLZ Gestão de Estoque

_Atualizado em Fase 6.13 (homologação final para piloto)._ Ver `HOMOLOGACAO_6_13.md`.

## Módulos entregues

| Módulo | Status | Observação |
|---|---|---|
| Multi-tenant + RLS | Estável | `is_member_of` + super admin em todas as tabelas operacionais. |
| Produtos / Endereços / Lotes | Estável | Delete físico bloqueado quando há histórico. |
| Movimentações | Estável | Imutáveis (UPDATE/DELETE bloqueados por RLS e por regra de negócio). |
| Recebimento guiado | Estável | Respeita `controls_batch`, `controls_expiration` e `is_perishable` **do produto**. |
| Expedição guiada (picking FEFO) | Estável | Visível apenas se `companies.uses_expedition = true`. |
| Endereçamento | Estável | Menu escondido se `companies.uses_addressing = false`. |
| Onboarding da empresa | Estável | 8 passos; salva parcial; ao concluir vai para produtos ou CSV. |
| Configurações da Empresa | Estável | Editável apenas por owner / admin / ponto focal (RLS 6.11). |
| Checklist de ativação | Estável | Usa evidências reais (activity_log, support_tickets). |
| Central de Suporte | Estável | Tickets, mensagens, notas internas, auditoria. |
| Painel Admin | Estável | Membros, papéis, status da empresa, auditoria. |
| CSV Import | Estável | Templates públicos em `/public/templates`. |
| AI Insights | Estável | Escopo por empresa e global; markdown com `react-markdown`. |
| Dashboards | Estável | Operacional + global (super admin). |
| Auditoria | Estável | `activity_log` alimentado por triggers em produtos, endereços, lotes, movimentos, tickets e configurações. |

## Hierarquia de regras de controle

**Configurações da Empresa = padrão de UX.**
**Produto = fonte da verdade.**

- Ao criar um novo produto, os flags `controls_batch` e `controls_expiration` são
  pré-marcados segundo `companies.controls_batch/controls_expiration/handles_perishables`.
- O usuário pode desmarcar ou marcar em qualquer produto.
- Recebimento, expedição e alertas de vencimento sempre olham para o produto,
  nunca para a empresa.
- Alterar as configurações da empresa **nunca reescreve** produtos existentes.

## RLS e permissões atuais

- `companies` UPDATE: apenas `owner`, `admin` ou `is_main_focal_point` (via `is_company_admin_of`).
- `companies` SELECT: qualquer membro ativo + super admin.
- Todas as tabelas operacionais: `is_member_of(auth.uid(), company_id)` + super admin.
- `movements`: UPDATE e DELETE bloqueados por RLS (`USING false`).
- `products`, `addresses`, `lots`: DELETE só para owner/admin, e bloqueado por
  trigger se houver histórico.

## Não implementado / pendente

- Envio real de e-mail transacional (login/reset usa Supabase Auth padrão).
- Cobrança / limites de plano aplicados.
- Franquias com hierarquia matriz→filial (arquitetura planejada em `ROADMAP.md`).
- Notificações WhatsApp reais (só UI e agendamento).
