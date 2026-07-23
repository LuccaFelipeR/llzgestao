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
