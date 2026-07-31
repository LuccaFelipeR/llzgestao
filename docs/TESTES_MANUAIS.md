# Testes Manuais — Roteiros críticos

Cada roteiro pressupõe que existe pelo menos uma empresa configurada e um usuário
membro ativo. Faça em ordem.

## 1. Isolamento multi-tenant
1. Crie duas empresas (A e B) com usuários diferentes.
2. Em cada empresa, cadastre um produto com o mesmo `SKU` (ex.: `TESTE-001`).
3. Esperado: ambos aceitos.
4. Logue como usuário de A e visite `/produtos`. Esperado: só produto de A.
5. Repita para B.

## 2. Hierarquia empresa × produto
1. Empresa A: `controls_batch = false`, `controls_expiration = false`.
2. Vá em `/produtos`, crie um novo produto. Esperado: switches começam desligados.
3. Ative `Controla lote` só nesse produto e salve.
4. Vá em `/recebimento`, selecione esse produto. Esperado: campo lote obrigatório
   mesmo com a empresa desligando lote.
5. Nos outros produtos, o campo lote continua opcional.

## 3. Estoque não-negativo
1. Cadastre produto com saldo 5 em um endereço.
2. Registre `OUT` de 6 unidades. Esperado: erro "Saldo insuficiente".

## 4. Imutabilidade de movimentos
1. Tente editar/excluir um movimento via UI. Esperado: não há ação.
2. Via SQL (super admin no `supabase--insert`), `UPDATE movements ...`. Esperado:
   erro de RLS.

## 5. Delete bloqueado
1. Tente excluir produto com estoque > 0. Esperado: toast "não é possível excluir".
2. Zere o estoque, mas deixe movimentos históricos. Esperado: continua bloqueado.
3. Desative o produto.

## 6. Configurações da empresa (RLS 6.11)
1. Como usuário `member` (não owner/admin/focal), abra `/configuracoes`.
2. Esperado: badge "Somente leitura", inputs desabilitados, sem botão salvar.
3. Como owner/admin/focal, edite `handles_perishables` e salve. Esperado: sucesso
   + entrada em `activity_log`.

## 7. Expedição guiada
1. `uses_expedition = true`. Sidebar mostra "Expedição".
2. Crie picking list com 1 item de um produto com lote.
3. Modo guiado sugere lote FEFO. Confirme item. Movimento `OUT` gerado.
4. Desative `uses_expedition`. Sidebar esconde "Expedição". Rotas diretas
   continuam funcionando (não removemos código, só o menu).

## 8. CSV Import
1. Baixe `produtos-exemplo.csv` na tela `/onboarding`.
2. Importe. Esperado: contador exibe criados/atualizados.
3. Após concluir, checklist de ativação marca "Importação CSV concluída".

## 9. Onboarding
1. Nova empresa, ainda sem produtos.
2. Complete os 8 passos. Esperado: se marcou `plans_csv_import`, cai em
   `/onboarding`; senão em `/produtos`.
3. Refazer onboarding (Configurações → Refazer). Estado volta para `in_progress`.

## 10. Suporte
1. Como usuário comum, abra ticket. Esperado: cria em `pending`.
2. Como super admin, mude prioridade/atribuição/status. Esperado: auditado.
3. Como usuário comum, tente mudar prioridade. Esperado: erro tratado.

## 8. Homologação 6.13 (roteiro multiempresa completo)
Ver `docs/HOMOLOGACAO_6_13.md` seção 3 (cenário A/B/super admin) e seção 4
(tabelas ISO/STK/LOT/ONB/SUP/ADM). Execute com contas fictícias `pilotoA-*` e
`pilotoB-*` e preencha os campos NOT_EXECUTED com PASS/FAIL reais.

## Fase 6.14 — Administração global da plataforma

- Papéis globais (`super_admin`, `platform_admin`, `support_agent`, `developer`) em `user_roles`; papéis de empresa seguem em `company_members`. Ver `docs/PLATFORM_ROLES.md`.
- Equipe LLZ entra sem empresa: painel global em `/admin/global`; telas operacionais exigem seleção explícita de empresa (`RequireCompany`).
- Modo de manutenção com banner e auditoria (`maintenance_mode_entered/exited`).
- Aprovação por EMPRESA: `approval_status` + `approve_company` / `reject_company` (motivo obrigatório, nada é apagado).
- Suporte global para `support_agent`/`platform_admin`; cliente segue restrito à própria empresa e sem notas internas.
- Reset de ambiente: preview + execução via Edge Function `admin-reset` (só `super_admin`). Ver `docs/RESET_AMBIENTE.md`. **Não executado nesta fase.**

## Fase 6.15A

O roteiro oficial de homologação com contas reais passou para
`docs/HOMOLOGACAO_USUARIO_REAL.md` (etapas A a O, com campos de evidência e
status). Nenhum teste pode ser marcado como PASS sem execução humana.

## 6.15B — Cadastro, confirmação, aprovação e onboarding

Roteiro detalhado (seções A–E) em `docs/HOMOLOGACAO_USUARIO_REAL.md`. Testes
dependentes de e-mail real ficam `AWAITING_USER_EVIDENCE` até execução humana.

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

## 6.16.1 — Testes de autorização administrativa (pendentes de execução humana)

Com `luccafelipe99@gmail.com` (`super_admin` + `admin` legado):

1. Login sem empresa → Painel Global.
2. Selecionar empresa (modo de manutenção) e listar usuários.
3. Operador → Supervisor; Supervisor → Admin da empresa.
4. Bloquear/reativar membro; aprovar usuário; definir ponto focal.
5. Remover vínculo (não pode remover o último owner).
6. Bloquear/restaurar empresa; sair do modo de manutenção.
7. Abrir `/admin/reset` **sem executar**.

Cruzados: admin da empresa A não altera membros da empresa B; supervisor e
operador não alteram cargos; `support_agent`/`developer` veem, mas não alteram.

Após todos passarem, remover o papel legado `admin`, sair/entrar e repetir.
