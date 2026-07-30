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

## Fase 6.15A — consolidação do estado real (concluída)

- Documentação alinhada ao código (CONFIRMED_IMPLEMENTED /
  IMPLEMENTED_BUT_NOT_E2E_VALIDATED / NOT_IMPLEMENTED / KNOWN_RISKS).
- Menu global separado dos módulos operacionais.
- Separação visual entre Equipe LLZ (papéis globais) e usuários de empresa.
- Confirmação de e-mail tratada como estado independente da aprovação.
- Roteiro E2E criado; reset não executado.

## Próximas fases

- 6.15B: execução humana do roteiro E2E e correção dos FAILs.
- 6.16: template de e-mail de autenticação em pt-BR e identidade
  "LLZ Gestão de Estoque".
- 6.17: preparação e execução controlada do reset com backup.

## 6.15B (entregue) — Homologação do cadastro e ativação

- Correções de UX no cadastro/confirmação/aprovação, sem mudança de RLS nem do
  motor de estoque.
- Próxima etapa: 6.16 — homologação operacional (produto, endereço, lote,
  entrada, saldo, saída, transferência, expedição) com empresa real aprovada.
- Pendência dependente de infraestrutura: e-mail de autenticação em pt-BR com
  remetente próprio (exige domínio de e-mail configurado no projeto).

## Fase 6.16 — ajustes finais, staff normalizada e preparação do piloto

- **Checklist de ativação corrigido**: o item "Central de suporte conhecida" agora
  é concluído por evidência real — a primeira visita válida do próprio cliente a
  `/suporte` registra `support_center_viewed` em `activity_log`
  (função `mark_support_center_viewed`, idempotente por empresa). Equipe LLZ,
  inclusive em modo de manutenção, não marca o item.
- **Item "Outro usuário vinculado à empresa" removido** do checklist e de
  `calcActivationPct`. Uma empresa com apenas o owner atinge **100%**.
  Convites e gestão de membros continuam existindo.
- **Staff LLZ normalizada**: única conta com papel global é
  `luccafelipe99@gmail.com` (`super_admin`). Papel legado `admin` removido;
  todos os demais papéis globais (inclusive de `retailtech@gmail.com`) foram
  apagados. Papel de empresa nunca torna alguém equipe LLZ.
- **Aprovar usuário de empresa não cria mais papel global** (`operator` em
  `user_roles`) no AdminPanel.
- **Reset de ambiente: preview gerado, execução NÃO realizada** — exige o JWT do
  super admin autenticado na Edge Function `admin-reset`. Detalhes e passo a
  passo em `docs/RESET_AMBIENTE.md`.
- **Piloto**: roteiro e checklist técnico em `docs/PILOTO_GO_LIVE.md`.
  Ambiente ainda **não** classificado como limpo/validado.
