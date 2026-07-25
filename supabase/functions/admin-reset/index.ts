import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Não autenticado" }, 401);

    // 1. Valida o usuário autenticado
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Sessão inválida" }, 401);
    const caller = userData.user;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // 2. Só super admin da plataforma
    const { data: callerRoles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id);
    const isSuper = (callerRoles ?? []).some((r: { role: string }) =>
      ["super_admin", "admin"].includes(r.role)
    );
    if (!isSuper) return json({ error: "Apenas o super admin pode executar esta operação" }, 403);

    const body = await req.json().catch(() => ({}));
    const action = body?.action === "execute" ? "execute" : "preview";

    // 3. PREVIEW (sempre calculado, mesmo no execute)
    const { data: preview, error: previewErr } = await admin.rpc("platform_reset_preview");
    if (previewErr) return json({ error: previewErr.message }, 400);

    const preserved = (preview as any)?.preserved_platform_users ?? [];
    const usersToDelete = (preview as any)?.users_to_delete ?? [];

    // 4. Travas de segurança
    const blockers: string[] = [];
    if (!preserved.some((u: any) => ["super_admin", "admin"].includes(u.role))) {
      blockers.push("Nenhum super admin válido identificado — reset abortado.");
    }
    if (usersToDelete.some((u: any) => u.id === caller.id)) {
      blockers.push("O usuário atual está na lista de exclusão — reset abortado.");
    }
    if (!preserved.some((u: any) => u.id === caller.id)) {
      blockers.push("O usuário atual não possui papel global preservado — reset abortado.");
    }

    if (action === "preview") {
      return json({ action: "preview", blockers, ...(preview as any) });
    }

    if (blockers.length > 0) {
      return json({ action: "aborted", blockers, ...(preview as any) }, 400);
    }
    if (body?.confirm !== "RESET") {
      return json({ error: 'Confirmação obrigatória: envie confirm: "RESET"' }, 400);
    }

    // 5. Execução: dados do banco em transação controlada (função admin)
    const { data: report, error: execErr } = await admin.rpc("platform_reset_execute");
    if (execErr) return json({ error: execErr.message, action: "failed" }, 400);

    // 6. Remoção dos usuários Auth clientes + revogação de sessões
    const deletedAuth: string[] = [];
    const authErrors: { id: string; error: string }[] = [];
    for (const u of usersToDelete) {
      if (preserved.some((p: any) => p.id === u.id)) continue;
      const { error } = await admin.auth.admin.deleteUser(u.id);
      if (error) authErrors.push({ id: u.id, error: error.message });
      else deletedAuth.push(u.email ?? u.id);
    }

    return json({
      action: "executed",
      preserved_platform_users: preserved,
      deleted_auth_users: deletedAuth,
      auth_errors: authErrors,
      db_report: report,
      note:
        "Tokens já emitidos podem permanecer válidos até expirar; as contas removidas não conseguem mais ler nem gravar dados.",
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
