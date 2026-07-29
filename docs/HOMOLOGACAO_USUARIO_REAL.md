# Homologação com Usuário Real — LLZ Gestão de Estoque (Fase 6.15A)
# Homologação com Usuário Real — LLZ Gestão de Estoque (Fase 6.15B)

Roteiro de teste ponta a ponta (E2E) com contas reais. **Nada aqui pode ser
marcado como PASS sem execução humana registrada.** O estado inicial de todos os
testes é `NOT_EXECUTED`; os testes preparados na 6.15B ficam
`AWAITING_USER_EVIDENCE` até o usuário informar as evidências.

Nunca registrar senha. Nunca publicar o e-mail completo — usar máscara
(`lu***@gmail.com`).

## Como usar

Para cada teste preencher: código, data, e-mail mascarado, papel, empresa, ação,
esperado, observado, resultado (PASS / FAIL / AWAITING_USER_EVIDENCE /
NOT_EXECUTED), evidência (print, ID do registro, linha do `activity_log`), bug
relacionado e correção aplicada.

Contas sugeridas (não criar antes de definir a equipe LLZ):

| Apelido | Papel | Empresa |
|---|---|---|
| LLZ-1 | `super_admin` (global) | — |
| LLZ-2 | `support_agent` (global) | — |
| A-OWNER | `owner` | Empresa A |
| A-OPER | `member` / operador | Empresa A |
| B-OWNER | `owner` | Empresa B |

---

## Estados oficiais do fluxo de ativação (6.15B)

Estes estados são **independentes** e nunca devem ser representados por um único
campo ou badge:

| Estado | Origem da verdade |
|---|---|
| `AUTH_EMAIL_UNCONFIRMED` | `auth.users.email_confirmed_at` nulo (visível só para o próprio usuário) |
| `AUTH_EMAIL_CONFIRMED` | `auth.users.email_confirmed_at` preenchido |
| `COMPANY_PENDING` | `companies.approval_status = 'pending'` |
| `COMPANY_APPROVED` | `companies.approval_status = 'approved'` + `approved_at` |
| `COMPANY_REJECTED` | `companies.approval_status = 'rejected'` + `approval_reason` |
| `MEMBERSHIP_PENDING` | `company_members.is_active = false` |
| `MEMBERSHIP_ACTIVE` | `company_members.is_active = true` + `approved_at` |
| `USER_BLOCKED` | `companies.status = 'blocked'` ou `company_members.blocked_at` |

Na UI: `Login` → `signup-sent` (e-mail) → `PendingApproval` (dois indicadores
separados: **E-mail** e **Empresa**) → `CompanyGate` → `CompanyOnboarding` →
sistema operacional.

## A. Cadastro e confirmação de e-mail

| Código | Usuário | Papel | Empresa | Ação | Esperado | Observado | Status | Evidência | Correção |
|---|---|---|---|---|---|---|---|---|---|
| A1 | A-OWNER | — | A | Criar conta com nome, e-mail, senha, confirmação de senha e nome da empresa | Conta criada; tela "Confirme seu e-mail" mostra o endereço informado | | AWAITING_USER_EVIDENCE | | 6.15B: campo "Confirmar senha" + tela pós-cadastro |
| A2 | A-OWNER | — | A | Tentar login antes de confirmar | Mensagem "E-mail ainda não confirmado" (não erro cru) e retorno à tela de confirmação | | AWAITING_USER_EVIDENCE | | 6.15B: `friendlyError` para erros de Auth |
| A3 | A-OWNER | — | A | Usar "Reenviar confirmação" | Novo e-mail recebido; botão bloqueia duplo clique | | AWAITING_USER_EVIDENCE | | 6.15B: reenvio também na tela de login |
| A4 | A-OWNER | — | A | Confirmar e-mail e usar "Já confirmei, verificar" | Login concluído; estado passa a `AUTH_EMAIL_CONFIRMED` / `COMPANY_PENDING` | | AWAITING_USER_EVIDENCE | | |
| A5 | A-OWNER | — | A | Cadastrar novamente o mesmo e-mail | Mensagem "Já existe uma conta com este e-mail" | | AWAITING_USER_EVIDENCE | | 6.15B |
| A6 | A-OWNER | — | A | Senha e confirmação diferentes | Bloqueado antes do envio | | AWAITING_USER_EVIDENCE | | 6.15B |
| A7 | A-OWNER | — | A | Erro no cadastro (ex.: senha fraca) | Dados preenchidos permanecem no formulário | | AWAITING_USER_EVIDENCE | | 6.15B |
| A8 | A-OWNER | — | A | Usar link expirado / já utilizado | Mensagem pedindo novo e-mail de confirmação | | AWAITING_USER_EVIDENCE | | 6.15B |
| A9 | — | — | — | Conferir remetente e idioma do e-mail | Identidade "LLZ Gestão de Estoque", texto em pt-BR | | FAIL (pendência conhecida) | Textos em inglês, remetente padrão | Requer domínio de e-mail próprio — ver AGENTS.md |


## B. Aprovação da empresa

| Código | Ação | Esperado | Status |
|---|---|---|---|
| B1 | LLZ-1 vê empresa A em Aprovações do Painel Global | Empresa listada como `pending` com responsável, e-mail, data e segmento | AWAITING_USER_EVIDENCE |
| B2 | LLZ-1 rejeita com motivo | `approval_status=rejected`, motivo visível ao cliente, nada apagado | AWAITING_USER_EVIDENCE |
| B3 | Cliente corrige dados na tela "Cadastro em análise" | Dados salvos, empresa segue pendente | AWAITING_USER_EVIDENCE |
| B4 | LLZ-1 aprova empresa A | Empresa ativa, owner ativo, ponto focal definido, `approved_at` e `activity_log` registrados | AWAITING_USER_EVIDENCE |
| B5 | Conferir papel do criador após aprovação | Continua `owner`, ativo e ponto focal — nunca vira supervisor/operador/member | AWAITING_USER_EVIDENCE |
| B6 | Cliente pendente tenta acessar `/produtos` pela URL | Permanece em "Cadastro em análise", sem loop de rotas | AWAITING_USER_EVIDENCE |

## C. Primeiro acesso após aprovação

| Código | Ação | Esperado | Status |
|---|---|---|---|
| C1 | Cliente aprovado clica em "Verificar status da aprovação" | Entra sem precisar de logout/login manual | AWAITING_USER_EVIDENCE |
| C2 | Login após aprovação | `currentCompanyId` correto, apenas a própria empresa disponível | AWAITING_USER_EVIDENCE |
| C3 | Sidebar do cliente | Sem módulos globais da equipe LLZ | AWAITING_USER_EVIDENCE |

## D. Onboarding

| Código | Ação | Esperado | Status |
|---|---|---|---|
| D1 | Percorrer as etapas do onboarding | Salva parcial, permite retomar após refresh | AWAITING_USER_EVIDENCE |
| D2 | Desmarcar "usa endereçamento" | Menu Endereços some | AWAITING_USER_EVIDENCE |
| D3 | Desmarcar "usa expedição" | Menu Expedição some | AWAITING_USER_EVIDENCE |
| D4 | Pular onboarding | `onboarding_status = skipped`, sem `completed_at` | AWAITING_USER_EVIDENCE |
| D5 | Concluir | `completed`, `completed_at` preenchido, checklist aparece | AWAITING_USER_EVIDENCE |
| D6 | Escolher importação CSV / cadastro manual | Direciona para Importar CSV / Produtos | AWAITING_USER_EVIDENCE |

## E. Novo funcionário em empresa existente (apenas mapeado na 6.15B)

Comportamento atual observado no código, **sem alteração nesta fase**:

- O funcionário se cadastra informando o **código da empresa** (`invite_code`);
  `handle_new_user` cria a membership como `member` **ativa**, sem nova empresa.
- Se a empresa já estiver aprovada, o `profiles.is_approved` do funcionário é
  liberado automaticamente — **a equipe LLZ não aprova funcionário**.
- Papéis `supervisor`/operador e bloqueio de abas são definidos depois pelo
  owner/admin da empresa no painel administrativo.
- Ambiguidade documentada: não existe hoje uma fila de aprovação de funcionário
  pelo owner. Decisão adiada para fase futura.

| Código | Ação | Esperado | Status |
|---|---|---|---|
| E1 | Cadastro com código da empresa | Entra na empresa existente, papel `member`, sem virar owner | AWAITING_USER_EVIDENCE |
| E2 | Cadastro com código inválido | Cria empresa nova pendente (comportamento atual) | AWAITING_USER_EVIDENCE |

## F. Produto


## D. Produto

| Código | Ação | Esperado | Status |
|---|---|---|---|
| D1 | Criar produto | Flags herdam padrão da empresa | NOT_EXECUTED |
| D2 | Alterar flags no produto | Produto é a fonte da verdade | NOT_EXECUTED |
| D3 | Alterar configuração da empresa | Produtos existentes não mudam | NOT_EXECUTED |
| D4 | SKU repetido na mesma empresa | Bloqueado com mensagem em pt-BR | NOT_EXECUTED |
| D5 | Mesmo SKU na empresa B | Permitido | NOT_EXECUTED |
| D6 | Excluir produto com histórico | Bloqueado com mensagem clara | NOT_EXECUTED |

## E. Endereço

| Código | Ação | Esperado | Status |
|---|---|---|---|
| E1 | Criar endereço | Código único por empresa | NOT_EXECUTED |
| E2 | Importar endereços via CSV modelo | Importação com mapeamento e deduplicação | NOT_EXECUTED |
| E3 | Excluir endereço com saldo | Bloqueado | NOT_EXECUTED |

## F. Lote e validade

| Código | Ação | Esperado | Status |
|---|---|---|---|
| F1 | Criar lote com fabricação > validade | Bloqueado | NOT_EXECUTED |
| F2 | Produto perecível sem validade | Bloqueado | NOT_EXECUTED |
| F3 | Lote próximo do vencimento | Aparece nos alertas | NOT_EXECUTED |

## G. Entrada

| Código | Ação | Esperado | Status |
|---|---|---|---|
| G1 | Recebimento guiado com lote e validade | Movimento IN criado, saldo atualizado | NOT_EXECUTED |
| G2 | Recebimento de produto sem controle de lote | Campos de lote ocultos/opcionais | NOT_EXECUTED |

## H. Saldo

| Código | Ação | Esperado | Status |
|---|---|---|---|
| H1 | Consultar estoque | Saldo bate com movimentos | NOT_EXECUTED |
| H2 | Filtros por produto/endereço/lote | Resultados só da empresa atual | NOT_EXECUTED |

## I. Saída

| Código | Ação | Esperado | Status |
|---|---|---|---|
| I1 | Saída dentro do saldo | Permitida | NOT_EXECUTED |
| I2 | Saída acima do saldo | Bloqueada na UI e no banco | NOT_EXECUTED |
| I3 | Tentar editar/excluir movimento | Bloqueado (imutabilidade) | NOT_EXECUTED |

## J. Transferência

| Código | Ação | Esperado | Status |
|---|---|---|---|
| J1 | Transferir entre endereços | Saldos de origem e destino corretos | NOT_EXECUTED |
| J2 | Transferir para endereço de outra empresa | Bloqueado | NOT_EXECUTED |

## K. Expedição

| Código | Ação | Esperado | Status |
|---|---|---|---|
| K1 | Criar lista de picking | Lista em `draft` | NOT_EXECUTED |
| K2 | Sugestão FEFO | Lote mais próximo do vencimento primeiro | NOT_EXECUTED |
| K3 | Concluir picking | Movimentos OUT gerados, lista `done` | NOT_EXECUTED |

## L. Suporte

| Código | Ação | Esperado | Status |
|---|---|---|---|
| L1 | Cliente abre ticket | Ticket visível só para a empresa dele | NOT_EXECUTED |
| L2 | LLZ-2 responde e cria nota interna | Nota invisível ao cliente | NOT_EXECUTED |
| L3 | LLZ-2 muda status/prioridade/responsável | Alterações auditadas | NOT_EXECUTED |

## M. Papéis e permissões

| Código | Ação | Esperado | Status |
|---|---|---|---|
| M1 | A-OPER acessa `/admin` | Redirecionado / sem acesso | NOT_EXECUTED |
| M2 | A-OWNER acessa `/admin/global` | Sem acesso (não é papel global) | NOT_EXECUTED |
| M3 | Admin da empresa exclui produto sem histórico | Permitido | NOT_EXECUTED |
| M4 | A-OPER tenta excluir produto | Bloqueado por RLS | NOT_EXECUTED |
| M5 | Admin da empresa bloqueia aba do operador | Aba some para o operador | NOT_EXECUTED |

## N. Multiempresa

| Código | Ação | Esperado | Status |
|---|---|---|---|
| N1 | A-OWNER lista produtos | Só dados da empresa A | NOT_EXECUTED |
| N2 | Usuário membro de A e B troca de empresa | Dados trocam por completo | NOT_EXECUTED |
| N3 | Consultar ID de registro da empresa B via URL/API | Negado por RLS | NOT_EXECUTED |
| N4 | Auditoria da empresa A | Só eventos da empresa A | NOT_EXECUTED |

## O. Administração global

| Código | Ação | Esperado | Status |
|---|---|---|---|
| O1 | LLZ-1 entra sem empresa | Abre no Painel Global, sem módulos operacionais no menu | NOT_EXECUTED |
| O2 | LLZ-1 acessa `/produtos` direto pela URL | Tela "Selecione uma empresa" | NOT_EXECUTED |
| O3 | LLZ-1 seleciona empresa para manutenção | Banner persistente + módulos operacionais | NOT_EXECUTED |
| O4 | Sair do modo de manutenção | Volta ao painel global, sem empresa | NOT_EXECUTED |
| O5 | Conferir `activity_log` | `maintenance_mode_entered` e `maintenance_mode_exited` | NOT_EXECUTED |
| O6 | Aba "Equipe LLZ" no painel administrativo | Só usuários com papel global | NOT_EXECUTED |
| O7 | `/admin/reset` com `platform_admin` | Sem acesso (só `super_admin`) | NOT_EXECUTED |

---

## Pré-requisitos obrigatórios antes de qualquer reset

1. Definir os integrantes da equipe LLZ.
2. Definir os e-mails oficiais.
3. Atribuir os papéis globais.
4. Confirmar quais contas são de teste.
5. Gerar o preview do reset.
6. Criar backup.
7. Validar que o `super_admin` será preservado.

O reset **não foi executado** e não deve ser executado nesta fase.
