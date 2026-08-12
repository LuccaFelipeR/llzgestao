/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { sb, rpcOk } from "@/lib/db-any";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { friendlyError } from "@/lib/error-messages";
import { useCompanyEntitlements } from "@/hooks/useEntitlements";
import { UsageRow } from "@/components/PlanUsagePanel";
import {
  FEATURE_KEYS,
  FEATURE_LABEL,
  LIMIT_KEYS,
  LIMIT_LABEL,
  UNLIMITED,
  limitLabelValue,
  mergeEntitlements,
  usageList,
  type FeatureKey,
  type LimitKey,
} from "@/lib/entitlements";
import { CreditCard, Save, Trash2 } from "lucide-react";

/**
 * Fase 6.19A — gestão comercial da empresa pela equipe LLZ.
 * Troca de plano e overrides com preview antes de salvar. Nada é apagado.
 */
export default function CompanyPlanManager({ companyId, canManage }: { companyId: string; canManage: boolean }) {
  const qc = useQueryClient();
  const { data: ent, isLoading } = useCompanyEntitlements(companyId);
  const { data: plans } = useQuery({
    queryKey: ["plans-catalog"],
    queryFn: async () => {
      const { data, error } = await sb.from("plans").select("*").order("sort_order");
      if (error) throw error;
      return data as any[];
    },
  });

  const [newPlan, setNewPlan] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [ovLimits, setOvLimits] = useState<Record<string, string>>({});
  const [ovFeatures, setOvFeatures] = useState<Record<string, boolean | undefined>>({});
  const [ovNote, setOvNote] = useState("");
  const [editingOverride, setEditingOverride] = useState(false);

  const usage = usageList(ent);

  const preview = useMemo(() => {
    if (!ent || !newPlan || newPlan === ent.plan?.code) return null;
    const target = (plans ?? []).find((p) => p.code === newPlan);
    if (!target) return null;
    const next = mergeEntitlements(target.limits, target.features, ent.overrides?.limits, ent.overrides?.features);
    return { target, next };
  }, [ent, newPlan, plans]);

  function startOverrideEdit() {
    const l: Record<string, string> = {};
    LIMIT_KEYS.forEach((k) => {
      const v = ent?.overrides?.limits?.[k];
      l[k] = v === undefined || v === null ? "" : String(v);
    });
    const f: Record<string, boolean | undefined> = {};
    FEATURE_KEYS.forEach((k) => { f[k] = ent?.overrides?.features?.[k] as boolean | undefined; });
    setOvLimits(l);
    setOvFeatures(f);
    setOvNote(ent?.overrides?.note ?? "");
    setEditingOverride(true);
  }

  async function applyPlan() {
    if (!preview) return;
    setSaving(true);
    try {
      await rpcOk("plan_set_company_plan", { _company_id: companyId, _plan_code: newPlan });
      toast({ title: "Plano alterado", description: `${ent?.plan?.name} → ${preview.target.name}. Nenhum dado foi removido.` });
      setNewPlan("");
      qc.invalidateQueries({ queryKey: ["entitlements", companyId] });
      qc.invalidateQueries({ queryKey: ["admin-companies"] });
    } catch (e) {
      toast({ title: "Erro ao alterar plano", description: friendlyError(e), variant: "destructive" });
    }
    setSaving(false);
  }

  async function saveOverride() {
    setSaving(true);
    const limits: Record<string, number> = {};
    LIMIT_KEYS.forEach((k) => {
      const raw = (ovLimits[k] ?? "").trim();
      if (raw === "") return;
      const n = Number(raw);
      if (Number.isFinite(n)) limits[k] = Math.trunc(n);
    });
    const features: Record<string, boolean> = {};
    FEATURE_KEYS.forEach((k) => { if (typeof ovFeatures[k] === "boolean") features[k] = ovFeatures[k] as boolean; });
    try {
      await rpcOk("plan_set_company_override", {
        _company_id: companyId, _limits: limits, _features: features, _note: ovNote.trim() || null,
      });
      toast({ title: "Exceção comercial aplicada" });
      setEditingOverride(false);
      qc.invalidateQueries({ queryKey: ["entitlements", companyId] });
    } catch (e) {
      toast({ title: "Erro ao aplicar exceção", description: friendlyError(e), variant: "destructive" });
    }
    setSaving(false);
  }

  async function clearOverride() {
    if (!confirm("Remover todas as exceções comerciais desta empresa? Ela volta aos valores do plano base.")) return;
    setSaving(true);
    try {
      await rpcOk("plan_clear_company_override", { _company_id: companyId });
      toast({ title: "Exceções removidas" });
      setEditingOverride(false);
      qc.invalidateQueries({ queryKey: ["entitlements", companyId] });
    } catch (e) {
      toast({ title: "Erro", description: friendlyError(e), variant: "destructive" });
    }
    setSaving(false);
  }

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando dados comerciais…</p>;
  if (!ent) return <p className="text-sm text-muted-foreground">Dados comerciais indisponíveis para esta empresa.</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm font-bold flex items-center gap-2"><CreditCard size={15} /> Plano e limites</p>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px]">{ent.plan?.name}</Badge>
          {ent.overrides?.has_any && <Badge variant="outline" className="text-[10px] border-primary text-primary">Com exceção comercial</Badge>}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-2">
        {usage.map((u) => <UsageRow key={u.key} u={u} />)}
      </div>

      <div className="grid sm:grid-cols-2 gap-1.5">
        {FEATURE_KEYS.map((f) => (
          <div key={f} className="text-xs p-2 rounded-lg bg-secondary/40 flex items-center justify-between">
            <span>{FEATURE_LABEL[f]}</span>
            <span className={ent.features?.[f] ? "text-accent font-semibold" : "text-muted-foreground"}>
              {ent.features?.[f] ? "Sim" : "Não"}
              {ent.overrides?.features?.[f] !== undefined && ent.overrides?.features?.[f] !== null && " (exceção)"}
            </span>
          </div>
        ))}
      </div>

      {ent.overrides?.note && (
        <p className="text-xs text-muted-foreground">Observação da exceção: {ent.overrides.note}</p>
      )}

      {!canManage && (
        <p className="text-xs text-muted-foreground">Somente super admin / platform admin pode alterar plano ou exceções.</p>
      )}

      {canManage && (
        <>
          {/* Troca de plano com preview */}
          <div className="border border-border rounded-xl p-3 space-y-3">
            <Label className="text-xs font-semibold">Alterar plano</Label>
            <Select value={newPlan} onValueChange={setNewPlan}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione o novo plano" /></SelectTrigger>
              <SelectContent>
                {(plans ?? []).filter((p) => p.is_active).map((p) => (
                  <SelectItem key={p.code} value={p.code} disabled={p.code === ent.plan?.code}>
                    {p.name}{p.code === ent.plan?.code ? " (atual)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {preview && (
              <div className="rounded-lg bg-secondary/40 p-3 space-y-1 text-xs">
                <p className="font-semibold">Pré-visualização</p>
                <p>Plano atual: {ent.plan?.name} → Novo plano: {preview.target.name}</p>
                {LIMIT_KEYS.map((k: LimitKey) => (
                  <p key={k} className="font-mono">
                    {LIMIT_LABEL[k]}: {limitLabelValue(ent.limits?.[k])} → {limitLabelValue(preview.next.limits[k])}
                  </p>
                ))}
                {FEATURE_KEYS.map((f: FeatureKey) => (
                  ent.features?.[f] !== preview.next.features[f] ? (
                    <p key={f}>{FEATURE_LABEL[f]}: {ent.features?.[f] ? "Sim" : "Não"} → {preview.next.features[f] ? "Sim" : "Não"}</p>
                  ) : null
                ))}
                <p className="text-muted-foreground">
                  Nenhum dado é apagado. Se a empresa ficar acima de algum limite, os registros existentes são preservados e apenas novos cadastros ficam bloqueados.
                </p>
                <Button size="sm" className="mt-1 gap-1" disabled={saving} onClick={applyPlan}>
                  <Save size={13} /> Confirmar alteração
                </Button>
              </div>
            )}
          </div>

          {/* Overrides */}
          <div className="border border-border rounded-xl p-3 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs font-semibold">Exceções comerciais desta empresa</Label>
              {!editingOverride && (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={startOverrideEdit}>
                    {ent.overrides?.has_any ? "Editar exceções" : "Aplicar exceção"}
                  </Button>
                  {ent.overrides?.has_any && (
                    <Button size="sm" variant="ghost" className="gap-1 text-destructive" onClick={clearOverride} disabled={saving}>
                      <Trash2 size={13} /> Remover
                    </Button>
                  )}
                </div>
              )}
            </div>

            {editingOverride && (
              <div className="space-y-3">
                <p className="text-[11px] text-muted-foreground">
                  Deixe em branco para herdar o valor do plano. Use -1 para ilimitado.
                </p>
                <div className="grid sm:grid-cols-2 gap-2">
                  {LIMIT_KEYS.map((k) => (
                    <div key={k}>
                      <Label className="text-[11px]">{LIMIT_LABEL[k]} (plano: {limitLabelValue(ent.plan?.limits?.[k] ?? UNLIMITED)})</Label>
                      <Input className="h-9 text-sm mt-1" inputMode="numeric" value={ovLimits[k] ?? ""}
                        placeholder="herdar do plano"
                        onChange={(e) => setOvLimits((s) => ({ ...s, [k]: e.target.value }))} />
                    </div>
                  ))}
                </div>
                <div className="space-y-1.5">
                  {FEATURE_KEYS.map((f) => {
                    const overridden = typeof ovFeatures[f] === "boolean";
                    return (
                      <div key={f} className="flex items-center gap-2 text-xs p-2 rounded-lg border border-border">
                        <span className="flex-1">{FEATURE_LABEL[f]}</span>
                        <span className="text-muted-foreground">
                          {overridden ? (ovFeatures[f] ? "Liberado por exceção" : "Bloqueado por exceção") : `Herdando do plano (${ent.plan?.features?.[f] ? "Sim" : "Não"})`}
                        </span>
                        <Switch checked={!!ovFeatures[f]} onCheckedChange={(v) => setOvFeatures((s) => ({ ...s, [f]: v }))} />
                        {overridden && (
                          <Button size="sm" variant="ghost" className="h-7 text-[11px]"
                            onClick={() => setOvFeatures((s) => ({ ...s, [f]: undefined }))}>herdar</Button>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div>
                  <Label className="text-[11px]">Motivo comercial da exceção</Label>
                  <Textarea className="mt-1 text-sm" rows={2} value={ovNote} onChange={(e) => setOvNote(e.target.value)} />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" className="gap-1" disabled={saving} onClick={saveOverride}><Save size={13} /> Salvar exceção</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingOverride(false)}>Cancelar</Button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
