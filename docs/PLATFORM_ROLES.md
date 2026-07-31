# Papéis da Plataforma — LLZ Gestão de Estoque (Fase 6.14)

O sistema tem **dois modelos de papéis independentes**. Nunca confunda os dois.

## 1. Papéis GLOBAIS da plataforma (equipe LLZ)

Armazenados em `public.user_roles` (`app_role`). Um usuário global **não precisa**
ter linha em `company_members` e **não pertence a nenhuma empresa**.

| Papel | O que pode fazer |
|---|---|
| `super_admin` | Acesso total, incluindo ações críticas e o reset de ambiente |
| `admin` (legado) | Equivalente a `super_admin` — mantido por compatibilidade |
| `platform_admin` | Aprova usuários/empresas, administra contas, acompanha operações |
| `support_agent` | Atende tickets (status, prioridade, responsável, nota interna); sem ações destrutivas amplas |
| `developer` | Manutenção, logs, auditoria e empresas autorizadas |

Funções de apoio (SECURITY DEFINER, sem execução para `anon`):

- `is_platform_staff(uuid)` — qualquer papel global
- `is_platform_super_admin(uuid)` — `super_admin` ou `admin`
- `is_support_staff(uuid)` — `super_admin`, `admin`, `platform_admin`, `support_agent`
- `has_role(uuid, app_role)` — mantida (usada por policies legadas)

No frontend: `useAuth()` expõe `roles`, `platformRole`, `isPlatformStaff`,
`isPlatformSuperAdmin`, `isSupportStaff`. `isAdmin` continua existindo e hoje
significa "é equipe LLZ" (acesso às áreas administrativas). Ações destrutivas
continuam protegidas por RLS de super admin no banco.

## 2. Papéis de EMPRESA (cliente)

Armazenados em `public.company_members` por `company_id`:

- `owner` — dono do cadastro da empresa
- `admin` — administrador da empresa
- ponto focal principal (`is_main_focal_point`) — contato oficial
- `supervisor`, `member`/operador — operação diária

Isolamento: RLS por membership (`is_member_of`) e administração da empresa por
`is_company_admin_of`. O super admin possui bypass controlado.

## Super admin ≠ admin da empresa

| | Super admin (global) | Admin da empresa |
|---|---|---|
| Onde vive | `user_roles` | `company_members` |
| Escopo | toda a plataforma | uma empresa |
| Precisa de empresa | não | sim |
| Aprova cadastros | sim | não |
| Reset de ambiente | sim (só `super_admin`) | não |

## Login da equipe LLZ sem empresa

- `CompanyGate` libera qualquer usuário com papel global sem empresa vinculada.
- Nenhum onboarding de cliente é exibido para a equipe.
- A rota `/` redireciona a equipe LLZ para `/admin/global`.
- Telas **globais** (`/admin`, `/admin/global`, `/admin/audit-logs`,
  `/admin/data-quality`, `/admin/changelog`, `/docs`, `/suporte`) não exigem
  `currentCompanyId`.
- Telas **operacionais** (produtos, endereços, estoque, movimentações,
  recebimento, expedição, configurações, checklist, importação, alertas) usam
  `RequireCompany` e exibem: *"Selecione uma empresa para acessar os dados
  operacionais."*
- Nunca há seleção silenciosa da primeira empresa para a equipe LLZ.

## Modo de manutenção

Quando alguém da equipe LLZ escolhe uma empresa no seletor do topo:

1. `currentCompanyId` é definido explicitamente (sessão do navegador);
2. banner persistente: **"Modo de manutenção — Empresa: [nome]"**;
3. botão **"Sair do modo de manutenção"** volta ao painel global;
4. `activity_log` recebe `maintenance_mode_entered` / `maintenance_mode_exited`.

Não existe "login como cliente": a identidade autenticada nunca é trocada.

## Aprovação de cadastros

Regra única: **a aprovação é da EMPRESA**; o usuário é liberado junto com ela.

- `companies.approval_status`: `pending` → `approved` | `rejected`
  (+ `approval_reason`, `approved_at`, `approved_by`).
- `approve_company(company_id)`: ativa empresa, membership do owner,
  `approved_at`, ponto focal, aprova os perfis vinculados e registra auditoria.
- `reject_company(company_id, motivo)`: exige motivo (mín. 5 caracteres), não
  apaga nada, permite correção e reanálise, registra auditoria.
- Enquanto pendente, o cliente vê "Cadastro em análise", pode corrigir dados
  básicos e falar com o suporte; operações de estoque e convites ficam bloqueados.
- Quem entra por `invite_code` de empresa já aprovada é liberado automaticamente.

## Fase 6.15A — validação dos dois modelos

Verificado no código, sem alteração de papéis ou contas:

| Verificação | Resultado |
|---|---|
| Usuário global não precisa de empresa | OK (`CompanyGate` libera `isPlatformStaff`) |
| Usuário global acessa o painel global sem `currentCompanyId` | OK (`/admin/global` sem `RequireCompany`) |
| Usuário global só opera após selecionar empresa | OK (`RequireCompany` nas telas operacionais) |
| Usuário empresarial não acessa administração global | OK (`ProtectedRoute adminOnly` → `isPlatformStaff`) |
| Admin da empresa ≠ super admin | OK (modelos separados; `isPlatformSuperAdmin` só de `user_roles`) |
| Supervisor não é papel global | OK (só existe em `company_members`) |
| Operador não é papel global | OK (só existe em `company_members`) |

Inconsistências identificadas (documentadas, **não** corrigidas por migração):

1. `AuthContext.isAdmin` é hoje um alias de `isPlatformStaff`. Funciona, mas o
   nome sugere "admin da empresa" e pode confundir manutenção futura.
2. O papel `admin` do enum `app_role` é ambíguo: em `user_roles` significa super
   admin legado; em `company_members` significa administrador da empresa.
3. A tela `/admin` ainda se chama "Painel do Desenvolvedor" e concentra usuários,
   empresas e auditoria. A partir de 6.15A a aba **Equipe LLZ** mostra somente
   papéis globais; a aba **Usuários** e a ficha de cada empresa mostram os
   membros de empresa. Nenhum papel foi migrado.

## Menu global (6.15A)

Quando a equipe LLZ está sem empresa selecionada, a barra lateral exibe somente
módulos globais: Painel Global, Empresas e Usuários, Suporte Global, Data
Quality, Auditoria, Changelog, Documentação e, para `super_admin`, Reset de
ambiente. Os módulos operacionais só aparecem após entrar no modo de manutenção
de uma empresa — o Admin Dev nunca aparenta ter estoque próprio.

## Fase 6.16 — lista oficial da equipe LLZ

Fonte de verdade dos papéis globais:

| E-mail | Papel |
|---|---|
| luccafelipe99@gmail.com | `super_admin` |

Regras consolidadas:

- Papel empresarial (`owner`, `admin` da empresa, `supervisor`, `member`/operador,
  ponto focal) **não** torna ninguém equipe LLZ.
- Apenas usuários com linha em `user_roles` aparecem na aba **Equipe LLZ**.
- A aba **Usuários da Empresa** exige uma empresa selecionada.
- O papel global legado `admin` foi removido do super admin oficial; use
  `super_admin`.
- Qualquer papel global fora da lista oficial deve ser removido.

## Fase 6.16.1 — autorização real dos papéis globais

Causa do bug: 53 policies usavam **somente** `has_role(auth.uid(), 'admin')` como
bypass global. Com a conta oficial apenas como `super_admin`, a UI liberava e o
RLS bloqueava.

Correções aplicadas:

- Todas as 53 policies passaram a usar `public.is_platform_super_admin(auth.uid())`
  (aceita `super_admin` e o legado `admin`).
- Novo helper `public.is_platform_client_admin(uuid)` = `super_admin` | `admin`
  (legado) | `platform_admin`, com `EXECUTE` só para `authenticated`/`service_role`.
- `company_members` UPDATE (staff) e `companies` UPDATE (staff) agora exigem
  `is_platform_client_admin` — `support_agent` e `developer` **não** alteram
  cargos nem cadastros de empresa.
- Frontend: `useAuth()` expõe `isPlatformAdmin` (espelha o helper). O AdminPanel
  desabilita vincular membro, trocar cargo, tornar focal, bloquear/reativar e
  remover vínculo quando o papel global não pode executar.

Regra final por papel global:

| Papel | Pode |
|---|---|
| `super_admin` | tudo, incluindo papéis globais e reset |
| `admin` (legado) | igual a `super_admin` — compatibilidade temporária |
| `platform_admin` | aprova/administra empresas e vínculos; sem reset e sem papéis globais |
| `support_agent` | tickets e leitura; sem alterar cargos/vínculos |
| `developer` | auditoria/diagnóstico; sem alterar cargos/vínculos |
| Admin de empresa | somente membros e configurações da própria empresa |

O papel legado `admin` de `luccafelipe99@gmail.com` foi **restaurado** e só pode
ser removido após homologação humana das ações administrativas.
