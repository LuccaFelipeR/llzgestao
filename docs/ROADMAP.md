# Roadmap — LLZ Gestão de Estoque

## Concluído
- Fases 1–5: hardening multi-tenant, produto/lote maduro, admin, governança,
  intelligence.
- Fase 6.1–6.6: correções críticas, expedição guiada, CSV templates, dashboard
  enxuto, redesign da navegação, README.
- Fase 6.7: RLS por membership, filtros de empresa no frontend, unicidade por
  empresa, backfill de ponto focal.
- Fase 6.8: prontidão comercial (lifecycle seguro, tradutor de erros PT-BR,
  schema de suporte).
- Fase 6.9: Central de Suporte funcional.
- Fase 6.10: onboarding inteligente e checklist de ativação.
- Fase 6.11: consequências operacionais reais, correção CSV, documentação.

## Em andamento / próximo
- **Fase 7 — Franquias**: hierarquia matriz→filial com visão consolidada e
  transferências entre unidades. Requer campo `parent_company_id` e novas
  policies de leitura hierárquica.
- **Fase 7.1 — Cobrança**: planos com limites reais (produtos, usuários,
  empresas), integração de pagamento.
- **Fase 7.2 — Notificações reais**: e-mail transacional e WhatsApp API.
- **Fase 7.3 — Mobile app**: PWA otimizado para chão de fábrica.

## Fora de escopo (por enquanto)
- ERP financeiro completo (contas a pagar/receber, DRE).
- Marketplace / e-commerce embutido.
- BI customizável pelo cliente.

## Fase 6.14 — Administração global da plataforma

- Papéis globais (`super_admin`, `platform_admin`, `support_agent`, `developer`) em `user_roles`; papéis de empresa seguem em `company_members`. Ver `docs/PLATFORM_ROLES.md`.
- Equipe LLZ entra sem empresa: painel global em `/admin/global`; telas operacionais exigem seleção explícita de empresa (`RequireCompany`).
- Modo de manutenção com banner e auditoria (`maintenance_mode_entered/exited`).
- Aprovação por EMPRESA: `approval_status` + `approve_company` / `reject_company` (motivo obrigatório, nada é apagado).
- Suporte global para `support_agent`/`platform_admin`; cliente segue restrito à própria empresa e sem notas internas.
- Reset de ambiente: preview + execução via Edge Function `admin-reset` (só `super_admin`). Ver `docs/RESET_AMBIENTE.md`. **Não executado nesta fase.**
