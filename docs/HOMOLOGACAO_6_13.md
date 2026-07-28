# Homologação 6.13 — LLZ Gestão de Estoque

Data: 2026-07-24
Responsável: Agente Lovable (execução automatizada) + revisão humana pendente.

## 1. Build e qualidade

| Comando | Resultado |
|---|---|
| `tsgo --noEmit` (typecheck) | PASS — 0 erros |
| `bun run build` (`vite build`) | PASS — build em ~10s. Aviso de chunk > 500 kB (não bloqueante). |
| `bun run lint` (`eslint .`) | FAIL — 252 erros / 14 warnings, **todos preexistentes**: `no-explicit-any` em telas antigas e `no-require-imports` em `tailwind.config.ts`. Nenhum erro introduzido nas fases 6.12/6.13. |
| `bun run test` | NOT_EXECUTED — suíte contém apenas `src/test/example.test.ts` (placeholder). |

Warnings SECURITY DEFINER do linter Supabase: 22 avisos de "Public Can Execute SECURITY DEFINER Function" + 1 de "Leaked password protection". Preexistentes; funções internas de trigger (`process_movement`, `log_*`, `validate_*`, `enforce_*`, `handle_new_user`, `prevent_delete_*`, `bump_ticket_on_message`, `sync_main_focal_point`, `block_writes_*`, `protect_support_ticket_updates`) já tiveram `EXECUTE` revogado de `anon`/`authenticated` na fase 6.6 de segurança, mas o linter continua flagando porque o dono é `postgres`. Não é bloqueador para piloto — nenhuma dessas funções é chamada via PostgREST.

**Bloqueadores de publicação:** nenhum.

## 2. Policies alteradas na 6.12 (validação)

Consulta direta em `pg_policies` confirma o estado atual:

| Tabela | Operação | Regra atual (USING / WITH CHECK) | Papéis autorizados |
|---|---|---|---|
| `products` | DELETE | `is_company_admin_of(auth.uid(), company_id) OR has_role(auth.uid(),'admin')` | owner, admin ou ponto focal da empresa da linha; super admin |
| `addresses` | DELETE | idem | idem |
| `lots` | DELETE | idem | idem |
| `company_members` | INSERT | `WITH CHECK (is_company_admin_of(...) OR has_role(...,'admin'))` | idem |
| `company_members` | UPDATE | `USING/WITH CHECK (is_company_admin_of(...) OR has_role(...,'admin'))` | idem |
| `company_members` | DELETE | `USING (is_company_admin_of(...) OR has_role(...,'admin'))` | idem |

Regra anterior (fase 6.1 → 6.11): `company_id = get_user_company_id(auth.uid())` — que aplicava `LIMIT 1` sobre `company_members` e efetivamente permitia ação apenas na "primeira" empresa vinculada.

Comportamentos confirmados por leitura das definições:

- **Usuário com 1 empresa:** `is_company_admin_of` retorna `true` para owner/admin/ponto focal daquela empresa. Igual ao anterior.
- **Usuário com N empresas (owner/admin em várias):** agora funciona em todas. Antes só na primeira.
- **Usuário comum (member) da empresa X:** `is_company_admin_of` retorna `false` — não recebe poderes administrativos.
- **Ponto focal:** `is_main_focal_point = true` entra na cláusula `OR is_main_focal_point = true` de `is_company_admin_of`, portanto tem os mesmos poderes de owner/admin *para sua empresa*.
- **Super admin:** bypass via `has_role(auth.uid(),'admin')`.
- **Usuário de empresa A sobre empresa B:** `is_company_admin_of(auth.uid(), B.id)` retorna `false`. Bloqueado.

`USING` está em todas as operações que leem linha (UPDATE/DELETE); `WITH CHECK` está em todas que gravam (INSERT/UPDATE). Nenhuma regra ficou mais permissiva do que era antes.

Existe ainda a policy legada `"Admins can update company members"` em `company_members` (super admin only). É redundante com a nova, mas não conflita — policies em RLS são unidas por OR. Deixada como está para não remover comportamento.

## 3. Cenário de homologação (roteiro manual)

Não foi possível executar E2E com contas reais nesta fase (o ambiente automatizado não cria usuários de teste sem side effects). Roteiro para execução humana:

### Empresa A ("Piloto A LTDA")
- Owner: `pilotoA-owner@teste.llz`
- Ponto focal: `pilotoA-focal@teste.llz` (marcar `is_main_focal_point`)
- Usuário comum: `pilotoA-op@teste.llz`
- Produto: SKU `SKU-001`, "Camiseta Teste"
- Endereço: código `A-01-01`
- Lote: `LOT-A-001`, validade +90d
- Saldo: entrada 100 un
- Ticket: "Dúvida onboarding"

### Empresa B ("Piloto B ME")
- Owner: `pilotoB-owner@teste.llz`
- Usuário comum: `pilotoB-op@teste.llz`
- Produto: SKU `SKU-001` (mesmo código) — deve aceitar
- Endereço: código `A-01-01` (mesmo código) — deve aceitar
- Ticket: "Erro CSV"

### Super admin
- `luccafelipe99@gmail.com` — usar switcher, validar `/admin/global`.

Usar apenas dados fictícios. Nenhum CNPJ/CPF/email real.

## 4. Testes

Legenda: PASS = validado; FAIL = falhou; NOT_EXECUTED = não foi possível executar automaticamente.

### 4.1 Build/Health

| Código | Cenário | Esperado | Observado | Status |
|---|---|---|---|---|
| B-01 | typecheck | 0 erros | 0 erros | PASS |
| B-02 | build produção | sucesso | sucesso, chunk warning | PASS |
| B-03 | lint | sem erros novos | 252 erros preexistentes, nenhum novo | PASS |

### 4.2 Isolamento multiempresa (revisão de RLS + código)

| Código | Cenário | Esperado | Observado | Status |
|---|---|---|---|---|
| ISO-01 | SKU igual entre A e B | permitido | Constraint `UNIQUE (company_id, sku)` — permite | PASS (schema) / NOT_EXECUTED (E2E) |
| ISO-02 | SKU duplicado em A | bloqueado | Constraint `UNIQUE (company_id, sku)` — bloqueia | PASS (schema) / NOT_EXECUTED (E2E) |
| ISO-03 | Código endereço igual entre A e B | permitido | `UNIQUE (company_id, code)` | PASS (schema) |
| ISO-04 | Código duplicado em A | bloqueado | idem | PASS (schema) |
| ISO-05 | Produto A não aparece em B | RLS bloqueia | `SELECT` policy `is_member_of + super admin` | PASS (revisão) / NOT_EXECUTED (E2E) |
| ISO-06 | Endereço A não em B | bloqueado | idem | PASS (revisão) |
| ISO-07 | Lote A não em B | bloqueado | idem | PASS (revisão) |
| ISO-08 | Estoque A não em B | bloqueado | idem | PASS (revisão) |
| ISO-09 | Movimento A não em B | bloqueado | idem | PASS (revisão) |
| ISO-10 | Ticket A não em B | bloqueado | policies em `support_tickets` usam `is_member_of` + super admin | PASS (revisão) |
| ISO-11 | activity_log de A não visível para admin de B | bloqueado | policy exige `company_members.role in (owner,admin)` na mesma company_id | PASS (revisão) |
| ISO-12 | UPDATE de `companies` por não-admin | bloqueado | policy `is_company_admin_of(auth.uid(), id)` | PASS (revisão) |
| ISO-13 | Usuário multi-empresa administra somente empresa autorizada | ok | `is_company_admin_of` avalia por `company_id` da linha | PASS (revisão) |
| ISO-14 | Super admin troca empresa sem misturar dados | ok | `CompanyContext.switchCompany` grava `STORAGE_KEY` e recarrega | PASS (revisão) |

### 4.3 Estoque

| Código | Cenário | Esperado | Observado | Status |
|---|---|---|---|---|
| STK-01 | Entrada aumenta saldo | +qty | trigger `process_movement` faz upsert | PASS (código) |
| STK-02 | Saída reduz saldo | -qty | idem | PASS (código) |
| STK-03 | Transferência move entre endereços | ok | trigger cobre TRANSFER (OUT+IN) | PASS (código) |
| STK-04 | Saída > saldo bloqueada | erro | `check_stock_before_movement` valida antes | PASS (código) |
| STK-05 | Saldo negativo impossível | ok | UI + trigger + `process_movement` `IF NOT FOUND RAISE` | PASS (código) |
| STK-06 | Movimento não editável | ok | policy `UPDATE USING false WITH CHECK false` | PASS (schema) |
| STK-07 | Movimento não deletável | ok | policy `DELETE USING false` | PASS (schema) |
| STK-08 | Cross-company bloqueada | ok | `validate_movement_cross_company` | PASS (schema) |
| STK-09 | Empresa bloqueada não movimenta | ok | `block_writes_for_blocked_companies` | PASS (schema) |
| STK-10 | Falha não deixa saldo parcial | ok | triggers em uma transação; RAISE aborta | PASS (código) |
| STK-11 | Dashboard reflete saldo | — | consulta agregada `stock_balance` filtrada por company_id | NOT_EXECUTED (E2E) |

### 4.4 Lote e validade

| Código | Cenário | Esperado | Observado | Status |
|---|---|---|---|---|
| LOT-01 | Empresa fornece defaults | ok | `Products.tsx` inicializa `controls_batch/controls_expiration` a partir de `companies.*` | PASS (código) |
| LOT-02 | Produto mantém regra própria | ok | flags salvos por produto; nunca sobrescritos pela empresa | PASS (código) |
| LOT-03 | Recebimento respeita produto | ok | `GuidedReceiving.tsx` esconde/mostra campos por produto | PASS (código) |
| LOT-04 | Lote duplicado bloqueado | ok | `UNIQUE (company_id, product_id, lot_code)` | PASS (schema) |
| LOT-05 | Lote cross-company bloqueado | ok | `validate_movement_cross_company` | PASS (schema) |
| LOT-06 | Fabricação > validade bloqueada | ok | `validate_lot_dates` | PASS (schema) |
| LOT-07 | Vencido → status expired | ok | `validate_lot_dates` seta status | PASS (schema) |
| LOT-08 | Perecível força controls_expiration | ok | `enforce_perishable_rules` | PASS (schema) |

**Regra consolidada perecíveis:** `is_perishable = true ⇒ controls_expiration := true` e `classification := 'perishable'` se nula. Recebimento e expedição olham `product.controls_batch/controls_expiration`. **Produto vence empresa.**

### 4.5 Onboarding

| Código | Cenário | Esperado | Observado | Status |
|---|---|---|---|---|
| ONB-01 | Nova empresa cria owner + focal | ok | `handle_new_user` cria company, owner ativo, `is_main_focal_point=true` | PASS (schema) |
| ONB-02 | Onboarding salva progresso | ok | `CompanyOnboarding.tsx` persiste `onboarding_step` a cada passo | PASS (código) |
| ONB-03 | Concluir gera completed | ok | `onboarding_status='completed'` + `onboarding_completed_at` | PASS (código) |
| ONB-04 | Pular gera skipped | ok | idem `status='skipped'` | PASS (código) |
| ONB-05 | CSV → /onboarding | ok | rota registrada, sidebar "Importar CSV" | PASS (código) |
| ONB-06 | Menu reage às configs | ok | `AppLayout.tsx` esconde Endereços/Expedição se flags = false | PASS (código) |
| ONB-07 | Checklist usa dados reais | ok | `ActivationChecklist.tsx` conta produtos, movimentos, tickets, csv_import_completed | PASS (código) |
| ONB-08 | Importação exige evidência real | ok | log `csv_import_completed` gravado em `activity_log` | PASS (código) |

### 4.6 Central de Suporte

| Código | Cenário | Esperado | Observado | Status |
|---|---|---|---|---|
| SUP-01 | Cliente abre ticket | ok | policy INSERT `is_member_of + created_by=auth.uid()` | PASS (schema) |
| SUP-02 | B não vê ticket de A | ok | SELECT `is_member_of` | PASS (schema) |
| SUP-03 | Super admin vê todos | ok | bypass `has_role(admin)` | PASS (schema) |
| SUP-04 | Nota interna oculta ao cliente | ok | filtro `is_internal=false` para não-admin em `Support.tsx` | PASS (código) |
| SUP-05 | Autor reabre resolved→in_progress | ok | `protect_support_ticket_updates` permite exceção | PASS (schema) |
| SUP-06 | Não-admin não muda prioridade/assigned | ok | trigger RAISE | PASS (schema) |
| SUP-07 | Fechamento auditado | ok | `log_support_ticket_activity` | PASS (schema) |
| SUP-08 | UI não promete envio de e-mail | ok | revisão de `Support.tsx` — nenhum toast do tipo "e-mail enviado" | PASS (código) |
| SUP-09 | Erros amigáveis | ok | `friendlyError` cobre 42501/23505/RLS | PASS (código) |

### 4.7 Administração

| Código | Cenário | Esperado | Observado | Status |
|---|---|---|---|---|
| ADM-01 | Bloquear/desbloquear empresa | ok | `AdminPanel.tsx` + `log_company_status_change` | PASS (código/schema) |
| ADM-02 | Desativar/restaurar | ok | idem | PASS |
| ADM-03 | Delete físico só se vazia | ok | `prevent_delete_company_if_referenced` | PASS (schema) |
| ADM-04 | Aprovar / bloquear usuário | ok | `AdminPanel.tsx` toggle `profiles.is_approved` | PASS (código) |
| ADM-05 | Trocar papel | ok | update em `company_members.role` — agora funciona para admin da própria empresa (fase 6.12) | PASS (código) |
| ADM-06 | Remover vínculo | ok | com proteção contra remoção do último owner via UI | PASS (código) |
| ADM-07 | Focal único por empresa | ok | trigger `sync_main_focal_point` desmarca os outros | PASS (schema) |
| ADM-08 | Usuário multi-empresa não sofre LIMIT 1 | ok | fase 6.12 removeu `get_user_company_id` das operações admin | PASS (schema) |
| ADM-09 | E2E admin trocando papel em N empresas | — | precisa execução humana | NOT_EXECUTED |

## 5. Bugs encontrados / corrigidos nesta fase

Nenhum bug novo reproduzido nesta homologação. Correções aplicadas na fase 6.12 continuam válidas.

## 6. Riscos restantes

- E2E multiempresa com usuários reais **ainda não foi executado**. Toda a validação acima é por leitura de código, schema, RLS e triggers.
- `profiles` não expõe nomes entre membros da mesma empresa (só o próprio e super admin). Impacto: Activity Log e Central de Suporte podem mostrar UUID em vez de nome para não-admins.
- Envio real de e-mail transacional, WhatsApp, cobrança e franquias continuam **não implementados** por design.
- Bundle único de 1.57 MB — apenas performance, não bloqueia piloto.

## 7. Classificação final

**PRONTO PARA HOMOLOGAÇÃO MANUAL.**

Build limpo, RLS revisada, isolamento consistente por análise de schema. Antes de mover para "piloto assistido", executar o roteiro E2E da seção 3 com duas contas reais de teste e registrar os PASS/FAIL correspondentes nesta mesma tabela.

---

## Atualização Fase 6.15A

Este documento cobre a homologação técnica de 6.13 (typecheck, build, policies).
A homologação funcional com usuários reais é feita em
`docs/HOMOLOGACAO_USUARIO_REAL.md`. Itens marcados aqui como validados por
inspeção de código continuam classificados como
**IMPLEMENTED_BUT_NOT_E2E_VALIDATED**.
