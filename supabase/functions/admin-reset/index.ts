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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

  try {
    // 1. JWT obrigatório
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "Sua sessão expirou. Entre novamente." }, 401);
    }

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return json({ error: "Sua sessão expirou. Entre novamente." }, 401);
    }
    const caller = userData.user;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // 2. Autorização: apenas super admin (ou papel legado admin)
    const { data: callerRoles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id);
    const isSuper = (callerRoles ?? []).some((r: { role: string }) =>
      ["super_admin", "admin"].includes(r.role)
    );
    if (!isSuper) {
      return json({ error: "Esta operação é exclusiva do super administrador da plataforma." }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const action: string = typeof body?.action === "string" ? body.action : "preview";

    // =====================================================
    // LIMPEZA SELETIVA
    // =====================================================
    if (action === "inventory") {
      const { data, error } = await admin.rpc("platform_cleanup_inventory", { _caller_id: caller.id });
      if (error) {
        console.error("platform_cleanup_inventory error", error);
        return json({ error: "Não foi possível carregar a lista de empresas." }, 400);
      }
      return json({ action: "inventory", ...(data as Record<string, unknown>) });
    }

    if (action === "cleanup_preview" || action === "cleanup_execute") {
      const rawIds: unknown = body?.company_ids;
      if (!Array.isArray(rawIds) || rawIds.length === 0) {
        return json({ error: "Selecione pelo menos uma empresa para a limpeza seletiva." }, 400);
      }
      const ids = [...new Set(rawIds.map(String))];
      if (ids.some((id) => !UUID_RE.test(id))) {
        return json({ error: "Identificador de empresa inválido recebido." }, 400);
      }

      const { data: preview, error: prevErr } = await admin.rpc("platform_cleanup_preview", {
        _caller_id: caller.id,
        _company_ids: ids,
      });
      if (prevErr) {
        console.error("platform_cleanup_preview error", prevErr);
        return json({ error: "Não foi possível gerar o preview da limpeza seletiva." }, 400);
      }

      const blockers: string[] = ((preview as any)?.blockers ?? []) as string[];

      if (action === "cleanup_preview") {
        return json({ action: "cleanup_preview", company_ids: ids, ...(preview as any) });
      }

      // ---- execução seletiva ----
      if (blockers.length > 0) {
        return json({ action: "aborted", blockers, ...(preview as any) }, 400);
      }
      const confirmText = typeof body?.confirm === "string" ? body.confirm.trim().toUpperCase() : "";
      if (confirmText !== "EXCLUIR SELECIONADAS") {
        return json(
          { error: 'Confirmação obrigatória: digite EXCLUIR SELECIONADAS para executar a limpeza.' },
          400,
        );
      }

      const { data: report, error: execErr } = await admin.rpc("platform_cleanup_execute", {
        _caller_id: caller.id,
        _company_ids: ids,
      });
      if (execErr) {
        // log completo server-side (nunca retornado cru ao cliente)
        console.error("platform_cleanup_execute error", {
          code: (execErr as any)?.code,
          message: (execErr as any)?.message,
          details: (execErr as any)?.details,
          hint: (execErr as any)?.hint,
        });

        // A RPC embute um JSON de diagnóstico na mensagem quando falha numa etapa
        let staged: Record<string, unknown> | null = null;
        const raw = String((execErr as any)?.message ?? "");
        const start = raw.indexOf("{");
        const end = raw.lastIndexOf("}");
        if (start >= 0 && end > start) {
          try {
            const parsed = JSON.parse(raw.slice(start, end + 1));
            if (parsed?.cleanup_error) staged = parsed;
          } catch { /* mensagem não estruturada */ }
        }

        if (staged) {
          return json(
            {
              action: "failed",
              error: "Não foi possível concluir a limpeza das empresas selecionadas.",
              stage: staged.stage ?? "desconhecida",
              error_code: staged.error_code ?? null,
              constraint: (execErr as any)?.details ?? null,
              detail:
                typeof staged.message === "string"
                  ? staged.message
                  : "Existe um registro vinculado que precisa ser tratado.",
              data_changed: false,
            },
            400,
          );
        }

        return json(
          {
            action: "failed",
            error: "A limpeza foi rejeitada pelas regras de segurança. Nenhum dado foi alterado.",
            stage: "validacao",
            error_code: (execErr as any)?.code ?? null,
            detail: raw || "Regra de segurança impediu a operação.",
            data_changed: false,
          },
          400,
        );
      }

      const authToDelete = ((report as any)?.auth_users_to_delete ?? []) as any[];
      const deletedAuth: string[] = [];
      const authErrors: { id: string; error: string }[] = [];
      for (const u of authToDelete) {
        const { error } = await admin.auth.admin.deleteUser(u.id);
        if (error) authErrors.push({ id: u.id, error: error.message });
        else deletedAuth.push(u.email ?? u.id);
      }

      return json({
        action: "cleanup_executed",
        complete_success: authErrors.length === 0,
        company_ids: ids,
        db_report: (report as any)?.removed ?? {},
        deleted_auth_users: deletedAuth,
        auth_errors: authErrors,
        warnings: (report as any)?.warnings ?? [],
        // contas apenas suspeitas (vínculo sem cadastro) NUNCA são removidas aqui
        orphan_auth_candidates: (report as any)?.orphan_auth_candidates ?? [],
        note:
          "Somente as empresas selecionadas e seus dados foram removidos. Contas com vínculo em empresas preservadas permanecem ativas. Contas listadas em orphan_auth_candidates precisam de verificação manual.",
      });
    }

    // =====================================================
    // RESET COMPLETO (comportamento existente)
    // =====================================================
    const { data: preview, error: previewErr } = await admin.rpc("platform_reset_preview", {
      _caller_id: caller.id,
    });
    if (previewErr) {
      console.error("platform_reset_preview error", previewErr);
      return json({ error: "Não foi possível gerar o preview do ambiente." }, 400);
    }

    const preserved = (preview as any)?.preserved_platform_users ?? [];
    const usersToDelete = (preview as any)?.users_to_delete ?? [];

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

    if (action !== "execute") {
      return json({ action: "preview", blockers, ...(preview as any) });
    }

    if (blockers.length > 0) {
      return json({ action: "aborted", blockers, ...(preview as any) }, 400);
    }
    if (body?.confirm !== "RESET") {
      return json({ error: 'Confirmação obrigatória: digite RESET para executar.' }, 400);
    }

    const { data: report, error: execErr } = await admin.rpc("platform_reset_execute", {
      _caller_id: caller.id,
    });
    if (execErr) {
      console.error("platform_reset_execute error", execErr);
      return json({ error: "O reset foi rejeitado pelas regras de segurança. Nenhum dado foi alterado.", action: "failed" }, 400);
    }

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
    console.error("admin-reset unexpected error", e);
    return json({ error: "Ocorreu uma falha interna. Nenhum dado foi alterado." }, 500);
  }
});
