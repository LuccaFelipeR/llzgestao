import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import {
  Building2, Store, Truck, Warehouse, Package, Layers, Zap, Settings,
  ChevronRight, ChevronLeft, CheckCircle2, Boxes, CalendarClock, Tag,
  MapPin, PackageCheck, Upload, Users, Sparkles,
} from "lucide-react";
import { friendlyError } from "@/lib/error-messages";

const BUSINESS_TYPES = [
  { value: "bakery", label: "Padaria / Alimentação", icon: Store, desc: "Produtos perecíveis, controle de validade" },
  { value: "retail", label: "Loja / Varejo", icon: Package, desc: "SKUs variados, multicanal" },
  { value: "distributor", label: "Distribuidor", icon: Truck, desc: "Alto volume, rotas de entrega" },
  { value: "warehouse", label: "Armazém", icon: Warehouse, desc: "Endereçamento, picking, packing" },
  { value: "logistics_center", label: "Centro Logístico", icon: Layers, desc: "Operação completa, WMS avançado" },
  { value: "other", label: "Outro", icon: Building2, desc: "Personalizar conforme necessidade" },
];

const OPERATION_MODES = [
  { value: "essential", label: "Essencial", icon: Zap, desc: "Controle básico. Ideal para começar.", features: ["Produtos", "Entrada/Saída", "Estoque"] },
  { value: "operations", label: "Operações", icon: Settings, desc: "Negócios estruturados que precisam de mais controle.", features: ["+ Lotes/Validade", "+ CSV", "+ Scanner"] },
  { value: "wms", label: "WMS Avançado", icon: Warehouse, desc: "Operação logística completa.", features: ["+ Endereçamento", "+ Picking", "+ IA Insights"] },
];

const SEGMENTS = ["Alimentos", "Bebidas", "Farmácia", "Cosméticos", "Varejo", "Moda", "Peças", "Eletrônicos", "Industrial", "Outros"];
const SIZES = [
  { value: "micro", label: "Até 100 SKUs" },
  { value: "small", label: "100 – 1.000 SKUs" },
  { value: "medium", label: "1.000 – 10.000 SKUs" },
  { value: "large", label: "10.000+ SKUs" },
];
const USERS_ESTIMATE = [
  { value: "1", label: "Apenas eu" },
  { value: "2-5", label: "2 a 5 pessoas" },
  { value: "6-20", label: "6 a 20 pessoas" },
  { value: "20+", label: "Mais de 20" },
];

export default function CompanyOnboarding() {
  const { company, companyId, refetch } = useCompany();
  const navigate = useNavigate();
  const [step, setStep] = useState(company?.onboarding_step ?? 0);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState(company?.name || "");
  const [businessType, setBusinessType] = useState(company?.business_type || "");
  const [operationMode, setOperationMode] = useState(company?.operation_mode || "");
  const [segment, setSegment] = useState(company?.segment || "");
  const [size, setSize] = useState(company?.estimated_size || "");
  const [users, setUsers] = useState(company?.estimated_users || "");

  // Operational configs (default to what's in company, or sensible defaults)
  const [controlsBatch, setControlsBatch] = useState(company?.controls_batch ?? true);
  const [controlsExpiration, setControlsExpiration] = useState(company?.controls_expiration ?? true);
  const [handlesPerishables, setHandlesPerishables] = useState(company?.handles_perishables ?? false);
  const [usesAddressing, setUsesAddressing] = useState(company?.uses_addressing ?? true);
  const [usesExpedition, setUsesExpedition] = useState(company?.uses_expedition ?? true);
  const [plansCsv, setPlansCsv] = useState(company?.plans_csv_import ?? false);

  // Adaptive defaults when business type / mode change
  useEffect(() => {
    if (businessType === "bakery") {
      setHandlesPerishables(true);
      setControlsExpiration(true);
      setControlsBatch(true);
    }
    if (businessType === "warehouse" || businessType === "logistics_center") {
      setUsesAddressing(true);
      setUsesExpedition(true);
    }
  }, [businessType]);

  useEffect(() => {
    if (operationMode === "essential") {
      setUsesAddressing(false);
      setUsesExpedition(false);
    }
    if (operationMode === "wms") {
      setUsesAddressing(true);
      setUsesExpedition(true);
    }
  }, [operationMode]);

  async function persist(patch: any, opts: { advance?: boolean; finish?: boolean } = {}) {
    if (!companyId) return false;
    setSaving(true);
    const payload: any = {
      ...patch,
      onboarding_status: opts.finish ? "completed" : "in_progress",
      onboarding_step: opts.advance ? step + 1 : step,
    };
    if (opts.finish) {
      payload.onboarding_completed = true;
      payload.onboarding_completed_at = new Date().toISOString();
    }
    const { error } = await (supabase as any).from("companies").update(payload).eq("id", companyId);
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: friendlyError(error), variant: "destructive" });
      return false;
    }
    await refetch();
    return true;
  }

  const steps = [
    // 0 - Welcome
    { key: "welcome", title: "Bem-vindo à LLZ", subtitle: "Vamos configurar sua empresa em poucos passos. Você pode ajustar tudo depois.", icon: Sparkles },
    // 1 - Company name & segment
    { key: "identity", title: "Sua empresa", subtitle: "Como identificamos sua operação.", icon: Building2 },
    // 2 - Business type
    { key: "business", title: "Tipo de negócio", subtitle: "Isso nos ajuda a adaptar o sistema.", icon: Store },
    // 3 - Operation mode
    { key: "mode", title: "Modo de operação", subtitle: "Escolha a profundidade das funcionalidades.", icon: Zap },
    // 4 - Operational configs
    { key: "config", title: "O que você controla?", subtitle: "Cada opção liga ou desliga funcionalidades reais.", icon: Settings },
    // 5 - Size & users
    { key: "size", title: "Tamanho da operação", subtitle: "Usamos para dimensionar exemplos e sugestões.", icon: Users },
    // 6 - Data source
    { key: "data", title: "Como começar?", subtitle: "Importar planilha ou cadastrar manualmente.", icon: Upload },
    // 7 - Done
    { key: "done", title: "Tudo pronto!", subtitle: "Sua empresa está configurada.", icon: CheckCircle2 },
  ];

  const total = steps.length;
  const current = steps[step];

  function canNext(): boolean {
    if (step === 1) return !!name.trim();
    if (step === 2) return !!businessType;
    if (step === 3) return !!operationMode;
    return true;
  }

  async function handleNext() {
    // Save incrementally so progress is never lost
    let patch: any = {};
    if (step === 1) patch = { name: name.trim(), segment: segment || null };
    if (step === 2) patch = { business_type: businessType };
    if (step === 3) patch = { operation_mode: operationMode };
    if (step === 4) patch = {
      controls_batch: controlsBatch,
      controls_expiration: controlsExpiration,
      handles_perishables: handlesPerishables,
      uses_addressing: usesAddressing,
      uses_expedition: usesExpedition,
    };
    if (step === 5) patch = { estimated_size: size || null, estimated_users: users || null };
    if (step === 6) patch = { plans_csv_import: plansCsv };

    const ok = await persist(patch, { advance: true });
    if (ok) setStep(step + 1);
  }

  async function handleFinish() {
    const ok = await persist({}, { finish: true });
    if (ok) {
      toast({ title: "Empresa configurada! 🎉" });
      if (plansCsv) navigate("/onboarding");
      else navigate("/");
    }
  }

  async function handleSkip() {
    if (!companyId) return;
    await (supabase as any).from("companies").update({
      onboarding_status: "skipped",
      onboarding_completed: true,
      onboarding_completed_at: new Date().toISOString(),
    }).eq("id", companyId);
    await refetch();
    navigate("/");
  }

  const StepIcon = current.icon;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <Boxes size={20} className="text-primary-foreground" />
            </div>
            <span className="font-black text-xl">LLZ</span>
          </div>
          <div className="flex items-center justify-center gap-1.5 mb-2">
            {Array.from({ length: total }).map((_, i) => (
              <div key={i} className={`h-1.5 rounded-full transition-all ${i <= step ? "bg-primary w-8" : "bg-border w-4"}`} />
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Etapa {step + 1} de {total}</p>
        </div>

        <div className="text-center mb-6">
          <StepIcon size={40} className="mx-auto text-primary mb-3" />
          <h2 className="text-2xl font-bold">{current.title}</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">{current.subtitle}</p>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={current.key}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="min-h-[280px]"
          >
            {step === 0 && (
              <div className="text-sm text-muted-foreground space-y-3 max-w-lg mx-auto text-center">
                <p>Em poucas perguntas vamos:</p>
                <ul className="text-left space-y-1.5 inline-block">
                  <li>• Configurar controles de lote e validade</li>
                  <li>• Definir endereçamento e expedição</li>
                  <li>• Preparar seu checklist de ativação</li>
                  <li>• Sugerir importação ou cadastro manual</li>
                </ul>
              </div>
            )}

            {step === 1 && (
              <div className="max-w-md mx-auto space-y-4">
                <div>
                  <Label className="text-xs font-semibold">Nome da Empresa</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Distribuidora Silva" className="mt-1 h-11 rounded-xl" autoFocus />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Segmento (opcional)</Label>
                  <div className="grid grid-cols-3 gap-2 mt-1">
                    {SEGMENTS.map((s) => (
                      <button key={s} type="button" onClick={() => setSegment(segment === s ? "" : s)}
                        className={`text-xs py-2 px-2 rounded-lg border transition ${segment === s ? "border-primary bg-primary/10" : "border-border hover:border-primary/30"}`}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-w-xl mx-auto">
                {BUSINESS_TYPES.map((bt) => (
                  <button key={bt.value} onClick={() => setBusinessType(bt.value)}
                    className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all text-center ${
                      businessType === bt.value ? "border-primary bg-primary/5 shadow-md" : "border-border hover:border-primary/30 hover:bg-secondary"
                    }`}>
                    <bt.icon size={28} className={businessType === bt.value ? "text-primary" : "text-muted-foreground"} />
                    <span className="text-sm font-semibold">{bt.label}</span>
                    <span className="text-[10px] text-muted-foreground">{bt.desc}</span>
                  </button>
                ))}
              </div>
            )}

            {step === 3 && (
              <div className="grid gap-3 max-w-xl mx-auto">
                {OPERATION_MODES.map((om) => (
                  <button key={om.value} onClick={() => setOperationMode(om.value)}
                    className={`flex items-start gap-4 p-4 rounded-2xl border-2 transition-all text-left ${
                      operationMode === om.value ? "border-primary bg-primary/5 shadow-md" : "border-border hover:border-primary/30"
                    }`}>
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${operationMode === om.value ? "bg-primary/15" : "bg-muted"}`}>
                      <om.icon size={22} className={operationMode === om.value ? "text-primary" : "text-muted-foreground"} />
                    </div>
                    <div className="flex-1">
                      <p className="font-bold text-sm">{om.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{om.desc}</p>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {om.features.map((f) => (
                          <span key={f} className="text-[10px] bg-secondary px-2 py-0.5 rounded-full text-muted-foreground">{f}</span>
                        ))}
                      </div>
                    </div>
                    {operationMode === om.value && <CheckCircle2 size={20} className="text-primary shrink-0 mt-1" />}
                  </button>
                ))}
              </div>
            )}

            {step === 4 && (
              <div className="max-w-lg mx-auto space-y-2">
                <ToggleRow icon={Tag} label="Controlar lote"
                  hint="Destaca lote em cadastros, recebimentos e movimentações."
                  value={controlsBatch} onChange={setControlsBatch} />
                <ToggleRow icon={CalendarClock} label="Controlar validade"
                  hint="Exibe alertas de vencimento e campos de validade."
                  value={controlsExpiration} onChange={setControlsExpiration} />
                <ToggleRow icon={Package} label="Trabalha com perecíveis"
                  hint="Ativa regras específicas para produtos perecíveis."
                  value={handlesPerishables} onChange={setHandlesPerishables} />
                <ToggleRow icon={MapPin} label="Usar endereçamento"
                  hint="Habilita cadastro e uso de endereços de armazenagem."
                  value={usesAddressing} onChange={setUsesAddressing} />
                <ToggleRow icon={PackageCheck} label="Usar expedição guiada"
                  hint="Ativa listas de picking e conferência."
                  value={usesExpedition} onChange={setUsesExpedition} />
              </div>
            )}

            {step === 5 && (
              <div className="max-w-lg mx-auto space-y-4">
                <div>
                  <Label className="text-xs font-semibold">Tamanho aproximado</Label>
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    {SIZES.map((s) => (
                      <button key={s.value} type="button" onClick={() => setSize(s.value)}
                        className={`text-xs py-3 px-3 rounded-lg border transition text-left ${size === s.value ? "border-primary bg-primary/10" : "border-border hover:border-primary/30"}`}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label className="text-xs font-semibold">Quantas pessoas vão usar?</Label>
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    {USERS_ESTIMATE.map((u) => (
                      <button key={u.value} type="button" onClick={() => setUsers(u.value)}
                        className={`text-xs py-3 px-3 rounded-lg border transition text-left ${users === u.value ? "border-primary bg-primary/10" : "border-border hover:border-primary/30"}`}>
                        {u.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {step === 6 && (
              <div className="max-w-lg mx-auto space-y-3">
                <button type="button" onClick={() => setPlansCsv(true)}
                  className={`w-full flex items-start gap-3 p-4 rounded-2xl border-2 text-left transition ${plansCsv ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"}`}>
                  <Upload size={22} className={plansCsv ? "text-primary" : "text-muted-foreground"} />
                  <div className="flex-1">
                    <p className="font-bold text-sm">Importar planilha CSV</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Tem produtos e endereços em planilha? Vamos importar. Modelos disponíveis para download.</p>
                  </div>
                  {plansCsv && <CheckCircle2 size={18} className="text-primary" />}
                </button>
                <button type="button" onClick={() => setPlansCsv(false)}
                  className={`w-full flex items-start gap-3 p-4 rounded-2xl border-2 text-left transition ${!plansCsv ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"}`}>
                  <Package size={22} className={!plansCsv ? "text-primary" : "text-muted-foreground"} />
                  <div className="flex-1">
                    <p className="font-bold text-sm">Cadastrar manualmente</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Começar do zero, cadastrando produtos e endereços aos poucos.</p>
                  </div>
                  {!plansCsv && <CheckCircle2 size={18} className="text-primary" />}
                </button>
              </div>
            )}

            {step === 7 && (
              <div className="max-w-lg mx-auto text-center space-y-4">
                <CheckCircle2 size={64} className="mx-auto text-primary" />
                <p className="text-sm text-muted-foreground">
                  Sua empresa está pronta. Use o <strong>checklist de ativação</strong> no dashboard para acompanhar os primeiros passos.
                </p>
                <p className="text-xs text-muted-foreground">
                  Você pode revisar todas as configurações em <strong>Configurações da Empresa</strong> a qualquer momento.
                </p>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-8 max-w-xl mx-auto">
          <Button variant="ghost" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0 || saving} className="gap-1">
            <ChevronLeft size={16} /> Voltar
          </Button>
          <div className="flex gap-2">
            {step < total - 1 && step > 0 && (
              <Button variant="ghost" size="sm" onClick={handleSkip} disabled={saving} className="text-xs text-muted-foreground">
                Pular por agora
              </Button>
            )}
            {step < total - 1 ? (
              <Button onClick={handleNext} disabled={!canNext() || saving} className="gap-1">
                {saving ? "Salvando..." : "Próximo"} <ChevronRight size={16} />
              </Button>
            ) : (
              <Button onClick={handleFinish} disabled={saving} className="gap-1 px-6">
                {saving ? "Salvando..." : "Concluir"} <CheckCircle2 size={16} />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ToggleRow({ icon: Icon, label, hint, value, onChange }: {
  icon: any; label: string; hint: string; value: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 p-3 rounded-xl border border-border hover:border-primary/30 transition cursor-pointer">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${value ? "bg-primary/15" : "bg-muted"}`}>
        <Icon size={18} className={value ? "text-primary" : "text-muted-foreground"} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">{label}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch checked={value} onCheckedChange={onChange} />
    </label>
  );
}
