import { useState, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { FileText, Download, Boxes, Shield, Package, MapPin, ArrowRightLeft, ScanLine, BarChart3, Bell, Upload, Brain, Users, ChevronDown, ChevronRight } from "lucide-react";
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
    title: "1. Visão Geral do Sistema",
    icon: Boxes,
    content: `**LLZ – Gestão de Estoque** é uma plataforma inteligente de gestão de estoque e logística (WIS/WMS) projetada para micro e pequenas empresas, com capacidade de escalar para operações logísticas complexas.

**Arquitetura Técnica:**
- Frontend: React 18 + TypeScript + Tailwind CSS + shadcn/ui
- Backend: Lovable Cloud (PostgreSQL + Auth + Edge Functions)
- Modelo: Multi-tenant com isolamento rigoroso via company_id
- Autenticação: Email/senha com RBAC (Operador, Supervisor, Admin)

**Modos de Operação:**
1. **Essencial** — Controle básico para pequenos negócios (padarias, comércios)
2. **Operações** — Lotes, validades, importação CSV, scanner QR
3. **WMS Avançado** — Endereçamento completo, picking, packing, auditoria operacional

**Modelo Multi-Tenant:**
Cada empresa possui seus dados completamente isolados. Todas as tabelas utilizam company_id como filtro obrigatório via Row Level Security (RLS), garantindo que nenhum dado vaze entre organizações.`
  },
  {
    id: "auth",
    title: "2. Autenticação e Controle de Acesso",
    icon: Shield,
    content: `**Fluxo de Registro e Aprovação:**
1. Usuário se registra com email, senha e nome completo
2. Conta é criada mas permanece **pendente de aprovação**
3. Administrador acessa o Painel Admin e aprova o usuário
4. Após aprovação, o usuário pode acessar o sistema
5. Admin pode bloquear acesso a qualquer momento

**Papéis (RBAC):**
- **Operador** — Acesso básico: movimentações, scanner, consulta de estoque
- **Supervisor** — Acesso intermediário: tudo do operador + relatórios e importação
- **Administrador** — Acesso total: gestão de usuários, auditoria, documentação, configurações

**Controle de Abas:**
O administrador pode bloquear/desbloquear abas específicas por usuário, controlando exatamente quais funcionalidades cada pessoa acessa.

**Equipe LLZ (papéis globais):**
A Equipe LLZ é um tipo de conta (account_type = llz_staff) ativada pelo super administrador; não existem cargos globais adicionais. Toda a equipe entra pelo login normal, com e-mail e senha individuais — não existe atalho de acesso automático.


**Segurança:**
- Todas as tabelas possuem RLS (Row Level Security) ativo
- Dados isolados por empresa via company_id
- Movimentações são imutáveis (sem edição/exclusão)
- Saldo negativo é bloqueado via trigger no banco de dados
- Senhas com mínimo de 6 caracteres`
  },
  {
    id: "products",
    title: "3. Módulo de Produtos",
    icon: Package,
    content: `**Campos do Cadastro:**
| Campo | Tipo | Obrigatório | Exemplo |
|-------|------|-------------|---------|
| SKU | Texto (único) | Sim | PROD-001 |
| Descrição | Texto | Sim | Caixa de Parafusos M8 |
| Código de Barras | Texto | Não | 7891234567890 |
| Unidade | UN/KG/L/M/CX/PC/PAR | Sim | UN |
| Preço | Numérico | Não | 29.90 |
| Estoque Mínimo | Numérico | Não | 10 |

**Funcionalidades:**
- Cadastro manual ou importação em massa via CSV
- Ativar/desativar produto (soft delete — mantém histórico)
- Visualização de estoque por local (multicanal)
- Alerta automático quando estoque atinge o mínimo configurado
- Botão para ver distribuição do produto por endereços

**Regras de Negócio:**
- SKU deve ser único por empresa
- Produto desativado não aparece para novas movimentações
- Preço e estoque mínimo aceitam valores decimais`
  },
  {
    id: "addresses",
    title: "4. Endereçamento WMS",
    icon: MapPin,
    content: `**Formato Clássico do Código:**
P01002003001A = Prefixo(1) + Rua(2) + Posição(3) + Andar(3) + Lado(3) + Face(1)

**Exemplo de Segmentação:**
- P01002003001A → Rua 01, Posição 002, Andar 003, Lado 001, Face A

**Formato Flexível:**
O sistema aceita qualquer código alfanumérico com mínimo 3 caracteres. Exemplos:
- A1-01 (formato simplificado)
- PRATELEIRA-A (texto descritivo)
- P01002003001A (formato WMS clássico)

**Tipos de Endereço:**
- **ARMAZENAGEM** — Locais de estoque (prateleiras, racks, bins, gôndolas)
- **TÉCNICO** — Locais especiais (quarentena, avaria, expedição, doca)

**Validação:**
- Verifica duplicidade antes de salvar
- Ativa/desativa endereço sem excluir (mantém histórico)
- Endereços inativos não aparecem para novas movimentações`
  },
  {
    id: "movements",
    title: "5. Movimentações de Estoque",
    icon: ArrowRightLeft,
    content: `**Tipos de Movimentação:**
1. **Entrada (IN)** — Recebimento de mercadoria → incrementa saldo no endereço de destino
2. **Saída (OUT)** — Expedição/separação → decrementa saldo no endereço de origem
3. **Transferência (TRANSFER)** — Move entre endereços → decrementa origem + incrementa destino

**Regras de Negócio Críticas:**
- **Imutabilidade**: Nenhuma movimentação pode ser editada ou excluída após registro
- **Saldo negativo**: Bloqueado via trigger check_stock_before_movement — o sistema verifica saldo ANTES de permitir a operação
- **Correção de erros**: Para corrigir, registre uma nova movimentação inversa (ex: saída errada → nova entrada)
- **Atomicidade**: Triggers garantem que saldo e movimentação são processados juntos (tudo ou nada)
- **Rastreabilidade**: Cada movimentação registra operador, data/hora, lote, endereço e observação

**Validações Preventivas no Frontend:**
- Quantidade deve ser maior que zero
- Produto deve estar selecionado
- Lote deve ser selecionado ou criado
- Endereço de origem/destino conforme o tipo da movimentação
- Origem e destino não podem ser iguais em transferências`
  },
  {
    id: "scanner",
    title: "6. Scanner de Operações",
    icon: ScanLine,
    content: `**Funcionalidades:**
- Leitura de QR Code e código de barras via câmera do dispositivo
- Entrada manual do código como alternativa
- Busca automática do produto no banco de dados pelo código
- Modal com ações rápidas: Dar Entrada ou Fazer Separação

**Fluxo de Uso:**
1. Acesse a aba Scanner
2. Aponte a câmera para o código de barras/QR Code do produto
3. Sistema identifica o produto automaticamente
4. Selecione a ação desejada (entrada ou saída)
5. Informe lote, quantidade e endereço
6. Confirme a operação

**Compatibilidade:**
- Funciona em smartphones e tablets com câmera
- Suporta formatos: EAN-13, EAN-8, Code128, QR Code
- Modo manual disponível para dispositivos sem câmera`
  },
  {
    id: "dashboard",
    title: "7. Dashboard — Torre de Controle",
    icon: BarChart3,
    content: `**KPIs Principais (Cards):**
- Produtos Ativos — total de produtos cadastrados e ativos
- Endereços Ativos — total de posições de armazenamento
- Total em Estoque — soma de todas as quantidades
- Itens Parados (>30 dias) — produtos sem movimentação recente

**Health Score (Índice de Saúde):**
Indicador visual que combina:
- Risco de estoque baixo (produtos abaixo do mínimo)
- Estoque parado (dead stock sem movimentação)
- Risco de validade (lotes próximos do vencimento)
- Cobertura (% de produtos com estoque)

**Painel de Exceções:**
Lista priorizada de ações urgentes:
- Estoque abaixo do mínimo → requer reposição
- Lotes próximos do vencimento → ação de saída/promoção
- Estoque sem movimentação → avaliar descarte
- Produtos sem saldo → verificar reposição

**Curva ABC:**
Classificação automática dos top produtos por receita:
- A (80%) — Alta rotatividade, posicionar próximo à expedição
- B (80-95%) — Rotatividade média, posição intermediária
- C (95-100%) — Baixa rotatividade, locais menos acessíveis`
  },
  {
    id: "guided",
    title: "8. Recebimento Guiado",
    icon: Package,
    content: `**Fluxo em 5 Etapas:**
1. **Selecionar Produto** — Busca por SKU ou descrição
2. **Informar Lote** — Selecionar existente ou criar novo com validade
3. **Quantidade** — Informar quantidade recebida
4. **Endereço de Destino** — Onde armazenar o produto
5. **Confirmação** — Resumo visual antes de confirmar

**Vantagens:**
- Interface passo-a-passo ideal para operadores iniciantes
- Validação em cada etapa antes de avançar
- Resumo completo antes da confirmação final
- Reduz erros de digitação e operacionais`
  },
  {
    id: "notifications",
    title: "9. Notificações e Alertas",
    icon: Bell,
    content: `**Configurações Disponíveis:**
- Número de WhatsApp — salvo no perfil do usuário
- Alerta de estoque mínimo — notifica quando produto atinge o mínimo
- Resumo diário — sumário das operações do dia

**Alertas Automáticos no Dashboard:**
- Produtos com validade próxima (7, 15, 30 dias)
- Estoque abaixo do mínimo configurado
- Itens parados há mais de 30 dias

**Estrutura para Integrações (futuro):**
- Twilio (SMS/WhatsApp)
- Z-API (WhatsApp Business API)
- Webhooks customizados para ERPs`
  },
  {
    id: "import",
    title: "10. Importação CSV",
    icon: Upload,
    content: `**Funcionalidades:**
- Upload via drag-and-drop ou seleção de arquivo
- Mapeamento automático de colunas (CSV → campos do sistema)
- Preview dos dados antes da importação
- Barra de progresso durante processamento
- Relatório de sucesso/erros ao final

**Campos Mapeáveis:**
SKU, Descrição, Código de Barras, Unidade, Estoque Mínimo, Preço

**Dicas:**
- Use ponto-e-vírgula (;) ou vírgula (,) como separador
- Primeira linha deve conter os cabeçalhos
- Encoding recomendado: UTF-8`
  },
  {
    id: "ai",
    title: "11. Inteligência Artificial",
    icon: Brain,
    content: `**Análises Disponíveis:**
1. **Visão Geral** — Análise de demanda, sugestões de reposição e tendências
2. **Reabastecimento** — Lista priorizada de compras baseada em velocidade de saída
3. **Otimização de Layout** — Sugestões de slotting baseadas na Curva ABC

**Como Funciona:**
- Dados do estoque são processados em tempo real
- IA analisa padrões de movimentação e validade
- Sugestões são geradas automaticamente

**Tecnologia:**
- Powered by Lovable AI Gateway
- Modelos: Google Gemini / OpenAI GPT
- Processamento via Edge Functions`
  },
  {
    id: "admin",
    title: "12. Painel Administrativo",
    icon: Users,
    content: `**Gestão de Usuários:**
- Aprovar/bloquear usuários pendentes
- Atribuir papéis (Operador, Supervisor, Administrador)
- Excluir usuários do sistema
- Controlar acesso por abas (bloquear/desbloquear funcionalidades)

**Log de Atividade:**
- Registro de todas as movimentações com timestamp
- Informações: operador, tipo, quantidade, data/hora
- Audit trail completo para rastreabilidade

**Auditoria Operacional:**
- Score de auditoria automático
- Detecção de: estoque negativo, SKUs duplicados, produtos sem preço, estoque morto

**Métricas do Sistema:**
- Contadores globais (produtos, endereços, lotes, movimentações)
- Posições ocupadas
- Saúde geral do sistema
- Versão da aplicação`
  },
];

export default function Documentation() {
  const { isAdmin } = useAuth();
  const { company } = useCompany();
  const [activeSection, setActiveSection] = useState("overview");
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["overview"]));
  const contentRef = useRef<HTMLDivElement>(null);

  if (!isAdmin) {
    return (
      <div className="page-container text-center py-20">
        <Shield size={48} className="mx-auto text-muted-foreground mb-4" />
        <h1 className="text-xl font-bold">Acesso Restrito</h1>
        <p className="text-sm text-muted-foreground">Esta página é exclusiva para administradores.</p>
      </div>
    );
  }

  function toggleSection(id: string) {
    setActiveSection(id);
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function generatePDF() {
    toast({ title: "Gerando PDF...", description: "Preparando documento da documentação." });

    // Open print dialog with all sections visible
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast({ title: "Erro", description: "Habilite pop-ups para gerar o PDF.", variant: "destructive" });
      return;
    }

    const allContent = SYSTEM_DOCS.map(doc => `
      <div style="page-break-after: always; padding: 20px 0;">
        <h2 style="color: #2563eb; font-size: 20px; border-bottom: 2px solid #2563eb; padding-bottom: 8px; margin-bottom: 16px;">${doc.title}</h2>
        ${renderContentToHTML(doc.content)}
      </div>
    `).join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>LLZ - Documentação do Sistema</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
          body { font-family: 'Inter', sans-serif; color: #1a1a2e; padding: 40px; line-height: 1.6; }
          h1 { font-size: 28px; color: #2563eb; margin-bottom: 8px; }
          h2 { font-size: 20px; color: #2563eb; }
          h3 { font-size: 16px; color: #1a1a2e; margin-top: 16px; }
          p { margin: 8px 0; font-size: 13px; }
          .subtitle { color: #666; font-size: 12px; margin-bottom: 24px; }
          .bold-text { font-weight: 700; }
          .list-item { padding: 4px 0 4px 16px; font-size: 13px; }
          .list-item::before { content: "•"; margin-right: 8px; color: #2563eb; }
          table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 12px; }
          th { background: #f0f4ff; text-align: left; padding: 8px; border: 1px solid #e0e0e0; font-weight: 600; }
          td { padding: 8px; border: 1px solid #e0e0e0; }
          @media print { body { padding: 20px; } }
        </style>
      </head>
      <body>
        <div style="text-align: center; margin-bottom: 40px; padding-bottom: 20px; border-bottom: 3px solid #2563eb;">
          <h1>📦 LLZ – Gestão de Estoque</h1>
          <p class="subtitle">Documentação Completa do Sistema • ${company?.name || "LLZ"}</p>
          <p class="subtitle">Gerado em: ${new Date().toLocaleDateString("pt-BR")} às ${new Date().toLocaleTimeString("pt-BR")}</p>
        </div>
        ${allContent}
        <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #e0e0e0; color: #999; font-size: 11px;">
          LLZ Gestão de Estoque © ${new Date().getFullYear()} • Documento gerado automaticamente
        </div>
      </body>
      </html>
    `);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 500);
  }

  function renderContentToHTML(content: string): string {
    return content.split('\n').map(line => {
      if (line.startsWith('**') && line.endsWith('**')) return `<h3>${line.slice(2, -2)}</h3>`;
      if (line.startsWith('**') && line.includes(':**')) {
        const m = line.match(/^\*\*(.+?)\*\*(.*)$/);
        if (m) return `<p><span class="bold-text">${m[1]}</span>${m[2]}</p>`;
      }
      if (line.startsWith('- **')) {
        const m = line.match(/^- \*\*(.+?)\*\*\s*[—–-]?\s*(.*)$/);
        if (m) return `<div class="list-item"><span class="bold-text">${m[1]}</span> — ${m[2]}</div>`;
      }
      if (line.startsWith('- ')) return `<div class="list-item">${line.slice(2)}</div>`;
      if (line.match(/^\d+\.\s\*\*/)) {
        const m = line.match(/^\d+\.\s\*\*(.+?)\*\*\s*[—–-]?\s*(.*)$/);
        if (m) return `<div class="list-item"><span class="bold-text">${m[1]}</span> — ${m[2]}</div>`;
      }
      if (line.match(/^\d+\.\s/)) return `<div class="list-item">${line}</div>`;
      if (line.startsWith('| ')) {
        const cells = line.split('|').filter(Boolean).map(c => c.trim());
        if (cells.every(c => c.match(/^[-:]+$/))) return '';
        const isHeader = line.includes('---');
        const tag = isHeader ? 'th' : 'td';
        return `<tr>${cells.map(c => `<${tag}>${c}</${tag}>`).join('')}</tr>`;
      }
      if (line.trim() === '') return '';
      return `<p>${line}</p>`;
    }).join('');
  }

  const activeDoc = SYSTEM_DOCS.find((d) => d.id === activeSection);

  function renderContent(content: string) {
    return content.split("\n").map((line, i) => {
      if (line.startsWith("**") && line.endsWith("**")) return <h3 key={i} className="text-base font-bold mt-5 mb-2 text-foreground">{line.slice(2, -2)}</h3>;
      if (line.startsWith("**") && line.includes(":**")) {
        const m = line.match(/^\*\*(.+?)\*\*(.*)$/);
        if (m) return <p key={i} className="text-sm py-0.5"><strong>{m[1]}</strong>{m[2]}</p>;
      }
      if (line.startsWith("| ")) {
        const cells = line.split("|").filter(Boolean).map((c) => c.trim());
        if (cells.every((c) => c.match(/^[-:]+$/))) return null;
        return <div key={i} className="grid grid-cols-4 gap-2 text-xs py-1.5 border-b border-border">{cells.map((c, j) => <span key={j} className={j === 0 ? "font-semibold" : "text-muted-foreground"}>{c}</span>)}</div>;
      }
      if (line.startsWith("- **")) {
        const m = line.match(/^- \*\*(.+?)\*\*\s*[—–-]?\s*(.*)$/);
        if (m) return <div key={i} className="flex gap-2 text-sm py-1 pl-3"><span className="text-primary font-semibold shrink-0">• {m[1]}</span><span className="text-muted-foreground">{m[2]}</span></div>;
      }
      if (line.startsWith("- ")) return <div key={i} className="text-sm text-muted-foreground py-0.5 pl-4">• {line.slice(2)}</div>;
      if (line.match(/^\d+\.\s\*\*/)) {
        const m = line.match(/^\d+\.\s\*\*(.+?)\*\*\s*[—–-]?\s*(.*)$/);
        if (m) return <div key={i} className="text-sm py-1 pl-3"><span className="font-semibold text-primary">{m[1]}</span> <span className="text-muted-foreground">— {m[2]}</span></div>;
      }
      if (line.match(/^\d+\.\s/)) return <div key={i} className="text-sm py-0.5 pl-4">{line}</div>;
      if (line.trim() === "") return <div key={i} className="h-2" />;
      return <p key={i} className="text-sm text-foreground leading-relaxed">{line}</p>;
    });
  }

  return (
    <div className="page-container">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <FileText size={28} className="text-primary" />
          <div>
            <h1 className="page-title mb-0">Documentação do Sistema</h1>
            <p className="text-xs text-muted-foreground">{company?.name || "LLZ"} — Referência técnica e operacional</p>
          </div>
        </div>
        <Button onClick={generatePDF} className="gap-2">
          <Download size={16} /> Exportar PDF
        </Button>
      </div>

      <div className="flex gap-6">
        {/* Sidebar - Desktop */}
        <nav className="hidden lg:flex flex-col w-60 shrink-0 space-y-0.5 sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto">
          {SYSTEM_DOCS.map((doc) => (
            <button
              key={doc.id}
              onClick={() => setActiveSection(doc.id)}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-medium transition-all text-left ${
                activeSection === doc.id
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              <doc.icon size={14} className="shrink-0" />
              <span className="truncate">{doc.title}</span>
            </button>
          ))}
        </nav>

        {/* Content */}
        <div ref={contentRef} className="flex-1 min-w-0">
          {/* Mobile: accordion style */}
          <div className="lg:hidden space-y-2">
            {SYSTEM_DOCS.map((doc) => (
              <div key={doc.id} className="bg-card border border-border rounded-xl overflow-hidden">
                <button
                  onClick={() => toggleSection(doc.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-secondary/50 transition-colors"
                >
                  <doc.icon size={16} className="text-primary shrink-0" />
                  <span className="text-sm font-semibold flex-1">{doc.title}</span>
                  {expandedSections.has(doc.id) ? <ChevronDown size={16} className="text-muted-foreground" /> : <ChevronRight size={16} className="text-muted-foreground" />}
                </button>
                {expandedSections.has(doc.id) && (
                  <div className="px-4 pb-4 border-t border-border/50">
                    <div className="pt-3">{renderContent(doc.content)}</div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Desktop: single content */}
          <motion.div key={activeSection} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="hidden lg:block">
            <div className="bg-card border border-border rounded-xl p-6">
              {activeDoc && (
                <>
                  <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-foreground border-b border-border pb-3">
                    <activeDoc.icon size={22} className="text-primary" />
                    {activeDoc.title}
                  </h2>
                  <div className="space-y-0">{renderContent(activeDoc.content)}</div>
                </>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
