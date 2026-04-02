import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { Building2, Store, Truck, Warehouse, Package, Layers, Zap, Settings, ChevronRight, ChevronLeft, CheckCircle2, Boxes } from "lucide-react";

const BUSINESS_TYPES = [
  { value: "bakery", label: "Padaria / Alimentação", icon: Store, desc: "Produtos perecíveis, controle de validade" },
  { value: "retail", label: "Loja / Varejo", icon: Package, desc: "SKUs variados, multicanal" },
  { value: "distributor", label: "Distribuidor", icon: Truck, desc: "Alto volume, rotas de entrega" },
  { value: "warehouse", label: "Armazém", icon: Warehouse, desc: "Endereçamento, picking, packing" },
  { value: "logistics_center", label: "Centro Logístico", icon: Layers, desc: "Operação completa, WMS avançado" },
  { value: "other", label: "Outro", icon: Building2, desc: "Personalizar conforme necessidade" },
];

const OPERATION_MODES = [
  { value: "essential", label: "Essencial", icon: Zap, desc: "Controle básico de estoque. Ideal para quem está começando.", features: ["Cadastro de produtos", "Entrada e saída", "Estoque por local", "Alertas de mínimo"] },
  { value: "operations", label: "Operações", icon: Settings, desc: "Para negócios estruturados que precisam de mais controle.", features: ["Tudo do Essencial", "Lotes e validades", "Curva ABC", "Importação CSV", "Scanner"] },
  { value: "wms", label: "WMS Avançado", icon: Warehouse, desc: "Operação logística completa com endereçamento e rastreabilidade.", features: ["Tudo de Operações", "Endereçamento WMS", "Picking e packing", "Auditoria operacional", "IA Insights"] },
];

export default function CompanyOnboarding() {
  const { company, companyId, refetch } = useCompany();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(company?.name || "");
  const [businessType, setBusinessType] = useState(company?.business_type || "");
  const [operationMode, setOperationMode] = useState(company?.operation_mode || "");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!companyId) return;
    if (!name.trim()) { toast({ title: "Informe o nome da empresa", variant: "destructive" }); return; }
    if (!businessType) { toast({ title: "Selecione o tipo de negócio", variant: "destructive" }); return; }
    if (!operationMode) { toast({ title: "Selecione o modo de operação", variant: "destructive" }); return; }

    setSaving(true);
    const { error } = await (supabase as any)
      .from("companies")
      .update({
        name: name.trim(),
        business_type: businessType,
        operation_mode: operationMode,
        onboarding_completed: true,
      })
      .eq("id", companyId);

    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Empresa configurada! 🎉" });
      await refetch();
    }
    setSaving(false);
  }

  const steps = [
    // Step 0: Company name
    <motion.div key="name" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} className="space-y-6">
      <div className="text-center">
        <Building2 size={48} className="mx-auto text-primary mb-3" />
        <h2 className="text-2xl font-bold">Como se chama sua empresa?</h2>
        <p className="text-sm text-muted-foreground mt-1">Este nome aparecerá no sistema e relatórios.</p>
      </div>
      <div className="max-w-sm mx-auto">
        <Label className="text-xs font-semibold">Nome da Empresa</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Distribuidora Silva" className="mt-1 h-12 text-lg rounded-xl" autoFocus />
      </div>
    </motion.div>,

    // Step 1: Business type
    <motion.div key="type" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold">Qual é o seu tipo de negócio?</h2>
        <p className="text-sm text-muted-foreground mt-1">Vamos adaptar o sistema ao seu perfil.</p>
      </div>
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
    </motion.div>,

    // Step 2: Operation mode
    <motion.div key="mode" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold">Escolha seu modo de operação</h2>
        <p className="text-sm text-muted-foreground mt-1">Você pode mudar depois a qualquer momento.</p>
      </div>
      <div className="grid gap-4 max-w-xl mx-auto">
        {OPERATION_MODES.map((om) => (
          <button key={om.value} onClick={() => setOperationMode(om.value)}
            className={`flex items-start gap-4 p-5 rounded-2xl border-2 transition-all text-left ${
              operationMode === om.value ? "border-primary bg-primary/5 shadow-md" : "border-border hover:border-primary/30"
            }`}>
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
              operationMode === om.value ? "bg-primary/15" : "bg-muted"
            }`}>
              <om.icon size={24} className={operationMode === om.value ? "text-primary" : "text-muted-foreground"} />
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
    </motion.div>,
  ];

  const canNext = step === 0 ? !!name.trim() : step === 1 ? !!businessType : !!operationMode;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <Boxes size={20} className="text-primary-foreground" />
            </div>
            <span className="font-black text-xl">LLZ</span>
          </div>
          {/* Progress */}
          <div className="flex items-center justify-center gap-2 mb-2">
            {[0, 1, 2].map((s) => (
              <div key={s} className={`h-1.5 rounded-full transition-all ${s <= step ? "bg-primary w-12" : "bg-border w-8"}`} />
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Etapa {step + 1} de 3</p>
        </div>

        {/* Step content */}
        <AnimatePresence mode="wait">{steps[step]}</AnimatePresence>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-8 max-w-xl mx-auto">
          <Button variant="ghost" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0} className="gap-1">
            <ChevronLeft size={16} /> Voltar
          </Button>
          {step < 2 ? (
            <Button onClick={() => setStep(step + 1)} disabled={!canNext} className="gap-1">
              Próximo <ChevronRight size={16} />
            </Button>
          ) : (
            <Button onClick={save} disabled={!canNext || saving} className="gap-1 px-6">
              {saving ? "Salvando..." : "Começar a usar"} <CheckCircle2 size={16} />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
