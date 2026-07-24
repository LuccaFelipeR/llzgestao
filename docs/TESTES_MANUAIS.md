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
