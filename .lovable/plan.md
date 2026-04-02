## Fase 1 — Fundação

### 1. Multi-Tenant (Banco de Dados)
- Criar tabela `companies` (nome, tipo de negócio, plano, modo operacional)
- Adicionar `company_id` a todas as tabelas existentes (products, addresses, movements, stock_balance, lots, activity_log)
- Vincular profiles a companies via tabela `company_members`
- Atualizar todas as RLS policies para isolar dados por empresa
- Trigger para criar empresa automaticamente no primeiro cadastro

### 2. Onboarding por Tipo de Negócio
- Wizard de setup: nome da empresa, tipo (padaria, loja, distribuidor, armazém, centro logístico)
- Seleção de modo operacional: Essencial / Operações / WMS Avançado
- Adaptar terminologia e módulos visíveis baseado no perfil

### 3. Dashboard Inteligente
- Health Score visual (estoque baixo, parado, vencendo, excesso)
- Painel de exceções (ações urgentes)
- Quick actions contextuais
- KPIs com filtro de data
- Design responsivo mobile-first

### 4. Documentação do Sistema
- Página /docs acessível apenas por admin
- Conteúdo gerado por IA documentando todas as funcionalidades
- Seções: visão geral, módulos, fluxos, regras de negócio, API

### 5. Melhorias de Auth/UX
- Corrigir triggers ausentes no banco
- Tela de perfil com avatar, idioma, tema
- Gestão de sessão