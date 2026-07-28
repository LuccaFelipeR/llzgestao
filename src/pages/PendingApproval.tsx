import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { friendlyError } from "@/lib/error-messages";
import { Clock, LogOut, LifeBuoy, XCircle } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export default function PendingApproval() {
  const { signOut, profile, user, refreshProfile } = useAuth();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [fullName, setFullName] = useState(profile?.full_name ?? "");
  const [companyName, setCompanyName] = useState("");
  const [phone, setPhone] = useState("");

  const { data: membership } = useQuery({
    queryKey: ["pending-company", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("company_members")
        .select("company_id, companies(id,name,phone,approval_status,approval_reason)")
        .eq("user_id", user!.id)
        .limit(1)
        .maybeSingle();
      const c = data?.companies;
      if (c) {
        setCompanyName((prev) => prev || c.name || "");
        setPhone((prev) => prev || c.phone || "");
      }
      return c ?? null;
    },
  });

  // Estados independentes: confirmação de e-mail (Supabase Auth) x aprovação da empresa (LLZ).
  const emailConfirmed = !!(user as any)?.email_confirmed_at || !!(user as any)?.confirmed_at;
  const [resending, setResending] = useState(false);

  const rejected = membership?.approval_status === "rejected" || !!profile?.rejection_reason;
  const reason = membership?.approval_reason ?? profile?.rejection_reason ?? null;

  async function resendConfirmation() {
    if (!user?.email) return;
    setResending(true);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: user.email,
      options: { emailRedirectTo: window.location.origin },
    });
    setResending(false);
    if (error) toast.error(friendlyError(error));
    else toast.success("E-mail de confirmação reenviado. Verifique a caixa de entrada e o spam.");
  }

  async function recheckConfirmation() {
    const { data, error } = await supabase.auth.refreshSession();
    if (error) return toast.error(friendlyError(error));
    if ((data.user as any)?.email_confirmed_at) {
      toast.success("E-mail confirmado!");
      window.location.reload();
    } else {
      toast.error("Ainda não identificamos a confirmação deste e-mail.");
    }
  }


  async function saveBasics(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (fullName.trim() !== (profile?.full_name ?? "")) {
        const { error } = await supabase.from("profiles").update({ full_name: fullName.trim() }).eq("id", user!.id);
        if (error) throw error;
      }
      if (membership?.id) {
        const { error } = await (supabase as any)
          .from("companies")
          .update({ name: companyName.trim(), phone: phone.trim() || null })
          .eq("id", membership.id);
        if (error) throw error;
      }
      await refreshProfile();
      qc.invalidateQueries({ queryKey: ["pending-company"] });
      toast.success("Dados atualizados. A equipe LLZ verá as informações na análise.");
    } catch (err) {
      toast.error(friendlyError(err));
    }
    setSaving(false);
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="bg-card border border-border rounded-2xl p-8 shadow-sm">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${rejected ? "bg-destructive/15" : "bg-warning/15"}`}>
            {rejected ? <XCircle size={32} className="text-destructive" /> : <Clock size={32} className="text-warning" />}
          </div>
          <h2 className="text-xl font-bold text-foreground mb-2 text-center">
            {rejected ? "Cadastro não aprovado" : "Cadastro em análise"}
          </h2>
          <p className="text-sm text-muted-foreground text-center mb-1">
            {rejected
              ? "Revise as informações abaixo e solicite nova análise ao suporte."
              : "Sua conta foi criada e está aguardando a aprovação da equipe LLZ."}
          </p>
          {reason && (
            <p className="text-xs text-destructive text-center mt-2 mb-2">Motivo: {reason}</p>
          )}
          <p className="text-[11px] text-muted-foreground text-center mb-5">
            Enquanto estiver pendente, operações de estoque e convites ficam bloqueados.
          </p>

          <form onSubmit={saveBasics} className="space-y-3 text-left">
            <div>
              <Label className="text-xs font-semibold">Seu nome</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} className="mt-1 h-10 rounded-xl" />
            </div>
            <div>
              <Label className="text-xs font-semibold">Nome da empresa</Label>
              <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="mt-1 h-10 rounded-xl" />
            </div>
            <div>
              <Label className="text-xs font-semibold">Telefone de contato</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1 h-10 rounded-xl" />
            </div>
            <Button type="submit" className="w-full h-10 rounded-xl text-sm font-bold" disabled={saving}>
              {saving ? "Salvando..." : "Atualizar informações"}
            </Button>
          </form>

          <a
            href="mailto:suporte@llz.com.br"
            className="mt-4 flex items-center justify-center gap-2 text-xs font-semibold text-primary hover:underline"
          >
            <LifeBuoy size={14} /> Falar com o suporte
          </a>

          <p className="text-[11px] text-muted-foreground text-center mt-4">{profile?.email}</p>
          <Button variant="ghost" size="sm" onClick={signOut} className="w-full mt-2 text-muted-foreground">
            <LogOut size={14} className="mr-1" /> Sair
          </Button>
        </div>
      </div>
    </div>
  );
}
