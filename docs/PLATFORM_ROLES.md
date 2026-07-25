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
