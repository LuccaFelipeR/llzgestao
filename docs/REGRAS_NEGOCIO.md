# Regras de Negócio — LLZ Gestão de Estoque

## Multi-tenant
- Toda linha operacional carrega `company_id`.
- RLS de leitura/escrita usa `is_member_of(auth.uid(), company_id)`.
- Super admin (`has_role(auth.uid(), 'admin')`) atravessa todas as empresas.

## Empresa (lifecycle)
- Estados: `active`, `trial`, `inactive`, `blocked`.
- `blocked` bloqueia escrita em todas as tabelas via `block_writes_for_blocked_companies`.
- Delete físico proibido se houver produtos, endereços, lotes, movimentos, membros,
  notificações, picking lists ou logs. Use `inactive` ou `blocked`.
- Toda transição de status vira registro em `activity_log`.

## Configuração operacional (Fase 6.10/6.11)
- `controls_batch`, `controls_expiration`, `handles_perishables`,
  `uses_addressing`, `uses_expedition`, `plans_csv_import` moram em `companies`.
- Servem de **default de UX** para novos produtos e de **filtro de navegação**
  (esconde Endereços/Expedição na sidebar quando desativados).
- Apenas `owner`, `admin` ou ponto focal editam (`is_company_admin_of`).
- Cada produto guarda o próprio `controls_batch`, `controls_expiration`,
  `is_perishable`. **Produto ganha da empresa** sempre.

## Produtos
- `sku` é único **por empresa** (`UNIQUE (company_id, sku)`).
- `is_perishable = true` força `controls_expiration = true` (trigger `enforce_perishable_rules`).
- Delete físico bloqueado por trigger se houver estoque, movimentos ou lotes.

## Endereços
- `code` único por empresa.
- Delete físico bloqueado se houver estoque > 0 ou aparecer em qualquer movimento.

## Lotes
- `lot_code` único por `(company_id, product_id)`.
- Validação: `manufacturing_date <= expires_at`.
- Lote vencido ativa status `expired` automaticamente.

## Estoque
- Nunca negativo: `check_stock_before_movement` valida antes; `process_movement`
  atualiza saldos atomicamente.
- Uma linha de saldo por `(product_id, address_id, lot_id)`.

## Movimentações
- Tipos: `IN`, `OUT`, `TRANSFER`.
- **Imutáveis**: sem UPDATE, sem DELETE (RLS + regra).
- `validate_movement_cross_company` impede movimento entre empresas diferentes.

## Expedição (Picking)
- Só aparece se `companies.uses_expedition = true`.
- Estratégia FEFO: sugere o lote com validade mais próxima com saldo suficiente.
- Ao confirmar item, gera movimento `OUT` (respeita todas as regras acima).

## Recebimento
- Se produto exige lote, campo é obrigatório.
- Se produto exige validade, campo é obrigatório.
- Caso contrário os campos são opcionais e o texto de ajuda explica.

## Suporte
- Todo usuário abre chamado da própria empresa.
- Super admin vê e responde tudo; usuário só vê os da sua empresa.
- Fechamento e reabertura são auditados.

## Fase 6.14 — Administração global da plataforma

- Papéis globais (`super_admin`, `platform_admin`, `support_agent`, `developer`) em `user_roles`; papéis de empresa seguem em `company_members`. Ver `docs/PLATFORM_ROLES.md`.
- Equipe LLZ entra sem empresa: painel global em `/admin/global`; telas operacionais exigem seleção explícita de empresa (`RequireCompany`).
- Modo de manutenção com banner e auditoria (`maintenance_mode_entered/exited`).
- Aprovação por EMPRESA: `approval_status` + `approve_company` / `reject_company` (motivo obrigatório, nada é apagado).
- Suporte global para `support_agent`/`platform_admin`; cliente segue restrito à própria empresa e sem notas internas.
- Reset de ambiente: preview + execução via Edge Function `admin-reset` (só `super_admin`). Ver `docs/RESET_AMBIENTE.md`. **Não executado nesta fase.**
