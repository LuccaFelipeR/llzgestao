import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { friendlyError } from "@/lib/error-messages";
import { Settings, Building2, Tag, CalendarClock, MapPin, PackageCheck, Package, Upload, Save, ChevronLeft, RotateCcw, Lock } from "lucide-react";
import ActivationChecklist from "@/components/ActivationChecklist";
import NoCompanySelected from "@/components/NoCompanySelected";

const SEGMENTS = ["Alimentos", "Bebidas", "Farmácia", "Cosméticos", "Varejo", "Moda", "Peças", "Eletrônicos", "Industrial", "Outros"];

export default function CompanySettings() {
  const { company, currentCompanyId, isCompanyAdmin, isFocalPoint, refetch } = useCompany();
  const navigate = useNavigate();
  const canEdit = isCompanyAdmin || isFocalPoint;

  const [name, setName] = useState("");
  const [segment, setSegment] = useState("");
  const [controlsBatch, setControlsBatch] = useState(true);
  const [controlsExpiration, setControlsExpiration] = useState(true);
  const [handlesPerishables, setHandlesPerishables] = useState(false);
  const [usesAddressing, setUsesAddressing] = useState(true);
  const [usesExpedition, setUsesExpedition] = useState(true);
  const [plansCsv, setPlansCsv] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!company) return;
    setName(company.name || "");
    setSegment(company.segment || "");
    setControlsBatch(company.controls_batch ?? true);
    setControlsExpiration(company.controls_expiration ?? true);
    setHandlesPerishables(company.handles_perishables ?? false);
    setUsesAddressing(company.uses_addressing ?? true);
    setUsesExpedition(company.uses_expedition ?? true);
    setPlansCsv(company.plans_csv_import ?? false);
  }, [company]);

  if (!currentCompanyId) return <NoCompanySelected />;

  async function save() {
    if (!currentCompanyId) return;
    if (!canEdit) {
      toast({ title: "Sem permissão para editar", variant: "destructive" });
      return;
    }
    if (!name.trim()) {
      toast({ title: "Nome é obrigatório", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await (supabase as any).from("companies").update({
      name: name.trim(),
      segment: segment || null,
      controls_batch: controlsBatch,
      controls_expiration: controlsExpiration,
      handles_perishables: handlesPerishables,
      uses_addressing: usesAddressing,
      uses_expedition: usesExpedition,
      plans_csv_import: plansCsv,
    }).eq("id", currentCompanyId);
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: friendlyError(error), variant: "destructive" });
      return;
    }
    toast({ title: "Configurações salvas" });
    await refetch();
  }

  async function restartOnboarding() {
    if (!currentCompanyId || !canEdit) return;
    if (!confirm("Refazer o onboarding? Suas configurações atuais serão mantidas até você concluir novamente.")) return;
    const { error } = await (supabase as any).from("companies").update({
      onboarding_status: "in_progress",
      onboarding_step: 0,
      onboarding_completed: false,
    }).eq("id", currentCompanyId);
    if (error) {
      toast({ title: "Erro", description: friendlyError(error), variant: "destructive" });
      return;
    }
    await refetch();
    navigate("/company-onboarding");
  }

  const status = company?.onboarding_status || "not_started";
  const statusLabel: Record<string, string> = {
    not_started: "Não iniciado",
    in_progress: "Em andamento",
    completed: "Concluído",
    skipped: "Adiado",
  };
  const statusColor: Record<string, string> = {
    not_started: "border-muted-foreground text-muted-foreground",
    in_progress: "border-warning text-warning",
    completed: "border-accent text-accent",
    skipped: "border-muted-foreground text-muted-foreground",
  };

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black flex items-center gap-2">
            <Settings size={24} className="text-primary" /> Configurações da Empresa
          </h1>
          <p className="text-sm text-muted-foreground">Adapte o sistema ao seu jeito de operar.</p>
        </div>
        {!canEdit && (
          <Badge variant="outline" className="gap-1 text-xs">
            <Lock size={12} /> Somente leitura
          </Badge>
        )}
      </div>

      <ActivationChecklist />

      {/* Status */}
      <div className="bg-card border border-border rounded-2xl p-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs text-muted-foreground">Status do onboarding</p>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline" className={statusColor[status]}>{statusLabel[status] || status}</Badge>
            {company?.onboarding_completed_at && (
              <span className="text-xs text-muted-foreground">
                em {new Date(company.onboarding_completed_at).toLocaleDateString("pt-BR")}
              </span>
            )}
          </div>
        </div>
        {canEdit && (
          <Button variant="outline" size="sm" onClick={restartOnboarding} className="gap-1">
            <RotateCcw size={14} /> Refazer onboarding
          </Button>
        )}
      </div>

      {/* Identity */}
      <section className="bg-card border border-border rounded-2xl p-5 space-y-4">
        <h2 className="font-bold text-sm flex items-center gap-2"><Building2 size={16} /> Identidade</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs font-semibold">Nome da Empresa</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit} className="mt-1 h-10 rounded-lg" />
          </div>
          <div>
            <Label className="text-xs font-semibold">Segmento</Label>
            <div className="grid grid-cols-3 gap-1.5 mt-1">
              {SEGMENTS.map((s) => (
                <button key={s} type="button" disabled={!canEdit}
                  onClick={() => setSegment(segment === s ? "" : s)}
                  className={`text-xs py-1.5 rounded-md border transition ${segment === s ? "border-primary bg-primary/10" : "border-border hover:border-primary/30"} ${!canEdit ? "opacity-60 cursor-not-allowed" : ""}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Operational config */}
      <section className="bg-card border border-border rounded-2xl p-5 space-y-3">
        <h2 className="font-bold text-sm flex items-center gap-2"><Settings size={16} /> Controles operacionais</h2>
        <SettingsRow icon={Tag} label="Controlar lote" hint="Destaca lote em cadastros, recebimentos e movimentações." value={controlsBatch} onChange={setControlsBatch} disabled={!canEdit} />
        <SettingsRow icon={CalendarClock} label="Controlar validade" hint="Exibe alertas de vencimento e campos de validade." value={controlsExpiration} onChange={setControlsExpiration} disabled={!canEdit} />
        <SettingsRow icon={Package} label="Trabalha com perecíveis" hint="Ativa regras específicas para produtos perecíveis." value={handlesPerishables} onChange={setHandlesPerishables} disabled={!canEdit} />
        <SettingsRow icon={MapPin} label="Usar endereçamento" hint="Habilita cadastro e uso de endereços de armazenagem." value={usesAddressing} onChange={setUsesAddressing} disabled={!canEdit} />
        <SettingsRow icon={PackageCheck} label="Usar expedição guiada" hint="Ativa listas de picking e conferência." value={usesExpedition} onChange={setUsesExpedition} disabled={!canEdit} />
        <SettingsRow icon={Upload} label="Pretende importar por CSV" hint="Mantém a importação em destaque no checklist." value={plansCsv} onChange={setPlansCsv} disabled={!canEdit} />
      </section>

      {/* Meta */}
      <section className="bg-card border border-border rounded-2xl p-5 space-y-3">
        <h2 className="font-bold text-sm">Informações</h2>
        <div className="grid sm:grid-cols-3 gap-3 text-xs">
          <Meta label="Criada em" value={company?.created_at ? new Date(company.created_at as any).toLocaleDateString("pt-BR") : "—"} />
          <Meta label="Modo de operação" value={company?.operation_mode || "—"} />
          <Meta label="Plano atual" value={company?.plan || "—"} />
        </div>
      </section>

      <div className="flex items-center justify-between pt-2">
        <Button variant="ghost" onClick={() => navigate(-1)} className="gap-1">
          <ChevronLeft size={16} /> Voltar
        </Button>
        {canEdit && (
          <Button onClick={save} disabled={saving} className="gap-1">
            <Save size={16} /> {saving ? "Salvando..." : "Salvar alterações"}
          </Button>
        )}
      </div>
    </div>
  );
}

function SettingsRow({ icon: Icon, label, hint, value, onChange, disabled }: any) {
  return (
    <label className={`flex items-start gap-3 p-3 rounded-xl border border-border ${disabled ? "opacity-70" : "hover:border-primary/30 cursor-pointer"}`}>
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${value ? "bg-primary/15" : "bg-muted"}`}>
        <Icon size={18} className={value ? "text-primary" : "text-muted-foreground"} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">{label}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch checked={value} onCheckedChange={onChange} disabled={disabled} />
    </label>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 rounded-lg bg-secondary/50">
      <p className="text-[10px] uppercase text-muted-foreground tracking-wide">{label}</p>
      <p className="text-sm font-semibold mt-0.5">{value}</p>
    </div>
  );
}
