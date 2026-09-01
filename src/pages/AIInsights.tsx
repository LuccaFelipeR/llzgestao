import { useState } from "react";
import { Sparkles, BarChart3, ShoppingCart, MapPin, Loader2, Bot, CalendarClock, Skull, ShieldCheck, Building2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ReactMarkdown from "react-markdown";
import { FeatureLockedCard } from "@/components/FeatureLocked";
import { useEntitlements } from "@/hooks/useEntitlements";
import remarkGfm from "remark-gfm";

type InsightType = "overview" | "restock" | "layout" | "fefo" | "dead-stock" | "data-quality" | "global-companies";

const INSIGHTS: { type: InsightType; label: string; desc: string; icon: any; color: string; superOnly?: boolean }[] = [
  { type: "overview", label: "Análise Geral", desc: "Resumo executivo e previsões", icon: BarChart3, color: "from-primary to-primary/70" },
  { type: "restock", label: "Lista de Compras IA", desc: "Reabastecimento priorizado", icon: ShoppingCart, color: "from-accent to-accent/70" },
  { type: "layout", label: "Otimizar Layout", desc: "Slotting por ABC e movimentação", icon: MapPin, color: "from-success to-success/70" },
  { type: "fefo", label: "Sugestões FEFO", desc: "Ordem de saída por validade", icon: CalendarClock, color: "from-accent to-primary" },
  { type: "dead-stock", label: "Estoque Parado", desc: "Liquide capital de giro", icon: Skull, color: "from-destructive to-destructive/70" },
  { type: "data-quality", label: "Qualidade de Dados", desc: "Classificação, preço, perecíveis", icon: ShieldCheck, color: "from-primary to-accent" },
  { type: "global-companies", label: "Visão Global", desc: "Empresas com setup incompleto", icon: Building2, color: "from-primary to-success", superOnly: true },
];

export default function AIInsights() {
  const { isSuperAdmin, currentCompanyId, availableCompanies } = useCompany();
  const { entitlements, can } = useEntitlements();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");
  const [activeType, setActiveType] = useState<InsightType | null>(null);
  const [scope, setScope] = useState<string>("current"); // "current" | "global" | companyId

  async function runInsight(type: InsightType) {
    setLoading(true); setActiveType(type); setResult("");
    try {
      // Use user JWT so the edge function can resolve company isolation
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const body: any = { type };
      // "global-companies" is only valid in global scope
      const effectiveScope = type === "global-companies" ? "global" : scope;
      if (isSuperAdmin) {
        if (effectiveScope === "global") body.scope = "global";
        else if (effectiveScope !== "current") body.companyId = effectiveScope;
        else if (currentCompanyId) body.companyId = currentCompanyId;
      } else if (currentCompanyId) {
        // Fase 6.21: a empresa analisada é sempre a selecionada no contexto.
        // O backend revalida a membership antes de aceitar.
        body.companyId = currentCompanyId;
      }


      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-insights`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Erro desconhecido" }));
        if (resp.status === 429) toast({ title: "Limite excedido", description: "Aguarde alguns segundos.", variant: "destructive" });
        else if (resp.status === 402) toast({ title: "Créditos insuficientes", description: "Adicione créditos.", variant: "destructive" });
        else toast({ title: "Erro", description: err.error, variant: "destructive" });
        setLoading(false); return;
      }

      const reader = resp.body?.getReader(); if (!reader) throw new Error("No reader");
      const decoder = new TextDecoder(); let buffer = ""; let fullText = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, nl); buffer = buffer.slice(nl + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) { fullText += content; setResult(fullText); }
          } catch { buffer = line + "\n" + buffer; break; }
        }
      }
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
    setLoading(false);
  }

  const visibleInsights = INSIGHTS.filter((i) => !i.superOnly || isSuperAdmin);

  // Fase 6.19A — recurso comercial: liberado pelo plano ou para a equipe LLZ.
  if (currentCompanyId && entitlements && !can("ai_insights") && !isSuperAdmin) {
    return (
      <div className="page-container">
        <FeatureLockedCard feature="ai_insights" planName={entitlements.plan?.name} />
      </div>
    );
  }

  return (
    <div className="page-container">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <Sparkles size={20} className="text-primary-foreground" />
            </div>
            <div>
              <h1 className="page-title mb-0">IA Insights</h1>
              <p className="text-xs text-muted-foreground">
                {isSuperAdmin && scope === "global"
                  ? "⚠ Visão global — dados de TODAS as empresas"
                  : "Análise isolada por empresa"}
              </p>
            </div>
          </div>
          {isSuperAdmin && (
            <Select value={scope} onValueChange={setScope}>
              <SelectTrigger className="w-[200px] h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="current">Empresa atual ({currentCompanyId?.slice(0, 6)})</SelectItem>
                <SelectItem value="global">★ Visão Global</SelectItem>
                {availableCompanies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </motion.div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-6 mb-6">
        {visibleInsights.map((insight, i) => (
          <motion.button
            key={insight.type}
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            onClick={() => runInsight(insight.type)}
            disabled={loading}
            className={`group relative overflow-hidden rounded-2xl border-2 p-4 text-left transition-all ${
              activeType === insight.type ? "border-primary bg-primary/5 shadow-lg" : "border-border hover:border-primary/30 hover:shadow-md bg-card"
            } disabled:opacity-60`}
          >
            <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${insight.color} flex items-center justify-center mb-2 group-hover:scale-110 transition-transform`}>
              <insight.icon size={18} className="text-primary-foreground" />
            </div>
            <h3 className="font-bold text-sm text-foreground">{insight.label}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{insight.desc}</p>
            {loading && activeType === insight.type && (
              <div className="absolute top-3 right-3"><Loader2 size={16} className="animate-spin text-primary" /></div>
            )}
          </motion.button>
        ))}
      </div>

      <AnimatePresence>
        {(result || loading) && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="glass-card p-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                <Bot size={16} className="text-primary-foreground" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-foreground">Análise da IA</h3>
                <p className="text-[10px] text-muted-foreground">Dados reais isolados por empresa</p>
              </div>
              {loading && <Loader2 size={14} className="animate-spin text-primary ml-auto" />}
            </div>
            <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed prose-headings:text-foreground prose-strong:text-foreground prose-p:text-foreground/90 prose-li:text-foreground/90 prose-table:text-xs prose-th:text-foreground prose-td:text-foreground/90">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{result || ""}</ReactMarkdown>
              {loading && <span className="inline-block w-2 h-4 bg-primary/60 animate-pulse ml-0.5" />}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!result && !loading && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="text-center py-16">
          <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-primary/10 to-accent/10 flex items-center justify-center mx-auto mb-4">
            <Sparkles size={28} className="text-primary" />
          </div>
          <h3 className="font-bold text-foreground mb-1">Selecione uma análise</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">A IA vai analisar os dados da empresa atual e gerar insights em tempo real.</p>
        </motion.div>
      )}
    </div>
  );
}

