# Homologação com Usuário Real — LLZ Gestão de Estoque (Fase 6.15A)

Roteiro de teste ponta a ponta (E2E) com contas reais. **Nada aqui pode ser
marcado como PASS sem execução humana registrada.** O estado inicial de todos os
testes é `NOT_EXECUTED`.

## Como usar

Para cada teste preencher: código, usuário, papel, empresa, ação, esperado,
observado, resultado (PASS / FAIL / NOT_EXECUTED), evidência (print, ID do
registro, linha do `activity_log`) e correção necessária.

Contas sugeridas (não criar antes de definir a equipe LLZ):

| Apelido | Papel | Empresa |
|---|---|---|
| LLZ-1 | `super_admin` (global) | — |
| LLZ-2 | `support_agent` (global) | — |
| A-OWNER | `owner` | Empresa A |
| A-OPER | `member` / operador | Empresa A |
| B-OWNER | `owner` | Empresa B |

---

## A. Cadastro e confirmação de e-mail

| Código | Usuário | Papel | Empresa | Ação | Esperado | Observado | Status | Evidência | Correção |
|---|---|---|---|---|---|---|---|---|---|
| A1 | A-OWNER | — | A | Criar conta com nome, e-mail, senha e nome da empresa | Conta criada, mensagem indica confirmação de e-mail | | NOT_EXECUTED | | |
| A2 | A-OWNER | — | A | Tentar login antes de confirmar | Mensagem "E-mail ainda não confirmado" (não erro técnico) | | NOT_EXECUTED | | |
| A3 | A-OWNER | — | A | Usar "Reenviar confirmação" | Novo e-mail recebido | | NOT_EXECUTED | | |
| A4 | A-OWNER | — | A | Confirmar e-mail e usar "Já confirmei, verificar" | Estado muda para EMAIL_CONFIRMED / COMPANY_PENDING | | NOT_EXECUTED | | |
| A5 | — | — | — | Conferir remetente e idioma do e-mail | Identidade "LLZ Gestão de Estoque", texto em pt-BR | | NOT_EXECUTED | | pendência conhecida |

## B. Aprovação da empresa

| Código | Ação | Esperado | Status |
|---|---|---|---|
| B1 | LLZ-1 vê empresa A em Aprovações do Painel Global | Empresa listada como `pending` | NOT_EXECUTED |
| B2 | LLZ-1 rejeita com motivo | `approval_status=rejected`, motivo visível ao cliente, nada apagado | NOT_EXECUTED |
| B3 | Cliente corrige dados na tela "Cadastro em análise" | Dados salvos, empresa segue pendente | NOT_EXECUTED |
| B4 | LLZ-1 aprova empresa A | Empresa ativa, owner ativo, ponto focal definido, `activity_log` registrado | NOT_EXECUTED |
| B5 | Cliente com empresa aprovada faz login | Vai direto ao onboarding | NOT_EXECUTED |

## C. Onboarding

| Código | Ação | Esperado | Status |
|---|---|---|---|
| C1 | Percorrer as etapas do onboarding | Salva parcial, permite retomar | NOT_EXECUTED |
| C2 | Desmarcar "usa endereçamento" | Menu Endereços some | NOT_EXECUTED |
| C3 | Desmarcar "usa expedição" | Menu Expedição some | NOT_EXECUTED |
| C4 | Concluir | Vai para produtos ou importação CSV; checklist aparece | NOT_EXECUTED |

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
