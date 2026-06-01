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
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Identify caller and resolve their company
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes } = await userClient.auth.getUser();
    const callerId = userRes?.user?.id;
    if (!callerId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { type, companyId: overrideCompanyId, scope } = await req.json();

    // Check role
    const { data: roleRow } = await admin.from("user_roles").select("role").eq("user_id", callerId).eq("role", "admin").maybeSingle();
    const isSuperAdmin = !!roleRow;

    // Resolve target company
    let companyId: string | null = null;
    let globalView = false;
    if (isSuperAdmin && scope === "global") {
      globalView = true;
    } else if (isSuperAdmin && overrideCompanyId) {
      companyId = overrideCompanyId;
    } else {
      const { data: member } = await admin.from("company_members").select("company_id").eq("user_id", callerId).order("created_at", { ascending: true }).limit(1).maybeSingle();
      companyId = member?.company_id ?? null;
    }

    if (!globalView && !companyId) {
      return new Response(JSON.stringify({ error: "Nenhuma empresa vinculada para análise" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===== Gather data (scoped) =====
    const scoped = (q: any) => globalView ? q : q.eq("company_id", companyId);

    const [productsRes, stockRes, movementsRes, lotsRes, companiesRes] = await Promise.all([
      scoped(admin.from("products").select("id, sku, description, min_stock, price, unit, classification, is_perishable, controls_expiration, category, company_id")).eq("is_active", true),
      scoped(admin.from("stock_balance").select("product_id, address_id, lot_id, qty, last_movement_at, company_id")).gt("qty", 0),
      scoped(admin.from("movements").select("product_id, type, qty, created_at, company_id")).order("created_at", { ascending: false }).limit(800),
      scoped(admin.from("lots").select("id, product_id, lot_code, expires_at, status, company_id")).not("expires_at", "is", null),
      globalView ? admin.from("companies").select("id, name, status, main_focal_user_id, onboarding_completed") : Promise.resolve({ data: [] }),
    ]);

    const products = productsRes.data ?? [];
    const stock = stockRes.data ?? [];
    const movements = movementsRes.data ?? [];
    const lots = lotsRes.data ?? [];
    const companies = (companiesRes as any).data ?? [];

    const totalStock = stock.reduce((s: number, r: any) => s + Number(r.qty), 0);
    const productCount = products.length;
    const recentOuts = movements.filter((m: any) => m.type === "OUT").slice(0, 200);

    const stockByProduct: Record<string, number> = {};
    stock.forEach((s: any) => { stockByProduct[s.product_id] = (stockByProduct[s.product_id] || 0) + Number(s.qty); });

    const critical = products.filter((p: any) => Number(p.min_stock) > 0 && (stockByProduct[p.id] || 0) <= Number(p.min_stock));
    const missingClassification = products.filter((p: any) => !p.classification);
    const possiblyPerishable = products.filter((p: any) =>
      !p.is_perishable && /(leite|iogurte|carne|peixe|frango|queijo|pão|fruta|fresco|congelado|vacina|medicamento|insulina)/i.test(`${p.description} ${p.category ?? ""}`)
    );

    const now = new Date();
    const thirty = new Date(now.getTime() + 30 * 86400000);
    const expiring = lots.filter((l: any) => new Date(l.expires_at) <= thirty && new Date(l.expires_at) >= now);
    const expired = lots.filter((l: any) => new Date(l.expires_at) < now);

    const outsByProduct: Record<string, number> = {};
    recentOuts.forEach((m: any) => { outsByProduct[m.product_id] = (outsByProduct[m.product_id] || 0) + Number(m.qty); });
    const topMovers = Object.entries(outsByProduct).sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([pid, qty]) => { const p = products.find((pr: any) => pr.id === pid); return `${p?.sku ?? "?"} (${p?.description ?? "?"}): ${qty} un`; });

    const stale = new Date(now.getTime() - 30 * 86400000);
    const dead = stock.filter((s: any) => new Date(s.last_movement_at) < stale);

    const globalContext = globalView ? `
[VISÃO GLOBAL - ${companies.length} empresas]
- Empresas sem focal point: ${companies.filter((c: any) => !c.main_focal_user_id).length}
- Empresas com onboarding incompleto: ${companies.filter((c: any) => !c.onboarding_completed).length}
- Empresas bloqueadas: ${companies.filter((c: any) => c.status === "blocked").length}
` : `[EMPRESA: ${companyId}]`;

    const dataContext = `
${globalContext}
DADOS:
- ${productCount} produtos ativos, ${totalStock.toFixed(0)} unidades em estoque
- ${critical.length} produtos com estoque crítico
- ${missingClassification.length} produtos sem classificação
- ${possiblyPerishable.length} produtos potencialmente perecíveis sem marcação
- ${expiring.length} lotes vencendo em 30 dias
- ${expired.length} lotes JÁ vencidos
- ${dead.length} posições paradas há mais de 30 dias
- Top movimentados: ${topMovers.join("; ")}
- Críticos: ${critical.slice(0, 10).map((p: any) => `${p.sku}: ${stockByProduct[p.id] || 0}/${p.min_stock}`).join("; ")}
- Lotes próximos do vencimento: ${expiring.slice(0, 10).map((l: any) => { const p = products.find((pr: any) => pr.id === l.product_id); return `${p?.sku ?? "?"} lote ${l.lot_code} vence ${new Date(l.expires_at).toLocaleDateString("pt-BR")}`; }).join("; ")}
`;

    let systemPrompt = "";
    let userPrompt = "";

    if (type === "overview") {
      systemPrompt = `Você é consultor sênior em WMS para PMEs brasileiras. Responda em markdown, direto e acionável, em pt-BR. Use emojis para categorizar.`;
      userPrompt = `Análise executiva:
1. 📊 Resumo Executivo
2. 🚨 Alertas Críticos
3. 📈 Oportunidades
4. 🔮 Previsão de demanda
5. 💡 Recomendação inovadora
${dataContext}`;
    } else if (type === "restock") {
      systemPrompt = `Você é especialista em compras inteligentes. Gere lista priorizada com qtd sugerida baseada em velocidade de saída (cobertura ideal 30d).`;
      userPrompt = `Gere lista de reabastecimento priorizada:\n${dataContext}`;
    } else if (type === "layout") {
      systemPrompt = `Você é especialista em slotting/layout de armazém. Use análise ABC e movimentação para sugerir reorganização.`;
      userPrompt = `Sugira reorganização de layout:\n${dataContext}`;
    } else if (type === "fefo") {
      systemPrompt = `Você é especialista em FEFO/FIFO e gestão de validade.`;
      userPrompt = `Sugira ordem de saída FEFO para os lotes próximos do vencimento, indique riscos e ações:\n${dataContext}`;
    } else if (type === "dead-stock") {
      systemPrompt = `Você é consultor em capital de giro e estoque parado.`;
      userPrompt = `Analise produtos parados há mais de 30d, sugira liquidação, promoção ou descontinuação:\n${dataContext}`;
    } else if (type === "data-quality") {
      systemPrompt = `Você é auditor de dados mestres em SKU.`;
      userPrompt = `Aponte produtos sem classificação, sem preço, sem mínimo, e produtos que provavelmente são perecíveis mas não estão marcados. Recomende ações:\n${dataContext}`;
    } else if (type === "global-companies" && globalView) {
      systemPrompt = `Você é diretor de operações de um SaaS multi-tenant.`;
      userPrompt = `Analise as empresas: aponte setups incompletos, riscos e oportunidades comerciais:\n${dataContext}`;
    } else {
      return new Response(JSON.stringify({ error: "Tipo de análise inválido" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
        stream: true,
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) return new Response(JSON.stringify({ error: "Limite de requisições excedido." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (status === 402) return new Response(JSON.stringify({ error: "Créditos insuficientes." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`AI gateway error: ${status}`);
    }

    return new Response(response.body, { headers: { ...corsHeaders, "Content-Type": "text/event-stream" } });
  } catch (e) {
    console.error("ai-insights error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
