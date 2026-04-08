import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { LogIn, UserPlus, KeyRound, Eye, EyeOff, Shield, Boxes, Zap } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const DEV_EMAIL = "luccafelipe99@gmail.com";
const DEV_PASS = "pro99123@";
const DEV_ACCESS_CODE = "AdminLLZ0726";

export default function Login() {
  const [mode, setMode] = useState<"login" | "signup" | "forgot" | "dev">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [devCode, setDevCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (error) {
      toast({ title: "Erro ao entrar", description: error.message === "Invalid login credentials" ? "Email ou senha incorretos." : error.message, variant: "destructive" });
    }
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim()) { toast({ title: "Informe seu nome", variant: "destructive" }); return; }
    if (password.length < 6) { toast({ title: "Senha: mínimo 6 caracteres", variant: "destructive" }); return; }
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: email.trim(), password,
      options: { data: { full_name: fullName.trim(), invite_code: inviteCode.trim() || undefined }, emailRedirectTo: window.location.origin },
    });
    setLoading(false);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Conta criada! 🎉", description: "Aguarde aprovação do administrador para acessar." });
      setMode("login");
    }
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset-password` });
    setLoading(false);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else { toast({ title: "Email enviado" }); setMode("login"); }
  }

  async function handleDevAccess(e: React.FormEvent) {
    e.preventDefault();
    if (devCode !== DEV_ACCESS_CODE) {
      toast({ title: "Código inválido", description: "O código de acesso do desenvolvedor está incorreto.", variant: "destructive" });
      return;
    }
    setLoading(true);
    // Try login first
    let { error } = await supabase.auth.signInWithPassword({ email: DEV_EMAIL, password: DEV_PASS });
    if (error?.message?.includes("Invalid login credentials")) {
      const { error: signupErr } = await supabase.auth.signUp({
        email: DEV_EMAIL, password: DEV_PASS,
        options: { data: { full_name: "Admin Dev" }, emailRedirectTo: window.location.origin },
      });
      if (signupErr) {
        toast({ title: "Erro", description: signupErr.message, variant: "destructive" });
        setLoading(false);
        return;
      }
      const { error: loginErr } = await supabase.auth.signInWithPassword({ email: DEV_EMAIL, password: DEV_PASS });
      if (loginErr) {
        toast({ title: "Erro ao entrar", description: loginErr.message, variant: "destructive" });
        setLoading(false);
        return;
      }
    } else if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-accent/5 blur-3xl" />
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="w-full max-w-md relative z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.5, type: "spring", stiffness: 200 }} className="inline-flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg">
              <Boxes size={24} className="text-primary-foreground" />
            </div>
            <div className="text-left">
              <h1 className="text-3xl font-black tracking-tight text-foreground">LLZ</h1>
              <p className="text-xs font-medium text-muted-foreground -mt-0.5">Gestão de Estoque</p>
            </div>
          </motion.div>
          <p className="text-sm text-muted-foreground mt-2">
            Sistema WMS inteligente para micro e pequenas empresas
          </p>
        </div>

        {/* Dev Access Button */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="mb-4">
          <button
            onClick={() => setMode("dev")}
            className="group flex items-center gap-2.5 p-3.5 rounded-2xl border-2 border-primary/20 bg-primary/5 hover:bg-primary/10 hover:border-primary/40 transition-all text-left w-full disabled:opacity-60"
          >
            <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Shield size={18} className="text-primary" />
            </div>
            <div>
              <p className="text-xs font-bold text-foreground">Acesso Desenvolvedor</p>
              <p className="text-[10px] text-muted-foreground">Requer código de acesso</p>
            </div>
          </button>
        </motion.div>

        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1 h-px bg-border" />
          <span className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider">ou entre com sua conta</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        {/* Auth Card */}
        <div className="glass-card p-6">
          <AnimatePresence mode="wait">
            {mode === "dev" && (
              <motion.form key="dev" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.2 }} onSubmit={handleDevAccess} className="space-y-4">
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <Shield size={20} className="text-primary" /> Acesso Desenvolvedor
                </h2>
                <p className="text-xs text-muted-foreground">Insira o código de acesso do desenvolvedor para entrar como admin.</p>
                <div>
                  <Label className="text-xs font-semibold">Código de Acesso</Label>
                  <div className="relative mt-1">
                    <Input type={showPassword ? "text" : "password"} value={devCode} onChange={(e) => setDevCode(e.target.value)} required placeholder="Digite o código..." className="h-11 rounded-xl pr-10" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                <Button type="submit" className="w-full h-11 rounded-xl font-bold text-sm" disabled={loading}>
                  {loading ? "Verificando..." : "Entrar como Admin"}
                </Button>
                <button type="button" onClick={() => setMode("login")} className="text-xs text-primary hover:underline w-full text-center font-medium">Voltar ao login</button>
              </motion.form>
            )}

            {mode === "login" && (
              <motion.form key="login" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.2 }} onSubmit={handleLogin} className="space-y-4">
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <LogIn size={20} className="text-primary" /> Entrar
                </h2>
                <div>
                  <Label className="text-xs font-semibold">Email</Label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="seu@email.com" autoComplete="email" className="mt-1 h-11 rounded-xl" />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Senha</Label>
                  <div className="relative mt-1">
                    <Input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} placeholder="••••••" autoComplete="current-password" className="h-11 rounded-xl pr-10" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                <Button type="submit" className="w-full h-11 rounded-xl font-bold text-sm" disabled={loading}>
                  {loading ? "Entrando..." : "Entrar"}
                </Button>
                <div className="flex justify-between text-xs">
                  <button type="button" onClick={() => setMode("forgot")} className="text-primary hover:underline font-medium">Esqueci a senha</button>
                  <button type="button" onClick={() => setMode("signup")} className="text-accent hover:underline font-medium">Criar conta</button>
                </div>
              </motion.form>
            )}

            {mode === "signup" && (
              <motion.form key="signup" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }} onSubmit={handleSignup} className="space-y-4">
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <UserPlus size={20} className="text-accent" /> Criar Conta
                </h2>
                <div>
                  <Label className="text-xs font-semibold">Nome Completo</Label>
                  <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required placeholder="Seu nome" autoComplete="name" className="mt-1 h-11 rounded-xl" />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Email</Label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="seu@email.com" autoComplete="email" className="mt-1 h-11 rounded-xl" />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Senha</Label>
                  <div className="relative mt-1">
                    <Input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} placeholder="Mínimo 6 caracteres" autoComplete="new-password" className="h-11 rounded-xl pr-10" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                <Button type="submit" className="w-full h-11 rounded-xl font-bold text-sm" disabled={loading}>
                  {loading ? "Cadastrando..." : "Cadastrar"}
                </Button>
                <p className="text-[10px] text-muted-foreground text-center">Após cadastro, aguarde aprovação do administrador.</p>
                <button type="button" onClick={() => setMode("login")} className="text-xs text-primary hover:underline w-full text-center font-medium">Já tenho conta</button>
              </motion.form>
            )}

            {mode === "forgot" && (
              <motion.form key="forgot" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }} onSubmit={handleForgot} className="space-y-4">
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <KeyRound size={20} className="text-primary" /> Recuperar Senha
                </h2>
                <div>
                  <Label className="text-xs font-semibold">Email</Label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="seu@email.com" className="mt-1 h-11 rounded-xl" />
                </div>
                <Button type="submit" className="w-full h-11 rounded-xl font-bold text-sm" disabled={loading}>{loading ? "Enviando..." : "Enviar link"}</Button>
                <button type="button" onClick={() => setMode("login")} className="text-xs text-primary hover:underline w-full text-center font-medium">Voltar ao login</button>
              </motion.form>
            )}
          </AnimatePresence>
        </div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className="flex items-center justify-center gap-4 mt-6 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><Zap size={10} className="text-accent" /> Scanner QR</span>
          <span>•</span>
          <span className="flex items-center gap-1"><Boxes size={10} className="text-primary" /> Multi-tenant</span>
          <span>•</span>
          <span className="flex items-center gap-1"><Shield size={10} className="text-success" /> RBAC</span>
        </motion.div>

        <p className="text-center text-[10px] text-muted-foreground mt-4">
          LLZ Gestão de Estoque © {new Date().getFullYear()} • Powered by AI
        </p>
      </motion.div>
    </div>
  );
}
