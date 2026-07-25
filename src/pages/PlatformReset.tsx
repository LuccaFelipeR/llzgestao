import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ShieldAlert, RefreshCw, Trash2, Users, Building2 } from "lucide-react";
import { toast } from "sonner";

type PreviewResult = any;

export default function PlatformReset() {
  const { isPlatformSuperAdmin } = useAuth();
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [result, setResult] = useState<any>(null);
  const [confirm, setConfirm] = useState("");

  async function call(action: "preview" | "execute") {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-reset", {
        body: action === "execute" ? { action, confirm: "RESET" } : { action },
      });
      if (error) throw error;
      if (action === "preview") {
        setPreview(data);
        setResult(null);
        toast.success("Preview gerado.");
      } else {
        setResult(data);
        toast.success("Reset executado.");
        await call("preview");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Falha na operação de manutenção");
    }
    setLoading(false);
  }

  if (!isPlatformSuperAdmin) return null;

  const counts: Record<string, number> = preview?.counts_to_delete ?? {};

  return (
    <div className="page-container space-y-5">
      <div>
        <h1 className="page-title flex items-center gap-2">
          <ShieldAlert size={22} className="text-destructive" /> Reset de ambiente de testes
        </h1>
        <p className="text-sm text-muted-foreground">
          Operação exclusiva do super admin. Remove empresas e usuários clientes preservando a equipe LLZ,
          o changelog e a estrutura do banco.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => call("preview")} disabled={loading} variant="outline">
          <RefreshCw size={14} className="mr-1" /> Gerar preview
        </Button>
      </div>

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
                {(preview.preserved_platform_users ?? []).map((u: any) => (
                  <div key={u.id} className="flex items-center justify-between gap-2">
                    <span className="truncate">{u.full_name || "—"} · {u.email}</span>
                    <Badge variant="secondary" className="text-[10px]">{u.role}</Badge>
                  </div>
                ))}
                {(preview.preserved_platform_users ?? []).length === 0 && <p className="text-destructive">Nenhum usuário global identificado.</p>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Trash2 size={16} className="text-destructive" /> Usuários que serão removidos</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-xs max-h-72 overflow-y-auto">
                {(preview.users_to_delete ?? []).map((u: any) => (
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
                {(preview.companies_to_delete ?? []).map((c: any) => (
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
            <CardHeader><CardTitle className="text-sm text-destructive flex items-center gap-2"><AlertTriangle size={16} /> Executar reset</CardTitle></CardHeader>
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
                onClick={() => call("execute")}
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
    </div>
  );
}
