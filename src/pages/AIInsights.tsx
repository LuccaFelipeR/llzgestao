import { useState } from "react";
import { Sparkles, BarChart3, ShoppingCart, MapPin, Loader2, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";

type InsightType = "overview" | "restock" | "layout";

const INSIGHTS: { type: InsightType; label: string; desc: string; icon: any; color: string }[] = [
  { type: "overview", label: "Análise Geral", desc: "Resumo executivo, alertas e previsões", icon: BarChart3, color: "from-primary to-primary/70" },
  { type: "restock", label: "Lista de Compras IA", desc: "Reabastecimento inteligente por prioridade", icon: ShoppingCart, color: "from-accent to-accent/70" },
  { type: "layout", label: "Otimizar Layout", desc: "Reorganização de armazém por movimentação", icon: MapPin, color: "from-success to-success/70" },
];

export default function AIInsights() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");
  const [activeType, setActiveType] = useState<InsightType | null>(null);

  async function runInsight(type: InsightType) {
    setLoading(true);
    setActiveType(type);
    setResult("");

    try {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-insights`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ type }),
        }
      );

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Erro desconhecido" }));
        if (resp.status === 429) toast({ title: "Limite excedido", description: "Aguarde alguns segundos e tente novamente.", variant: "destructive" });
        else if (resp.status === 402) toast({ title: "Créditos insuficientes", description: "Adicione créditos ao workspace.", variant: "destructive" });
        else toast({ title: "Erro", description: err.error, variant: "destructive" });
        setLoading(false);
        return;
      }

      const reader = resp.body?.getReader();
      if (!reader) throw new Error("No reader");
      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              fullText += content;
              setResult(fullText);
            }
          } catch {
            buffer = line + "\n" + buffer;
            break;
          }
        }
      }
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
    setLoading(false);
  }

  return (
    <div className="page-container">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
            <Sparkles size={20} className="text-primary-foreground" />
          </div>
          <div>
            <h1 className="page-title mb-0">IA Insights</h1>
            <p className="text-xs text-muted-foreground">Inteligência artificial aplicada ao seu estoque</p>
          </div>
        </div>
      </motion.div>

      {/* Insight Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6 mb-6">
        {INSIGHTS.map((insight, i) => (
          <motion.button
            key={insight.type}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            onClick={() => runInsight(insight.type)}
            disabled={loading}
            className={`group relative overflow-hidden rounded-2xl border-2 p-5 text-left transition-all ${
              activeType === insight.type
                ? "border-primary bg-primary/5 shadow-lg"
                : "border-border hover:border-primary/30 hover:shadow-md bg-card"
            } disabled:opacity-60`}
          >
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${insight.color} flex items-center justify-center mb-3 group-hover:scale-110 transition-transform`}>
              <insight.icon size={20} className="text-primary-foreground" />
            </div>
            <h3 className="font-bold text-sm text-foreground">{insight.label}</h3>
            <p className="text-xs text-muted-foreground mt-1">{insight.desc}</p>
            {loading && activeType === insight.type && (
              <div className="absolute top-3 right-3">
                <Loader2 size={16} className="animate-spin text-primary" />
              </div>
            )}
          </motion.button>
        ))}
      </div>

      {/* Result */}
      <AnimatePresence>
        {(result || loading) && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="glass-card p-6"
          >
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                <Bot size={16} className="text-primary-foreground" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-foreground">Análise da IA</h3>
                <p className="text-[10px] text-muted-foreground">Baseado nos dados reais do seu estoque</p>
              </div>
              {loading && <Loader2 size={14} className="animate-spin text-primary ml-auto" />}
            </div>
            <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed">
              {result.split("\n").map((line, i) => {
                if (line.startsWith("# ")) return <h2 key={i} className="text-lg font-bold text-foreground mt-4 mb-2">{line.slice(2)}</h2>;
                if (line.startsWith("## ")) return <h3 key={i} className="text-base font-bold text-foreground mt-3 mb-1">{line.slice(3)}</h3>;
                if (line.startsWith("### ")) return <h4 key={i} className="text-sm font-bold text-foreground mt-2 mb-1">{line.slice(4)}</h4>;
                if (line.startsWith("**") && line.endsWith("**")) return <p key={i} className="font-bold text-foreground mt-2">{line.slice(2, -2)}</p>;
                if (line.startsWith("- ") || line.startsWith("* ")) return <li key={i} className="ml-4 text-foreground/90">{renderBold(line.slice(2))}</li>;
                if (line.trim() === "") return <br key={i} />;
                return <p key={i} className="text-foreground/90">{renderBold(line)}</p>;
              })}
              {loading && <span className="inline-block w-2 h-4 bg-primary/60 animate-pulse ml-0.5" />}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!result && !loading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="text-center py-16"
        >
          <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-primary/10 to-accent/10 flex items-center justify-center mx-auto mb-4">
            <Sparkles size={28} className="text-primary" />
          </div>
          <h3 className="font-bold text-foreground mb-1">Selecione uma análise</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            A IA vai analisar seus dados reais de estoque e gerar insights personalizados em tempo real.
          </p>
        </motion.div>
      )}
    </div>
  );
}

function renderBold(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}
