import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { LifeBuoy, Plus, MessageSquare, Clock, CheckCircle2, AlertTriangle, Building2 } from "lucide-react";
import { toast } from "sonner";
import { friendlyError } from "@/lib/error-messages";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

type TicketStatus = "open" | "in_progress" | "waiting_customer" | "resolved" | "closed";
type TicketPriority = "low" | "medium" | "high" | "critical";

const STATUS_LABEL: Record<TicketStatus, string> = {
  open: "Aberto",
  in_progress: "Em andamento",
  waiting_customer: "Aguardando cliente",
  resolved: "Resolvido",
  closed: "Fechado",
};

const PRIORITY_LABEL: Record<TicketPriority, string> = {
  low: "Baixa", medium: "Média", high: "Alta", critical: "Crítica",
};

const CATEGORIES = [
  { value: "question", label: "Dúvida" },
  { value: "bug", label: "Erro / Bug" },
  { value: "feature_request", label: "Sugestão" },
  { value: "billing", label: "Financeiro" },
  { value: "other", label: "Outro" },
];

function statusVariant(s: TicketStatus): "default" | "secondary" | "outline" | "destructive" {
  if (s === "open") return "destructive";
  if (s === "in_progress" || s === "waiting_customer") return "default";
  if (s === "resolved") return "secondary";
  return "outline";
}

function priorityVariant(p: TicketPriority): "default" | "secondary" | "outline" | "destructive" {
  if (p === "critical") return "destructive";
  if (p === "high") return "default";
  if (p === "medium") return "secondary";
  return "outline";
}

export default function Support() {
  const { user, isAdmin } = useAuth();
  const { currentCompanyId, company } = useCompany();
  const qc = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scope, setScope] = useState<"mine" | "all">(isAdmin ? "all" : "mine");
  const [filterStatus, setFilterStatus] = useState<string>("active");

  const { data: tickets, isLoading } = useQuery({
    queryKey: ["support-tickets", scope, currentCompanyId, isAdmin],
    enabled: isAdmin ? true : !!currentCompanyId,
    queryFn: async () => {
      let q = supabase
        .from("support_tickets")
        .select("*, companies(name)")
        .order("updated_at", { ascending: false });
      if (!(isAdmin && scope === "all") && currentCompanyId) {
        q = q.eq("company_id", currentCompanyId);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    const list = tickets ?? [];
    if (filterStatus === "all") return list;
    if (filterStatus === "active") return list.filter((t: any) => !["resolved", "closed"].includes(t.status));
    return list.filter((t: any) => t.status === filterStatus);
  }, [tickets, filterStatus]);

  const stats = useMemo(() => {
    const list = tickets ?? [];
    return {
      total: list.length,
      open: list.filter((t: any) => t.status === "open").length,
      in_progress: list.filter((t: any) => t.status === "in_progress").length,
      resolved: list.filter((t: any) => ["resolved", "closed"].includes(t.status)).length,
    };
  }, [tickets]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <LifeBuoy className="text-primary" /> Central de Suporte
          </h1>
          <p className="text-sm text-muted-foreground">
            {isAdmin ? "Gerencie chamados de todas as empresas." : "Abra chamados e acompanhe respostas da equipe LLZ."}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus size={16} className="mr-1" /> Novo chamado
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={<MessageSquare />} label="Total" value={stats.total} />
        <StatCard icon={<AlertTriangle className="text-destructive" />} label="Abertos" value={stats.open} />
        <StatCard icon={<Clock className="text-primary" />} label="Em andamento" value={stats.in_progress} />
        <StatCard icon={<CheckCircle2 className="text-emerald-600" />} label="Resolvidos" value={stats.resolved} />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap gap-2 items-center justify-between">
            <div className="flex gap-2">
              {isAdmin && (
                <Tabs value={scope} onValueChange={(v) => setScope(v as any)}>
                  <TabsList>
                    <TabsTrigger value="all">Todas empresas</TabsTrigger>
                    <TabsTrigger value="mine">Minha empresa</TabsTrigger>
                  </TabsList>
                </Tabs>
              )}
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Ativos (abertos + andamento)</SelectItem>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="open">Abertos</SelectItem>
                <SelectItem value="in_progress">Em andamento</SelectItem>
                <SelectItem value="waiting_customer">Aguardando cliente</SelectItem>
                <SelectItem value="resolved">Resolvidos</SelectItem>
                <SelectItem value="closed">Fechados</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Carregando...</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Nenhum chamado encontrado.</p>
          ) : (
            <div className="divide-y">
              {filtered.map((t: any) => (
                <button
                  key={t.id}
                  onClick={() => setSelectedId(t.id)}
                  className="w-full text-left py-3 flex flex-wrap items-center gap-3 hover:bg-muted/50 px-2 rounded transition"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium truncate">{t.title}</span>
                      <Badge variant={statusVariant(t.status)}>{STATUS_LABEL[t.status as TicketStatus]}</Badge>
                      <Badge variant={priorityVariant(t.priority)}>{PRIORITY_LABEL[t.priority as TicketPriority]}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2 mt-1 flex-wrap">
                      {isAdmin && t.companies?.name && (
                        <span className="flex items-center gap-1"><Building2 size={12} />{t.companies.name}</span>
                      )}
                      <span>Atualizado {formatDistanceToNow(new Date(t.updated_at), { locale: ptBR, addSuffix: true })}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <CreateTicketDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        companyId={currentCompanyId}
        companyName={company?.name}
        userEmail={user?.email ?? null}
        onCreated={() => qc.invalidateQueries({ queryKey: ["support-tickets"] })}
      />

      <TicketDetailDialog
        ticketId={selectedId}
        onClose={() => setSelectedId(null)}
        isAdmin={isAdmin}
        userId={user?.id ?? null}
      />
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">{icon}</div>
        <div>
          <div className="text-2xl font-bold leading-none">{value}</div>
          <div className="text-xs text-muted-foreground mt-1">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function CreateTicketDialog({
  open, onClose, companyId, companyName, userEmail, onCreated,
}: {
  open: boolean; onClose: () => void; companyId: string | null;
  companyName?: string; userEmail: string | null; onCreated: () => void;
}) {
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("question");
  const [priority, setPriority] = useState<TicketPriority>("medium");
  const [module, setModule] = useState("");
  const [contactEmail, setContactEmail] = useState(userEmail ?? "");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!title.trim() || !description.trim()) {
      toast.error("Preencha título e descrição.");
      return;
    }
    if (!companyId || !user?.id) {
      toast.error("Selecione uma empresa antes de abrir o chamado.");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("support_tickets").insert({
      company_id: companyId,
      created_by: user.id,
      title: title.trim(),
      description: description.trim(),
      category,
      priority,
      module: module.trim() || null,
      contact_email: contactEmail.trim() || null,
    });
    setSubmitting(false);
    if (error) {
      toast.error(friendlyError(error));
      return;
    }
    toast.success("Chamado aberto com sucesso.");
    setTitle(""); setDescription(""); setModule(""); setPriority("medium"); setCategory("question");
    onCreated();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo chamado{companyName ? ` — ${companyName}` : ""}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Título</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} placeholder="Resumo curto do problema" />
          </div>
          <div>
            <Label>Descrição</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={5} maxLength={4000} placeholder="Descreva o que aconteceu, passos para reproduzir, prints (colar link)..." />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Categoria</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Prioridade</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as TicketPriority)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(["low","medium","high","critical"] as TicketPriority[]).map(p =>
                    <SelectItem key={p} value={p}>{PRIORITY_LABEL[p]}</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Módulo (opcional)</Label>
              <Input value={module} onChange={(e) => setModule(e.target.value)} placeholder="Ex: Produtos, Expedição" />
            </div>
            <div>
              <Label>E-mail de contato</Label>
              <Input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} maxLength={200} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={submitting}>{submitting ? "Enviando..." : "Abrir chamado"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TicketDetailDialog({
  ticketId, onClose, isAdmin, userId,
}: { ticketId: string | null; onClose: () => void; isAdmin: boolean; userId: string | null }) {
  const qc = useQueryClient();
  const [reply, setReply] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [sending, setSending] = useState(false);

  const { data: ticket } = useQuery({
    queryKey: ["support-ticket", ticketId],
    enabled: !!ticketId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_tickets")
        .select("*, companies(name)")
        .eq("id", ticketId!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: messages } = useQuery({
    queryKey: ["support-ticket-messages", ticketId],
    enabled: !!ticketId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_ticket_messages")
        .select("*")
        .eq("ticket_id", ticketId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const senderIds = useMemo(
    () => Array.from(new Set((messages ?? []).map((m: any) => m.sender_id).filter(Boolean))),
    [messages],
  );
  const { data: senders } = useQuery({
    queryKey: ["support-senders", senderIds],
    enabled: senderIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name, email").in("id", senderIds);
      return data ?? [];
    },
  });
  const senderMap = useMemo(() => {
    const m = new Map<string, any>();
    (senders ?? []).forEach((s: any) => m.set(s.id, s));
    return m;
  }, [senders]);

  const send = async () => {
    if (!reply.trim() || !ticketId || !userId) return;
    setSending(true);
    const { error } = await supabase.from("support_ticket_messages").insert({
      ticket_id: ticketId,
      sender_id: userId,
      message: reply.trim(),
      is_internal: isAdmin ? isInternal : false,
    });
    setSending(false);
    if (error) {
      toast.error(friendlyError(error));
      return;
    }
    setReply("");
    setIsInternal(false);
    qc.invalidateQueries({ queryKey: ["support-ticket-messages", ticketId] });
    qc.invalidateQueries({ queryKey: ["support-tickets"] });
    toast.success("Mensagem enviada.");
  };

  const updateStatus = async (status: TicketStatus) => {
    if (!ticketId) return;
    const patch: any = { status };
    const { error } = await supabase.from("support_tickets").update(patch).eq("id", ticketId);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success("Status atualizado.");
    qc.invalidateQueries({ queryKey: ["support-ticket", ticketId] });
    qc.invalidateQueries({ queryKey: ["support-tickets"] });
  };

  const updatePriority = async (priority: TicketPriority) => {
    if (!ticketId) return;
    const { error } = await supabase.from("support_tickets").update({ priority }).eq("id", ticketId);
    if (error) { toast.error(friendlyError(error)); return; }
    qc.invalidateQueries({ queryKey: ["support-ticket", ticketId] });
    qc.invalidateQueries({ queryKey: ["support-tickets"] });
  };

  const canReopen = !isAdmin && ticket?.status === "resolved" && ticket?.created_by === userId;

  return (
    <Dialog open={!!ticketId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            {ticket?.title ?? "Chamado"}
            {ticket && <Badge variant={statusVariant(ticket.status)}>{STATUS_LABEL[ticket.status as TicketStatus]}</Badge>}
            {ticket && <Badge variant={priorityVariant(ticket.priority)}>{PRIORITY_LABEL[ticket.priority as TicketPriority]}</Badge>}
          </DialogTitle>
          {ticket && (
            <p className="text-xs text-muted-foreground">
              {ticket.companies?.name} · Aberto em {new Date(ticket.created_at).toLocaleString("pt-BR")}
            </p>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {ticket && (
            <Card>
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground mb-1">Descrição inicial</p>
                <p className="text-sm whitespace-pre-wrap">{ticket.description}</p>
              </CardContent>
            </Card>
          )}

          {(messages ?? []).map((m: any) => {
            const sender = senderMap.get(m.sender_id);
            const mine = m.sender_id === userId;
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-lg p-3 text-sm ${
                  m.is_internal
                    ? "bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800"
                    : mine ? "bg-primary text-primary-foreground" : "bg-muted"
                }`}>
                  <div className="text-[10px] opacity-75 mb-1 flex items-center gap-2">
                    <span>{sender?.full_name || sender?.email || "Usuário"}</span>
                    <span>·</span>
                    <span>{formatDistanceToNow(new Date(m.created_at), { locale: ptBR, addSuffix: true })}</span>
                    {m.is_internal && <Badge variant="outline" className="h-4 text-[9px]">Interno</Badge>}
                  </div>
                  <p className="whitespace-pre-wrap">{m.message}</p>
                </div>
              </div>
            );
          })}
        </div>

        {isAdmin && ticket && (
          <div className="border-t pt-3 grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Status</Label>
              <Select value={ticket.status} onValueChange={(v) => updateStatus(v as TicketStatus)}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(STATUS_LABEL) as TicketStatus[]).map(s =>
                    <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Prioridade</Label>
              <Select value={ticket.priority} onValueChange={(v) => updatePriority(v as TicketPriority)}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(PRIORITY_LABEL) as TicketPriority[]).map(p =>
                    <SelectItem key={p} value={p}>{PRIORITY_LABEL[p]}</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {canReopen && (
          <div className="border-t pt-3">
            <Button variant="outline" size="sm" onClick={() => updateStatus("in_progress")}>
              Reabrir chamado
            </Button>
          </div>
        )}

        {ticket && ticket.status !== "closed" && (
          <div className="border-t pt-3 space-y-2">
            <Textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={3} maxLength={4000} placeholder="Escreva sua resposta..." />
            <div className="flex items-center justify-between">
              {isAdmin ? (
                <label className="flex items-center gap-2 text-xs">
                  <Checkbox checked={isInternal} onCheckedChange={(c) => setIsInternal(!!c)} />
                  Nota interna (visível apenas para a equipe LLZ)
                </label>
              ) : <span />}
              <Button size="sm" onClick={send} disabled={sending || !reply.trim()}>
                {sending ? "Enviando..." : "Enviar"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
