# Reset de Ambiente de Testes (Fase 6.14)

Operação administrativa **exclusiva do `super_admin`**, disponível em
`/admin/reset` (também no menu Administração e no painel global). Não aparece
para usuários clientes.

## Arquitetura

| Camada | Responsabilidade |
|---|---|
| `/admin/reset` (UI) | Gera preview, exibe listas e exige confirmação `RESET` |
| Edge Function `admin-reset` | Valida o JWT, confirma `super_admin`, aplica travas, chama o banco e remove contas Auth |
| `platform_reset_preview()` | Somente leitura: listas e contagens |
| `platform_reset_execute()` | Exclusão em transação única, na ordem das foreign keys |

A secret key / service role **nunca** vai ao frontend: é usada apenas dentro da
Edge Function. As funções de reset não têm `EXECUTE` para `anon`/`authenticated`.

## Preview (não altera nada)

Retorna:

- `PRESERVED_PLATFORM_USERS`: id, e-mail, nome e papel global
- `USERS_TO_DELETE`: id, e-mail e empresas vinculadas
- `COMPANIES_TO_DELETE`: id, nome e quantidade de registros vinculados
- `counts_to_delete`: contagem por tabela
- `blockers`: motivos que impedem a execução

## Travas de segurança (abortam o reset)

1. Nenhum `super_admin`/`admin` válido identificado.
2. O usuário atual está na lista de exclusão.
3. O usuário atual não possui papel global preservado.
4. Confirmação `RESET` ausente.
5. Qualquer erro no banco → a transação inteira é revertida.

Critério de preservação: **somente papel global em `user_roles`**.
`owner`/`admin` em `company_members` **não** é papel global.

## Ordem de exclusão

`support_ticket_messages` → `support_tickets` → `picking_list_items` →
`picking_lists` → `notifications` → `stock_balance` → `movements` → `lots` →
`addresses` → `products` → `activity_log` (com `company_id`) →
`company_members` → `companies` → `user_tab_permissions` (clientes) →
`profiles` (clientes) → contas Auth dos clientes (Edge Function).

Nenhuma trigger é desabilitada: como os filhos são removidos antes,
`prevent_delete_company_if_referenced` passa naturalmente.

## Preservado

- Usuários globais (Auth, `profiles`, `user_roles`) e suas credenciais
- `system_changelog`
- Estrutura do banco, migrations, funções, policies e triggers

## Sessões e pós-reset

Após remover as contas Auth, tokens já emitidos podem continuar válidos até
expirar, porém as contas removidas não conseguem mais ler nem gravar dados
(perfil, membership e RLS deixam de autorizar). Se houver arquivos de Storage
de usuários removidos, remova-os manualmente — hoje o projeto não usa buckets.

## Relatório

A execução devolve: quantidade removida por tabela, usuários preservados,
usuários removidos, erros de exclusão Auth e observação sobre tokens.
O evento é registrado em `activity_log` como `platform_environment_reset`.

## Estado atual (6.14)

Mecanismo + preview **entregues e disponíveis**. O reset **não foi executado**:
existem dois usuários com papel global `admin` (`luccafelipe99@gmail.com` e
`retailtech@gmail.com`), sendo o segundo aparentemente uma conta de teste de
hackathon. Antes de executar, o super admin deve remover o papel global das
contas que não são da equipe LLZ — caso contrário elas seriam preservadas.

## Recuperação

Não há undo. Antes de executar:

1. exporte os dados relevantes (Cloud → Advanced settings → Export data);
2. confira o preview linha por linha;
3. confirme a lista de usuários globais.

## Fase 6.15A — reset NÃO executado

O mecanismo permanece intacto e continua **não executado**. Antes de qualquer
execução é obrigatório:

1. Definir os integrantes da equipe LLZ.
2. Definir os e-mails oficiais da equipe.
3. Atribuir os papéis globais em `user_roles`.
4. Confirmar quais contas são de teste (e remover papéis globais indevidos,
   como o de `retailtech@gmail.com`).
5. Gerar o preview (`platform_reset_preview`).
6. Criar backup.
7. Validar que o `super_admin` será preservado.

Nenhum dado foi apagado nesta fase.

## Fase 6.16 — normalização da staff e novo preview (reset NÃO executado)

### Lista oficial da staff preservada

| E-mail | Papel global |
|---|---|
| luccafelipe99@gmail.com | `super_admin` |

Papel empresarial (`owner`, `admin` da empresa, `supervisor`, `member`/operador,
ponto focal) **nunca** preserva um usuário no reset.

### Normalização aplicada (migration 6.16)

- `luccafelipe99@gmail.com` passou a ter `super_admin` e teve o papel legado
  `admin` removido.
- Todos os demais registros de `user_roles` foram removidos, incluindo
  `retailtech@gmail.com` e papéis `admin`/`supervisor` concedidos indevidamente
  no nível da plataforma (`abel.beleleu@`, `manus2silva01@`, `alinamoretii@`,
  `leandrom.yamasaki@`).
- Evento registrado em `activity_log` como `platform_roles_normalized`.

### Preview (leitura, pós-normalização)

`PRESERVED_PLATFORM_USERS` → 1 usuário: `luccafelipe99@gmail.com` (`super_admin`).

`USERS_TO_DELETE` → 5 usuários clientes/teste: `abel.beleleu@gmail.com`,
`alinamoretii@gmail.com`, `leandrom.yamasaki@gmail.com`, `manus2silva01@gmail.com`,
`retailtech@gmail.com`.

`COMPANIES_TO_DELETE` → 10 empresas: Burtan Store, Hackaton RetailTech,
Hospital Vascular de Londrina, Lemon Haze Floricultura (pending), LLZ,
LUCCATESTE01, Manu Cosmético, Mario AutoPeças, Mercosu, Minha Empresa.

`COUNTS_TO_DELETE` (momento do preview):

| Tabela | Registros |
|---|---|
| support_ticket_messages | 2 |
| support_tickets | 1 |
| picking_list_items | 2 |
| picking_lists | 1 |
| notifications | 0 |
| stock_balance | 23 |
| movements | 47 |
| lots | 19 |
| addresses | 45 |
| products | 44 |
| activity_log (com company_id) | 168 |
| company_members | 9 |
| companies | 10 |
| system_changelog | **preservado (35)** |

### Por que o reset NÃO foi executado nesta fase

A execução exige a Edge Function `admin-reset` chamada com o **JWT do super admin
autenticado**. O agente não possui — e não deve possuir — sessão do super admin,
e a service role não pode ser exposta. Trava acionada:

> **6. O usuário autenticado não é o super admin preservado.**

Nada foi apagado. Para concluir, o próprio `luccafelipe99@gmail.com` deve:

1. Entrar no app.
2. Abrir `/admin/reset`.
3. Clicar em **Gerar preview** e conferir que apenas ele aparece em usuários preservados.
4. Digitar `RESET` e executar.
5. Conferir o relatório (contagens removidas, contas Auth removidas, falhas).

Empresas criadas pelo super admin (LLZ, Hospital Vascular de Londrina, Mercosu,
Minha Empresa, Mario AutoPeças) **também serão removidas** — só a identidade
global dele é preservada.

## Atualização 6.16.1

O papel global legado `admin` foi **restaurado** para `luccafelipe99@gmail.com`
como compatibilidade temporária. O reset continua **não executado** e exige o
JWT do super admin autenticado. Só remova o papel legado após a homologação
descrita em `docs/TESTES_MANUAIS.md` (seção 6.16.1).

## Fase 6.16.2 — correção da autorização das RPCs (reset NÃO executado)

### Causa do erro 400

A Edge Function validava o JWT corretamente, mas chamava
`platform_reset_preview()` com a **service role**. Dentro da função SQL a
validação usava `auth.uid()`, que nessa chamada não representa o usuário
autenticado original → a função rejeitava com
"Apenas o super admin pode consultar o reset de ambiente".

### Correção

| Antes | Depois |
|---|---|
| `platform_reset_preview()` | `platform_reset_preview(_caller_id uuid)` |
| `platform_reset_execute()` | `platform_reset_execute(_caller_id uuid)` |
| Validação por `auth.uid()` | Validação direta em `public.user_roles` pelo `_caller_id` |

O `_caller_id` é preenchido **exclusivamente** pela Edge Function, a partir do
JWT validado com `auth.getUser()`. O frontend envia apenas
`{ action: "preview" }` ou `{ action: "execute", confirm: "RESET" }`.

`platform_reset_execute` também confirma que o chamador é staff preservada e
que não está na lista de exclusão.

### Grants

`REVOKE ALL` de `PUBLIC`, `anon` e `authenticated`; `GRANT EXECUTE` apenas para
`service_role` (e `postgres`). Chamada direta pelo navegador é negada.

### Status HTTP padronizados

- 401 — JWT ausente/sessão inválida
- 403 — autenticado sem `super_admin`/`admin` legado
- 400 — blocker, confirmação inválida ou regra de negócio
- 500 — falha interna

### Tela /admin/reset

Erros não causam mais tela branca: a página permanece renderizada, mostra um
card de erro com mensagem em português, mantém o último preview válido e
oferece "Tentar novamente". O preview não é mais chamado recursivamente após a
execução.

### Estado

Reset **NÃO executado**. Nenhum usuário, empresa, perfil, membership ou conta
Auth foi removido nesta fase. Execução continua manual, pelo próprio super
admin autenticado.
