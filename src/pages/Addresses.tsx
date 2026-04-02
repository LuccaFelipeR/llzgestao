import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Plus, Pencil } from "lucide-react";
import { validateAddressCode, parseAddressCode, formatAddressDisplay } from "@/lib/address-utils";

export default function Addresses() {
  const { companyId } = useCompany();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ code: "", type: "ARMAZENAGEM" as "ARMAZENAGEM" | "TECNICO" });

  const { data: addresses, isLoading } = useQuery({
    queryKey: ["addresses"],
    queryFn: async () => {
      const { data, error } = await supabase.from("addresses").select("*").order("code");
      if (error) throw error;
      return data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const code = form.code.toUpperCase().trim();
      if (!validateAddressCode(code)) throw new Error("Formato inválido. Use: P01002003001A (P + 2 dígitos Rua + 3 Posição + 3 Andar + 3 Lado + 1 Face)");
      const parsed = parseAddressCode(code)!;
      if (editing) {
        const { error } = await supabase.from("addresses").update({ code, type: form.type, ...parsed }).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("addresses").insert({ code, type: form.type, ...parsed });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["addresses"] });
      toast({ title: editing ? "Endereço atualizado" : "Endereço cadastrado" });
      setOpen(false);
      setEditing(null);
    },
    onError: (e: Error) => {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async (a: any) => {
      const { error } = await supabase.from("addresses").update({ is_active: !a.is_active }).eq("id", a.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["addresses"] }),
  });

  function openNew() {
    setEditing(null);
    setForm({ code: "", type: "ARMAZENAGEM" });
    setOpen(true);
  }

  function openEdit(a: any) {
    setEditing(a);
    setForm({ code: a.code, type: a.type });
    setOpen(true);
  }

  return (
    <div className="page-container">
      <div className="flex items-center justify-between mb-6">
        <h1 className="page-title mb-0">Endereços</h1>
        <Button onClick={openNew} size="lg"><Plus size={18} className="mr-1" /> Novo</Button>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Carregando...</p>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr><th>Código</th><th>Exibição</th><th>Tipo</th><th>Rua</th><th>Posição</th><th>Andar</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {addresses?.map((a) => (
                <tr key={a.id} className={!a.is_active ? "opacity-50" : ""}>
                  <td className="font-mono font-semibold">{a.code}</td>
                  <td>{formatAddressDisplay(a.code)}</td>
                  <td><span className="text-xs font-medium">{a.type}</span></td>
                  <td>{a.rua}</td>
                  <td>{a.posicao}</td>
                  <td>{a.andar}</td>
                  <td>
                    <button onClick={() => toggleMutation.mutate(a)} className={`text-xs px-2 py-0.5 rounded-md font-medium ${a.is_active ? "bg-accent/15 text-accent" : "bg-muted text-muted-foreground"}`}>
                      {a.is_active ? "Ativo" : "Inativo"}
                    </button>
                  </td>
                  <td>
                    <Button variant="ghost" size="sm" onClick={() => openEdit(a)}><Pencil size={16} /></Button>
                  </td>
                </tr>
              ))}
              {addresses?.length === 0 && (
                <tr><td colSpan={8} className="text-center text-muted-foreground py-8">Nenhum endereço cadastrado.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Endereço" : "Novo Endereço"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(); }} className="space-y-4">
            <div>
              <Label htmlFor="code">Código do Endereço *</Label>
              <Input id="code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="P01002003001A" maxLength={14} className="font-mono" />
              <p className="text-xs text-muted-foreground mt-1">Formato: P + 2 dígitos (Rua) + 3 (Posição) + 3 (Andar) + 3 (Lado) + 1 letra (Face)</p>
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={form.type} onValueChange={(v: "ARMAZENAGEM" | "TECNICO") => setForm({ ...form, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ARMAZENAGEM">Armazenagem</SelectItem>
                  <SelectItem value="TECNICO">Técnico</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.code && validateAddressCode(form.code) && (
              <div className="bg-secondary rounded-lg p-3 text-sm">
                <p className="font-medium mb-1">Segmentação:</p>
                {(() => {
                  const p = parseAddressCode(form.code)!;
                  return (
                    <div className="grid grid-cols-5 gap-2 text-xs">
                      <div><span className="text-muted-foreground">Rua:</span> {p.rua}</div>
                      <div><span className="text-muted-foreground">Posição:</span> {p.posicao}</div>
                      <div><span className="text-muted-foreground">Andar:</span> {p.andar}</div>
                      <div><span className="text-muted-foreground">Lado:</span> {p.lado}</div>
                      <div><span className="text-muted-foreground">Face:</span> {p.face}</div>
                    </div>
                  );
                })()}
              </div>
            )}
            <Button type="submit" className="w-full" size="lg" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
