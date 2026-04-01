import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { type } = await req.json();

    // Gather data for analysis
    const [productsRes, stockRes, movementsRes, lotsRes] = await Promise.all([
      supabase.from("products").select("id, sku, description, min_stock, price, unit").eq("is_active", true),
      supabase.from("stock_balance").select("product_id, address_id, lot_id, qty, last_movement_at, addresses(code, type)").gt("qty", 0),
      supabase.from("movements").select("product_id, type, qty, created_at").order("created_at", { ascending: false }).limit(500),
      supabase.from("lots").select("id, product_id, lot_code, expires_at").not("expires_at", "is", null),
    ]);

    const products = productsRes.data ?? [];
    const stock = stockRes.data ?? [];
    const movements = movementsRes.data ?? [];
    const lots = lotsRes.data ?? [];

    // Build context summary
    const totalStock = stock.reduce((s: number, r: any) => s + Number(r.qty), 0);
    const productCount = products.length;
    const recentOuts = movements.filter((m: any) => m.type === "OUT").slice(0, 100);
    
    // Stock by product
    const stockByProduct: Record<string, number> = {};
    stock.forEach((s: any) => {
      stockByProduct[s.product_id] = (stockByProduct[s.product_id] || 0) + Number(s.qty);
    });

    // Critical stock
    const critical = products.filter(p => {
      const current = stockByProduct[p.id] || 0;
      return Number(p.min_stock) > 0 && current <= Number(p.min_stock);
    });

    // Expiring lots
    const now = new Date();
    const thirtyDays = new Date(now.getTime() + 30 * 86400000);
    const expiring = lots.filter((l: any) => new Date(l.expires_at) <= thirtyDays && new Date(l.expires_at) >= now);

    // Movement velocity
    const outsByProduct: Record<string, number> = {};
    recentOuts.forEach((m: any) => {
      outsByProduct[m.product_id] = (outsByProduct[m.product_id] || 0) + Number(m.qty);
    });

    const topMovers = Object.entries(outsByProduct)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([pid, qty]) => {
        const p = products.find(pr => pr.id === pid);
        return `${p?.sku || "?"} (${p?.description || "?"}): ${qty} un saídas`;
      });

    const staleDate = new Date(now.getTime() - 30 * 86400000);
    const staleItems = stock.filter((s: any) => new Date(s.last_movement_at) < staleDate);

    const dataContext = `
DADOS DO ESTOQUE:
- ${productCount} produtos ativos, ${totalStock} unidades totais em estoque
- ${critical.length} produtos com estoque crítico (abaixo do mínimo)
- ${expiring.length} lotes vencendo nos próximos 30 dias
- ${staleItems.length} posições paradas há mais de 30 dias
- Top 5 produtos mais movimentados: ${topMovers.join("; ")}
- Produtos críticos: ${critical.map(p => `${p.sku}: ${stockByProduct[p.id] || 0}/${p.min_stock} un`).join("; ")}
- Lotes próximos ao vencimento: ${expiring.map((l: any) => {
  const p = products.find(pr => pr.id === l.product_id);
  return `${p?.sku || "?"} lote ${l.lot_code} vence em ${new Date(l.expires_at).toLocaleDateString("pt-BR")}`;
}).join("; ")}
`;

    let systemPrompt = "";
    let userPrompt = "";

    if (type === "overview") {
      systemPrompt = `Você é um consultor especialista em logística e gestão de estoque (WMS/WIS) para micro e pequenas empresas brasileiras. Analise os dados e forneça insights acionáveis em português. Seja direto, use emojis para categorizar. Responda em formato markdown com seções claras.`;
      userPrompt = `Analise estes dados do estoque e forneça:
1. 📊 **Resumo Executivo** (2-3 frases)
2. 🚨 **Alertas Críticos** (ações imediatas necessárias)
3. 📈 **Oportunidades de Otimização** (onde melhorar)
4. 🔮 **Previsão de Demanda** (baseado nas tendências de saída)
5. 💡 **Recomendação Inovadora** (algo que o gestor pode não ter pensado)

${dataContext}`;
    } else if (type === "restock") {
      systemPrompt = `Você é um assistente de compras inteligente para estoque. Gere uma lista de reabastecimento priorizada com quantidades sugeridas baseadas na velocidade de saída.`;
      userPrompt = `Com base nos dados abaixo, gere uma lista de reabastecimento inteligente:
- Priorize por urgência (crítico > baixo > normal)
- Sugira quantidades baseadas na velocidade de saída (dias de cobertura ideal: 30 dias)
- Indique fornecedores potenciais quando aplicável
- Estime custo total se preços disponíveis

${dataContext}`;
    } else if (type === "layout") {
      systemPrompt = `Você é um especialista em layout de armazém e slotting optimization. Analise os dados de movimentação e sugira reorganização de endereços para maximizar eficiência.`;
      userPrompt = `Analise a movimentação de produtos e sugira:
1. **Reorganização ABC**: quais produtos devem ficar mais próximos da expedição
2. **Otimização de picking**: agrupamentos sugeridos
3. **Endereços subutilizados**: posições paradas que podem ser liberadas
4. **Estimativa de ganho**: tempo/distância que pode ser economizado

${dataContext}`;
    } else {
      throw new Error("Tipo de análise inválido");
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns segundos." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (status === 402) return new Response(JSON.stringify({ error: "Créditos insuficientes. Adicione créditos ao workspace." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`AI gateway error: ${status}`);
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("ai-insights error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
