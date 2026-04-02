import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { FileText, RefreshCw, Boxes, Shield, Package, MapPin, ArrowRightLeft, ScanLine, BarChart3, Bell, Upload, Brain, Users } from "lucide-react";
import { motion } from "framer-motion";

interface DocSection {
  id: string;
  title: string;
  icon: any;
  content: string;
}

const SYSTEM_DOCS: DocSection[] = [
  {
    id: "overview",
    title: "Visão Geral",
    icon: Boxes,
    content: `## LLZ – Gestão de Estoque

O **LLZ** é uma plataforma inteligente de gestão de estoque e logística (WIS/WMS) projetada para micro e pequenas empresas, com capacidade de escalar para operações logísticas complexas.

### Arquitetura
- **Frontend**: React 18 + TypeScript + Tailwind CSS + shadcn/ui
- **Backend**: Supabase (PostgreSQL + Auth + Edge Functions)
- **Multi-tenant**: Cada empresa possui dados isolados via \`company_id\` e RLS policies
- **Autenticação**: Email/senha com RBAC (Operador, Supervisor, Admin)

### Modos de Operação
1. **Essencial**: Controle básico para pequenos negócios
2. **Operações**: Lotes, validades, importação, scanner
3. **WMS Avançado**: Endereçamento completo, picking, packing, auditoria`
  },
  {
    id: "auth",
    title: "Autenticação e RBAC",
    icon: Shield,
    content: `## Sistema de Autenticação

### Fluxo de Acesso
1. Usuário se registra com email, senha e nome
2. Conta é criada mas fica **pendente de aprovação**
3. Administrador aprova o usuário no painel admin
4. Após aprovação, o usuário pode acessar o sistema

### Papéis (Roles)
- **Operador**: Acesso básico (movimentações, scanner, estoque)
- **Supervisor**: Acesso intermediário + relatórios
- **Admin**: Acesso total + painel administrativo + gestão de usuários

### Super Admin
O email \`luccafelipe99@gmail.com\` é auto-aprovado e recebe role \`admin\` automaticamente.

### Segurança
- Todas as tabelas possuem **RLS (Row Level Security)** ativo
- Dados são isolados por empresa via \`company_id\`
- Movimentações são **imutáveis** (sem edição/exclusão)
- Saldo negativo é **bloqueado** via trigger no banco`
  },
  {
    id: "products",
    title: "Produtos",
    icon: Package,
    content: `## Módulo de Produtos

### Campos
| Campo | Tipo | Obrigatório |
|-------|------|-------------|
| SKU | Texto | Sim |
| Descrição | Texto | Sim |
| Código de Barras | Texto | Não |
| Unidade | UN/KG/L/M/CX/PC/PAR | Sim |
| Preço | Numérico | Não |
| Estoque Mínimo | Numérico | Não |

### Funcionalidades
- Cadastro manual ou importação via CSV
- Ativar/desativar produto (soft delete)
- Visualização de estoque por local (multicanal)
- Alerta quando estoque atinge o mínimo configurado`
  },
  {
    id: "addresses",
    title: "Endereçamento WMS",
    icon: MapPin,
    content: `## Estrutura de Endereços

### Formato do Código
\`P01002003001A\` = Prefixo + Rua(2) + Posição(3) + Andar(3) + Lado(3) + Face(1)

### Exemplo
- \`P01002003001A\` → Rua 01, Posição 002, Andar 003, Lado 001, Face A

### Tipos
- **ARMAZENAGEM**: Locais de estoque (prateleiras, racks, bins)
- **TÉCNICO**: Locais especiais (quarentena, avaria, expedição)

### Validação
O sistema valida automaticamente o formato do código e segmenta os campos para consulta.`
  },
  {
    id: "movements",
    title: "Movimentações",
    icon: ArrowRightLeft,
    content: `## Movimentações de Estoque

### Tipos
1. **Entrada (IN)**: Recebimento de mercadoria → incrementa saldo no destino
2. **Saída (OUT)**: Expedição/separação → decrementa saldo na origem
3. **Transferência (TRANSFER)**: Move entre endereços → decrementa origem, incrementa destino

### Regras de Negócio
- **Imutabilidade**: Nenhuma movimentação pode ser editada ou excluída
- **Saldo negativo**: Bloqueado via trigger \`check_stock_before_movement\`
- **Correção**: Para corrigir erros, registre uma nova movimentação inversa
- **Atomicidade**: Triggers garantem que saldo e movimentação são processados juntos
- **Rastreabilidade**: Cada movimentação registra operador, data, lote e observação`
  },
  {
    id: "scanner",
    title: "Scanner",
    icon: ScanLine,
    content: `## Scanner de Operações

### Funcionalidades
- Leitura de QR Code e código de barras via câmera do dispositivo
- Entrada manual do código como alternativa
- Busca automática do produto no banco de dados
- Modal com ações rápidas: **Dar Entrada** ou **Fazer Separação**

### Fluxo
1. Aponte a câmera para o código
2. Sistema identifica o produto
3. Selecione a ação (entrada/saída)
4. Informe lote, quantidade e endereço
5. Confirme a operação`
  },
  {
    id: "dashboard",
    title: "Dashboard / Torre de Controle",
    icon: BarChart3,
    content: `## Dashboard Inteligente

### KPIs Principais
- Produtos Ativos
- Endereços Ativos
- Total em Estoque
- Itens Parados (>30 dias)

### Health Score
Índice visual de saúde do estoque combinando:
- Risco de estoque baixo
- Estoque parado (dead stock)
- Risco de validade
- Cobertura de produtos

### Painel de Exceções
Ações urgentes que precisam de atenção imediata:
- Estoque abaixo do mínimo
- Lotes próximos do vencimento
- Estoque sem movimentação
- Produtos sem saldo

### Curva ABC
Top produtos por receita (saídas × preço):
- **A** (80%): Devem ficar próximos à expedição
- **B** (80-95%): Posição intermediária
- **C** (95-100%): Podem ficar em locais menos acessíveis`
  },
  {
    id: "notifications",
    title: "Notificações",
    icon: Bell,
    content: `## Configurações de Notificação

### Opções
- **WhatsApp**: Número salvo no perfil do usuário
- **Alerta de estoque mínimo**: Notifica quando produto atinge o mínimo
- **Resumo diário**: Sumário das operações do dia

### Estrutura
O sistema possui a base preparada para integração com:
- Twilio (SMS/WhatsApp)
- Z-API (WhatsApp Business)
- Webhooks customizados`
  },
  {
    id: "onboarding",
    title: "Importação CSV",
    icon: Upload,
    content: `## Importação em Massa

### Funcionalidades
- Upload via drag-and-drop
- Mapeamento de colunas (CSV → campos do sistema)
- Preview antes da importação
- Barra de progresso
- Relatório de sucesso/erros

### Campos Mapeáveis
SKU, Descrição, Código de Barras, Unidade, Estoque Mínimo, Preço`
  },
  {
    id: "ai",
    title: "IA Insights",
    icon: Brain,
    content: `## Inteligência Artificial

### Análises Disponíveis
1. **Visão Geral**: Análise de demanda, sugestões de reposição, tendências
2. **Reabastecimento**: Lista priorizada de compras baseada em velocidade de saída
3. **Layout**: Otimização de slotting baseada na Curva ABC

### Tecnologia
- Powered by Lovable AI Gateway
- Modelos: Google Gemini / OpenAI GPT
- Processamento via Edge Functions`
  },
  {
    id: "admin",
    title: "Painel Administrativo",
    icon: Users,
    content: `## Painel do Administrador

### Gestão de Usuários
- Aprovar/bloquear usuários
- Atribuir papéis (Operador, Supervisor, Admin)
- Visualizar informações de cadastro

### Log de Atividade
- Registro de todas as movimentações
- Operador, tipo, quantidade, data/hora
- Audit trail completo

### Métricas do Sistema
- Contadores globais (produtos, endereços, lotes, movimentações)
- Posições ocupadas
- Saúde do sistema`
  },
];

export default function Documentation() {
  const { isAdmin } = useAuth();
  const { company } = useCompany();
  const [activeSection, setActiveSection] = useState("overview");

  if (!isAdmin) {
    return (
      <div className="page-container text-center py-20">
        <Shield size={48} className="mx-auto text-muted-foreground mb-4" />
        <h1 className="text-xl font-bold">Acesso Restrito</h1>
        <p className="text-sm text-muted-foreground">Esta página é exclusiva para administradores.</p>
      </div>
    );
  }

  const activeDoc = SYSTEM_DOCS.find((d) => d.id === activeSection);

  return (
    <div className="page-container">
      <div className="flex items-center gap-3 mb-6">
        <FileText size={28} className="text-primary" />
        <div>
          <h1 className="page-title mb-0">Documentação do Sistema</h1>
          <p className="text-xs text-muted-foreground">{company?.name || "LLZ"} — Referência técnica e operacional</p>
        </div>
      </div>

      <div className="flex gap-6">
        {/* Sidebar */}
        <nav className="hidden md:flex flex-col w-56 shrink-0 space-y-0.5">
          {SYSTEM_DOCS.map((doc) => (
            <button
              key={doc.id}
              onClick={() => setActiveSection(doc.id)}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left ${
                activeSection === doc.id
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              <doc.icon size={16} />
              {doc.title}
            </button>
          ))}
        </nav>

        {/* Mobile select */}
        <div className="md:hidden w-full mb-4">
          <select
            value={activeSection}
            onChange={(e) => setActiveSection(e.target.value)}
            className="w-full p-2 rounded-xl border border-border bg-card text-sm"
          >
            {SYSTEM_DOCS.map((doc) => (
              <option key={doc.id} value={doc.id}>{doc.title}</option>
            ))}
          </select>
        </div>

        {/* Content */}
        <motion.div key={activeSection} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex-1 min-w-0">
          <div className="bg-card border border-border rounded-xl p-6">
            <div className="prose prose-sm dark:prose-invert max-w-none">
              {activeDoc?.content.split("\n").map((line, i) => {
                if (line.startsWith("## ")) return <h2 key={i} className="text-xl font-bold mt-0 mb-3 flex items-center gap-2"><activeDoc.icon size={20} className="text-primary" />{line.slice(3)}</h2>;
                if (line.startsWith("### ")) return <h3 key={i} className="text-base font-semibold mt-4 mb-2">{line.slice(4)}</h3>;
                if (line.startsWith("| ")) {
                  const cells = line.split("|").filter(Boolean).map((c) => c.trim());
                  if (cells.every((c) => c.match(/^-+$/))) return null;
                  return <div key={i} className="grid grid-cols-3 gap-2 text-xs py-1 border-b border-border">{cells.map((c, j) => <span key={j} className={i === 0 ? "font-semibold" : ""}>{c}</span>)}</div>;
                }
                if (line.startsWith("- **")) {
                  const match = line.match(/^- \*\*(.+?)\*\*:?\s*(.*)$/);
                  if (match) return <div key={i} className="flex gap-2 text-sm py-1"><span className="font-semibold shrink-0">• {match[1]}:</span><span className="text-muted-foreground">{match[2]}</span></div>;
                }
                if (line.startsWith("- ")) return <div key={i} className="text-sm text-muted-foreground py-0.5 pl-3">• {line.slice(2)}</div>;
                if (line.startsWith("1. ") || line.startsWith("2. ") || line.startsWith("3. ")) {
                  return <div key={i} className="text-sm py-0.5 pl-3">{line}</div>;
                }
                if (line.trim() === "") return <div key={i} className="h-2" />;
                if (line.startsWith("`") && line.endsWith("`")) return <code key={i} className="bg-muted px-2 py-0.5 rounded text-xs font-mono">{line.slice(1, -1)}</code>;
                return <p key={i} className="text-sm text-foreground leading-relaxed">{line}</p>;
              })}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
