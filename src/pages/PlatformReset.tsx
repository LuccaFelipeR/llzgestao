import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertTriangle, ShieldAlert, RefreshCw, Trash2, Users, Building2, Info, ListChecks, Lock,
} from "lucide-react";
import { toast } from "sonner";

type AnyRec = Record<string, any>;

const STATUS_MESSAGES: Record<number, string> = {
  401: "Sua sessão expirou. Entre novamente.",
  403: "Esta operação é exclusiva do super administrador da plataforma.",
  400: "Não foi possível concluir a operação. Verifique os bloqueios apresentados.",
  500: "Ocorreu uma falha interna. Nenhum dado foi alterado.",
};

const CLEANUP_CONFIRM = "EXCLUIR SELECIONADAS";

/** Agrupa papéis globais por usuário (evita linhas duplicadas). */
function groupRoles(list: AnyRec[]): AnyRec[] {
  const map = new Map<string, AnyRec>();
  for (const u of list ?? []) {
    const roles: string[] = Array.isArray(u.roles) ? u.roles : u.role ? [u.role] : [];
    const cur = map.get(u.id);
    if (cur) cur.roles = Array.from(new Set([...cur.roles, ...roles]));
    else map.set(u.id, { ...u, roles: Array.from(new Set(roles)) });
  }
  return Array.from(map.values());
}

export default function PlatformReset() {
  const { isPlatformSuperAdmin } = useAuth();
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // --- reset completo ---
  const [preview, setPreview] = useState<AnyRec | null>(null);
  const [result, setResult] = useState<AnyRec | null>(null);
  const [confirm, setConfirm] = useState("");

  // --- limpeza seletiva ---
  const [inventory, setInventory] = useState<AnyRec[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [cleanupPreview, setCleanupPreview] = useState<AnyRec | null>(null);
  const [cleanupConfirm, setCleanupConfirm] = useState("");
  const [cleanupResult, setCleanupResult] = useState<AnyRec | null>(null);

  async function invoke(body: AnyRec): Promise<AnyRec | null> {
    setLoading(true);
    setErrorMsg(null);
    try {
      const { data, error } = await supabase.functions.invoke("admin-reset", { body });
      if (error) {
        console.error("[admin-reset]", body.action, error);
        let status = 0;
        let serverMessage: string | null = null;
        const ctx = (error as any)?.context;
        if (ctx && typeof ctx.status === "number") {
          status = ctx.status;
          try {
            const parsed = await ctx.clone().json();
            if (typeof parsed?.error === "string") serverMessage = parsed.error;
            if (Array.isArray(parsed?.blockers) && parsed.blockers.length > 0) {
              serverMessage = parsed.blockers.join(" ");
            }
          } catch {
            /* corpo não-JSON */
          }
        }
        const msg = STATUS_MESSAGES[status] ?? serverMessage ?? "Não foi possível concluir a operação de manutenção.";
        setErrorMsg(serverMessage && status !== 401 && status !== 403 ? `${msg} ${serverMessage}` : msg);
        toast.error(msg);
        return null;
      }
      return data as AnyRec;
    } catch (e) {
      console.error("[admin-reset] exceção", e);
      setErrorMsg("Ocorreu uma falha interna. Nenhum dado foi alterado.");
      toast.error("Ocorreu uma falha interna. Nenhum dado foi alterado.");
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function loadInventory() {
    const data = await invoke({ action: "inventory" });
    if (data) setInventory(data.companies ?? []);
  }

  useEffect(() => {
    if (isPlatformSuperAdmin) loadInventory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlatformSuperAdmin]);

  // qualquer mudança de seleção invalida o preview e a confirmação
  function updateSelection(next: string[]) {
    setSelected(next);
    setCleanupPreview(null);
    setCleanupConfirm("");
    setCleanupResult(null);
  }

  const filtered = useMemo(() => {
    return (inventory ?? []).filter((c) => {
      const okName = c.name?.toLowerCase().includes(search.trim().toLowerCase());
      const okStatus = statusFilter === "all" || c.status === statusFilter;
      return okName && okStatus;
    });
  }, [inventory, search, statusFilter]);

  // "Selecionar todas" atinge somente as empresas visíveis no filtro atual
  const selectableFiltered = filtered;

  async function runCleanupPreview() {
    if (selected.length === 0) {
      toast.error("Selecione pelo menos uma empresa.");
      return;
    }
    const data = await invoke({ action: "cleanup_preview", company_ids: selected });
    if (data) {
      setCleanupPreview(data);
      setCleanupConfirm("");
      toast.success("Preview da limpeza seletiva gerado.");
    }
  }

  async function runCleanupExecute() {
    const data = await invoke({
      action: "cleanup_execute",
      company_ids: selected,
      confirm: CLEANUP_CONFIRM,
    });
    if (data) {
      setCleanupResult(data);
      setCleanupConfirm("");
      setCleanupPreview(null);
      setSelected([]);
      loadInventory();
      toast.success("Limpeza seletiva executada.");
    }
  }

  async function runFullReset(action: "preview" | "execute") {
    const data = await invoke(action === "execute" ? { action, confirm: "RESET" } : { action });
    if (!data) return;
    if (action === "preview") {
      setPreview(data);
      setResult(null);
      toast.success("Preview gerado.");
    } else {
      setResult(data);
      setConfirm("");
      toast.success("Reset executado.");
    }
  }

  if (!isPlatformSuperAdmin) return null;

  const counts: Record<string, number> = preview?.counts_to_delete ?? {};
  const cleanupCounts: Record<string, number> = cleanupPreview?.counts_to_delete ?? {};
  const cleanupBlockers: string[] = cleanupPreview?.blockers ?? [];
  const cleanupWarnings: string[] = cleanupPreview?.warnings ?? [];
  const confirmOk = cleanupConfirm.trim().toUpperCase() === CLEANUP_CONFIRM;
  const canExecuteCleanup =
    !!cleanupPreview && selected.length > 0 && cleanupBlockers.length === 0 && confirmOk;

  const disabledReason = !cleanupPreview
    ? selected.length === 0
      ? "Selecione pelo menos uma empresa."
      : "Gere o preview da limpeza."
    : selected.length === 0
    ? "Selecione pelo menos uma empresa."
    : cleanupBlockers.length > 0
    ? `Existe${cleanupBlockers.length === 1 ? "" : "m"} ${cleanupBlockers.length} bloqueio${cleanupBlockers.length === 1 ? "" : "s"} de segurança.`
    : !confirmOk
    ? `Digite ${CLEANUP_CONFIRM}.`
    : null;



  return (
    <div className="page-container space-y-5">
      <div>
        <h1 className="page-title flex items-center gap-2">
          <ShieldAlert size={22} className="text-destructive" /> Manutenção e limpeza do ambiente
        </h1>
        <p className="text-sm text-muted-foreground">
          Operações exclusivas do super admin. A limpeza seletiva remove apenas as empresas escolhidas;
          o reset completo remove todas as empresas clientes.
        </p>
      </div>

      {errorMsg && (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2 text-destructive">
              <AlertTriangle size={16} /> Falha na operação
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <p>{errorMsg}</p>
            <Button size="sm" variant="outline" onClick={loadInventory} disabled={loading}>
              <RefreshCw size={14} className="mr-1" /> Tentar novamente
            </Button>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="selective">
        <TabsList>
          <TabsTrigger value="selective" className="gap-1"><ListChecks size={14} /> Limpeza seletiva</TabsTrigger>
          <TabsTrigger value="full" className="gap-1"><ShieldAlert size={14} /> Reset completo</TabsTrigger>
        </TabsList>

        {/* ================= LIMPEZA SELETIVA ================= */}
        <TabsContent value="selective" className="space-y-4 pt-4">
          <Card className="border-primary/40 bg-primary/5">
            <CardContent className="pt-4 space-y-1 text-xs">
              <p className="flex items-start gap-2">
                <Info size={14} className="mt-0.5 text-primary shrink-0" />
                Somente as empresas selecionadas e seus dados vinculados serão removidos.
              </p>
              <p className="flex items-start gap-2">
                <Info size={14} className="mt-0.5 text-primary shrink-0" />
                Usuários com acesso a empresas preservadas continuarão ativos.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Building2 size={16} /> Empresas ({selected.length} selecionada{selected.length === 1 ? "" : "s"})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2 items-center">
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar empresa por nome"
                  className="h-9 max-w-xs"
                />
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os status</SelectItem>
                    <SelectItem value="active">Ativas</SelectItem>
                    <SelectItem value="inactive">Inativas</SelectItem>
                    <SelectItem value="blocked">Bloqueadas</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={loading || selectableFiltered.length === 0}
                  onClick={() => updateSelection(Array.from(new Set([...selected, ...selectableFiltered.map((c) => c.id)])))}
                >
                  Selecionar todas
                </Button>
                <Button size="sm" variant="ghost" disabled={loading || selected.length === 0} onClick={() => updateSelection([])}>
                  Limpar seleção
                </Button>
                <Button size="sm" variant="outline" disabled={loading} onClick={loadInventory}>
                  <RefreshCw size={14} className="mr-1" /> Atualizar lista
                </Button>
              </div>

              <div className="space-y-2 max-h-[26rem] overflow-y-auto">
                {(inventory ?? []).length === 0 && (
                  <p className="text-xs text-muted-foreground">Nenhuma empresa carregada.</p>
                )}
                {filtered.map((c) => {
                  const checked = selected.includes(c.id);
                  return (
                    <div key={c.id} className="rounded-lg border border-border p-3 text-xs">
                      <div className="flex items-start gap-3">
                        <Checkbox
                          checked={checked}
                          disabled={loading}
                          onCheckedChange={(v) =>
                            updateSelection(v ? [...selected, c.id] : selected.filter((id) => id !== c.id))
                          }
                          aria-label={`Selecionar ${c.name}`}
                        />
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium truncate">{c.name}</span>
                            <Badge variant="secondary" className="text-[10px]">{c.status}</Badge>
                            <Badge variant="outline" className="text-[10px]">{c.approval_status}</Badge>
                            <span className="text-muted-foreground">
                              criada em {new Date(c.created_at).toLocaleDateString("pt-BR")}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-5 gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground font-mono">
                            <span>membros: {c.counts.company_members}</span>
                            <span>produtos: {c.counts.products}</span>
                            <span>endereços: {c.counts.addresses}</span>
                            <span>lotes: {c.counts.lots}</span>
                            <span>saldos: {c.counts.stock_balance}</span>
                            <span>movim.: {c.counts.movements}</span>
                            <span>tickets: {c.counts.support_tickets}</span>
                            <span>separações: {c.counts.picking_lists}</span>
                            <span>logs: {c.counts.activity_log}</span>
                            <span className="text-foreground">total: {c.total_linked}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <Button onClick={runCleanupPreview} disabled={loading || selected.length === 0}>
                <RefreshCw size={14} className="mr-1" /> Gerar preview da limpeza
              </Button>
            </CardContent>
          </Card>

          {cleanupPreview && (
            <>
              {cleanupBlockers.length > 0 && (
                <Card className="border-destructive/50">
                  <CardHeader><CardTitle className="text-sm flex items-center gap-2 text-destructive"><AlertTriangle size={16} /> Bloqueios de segurança</CardTitle></CardHeader>
                  <CardContent className="text-xs space-y-1">
                    {cleanupBlockers.map((b) => <p key={b}>• {b}</p>)}
                  </CardContent>
                </Card>
              )}

              {cleanupWarnings.length > 0 && (
                <Card className="border-warning/50">
                  <CardHeader><CardTitle className="text-sm flex items-center gap-2"><AlertTriangle size={16} className="text-warning" /> Avisos (não impedem a limpeza)</CardTitle></CardHeader>
                  <CardContent className="text-xs space-y-1">
                    {cleanupWarnings.map((w) => <p key={w}>• {w}</p>)}
                  </CardContent>
                </Card>
              )}



              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Trash2 size={16} className="text-destructive" /> Empresas a excluir</CardTitle></CardHeader>
                  <CardContent className="space-y-1 text-xs max-h-64 overflow-y-auto">
                    {(cleanupPreview.selected_companies_to_delete ?? []).map((c: AnyRec) => (
                      <div key={c.id} className="flex justify-between gap-2">
                        <span className="truncate">{c.name}</span>
                        <span className="text-muted-foreground text-[10px]">{c.status}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Building2 size={16} className="text-success" /> Empresas preservadas</CardTitle></CardHeader>
                  <CardContent className="space-y-1 text-xs max-h-64 overflow-y-auto">
                    {(cleanupPreview.companies_to_preserve ?? []).map((c: AnyRec) => (
                      <div key={c.id} className="flex justify-between gap-2">
                        <span className="truncate">{c.name}</span>
                        <span className="text-muted-foreground text-[10px]">{c.reason}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Users size={16} className="text-success" /> Usuários preservados</CardTitle></CardHeader>
                  <CardContent className="space-y-1 text-xs max-h-64 overflow-y-auto">
                    {(cleanupPreview.users_to_preserve ?? []).map((u: AnyRec) => (
                      <div key={u.id} className="flex justify-between gap-2">
                        <span className="truncate">{u.full_name || "—"} · {u.email}</span>
                        <span className="text-muted-foreground text-[10px]">{u.reason}</span>
                      </div>
                    ))}
                    {(cleanupPreview.users_to_preserve ?? []).length === 0 && <p className="text-muted-foreground">Nenhum.</p>}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Trash2 size={16} className="text-destructive" /> Contas de acesso a remover</CardTitle></CardHeader>
                  <CardContent className="space-y-1 text-xs max-h-64 overflow-y-auto">
                    {(cleanupPreview.auth_users_to_delete ?? []).map((u: AnyRec) => (
                      <p key={u.id} className="truncate">{u.full_name || "—"} · {u.email}</p>
                    ))}
                    {(cleanupPreview.auth_users_to_delete ?? []).length === 0 && <p className="text-muted-foreground">Nenhuma conta será removida.</p>}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle className="text-sm">Vínculos removidos</CardTitle></CardHeader>
                  <CardContent className="space-y-1 text-xs max-h-64 overflow-y-auto">
                    {(cleanupPreview.memberships_to_delete ?? []).map((m: AnyRec, i: number) => (
                      <p key={`${m.user_id}-${m.company_id}-${i}`} className="truncate">
                        {m.email} · {m.company} · {m.role}
                      </p>
                    ))}
                    {(cleanupPreview.memberships_to_delete ?? []).length === 0 && <p className="text-muted-foreground">Nenhum.</p>}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle className="text-sm">Vínculos mistos (conta preservada)</CardTitle></CardHeader>
                  <CardContent className="space-y-1 text-xs max-h-64 overflow-y-auto">
                    {(cleanupPreview.users_with_mixed_memberships ?? []).map((u: AnyRec) => (
                      <p key={u.id} className="truncate">{u.full_name || "—"} · {u.email}</p>
                    ))}
                    {(cleanupPreview.users_with_mixed_memberships ?? []).length === 0 && <p className="text-muted-foreground">Nenhum.</p>}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle className="text-sm">Usuários órfãos (não removidos)</CardTitle></CardHeader>
                  <CardContent className="space-y-1 text-xs max-h-64 overflow-y-auto">
                    {(cleanupPreview.orphan_users ?? []).map((u: AnyRec) => (
                      <p key={u.id} className="truncate">{u.full_name || "—"} · {u.email}</p>
                    ))}
                    {(cleanupPreview.orphan_users ?? []).length === 0 && <p className="text-muted-foreground">Nenhum.</p>}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle className="text-sm">Vínculos sem cadastro — serão removidos</CardTitle></CardHeader>
                  <CardContent className="space-y-1 text-xs max-h-64 overflow-y-auto">
                    {(cleanupPreview.orphan_memberships_to_delete ?? []).map((m: AnyRec) => (
                      <p key={m.membership_id} className="truncate font-mono text-[11px]">
                        {m.company} · {m.role} · user {m.user_id}
                      </p>
                    ))}
                    {(cleanupPreview.orphan_memberships_to_delete ?? []).length === 0 && <p className="text-muted-foreground">Nenhum.</p>}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle className="text-sm">Vínculos sem cadastro — preservados</CardTitle></CardHeader>
                  <CardContent className="space-y-1 text-xs max-h-64 overflow-y-auto">
                    {(cleanupPreview.orphan_memberships_preserved ?? []).map((m: AnyRec) => (
                      <p key={m.membership_id} className="truncate font-mono text-[11px]">
                        {m.company} · {m.role} · user {m.user_id}
                      </p>
                    ))}
                    {(cleanupPreview.orphan_memberships_preserved ?? []).length === 0 && <p className="text-muted-foreground">Nenhum.</p>}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle className="text-sm">Contas a verificar manualmente</CardTitle></CardHeader>
                  <CardContent className="space-y-1 text-xs max-h-64 overflow-y-auto">
                    {(cleanupPreview.orphan_auth_candidates ?? []).map((u: AnyRec) => (
                      <p key={u.user_id} className="truncate font-mono text-[11px]">{u.user_id}</p>
                    ))}
                    {(cleanupPreview.orphan_auth_candidates ?? []).length === 0 && <p className="text-muted-foreground">Nenhuma.</p>}
                    <p className="text-muted-foreground pt-1">Nunca são removidas automaticamente.</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle className="text-sm">Registros por tabela</CardTitle></CardHeader>
                  <CardContent className="grid grid-cols-2 gap-1 text-xs">
                    {Object.entries(cleanupCounts).map(([k, v]) => (
                      <div key={k} className="flex justify-between border-b border-border/50 py-0.5">
                        <span className="text-muted-foreground">{k}</span><span className="font-mono">{v}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>

              <Card className="border-destructive/50">
                <CardHeader><CardTitle className="text-sm text-destructive flex items-center gap-2"><AlertTriangle size={16} /> Executar limpeza seletiva</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Ação irreversível. Digite <span className="font-mono font-bold">{CLEANUP_CONFIRM}</span> para liberar o botão.
                    Alterar a seleção invalida o preview e exige nova conferência.
                  </p>
                  <div className="max-w-sm">
                    <Label className="text-xs">Confirmação</Label>
                    <Input
                      value={cleanupConfirm}
                      onChange={(e) => setCleanupConfirm(e.target.value)}
                      className="mt-1 h-9"
                      placeholder={CLEANUP_CONFIRM}
                    />
                  </div>
                  <Button variant="destructive" disabled={loading || !canExecuteCleanup} onClick={runCleanupExecute}>
                    <Trash2 size={14} className="mr-1" /> Excluir {selected.length} empresa{selected.length === 1 ? "" : "s"} selecionada{selected.length === 1 ? "" : "s"}
                  </Button>
                </CardContent>
              </Card>
            </>
          )}

          {cleanupResult && (
            <Card>
              <CardHeader><CardTitle className="text-sm">Relatório da limpeza seletiva</CardTitle></CardHeader>
              <CardContent>
                <pre className="text-[10px] overflow-x-auto bg-muted/40 p-3 rounded-lg">{JSON.stringify(cleanupResult, null, 2)}</pre>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ================= RESET COMPLETO ================= */}
        <TabsContent value="full" className="space-y-4 pt-4">
          <Card className="border-destructive/50 bg-destructive/5">
            <CardContent className="pt-4 text-xs flex items-start gap-2">
              <AlertTriangle size={14} className="mt-0.5 text-destructive shrink-0" />
              Todas as empresas clientes e dados operacionais serão removidos. Preserva apenas a equipe LLZ,
              o changelog e a estrutura do banco.
            </CardContent>
          </Card>

          <Button onClick={() => runFullReset("preview")} disabled={loading} variant="outline">
            <RefreshCw size={14} className="mr-1" /> {loading ? "Processando..." : "Gerar preview do reset completo"}
          </Button>

          {preview && (
            <>
              {(preview.blockers ?? []).length > 0 && (
                <Card className="border-destructive/50">
                  <CardHeader><CardTitle className="text-sm flex items-center gap-2 text-destructive"><AlertTriangle size={16} /> Bloqueios de segurança</CardTitle></CardHeader>
                  <CardContent className="text-xs space-y-1">
                    {preview.blockers.map((b: string) => <p key={b}>• {b}</p>)}
                  </CardContent>
                </Card>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Users size={16} className="text-success" /> Usuários globais preservados</CardTitle></CardHeader>
                  <CardContent className="space-y-2 text-xs">
                    {groupRoles(preview.preserved_platform_users ?? []).map((u: AnyRec) => (
                      <div key={u.id} className="flex items-center justify-between gap-2">
                        <span className="truncate">{u.full_name || "—"} · {u.email}</span>
                        <Badge variant="secondary" className="text-[10px]">{u.roles.join(", ")}</Badge>
                      </div>
                    ))}
                    {(preview.preserved_platform_users ?? []).length === 0 && <p className="text-destructive">Nenhum usuário global identificado.</p>}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Trash2 size={16} className="text-destructive" /> Usuários que serão removidos</CardTitle></CardHeader>
                  <CardContent className="space-y-2 text-xs max-h-72 overflow-y-auto">
                    {(preview.users_to_delete ?? []).map((u: AnyRec) => (
                      <div key={u.id}>
                        <p className="truncate">{u.full_name || "—"} · {u.email}</p>
                        <p className="text-muted-foreground text-[10px]">{(u.companies ?? []).join(", ") || "sem empresa"}</p>
                      </div>
                    ))}
                    {(preview.users_to_delete ?? []).length === 0 && <p className="text-muted-foreground">Nenhum usuário cliente.</p>}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Building2 size={16} className="text-destructive" /> Empresas que serão removidas</CardTitle></CardHeader>
                  <CardContent className="space-y-2 text-xs max-h-72 overflow-y-auto">
                    {(preview.companies_to_delete ?? []).map((c: AnyRec) => (
                      <div key={c.id} className="flex items-center justify-between gap-2">
                        <span className="truncate">{c.name}</span>
                        <span className="text-muted-foreground text-[10px]">{c.linked_records} registros</span>
                      </div>
                    ))}
                    {(preview.companies_to_delete ?? []).length === 0 && <p className="text-muted-foreground">Nenhuma empresa.</p>}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle className="text-sm">Registros por tabela</CardTitle></CardHeader>
                  <CardContent className="grid grid-cols-2 gap-1 text-xs">
                    {Object.entries(counts).map(([k, v]) => (
                      <div key={k} className="flex justify-between border-b border-border/50 py-0.5">
                        <span className="text-muted-foreground">{k}</span><span className="font-mono">{v}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>

              <Card className="border-destructive/50">
                <CardHeader><CardTitle className="text-sm text-destructive flex items-center gap-2"><AlertTriangle size={16} /> Executar reset completo</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Ação irreversível. Digite <span className="font-mono font-bold">RESET</span> para liberar o botão.
                    A exclusão de contas de autenticação ocorre em ambiente servidor seguro.
                  </p>
                  <div className="max-w-xs">
                    <Label className="text-xs">Confirmação</Label>
                    <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} className="mt-1 h-9" placeholder="RESET" />
                  </div>
                  <Button
                    variant="destructive"
                    disabled={loading || confirm !== "RESET" || (preview.blockers ?? []).length > 0}
                    onClick={() => runFullReset("execute")}
                  >
                    <Trash2 size={14} className="mr-1" /> Executar reset de ambiente
                  </Button>
                </CardContent>
              </Card>
            </>
          )}

          {result && (
            <Card>
              <CardHeader><CardTitle className="text-sm">Relatório do reset</CardTitle></CardHeader>
              <CardContent>
                <pre className="text-[10px] overflow-x-auto bg-muted/40 p-3 rounded-lg">{JSON.stringify(result, null, 2)}</pre>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
