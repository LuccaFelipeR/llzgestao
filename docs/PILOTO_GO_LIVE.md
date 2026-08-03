# Piloto Assistido — Go Live (Fase 6.16)

Documento de preparação da **primeira empresa piloto** da LLZ Gestão de Estoque.

> Classificação atual: **ambiente ajustado; reset de ambiente ainda NÃO executado**
> (ver `RESET_AMBIENTE.md`). O selo "Ambiente preparado para primeiro piloto
> assistido" só pode ser aplicado depois do reset + validação pós-reset.

Nenhuma empresa piloto é criada automaticamente. O piloto começa com um
**cadastro real, feito pelo próprio cliente, com e-mail real**.

## Roteiro do piloto

| # | Etapa | Responsável | Evidência |
|---|---|---|---|
| 1 | Cliente cria a conta em `/login` (nome, empresa, senha + confirmação) | Cliente | Registro em `profiles` |
| 2 | Cliente confirma o e-mail pelo link recebido | Cliente | Login liberado |
| 3 | Empresa fica com `approval_status = pending` | Sistema | `/admin/global` |
| 4 | Equipe LLZ aprova a empresa (`approve_company`) | LLZ | `activity_log` |
| 5 | Criador permanece `owner` ativo e ponto focal | Sistema | `companies.main_focal_user_id` |
| 6 | Cliente conclui o onboarding da empresa | Cliente | `onboarding_status = completed` |
| 7 | Cliente cadastra ou importa produtos | Cliente | Contagem de produtos |
| 8 | Cliente cadastra endereços (se usa endereçamento) | Cliente | Contagem de endereços |
| 9 | Cliente registra a primeira entrada | Cliente | `movements` tipo IN |
| 10 | Cliente consulta o saldo | Cliente | `stock_balance` > 0 |
| 11 | Cliente realiza saída controlada | Cliente | `movements` tipo OUT |
| 12 | Cliente abre um chamado em `/suporte` | Cliente | `support_tickets` |
| 13 | Equipe LLZ responde o chamado | LLZ | Mensagem no ticket |
| 14 | Operação assistida iniciada | Ambos | Registro nesta ficha |

O checklist de ativação da empresa acompanha as etapas 1–12 e pode atingir
**100% com apenas o owner** — não é mais exigido um segundo usuário.

## Checklist técnico do go live

- [ ] **Domínio** — app publicado em domínio definitivo (hoje: `llzgestao.lovable.app`)
- [ ] **Backup** — exportação dos dados antes do início do piloto
- [ ] **Responsável LLZ** — nome, e-mail e telefone do acompanhante
- [ ] **Ponto focal do cliente** — nome, e-mail e telefone
- [ ] **Dados iniciais** — produtos, endereços e saldos de abertura acordados
- [ ] **Modelo CSV** — templates entregues (`/public/templates`)
- [ ] **Treinamento** — sessão de uso (recebimento, expedição, consulta, suporte)
- [ ] **Plano de contingência** — como operar caso o sistema fique indisponível
- [ ] **Exportação** — rotina combinada de extração dos dados do cliente
- [ ] **Suporte** — canal oficial: Central de Suporte (`/suporte`); SLA acordado
- [ ] **Período de acompanhamento** — janela de piloto assistido definida (sugerido: 30 dias)

## Limitações conhecidas no piloto

- E-mails de autenticação usam textos padrão em inglês e remetente padrão
  (`auth.lovable.cloud`) — ainda não há domínio de e-mail próprio.
- Não há cobrança, planos com limites ou notificações reais por WhatsApp.
- Não há e-mail transacional próprio da aplicação.
- Painel global não exibe badge de confirmação de e-mail dos clientes.

**Não classificar o piloto como produção autônoma.** Toda a operação inicial é
acompanhada pela equipe LLZ.

## 6.16.3 — limpeza antes do piloto

Antes do go-live, usar **Limpeza seletiva** (não o reset completo) para remover apenas
as empresas de teste, preservando Lemon Haze Floricultura, Magrao Auto Peças e
Congelados Sartorio e seus usuários. Passo a passo em `docs/RESET_AMBIENTE.md`.
