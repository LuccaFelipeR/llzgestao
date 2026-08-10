/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { sb, rpcOk } from "@/lib/db-any";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { friendlyError } from "@/lib/error-messages";
import {
  computeDeployment,
  STAGE_LABEL,
  STAGE_ORDER,
  NOTE_CATEGORIES,
  NOTE_CATEGORY_LABEL,
  type DeploymentStage,
} from "@/lib/deployment";
import {
  Rocket,
  Search,
  CheckCircle2,
  Circle,
  AlertTriangle,
  ArrowLeft,
  UserCog,
  StickyNote,
  ShieldCheck,
  Building2,
  Activity,
} from "lucide-react";

const ATTENTION_STYLE: Record<string, string> = {
  normal: "border-accent text-accent",
  atencao: "border-warning text-warning",
  critico: "border-destructive text-destructive",
};
const ATTENTION_LABEL: Record<string, string> = {
  normal: "Normal",
  atencao: "Atenção",
  critico: "Crítico",
};

function fmt(d?: string | null) {
  return d ? new Date(d).toLocaleDateString("pt-BR") : "—";
}
function fmtDT(d?: string | null) {
  return d ? new Date(d).toLocaleString("pt-BR") : "—";
}

export default function DeploymentCenter() {
  const { isPlatformAdmin } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [ownerFilter, setOwnerFilter] = useState<string>("all");
  const [planFilter, setPlanFilter] = useState<string>("all");
  const [segmentFilter, setSegmentFilter] = useState<string>("all");
  const [openId, setOpenId] = useState<string | null>(null);

  // Diálogos
  const [ownerDialog, setOwnerDialog] = useState<any>(null);
  const [ownerChoice, setOwnerChoice] = useState<string>("");
  const [noteDialog, setNoteDialog] = useState<any>(null);
  const [noteText, setNoteText] = useState("");
  const [noteCategory, setNoteCategory] = useState("geral");
  const [validationDialog, setValidationDialog] = useState<any>(null);
  const [validationNote, setValidationNote] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["deployment-overview"],
    queryFn: async () => {
      const { data, error } = await sb.rpc("deployment_overview");
      if (error) throw error;
      return (data?.companies ?? []) as any[];
    },
  });

  /** Equipe LLZ elegível como responsável (account_type = llz_staff + papel global). */
  const { data: staff } = useQuery({
    queryKey: ["deployment-staff-options"],
    queryFn: async () => {
      const [profilesRes, rolesRes] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email, account_type").eq("account_type", "llz_staff"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      const roleIds = new Set((rolesRes.data ?? []).map((r: any) => r.user_id));
      return (profilesRes.data ?? []).filter((p: any) => roleIds.has(p.id));
    },
  });

  const rows = useMemo(() => {
    return (data ?? []).map((c) => ({ ...c, calc: computeDeployment(c) }));
  }, [data]);

  const plans = useMemo(() => Array.from(new Set(rows.map((r) => r.plan).filter(Boolean))), [rows]);
  const segments = useMemo(() => Array.from(new Set(rows.map((r) => r.segment).filter(Boolean))), [rows]);

  const filtered = rows.filter((r) => {
    const q = search.trim().toLowerCase();
    if (q && !`${r.name} ${r.owner_email ?? ""} ${r.owner_name ?? ""}`.toLowerCase().includes(q)) return false;
    if (stageFilter !== "all" && r.calc.stage !== stageFilter) return false;
    if (statusFilter !== "all" && (r.status ?? "active") !== statusFilter) return false;
    if (ownerFilter === "none" && r.deployment_owner_id) return false;
    if (ownerFilter !== "all" && ownerFilter !== "none" && r.deployment_owner_id !== ownerFilter) return false;
    if (planFilter !== "all" && r.plan !== planFilter) return false;
    if (segmentFilter !== "all" && r.segment !== segmentFilter) return false;
    return true;
  });

  const kpis = useMemo(() => {
    const byStage = (s: DeploymentStage) => rows.filter((r) => r.calc.stage === s).length;
    const inDeployment = rows.filter((r) => r.calc.stage !== "em_operacao").length;
    const avg = rows.length ? Math.round(rows.reduce((a, r) => a + r.calc.pct, 0) / rows.length) : 0;
    return {
      inDeployment,
      awaiting: byStage("aguardando_aprovacao") + byStage("cadastro"),
      configuring: byStage("configuracao") + byStage("preparacao_dados"),
      validating: byStage("primeira_movimentacao") + byStage("validacao_operacional"),
      ready: byStage("pronta"),
      operating: byStage("em_operacao"),
      attention: rows.filter((r) => r.calc.attention !== "normal").length,
      avg,
    };
  }, [rows]);

  const detailRow = rows.find((r) => r.id === openId) ?? null;

  const { data: detail } = useQuery({
    queryKey: ["deployment-detail", openId],
    enabled: !!openId,
    queryFn: async () => {
      const { data, error } = await sb.rpc("deployment_detail", { _company_id: openId });
      if (error) throw error;
      return data as any;
    },
  });

  const setOwner = useMutation({
    mutationFn: async ({ companyId, userId }: { companyId: string; userId: string | null }) =>
      rpcOk("deployment_set_owner", { _company_id: companyId, _user_id: userId }),
    onSuccess: () => {
      toast({ title: "Responsável LLZ atualizado" });
      setOwnerDialog(null);
      setOwnerChoice("");
      qc.invalidateQueries({ queryKey: ["deployment-overview"] });
    },
    onError: (e: any) => toast({ title: "Erro", description: friendlyError(e), variant: "destructive" }),
  });

  const addNote = useMutation({
    mutationFn: async ({ companyId }: { companyId: string }) => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await sb.from("company_deployment_notes").insert({
        company_id: companyId,
        author_id: auth.user?.id,
        category: noteCategory,
        note: noteText.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Nota interna registrada" });
      setNoteDialog(null);
      setNoteText("");
      setNoteCategory("geral");
      qc.invalidateQueries({ queryKey: ["deployment-detail"] });
      qc.invalidateQueries({ queryKey: ["deployment-overview"] });
    },
    onError: (e: any) => toast({ title: "Erro", description: friendlyError(e), variant: "destructive" }),
  });

  const validate = useMutation({
    mutationFn: async ({ companyId }: { companyId: string }) =>
      rpcOk("deployment_complete_validation", {
        _company_id: companyId,
        _note: validationNote.trim() || null,
      }),
    onSuccess: () => {
      toast({ title: "Validação assistida registrada" });
      setValidationDialog(null);
      setValidationNote("");
      qc.invalidateQueries({ queryKey: ["deployment-overview"] });
      qc.invalidateQueries({ queryKey: ["deployment-detail"] });
    },
    onError: (e: any) => toast({ title: "Não foi possível homologar", description: friendlyError(e), variant: "destructive" }),
  });

  if (error) {
    return (
      <div className="bg-card border border-destructive/30 rounded-xl p-4 text-sm">
        Não foi possível carregar as implantações. {friendlyError(error)}
      </div>
    );
  }

  // ---------------- Detalhe ----------------
  if (detailRow) {
    const c = detailRow;
    const calc = c.calc;
    const notes = detail?.notes ?? [];
    const history = detail?.history ?? [];
    const quick = [
      { label: "Produtos", to: "/produtos" },
      { label: "Endereços", to: "/enderecos" },
      { label: "Estoque", to: "/estoque" },
      { label: "Movimentações", to: "/movimentacoes" },
      { label: "Suporte", to: "/suporte" },
    ];
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <Button variant="ghost" size="sm" onClick={() => setOpenId(null)} className="gap-1">
            <ArrowLeft size={14} /> Voltar
          </Button>
          <h2 className="font-bold text-lg">{c.name}</h2>
          <Badge variant="outline" className="text-[10px]">{calc.stageLabel}</Badge>
          <Badge variant="outline" className={`text-[10px] ${ATTENTION_STYLE[calc.attention]}`}>
            {ATTENTION_LABEL[calc.attention]}
          </Badge>
          <span className="text-sm font-black text-primary ml-auto">{calc.pct}%</span>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Block title="Empresa" icon={<Building2 size={14} />}>
            <Row k="Status" v={c.status ?? "active"} />
            <Row k="Aprovação" v={c.approval_status ?? "pending"} />
            <Row k="Plano" v={c.plan ?? "—"} />
            <Row k="Segmento" v={c.segment ?? "—"} />
            <Row k="Tipo de negócio" v={c.business_type ?? "—"} />
            <Row k="Criada em" v={fmt(c.created_at)} />
          </Block>

          <Block title="Responsáveis" icon={<UserCog size={14} />}>
            <Row k="Proprietário" v={c.owner_name || c.owner_email || "—"} />
            <Row k="Ponto focal" v={c.focal_name || c.focal_email || "—"} />
            <Row k="Responsável LLZ" v={c.deployment_owner_name || c.deployment_owner_email || "não definido"} />
            {isPlatformAdmin && (
              <Button size="sm" variant="outline" className="mt-2 gap-1"
                onClick={() => { setOwnerDialog(c); setOwnerChoice(c.deployment_owner_id ?? ""); }}>
                <UserCog size={14} /> Definir responsável
              </Button>
            )}
          </Block>

          <Block title="Configuração">
            <Row k="Onboarding" v={c.onboarding_status ?? "—"} />
            <Row k="Modo operacional" v={c.operation_mode ?? "—"} />
            <Row k="Endereçamento" v={c.uses_addressing === false ? "não usa" : "usa"} />
            <Row k="Expedição" v={c.uses_expedition ? "usa" : "não usa"} />
            <Row k="Controla lote" v={c.controls_batch ? "sim" : "não"} />
            <Row k="Controla validade" v={c.controls_expiration ? "sim" : "não"} />
          </Block>

          <Block title="Dados">
            <Row k="Produtos" v={c.products} />
            <Row k="Endereços" v={c.uses_addressing === false ? "n/a" : c.addresses} />
            <Row k="Lotes" v={c.lots} />
            <Row k="Posições com estoque" v={c.stock_positions} />
          </Block>

          <Block title="Operação" icon={<Activity size={14} />}>
            <Row k="Primeira entrada" v={fmtDT(c.first_in_at)} />
            <Row k="Primeira saída" v={fmtDT(c.first_out_at)} />
            <Row k="Última movimentação" v={fmtDT(c.last_movement_at)} />
            <Row k="Saldo total" v={Number(c.stock_qty ?? 0)} />
            <Row k="Movimentações" v={c.movements} />
          </Block>

          <Block title="Equipe">
            <Row k="Total" v={c.members_total} />
            <Row k="Ativos" v={c.members_active} />
            <Row k="Bloqueados" v={c.members_blocked} />
            <Row k="Limite do plano" v={c.max_users ?? "sem limite"} />
          </Block>

          <Block title="Suporte">
            <Row k="Central acessada" v={Number(c.support_seen ?? 0) > 0 ? "sim" : "não"} />
            <Row k="Tickets" v={c.tickets_total} />
            <Row k="Em aberto" v={c.tickets_open} />
          </Block>

          <Block title="Checklist de ativação">
            <ul className="space-y-1">
              {calc.items.map((i) => (
                <li key={i.key} className="flex items-center gap-2 text-xs">
                  {i.done ? <CheckCircle2 size={13} className="text-primary" /> : <Circle size={13} className="text-muted-foreground" />}
                  <span className={i.done ? "text-muted-foreground line-through" : ""}>{i.label}</span>
                </li>
              ))}
              <li className="flex items-center gap-2 text-xs">
                {Number(c.movements_out ?? 0) > 0 ? <CheckCircle2 size={13} className="text-primary" /> : <Circle size={13} className="text-muted-foreground" />}
                <span className="text-muted-foreground">Primeira saída (marco operacional)</span>
              </li>
              <li className="flex items-center gap-2 text-xs">
                {calc.validated ? <CheckCircle2 size={13} className="text-primary" /> : <Circle size={13} className="text-muted-foreground" />}
                <span className="text-muted-foreground">Validação assistida concluída</span>
              </li>
            </ul>
          </Block>
        </div>

        {/* Homologação */}
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck size={16} className="text-primary" />
            <h3 className="font-semibold text-sm">Validação assistida</h3>
          </div>
          {calc.validated ? (
            <p className="text-xs text-muted-foreground">
              Homologada em {fmtDT(c.assisted_validation_at)}.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground mb-2">
              Confirma que a LLZ testou a operação com o cliente. Não substitui o checklist.
            </p>
          )}
          {isPlatformAdmin && !calc.validated && (
            <Button size="sm" onClick={() => setValidationDialog(c)} className="gap-1">
              <ShieldCheck size={14} /> Concluir validação assistida
            </Button>
          )}
        </div>

        {/* Notas internas */}
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <StickyNote size={16} className="text-primary" />
            <h3 className="font-semibold text-sm">Notas internas ({notes.length})</h3>
            <Button size="sm" variant="outline" className="ml-auto" onClick={() => setNoteDialog(c)}>
              Adicionar nota
            </Button>
          </div>
          {notes.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma nota registrada.</p>}
          <ul className="space-y-2">
            {notes.map((n: any) => (
              <li key={n.id} className="border border-border rounded-lg p-2.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="text-[10px]">{NOTE_CATEGORY_LABEL[n.category] ?? n.category}</Badge>
                  <span className="text-[11px] text-muted-foreground">
                    {n.author_name || n.author_email || "LLZ"} • {fmtDT(n.created_at)}
                  </span>
                </div>
                <p className="text-sm mt-1 whitespace-pre-wrap">{n.note}</p>
              </li>
            ))}
          </ul>
        </div>

        {/* Histórico */}
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="font-semibold text-sm mb-2">Histórico</h3>
          {history.length === 0 && <p className="text-xs text-muted-foreground">Sem eventos registrados.</p>}
          <ul className="space-y-1">
            {history.map((h: any) => (
              <li key={h.id} className="text-xs text-muted-foreground">
                {fmtDT(h.created_at)} — <span className="text-foreground">{h.action}</span>
                {h.actor_name || h.actor_email ? ` • ${h.actor_name || h.actor_email}` : ""}
              </li>
            ))}
          </ul>
        </div>

        {/* Ações rápidas */}
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="font-semibold text-sm mb-2">Ações rápidas</h3>
          <p className="text-[11px] text-muted-foreground mb-2">
            As telas operacionais exigem que esta empresa esteja selecionada no seletor de empresa.
          </p>
          <div className="flex flex-wrap gap-2">
            {quick.map((q) => (
              <Link key={q.to} to={q.to} className="text-xs px-2.5 py-1.5 rounded-md border border-border hover:border-primary/50">
                {q.label}
              </Link>
            ))}
            <Link to="/admin" className="text-xs px-2.5 py-1.5 rounded-md border border-border hover:border-primary/50">Gerenciar empresa</Link>
            <Link to="/admin" className="text-xs px-2.5 py-1.5 rounded-md border border-border hover:border-primary/50">Gerenciar equipe</Link>
            <Link to="/admin/global" className="text-xs px-2.5 py-1.5 rounded-md border border-border hover:border-primary/50">Atividade</Link>
          </div>
        </div>

        {renderDialogs()}
      </div>
    );
  }

  // ---------------- Lista ----------------
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-2">
        <Kpi label="Em implantação" value={kpis.inDeployment} />
        <Kpi label="Aguardando aprovação" value={kpis.awaiting} />
        <Kpi label="Configurando" value={kpis.configuring} />
        <Kpi label="Em validação" value={kpis.validating} />
        <Kpi label="Prontas para operar" value={kpis.ready} />
        <Kpi label="Em operação" value={kpis.operating} />
        <Kpi label="Atenção necessária" value={kpis.attention} tone={kpis.attention > 0 ? "warn" : undefined} />
      </div>

      <div className="text-xs text-muted-foreground">
        Percentual médio de implantação: <span className="font-bold text-foreground">{kpis.avg}%</span>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar empresa ou proprietário" className="pl-8 h-9" />
        </div>
        <FilterSelect value={stageFilter} onChange={setStageFilter} placeholder="Estágio"
          options={[{ value: "all", label: "Todos os estágios" }, ...STAGE_ORDER.map((s) => ({ value: s, label: STAGE_LABEL[s] }))]} />
        <FilterSelect value={statusFilter} onChange={setStatusFilter} placeholder="Status"
          options={[
            { value: "all", label: "Todos os status" },
            { value: "active", label: "Ativas" },
            { value: "trial", label: "Trial" },
            { value: "blocked", label: "Bloqueadas" },
            { value: "inactive", label: "Inativas" },
          ]} />
        <FilterSelect value={ownerFilter} onChange={setOwnerFilter} placeholder="Responsável LLZ"
          options={[
            { value: "all", label: "Qualquer responsável" },
            { value: "none", label: "Sem responsável" },
            ...(staff ?? []).map((s: any) => ({ value: s.id, label: s.full_name || s.email })),
          ]} />
        <FilterSelect value={planFilter} onChange={setPlanFilter} placeholder="Plano"
          options={[{ value: "all", label: "Todos os planos" }, ...plans.map((p) => ({ value: p, label: p }))]} />
        <FilterSelect value={segmentFilter} onChange={setSegmentFilter} placeholder="Segmento"
          options={[{ value: "all", label: "Todos os segmentos" }, ...segments.map((s) => ({ value: s, label: s }))]} />
      </div>

      {isLoading && <p className="text-sm text-muted-foreground py-6 text-center">Carregando implantações…</p>}
      {!isLoading && filtered.length === 0 && (
        <p className="text-sm text-muted-foreground py-6 text-center">Nenhuma implantação encontrada com os filtros atuais.</p>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {filtered.map((c) => {
          const calc = c.calc;
          return (
            <button key={c.id} onClick={() => setOpenId(c.id)} className="text-left bg-card border border-border rounded-xl p-4 hover:border-primary/50 transition-colors">
              <div className="flex items-start gap-2 flex-wrap">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-sm truncate">{c.name}</h3>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {c.owner_name || c.owner_email || "sem proprietário"} • criada em {fmt(c.created_at)}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-lg font-black text-primary leading-none">{calc.pct}%</div>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 mt-2">
                <Badge variant="outline" className="text-[10px]">{calc.stageLabel}</Badge>
                <Badge variant="outline" className="text-[10px]">{c.status ?? "active"}</Badge>
                {c.plan && <Badge variant="outline" className="text-[10px]">{c.plan}</Badge>}
                {c.segment && <Badge variant="outline" className="text-[10px]">{c.segment}</Badge>}
                <Badge variant="outline" className={`text-[10px] ${ATTENTION_STYLE[calc.attention]}`}>
                  {ATTENTION_LABEL[calc.attention]}
                </Badge>
              </div>

              <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden my-3">
                <div className="h-full bg-gradient-to-r from-primary to-accent" style={{ width: `${calc.pct}%` }} />
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center mb-2">
                <Mini label="Usuários" value={c.members_active} />
                <Mini label="Produtos" value={c.products} />
                {c.uses_addressing !== false && <Mini label="Endereços" value={c.addresses} />}
                <Mini label="Estoque" value={Number(c.stock_qty ?? 0)} />
                <Mini label="Movim." value={c.movements} />
                <Mini label="Tickets" value={c.tickets_total} />
              </div>

              <div className="text-[11px] text-muted-foreground space-y-0.5">
                <p>Ponto focal: {c.focal_name || c.focal_email || "—"}</p>
                <p>Responsável LLZ: {c.deployment_owner_name || c.deployment_owner_email || "não definido"}</p>
                <p>Última atividade: {fmtDT(c.last_activity_at)}</p>
                <p className="text-foreground font-medium">Próxima ação: {calc.nextAction}</p>
                {calc.attentionReason && (
                  <p className="flex items-center gap-1 text-warning"><AlertTriangle size={11} /> {calc.attentionReason}</p>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {renderDialogs()}
    </div>
  );

  function renderDialogs() {
    return (
      <>
        {/* Responsável LLZ */}
        <Dialog open={!!ownerDialog} onOpenChange={(o) => !o && setOwnerDialog(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Responsável LLZ pela implantação</DialogTitle>
              <DialogDescription>
                Vínculo administrativo interno. Não cria acesso à empresa nem vínculo de equipe do cliente.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <Label>Membro da Equipe LLZ</Label>
              <Select value={ownerChoice} onValueChange={setOwnerChoice}>
                <SelectTrigger><SelectValue placeholder="Selecione um membro" /></SelectTrigger>
                <SelectContent>
                  {(staff ?? []).map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>{s.full_name || s.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter className="gap-2">
              {ownerDialog?.deployment_owner_id && (
                <Button variant="outline" onClick={() => setOwner.mutate({ companyId: ownerDialog.id, userId: null })}>
                  Remover responsável
                </Button>
              )}
              <Button disabled={!ownerChoice || setOwner.isPending}
                onClick={() => setOwner.mutate({ companyId: ownerDialog.id, userId: ownerChoice })}>
                Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Nota interna */}
        <Dialog open={!!noteDialog} onOpenChange={(o) => !o && setNoteDialog(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nota interna da implantação</DialogTitle>
              <DialogDescription>Visível apenas para a equipe LLZ.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Categoria</Label>
                <Select value={noteCategory} onValueChange={setNoteCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {NOTE_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Nota</Label>
                <Textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} rows={4} placeholder="Ex.: treinamento marcado para quarta" />
              </div>
            </div>
            <DialogFooter>
              <Button disabled={!noteText.trim() || addNote.isPending} onClick={() => addNote.mutate({ companyId: noteDialog.id })}>
                Registrar nota
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Validação assistida */}
        <Dialog open={!!validationDialog} onOpenChange={(o) => !o && setValidationDialog(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Concluir validação assistida</DialogTitle>
              <DialogDescription>
                Confirma que a LLZ validou a operação de {validationDialog?.name} com o cliente. Registra autor e data/hora.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label>Observação (opcional)</Label>
              <Textarea value={validationNote} onChange={(e) => setValidationNote(e.target.value)} rows={3} />
            </div>
            <DialogFooter>
              <Button disabled={validate.isPending} onClick={() => validate.mutate({ companyId: validationDialog.id })}>
                Confirmar validação
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }
}

function Kpi({ label, value, tone }: { label: string; value: number; tone?: "warn" }) {
  return (
    <div className={`bg-card border rounded-xl p-3 ${tone === "warn" ? "border-warning/50" : "border-border"}`}>
      <div className={`text-xl font-black ${tone === "warn" ? "text-warning" : "text-primary"}`}>{value}</div>
      <div className="text-[11px] text-muted-foreground leading-tight">{label}</div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-lg bg-secondary/60 py-1.5">
      <div className="text-sm font-bold">{value ?? 0}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

function Block({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <h3 className="font-semibold text-sm">{title}</h3>
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: any }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-medium text-right truncate">{String(v ?? "—")}</span>
    </div>
  );
}

function FilterSelect({
  value, onChange, options, placeholder,
}: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; placeholder: string }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-9 w-auto min-w-[150px] text-xs"><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        {options.map((o) => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

export { Rocket as DeploymentIcon };
