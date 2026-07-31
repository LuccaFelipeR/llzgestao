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
- **Configuração da empresa = padrão de UX. Produto = fonte da verdade.**
  Alterar configurações da empresa nunca deve reescrever produtos
  existentes; recebimento, expedição e alertas sempre olham para o
  produto.
- **Nunca** implementar pagamentos, WhatsApp real ou envios simulados
  de e-mail que enganem o usuário.
- Implementado ≠ homologado. Só marcar como homologado após execução
  humana registrada em `docs/HOMOLOGACAO_USUARIO_REAL.md`.
- Toda alteração relevante deve gerar entrada em `system_changelog`
  (pública e/ou interna).

## Baseline atual (Fase 6.15B — 2026-07)

### CONFIRMED_IMPLEMENTED
- Isolamento multi-tenant por `company_id` com RLS baseada em
  `is_member_of` + bypass controlado de super admin.
- Filtros por `currentCompanyId` nas queries operacionais do frontend.
- Unicidade por empresa (produtos, endereços, lotes).
- Criador da empresa vira `owner` ativo e ponto focal principal;
  `companies.main_focal_user_id` sincronizado por trigger.
- Movimentações imutáveis (UPDATE/DELETE bloqueados por RLS).
- Estoque negativo bloqueado em UI e no banco.
- `validate_movement_cross_company` e `block_writes_for_blocked_companies`.
- Exclusão física bloqueada quando há histórico (empresas, produtos,
  endereços, lotes).
- `activity_log` alimentado por triggers + `system_changelog`
  público/interno.
- **Central de Suporte com UI completa** (`/suporte`): tickets, thread de
  mensagens, notas internas, status/prioridade/responsável e auditoria.
- **Onboarding da empresa multi-etapas** com salvamento parcial e efeitos
  reais na UI (endereçamento, expedição, lote, validade, perecíveis).
- **Checklist de ativação real**, baseado em contagens e `activity_log`.
- **Configurações da Empresa** (`/configuracoes`) restritas a
  owner/admin/ponto focal via `is_company_admin_of`.
- **Administração global da plataforma** (Fase 6.14): papéis globais em
  `user_roles`, painel global `/admin/global`, `RequireCompany` nas telas
  operacionais.
- **Modo de manutenção** com banner persistente e auditoria
  (`maintenance_mode_entered` / `maintenance_mode_exited`).
- **Aprovação por EMPRESA** (`approval_status`, `approve_company`,
  `reject_company` com motivo obrigatório).
- **Documentação do projeto** em `docs/` (estado, regras, papéis, testes,
  reset, roadmap, homologação).
- Menu global: equipe LLZ sem empresa selecionada vê apenas módulos
  globais (6.15A).
- Estados de e-mail e de aprovação tratados de forma independente na tela
  do cliente, com reenvio de confirmação e reverificação (6.15A).
- Fluxo de ativação com estados formais separados, confirmação de senha no
  cadastro, mensagens de Auth em pt-BR e revalidação automática da aprovação
  sem exigir logout (6.15B).
- `approve_company` preserva o criador como `owner` ativo e ponto focal —
  aprovação nunca rebaixa o fundador (6.15B).

### IMPLEMENTED_BUT_NOT_E2E_VALIDATED
- AdminPanel completo (bloquear/desbloquear/inativar/restaurar, troca de
  ponto focal, edição de empresa, gestão de membros).
- Aba "Equipe LLZ" separando papéis globais dos papéis de empresa.
- Fluxos CSV (produtos e endereços) com mapeamento e deduplicação.
- Troca de empresa para membros de várias companies.
- Expedição guiada com FEFO.
- Aprovação/rejeição de empresa ponta a ponta com usuários reais.
- Reset de ambiente: mecanismo entregue e validado apenas por **preview**.
- Isolamento multiempresa validado por leitura de policies, **não** por
  teste E2E com duas empresas reais.

### NOT_IMPLEMENTED
- Franquias (matriz → filial); apenas arquitetura planejada em
  `docs/ROADMAP.md`.
- Cobrança / planos com limites reais aplicados.
- Notificações WhatsApp reais.
- E-mail transacional próprio da aplicação.
- Template de e-mail de autenticação personalizado (ver KNOWN_RISKS).

### KNOWN_RISKS
- Template de e-mail de autenticação: **não é configurável pelo repositório**.
  Depende de um domínio de e-mail próprio do projeto (Cloud -> Emails ->
  configurar domínio) e, só depois, dos templates gerenciados em pt-BR. Enquanto
  isso, valem os textos padrão em inglês e o remetente padrão. Não afirmar ao
  usuário que existe remetente personalizado.
- Os e-mails de autenticação ainda usam os textos padrão em inglês
  ("Confirm your signup" / "Verify Email") e o remetente padrão
  `auth.lovable.cloud`. Não afirmar ao usuário que já existe remetente
  personalizado.
- O painel global ainda **não** mostra badge de confirmação de e-mail dos
  clientes: `auth.users.email_confirmed_at` não é legível pelo cliente e
  exigiria uma Edge Function com service role (não implementada).
- `profiles` sem leitura cruzada entre membros comuns: nomes podem
  aparecer vazios em logs para usuários não administradores.
- Lint com ~252 erros preexistentes (`no-explicit-any`); dívida técnica
  conhecida, sem plano de refatoração nesta fase.
- Reset de ambiente **nunca executado**; exige checklist prévio.

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

## Modelos de papéis (nunca misturar)

- **Globais (equipe LLZ)** em `user_roles`: `super_admin`, `admin`
  (legado), `platform_admin`, `support_agent`, `developer`.
- **De empresa (cliente)** em `company_members`: `owner`, `admin`,
  `supervisor`, `member`/operador e ponto focal (`is_main_focal_point`).
- Admin da empresa **não** é super admin. Supervisor e operador **nunca**
  são papéis globais. Ver `docs/PLATFORM_ROLES.md`.

## Checklist antes de finalizar uma fase

1. `typecheck` passa.
2. `build` passa.
3. Nenhuma nova política de RLS foi enfraquecida.
4. Nenhum `DELETE` novo em tabelas com histórico.
5. Entrada criada em `system_changelog` (pública + interna quando
   aplicável).
6. `AGENTS.md`, `README.md` e/ou `docs/` atualizados se o baseline
   mudou.

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

## Fase 6.16.1 — autorização do super administrador

- **Causa raiz:** 53 policies dependiam exclusivamente de
  `has_role(auth.uid(),'admin')`. Após 6.16 a conta oficial ficou só com
  `super_admin` → UI liberava, RLS bloqueava.
- **Correção:** todas migradas para `is_platform_super_admin(auth.uid())`.
- **Novo helper:** `is_platform_client_admin` (`super_admin`/`admin`/`platform_admin`)
  usado em `company_members` UPDATE e `companies` UPDATE de staff.
- **Frontend:** `isPlatformAdmin` no `AuthContext`; AdminPanel desabilita o que o
  papel não pode executar. `isAdmin` permanece apenas como "é equipe LLZ".
- **Papel legado `admin`:** restaurado temporariamente para
  `luccafelipe99@gmail.com`. Só remover após homologação humana.
- **Reset:** não executado.
