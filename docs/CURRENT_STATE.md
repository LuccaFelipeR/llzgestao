# Estado Atual — LLZ Gestão de Estoque

_Atualizado na Fase 6.15A (consolidação do estado real antes da homologação)._
Roteiro de homologação: `HOMOLOGACAO_USUARIO_REAL.md`. Histórico: `HOMOLOGACAO_6_13.md`.

> **Implementado ≠ homologado.** Um módulo só sai de
> `IMPLEMENTED_BUT_NOT_E2E_VALIDATED` depois de teste humano registrado.

## CONFIRMED_IMPLEMENTED

| Módulo | Observação |
|---|---|
| Multi-tenant + RLS | `is_member_of` + super admin em todas as tabelas operacionais. |
| Produtos / Endereços / Lotes | Delete físico bloqueado quando há histórico; unicidade por empresa. |
| Movimentações | Imutáveis (UPDATE/DELETE bloqueados por RLS). |
| Estoque | Saldo transacional por trigger; negativo bloqueado na UI e no banco. |
| Recebimento guiado | Respeita `controls_batch`, `controls_expiration` e `is_perishable` **do produto**. |
| Expedição guiada (picking FEFO) | Visível apenas se `companies.uses_expedition = true`. |
| Endereçamento | Menu escondido se `companies.uses_addressing = false`. |
| Onboarding da empresa | Multi-etapas, salva parcial, gera consequências reais na UI. |
| Checklist de ativação | Usa evidências reais (contagens, `activity_log`, tickets). |
| Configurações da Empresa | Editável apenas por owner / admin / ponto focal. |
| Central de Suporte | UI completa: tickets, mensagens, notas internas, auditoria. |
| Administração global | `/admin/global`, papéis globais, `RequireCompany`. |
| Modo de manutenção | Banner persistente + auditoria de entrada/saída. |
| Aprovação por empresa | `approval_status` + `approve_company` / `reject_company`. |
| CSV Import | Templates públicos em `/public/templates`. |
| AI Insights | Escopo por empresa e global; markdown com `react-markdown`. |
| Dashboards | Operacional + global. |
| Auditoria | `activity_log` alimentado por triggers. |
| Menu global (6.15A) | Equipe LLZ sem empresa vê apenas módulos globais. |
| Estados de e-mail (6.15A) | Confirmação de e-mail e aprovação tratadas separadamente. |

## IMPLEMENTED_BUT_NOT_E2E_VALIDATED

- Isolamento multiempresa com duas empresas e usuários reais.
- Aprovação/rejeição de empresa ponta a ponta.
- Gestão de membros e papéis pelo AdminPanel.
- Aba "Equipe LLZ" (papéis globais) separada dos usuários de empresa.
- Importação CSV com arquivos reais de cliente.
- Expedição guiada FEFO em operação real.
- Modo de manutenção com empresa de cliente real.
- Reset de ambiente (mecanismo validado apenas por preview).

## NOT_IMPLEMENTED

- Envio real de e-mail transacional da aplicação.
- Template de e-mail de autenticação personalizado em pt-BR.
- Cobrança / limites de plano aplicados.
- Franquias com hierarquia matriz→filial (ver `ROADMAP.md`).
- Notificações WhatsApp reais (só UI e agendamento).
- Badge de confirmação de e-mail no painel global (exige Edge Function).

## KNOWN_RISKS

- E-mails de auth ainda em inglês e com remetente padrão da plataforma.
- `profiles` sem leitura cruzada entre membros comuns (nomes vazios em logs).
- ~252 erros de lint preexistentes (`no-explicit-any`).
- Reset nunca executado; exige checklist prévio (`RESET_AMBIENTE.md`).
- Nenhuma classificação de "pronto para produção" foi emitida.

## Hierarquia de regras de controle

**Configurações da Empresa = padrão de UX. Produto = fonte da verdade.**

- Novos produtos herdam `controls_batch` / `controls_expiration` da empresa.
- O usuário pode alterar em qualquer produto.
- Recebimento, expedição e alertas sempre olham para o produto.
- Alterar as configurações da empresa **nunca reescreve** produtos existentes.

## RLS e permissões atuais

- `companies` UPDATE: apenas `owner`, `admin` ou ponto focal (`is_company_admin_of`).
- `companies` SELECT: qualquer membro ativo + equipe LLZ.
- Tabelas operacionais: `is_member_of(auth.uid(), company_id)` + super admin.
- `movements`: UPDATE e DELETE bloqueados (`USING false`).
- `products`, `addresses`, `lots`: DELETE só para owner/admin e bloqueado por
  trigger quando há histórico.
- Nenhuma policy foi alterada ou enfraquecida na Fase 6.15A.
