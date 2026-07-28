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
