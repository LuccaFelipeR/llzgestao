import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { Bell, MessageSquare, Save } from "lucide-react";

export default function NotificationSettings() {
  const { user } = useAuth();
  const [whatsapp, setWhatsapp] = useState("");
  const [notifyMinStock, setNotifyMinStock] = useState(false);
  const [notifyDailySummary, setNotifyDailySummary] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("whatsapp_number, notify_min_stock, notify_daily_summary")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setWhatsapp((data as any).whatsapp_number || "");
          setNotifyMinStock((data as any).notify_min_stock || false);
          setNotifyDailySummary((data as any).notify_daily_summary || false);
        }
        setLoaded(true);
      });
  }, [user]);

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        whatsapp_number: whatsapp.trim() || null,
        notify_min_stock: notifyMinStock,
        notify_daily_summary: notifyDailySummary,
      } as any)
      .eq("id", user.id);
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Configurações salvas!" });
    }
  }

  if (!loaded) return <div className="page-container text-sm text-muted-foreground">Carregando...</div>;

  return (
    <div className="page-container max-w-lg mx-auto">
      <h1 className="page-title flex items-center gap-2"><Bell size={24} /> Notificações</h1>
      <p className="text-sm text-muted-foreground mb-6">Configure alertas automáticos via WhatsApp.</p>

      <div className="space-y-6 bg-card border border-border rounded-xl p-6">
        {/* WhatsApp */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <MessageSquare size={16} className="text-green-500" /> Número WhatsApp
          </Label>
          <Input
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
            placeholder="+55 11 99999-9999"
            maxLength={20}
          />
          <p className="text-xs text-muted-foreground">Inclua o código do país (ex: +55 para Brasil)</p>
        </div>

        {/* Toggles */}
        <div className="space-y-4 pt-4 border-t border-border">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">Alertar estoque mínimo</p>
              <p className="text-xs text-muted-foreground">Receba quando um produto atingir o estoque mínimo</p>
            </div>
            <Switch checked={notifyMinStock} onCheckedChange={setNotifyMinStock} />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">Resumo diário de separação</p>
              <p className="text-xs text-muted-foreground">Receba um resumo diário das saídas do dia</p>
            </div>
            <Switch checked={notifyDailySummary} onCheckedChange={setNotifyDailySummary} />
          </div>
        </div>

        <Button onClick={handleSave} disabled={saving} className="w-full" size="lg">
          <Save size={18} className="mr-2" />
          {saving ? "Salvando..." : "Salvar Configurações"}
        </Button>
      </div>

      <div className="mt-6 bg-primary/5 border border-primary/20 rounded-xl p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground mb-1">🔌 Integração WhatsApp</p>
        <p>A integração com WhatsApp (Twilio/Z-API) será ativada em breve. Suas configurações já estão salvas e serão utilizadas automaticamente quando o serviço estiver disponível.</p>
      </div>
    </div>
  );
}
