# AGENTS.md — LLZ Gestão de Estoque

Guia operacional para o agente Lovable e futuros mantenedores. O agente
deve atuar de forma **proativa e contínua**: além de executar a tarefa
literal, identificar bugs, riscos de segurança, falhas multiempresa,
problemas visuais, gaps de onboarding e oportunidades comerciais.

## Regras de intervenção

- Aplicar melhorias **pequenas, seguras e diretamente relacionadas** à
  tarefa em execução.
- Mudanças **grandes, destrutivas ou de arquitetura** devem ser
  reportadas e **não executadas sem aprovação** explícita.
- **Nunca enfraquecer** RLS ou a imutabilidade de movimentos.
- **Nunca apagar** dados nem fazer hard delete de registros com
  histórico. A regra vale para empresas, usuários, produtos, endereços,
  lotes e movimentações.
- **Nunca** implementar pagamentos, WhatsApp real ou envios simulados
  de e-mail que enganem o usuário.
- Toda alteração relevante deve gerar entrada em `system_changelog`
  (pública e/ou interna).

## Baseline atual (2026-07)

### CONFIRMED_IMPLEMENTED
- Isolamento multi-tenant por `company_id`.
- RLS baseada em `is_member_of` + super admin (`has_role(admin)`).
- Filtros por `currentCompanyId` nas queries operacionais do frontend.
- Unicidade por empresa (produtos, endereços, lotes).
- Criador da empresa vira `owner` ativo e ponto focal principal.
- `companies.main_focal_user_id` sincronizado via trigger.
- Movimentações imutáveis (sem UPDATE/DELETE).
- Estoque negativo bloqueado em UI e no banco.
- `validate_movement_cross_company` e `block_writes_for_blocked_companies`.
- `activity_log` básico + `system_changelog` público/interno.
- **Fase 6.8:** exclusão física de empresa com histórico é bloqueada
  (`prevent_delete_company_if_referenced`); transições de status
  registradas em auditoria; tabelas `support_tickets` e
  `support_ticket_messages` criadas com RLS.

### IMPLEMENTED_BUT_UNVERIFIED
- AdminPanel completo (bloquear/desbloquear/inativar/restaurar,
  troca de ponto focal, edição de empresa).
- Fluxos CSV (produtos e endereços).
- Ações de aprovação/bloqueio/troca de papel de usuário.
- Troca de empresa (switcher) para membros de várias companies.
- Visualização de atividades por perfil.

### NOT_IMPLEMENTED_OR_PENDING
- **UI da Central de Suporte** (tabelas prontas, faltam páginas).
- Franquias completas (arquitetura só planejada; ver
  `docs/ROADMAP.md`).
- Documentação `docs/` completa e atualizada.
- Refinamento visual da página IA Insights.
- Onboarding "inteligente" — perguntas ainda são coletadas, mas nem
  todas produzem efeito real no comportamento.
- Envio real de e-mail transacional.
- Cobrança / planos com limites reais aplicados.

## Convenções

- **Estado de UI**: usar TanStack Query; toasts via `sonner` ou
  `use-toast`.
- **Erros para o usuário**: sempre passar pelo tradutor
  `friendlyError()` em `src/lib/error-messages.ts`. Nunca vazar mensagem
  crua de Postgres/Supabase/RLS.
- **Tipos do banco**: `src/integrations/supabase/types.ts` é
  auto-gerado; **não editar à mão**.
- **Migrations**: toda `CREATE TABLE public.*` deve vir com `GRANT`,
  `ALTER TABLE ... ENABLE RLS` e `CREATE POLICY` na mesma migration.
- **Cores/tokens**: usar tokens semânticos em `index.css`. Não usar
  `text-white`, `bg-black`, `bg-[#hex]` em componentes.

## Checklist antes de finalizar uma fase

1. `typecheck` passa.
2. `build` passa.
3. Nenhuma nova política de RLS foi enfraquecida.
4. Nenhum `DELETE` novo em tabelas com histórico.
5. Entrada criada em `system_changelog` (pública + interna quando
   aplicável).
6. `AGENTS.md`, `README.md` e/ou `docs/` atualizados se o baseline
   mudou.
