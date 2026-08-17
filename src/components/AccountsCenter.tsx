import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { sb } from "@/lib/db-any";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, IdCard, Crown, Building2 } from "lucide-react";
import UserDetailDialog, {
  COMPANY_ROLE_LABELS,
  UserOverviewRow,
  accountLabel,
  statusLabel,
} from "@/components/UserDetailDialog";

type Filter = "all" | "pending" | "customers" | "no_company" | "staff" | "blocked";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Todas" },
  { key: "pending", label: "Pendentes" },
  { key: "customers", label: "Clientes" },
  { key: "no_company", label: "Sem empresa" },
  { key: "staff", label: "Equipe LLZ" },
  { key: "blocked", label: "Bloqueadas" },
];

interface Props {
  /** Abre direto uma pessoa (usado pela Central da Equipe LLZ). */
  initialUserId?: string | null;
}

export default function AccountsCenter({ initialUserId }: Props) {
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(initialUserId ?? null);

  useEffect(() => {
    if (initialUserId) setOpenId(initialUserId);
  }, [initialUserId]);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-users-overview"],
    queryFn: async () => {
      const { data, error } = await sb.rpc("admin_users_overview", { _search: null });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return (data?.items ?? []) as UserOverviewRow[];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? []).filter((r) => {
      if (q && !`${r.full_name ?? ""} ${r.email ?? ""}`.toLowerCase().includes(q)) return false;
      if (filter === "pending") return !r.is_approved;
      if (filter === "customers") return r.account_type !== "llz_staff";
      if (filter === "no_company") return r.account_type !== "llz_staff" && r.companies.length === 0;
      if (filter === "staff") return r.account_type === "llz_staff";
      if (filter === "blocked") return !r.is_approved && !!r.rejection_reason;
      return true;
    });
  }, [data, search, filter]);

  return (
    <div className="space-y-3">
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <IdCard size={16} className="text-primary" /> Central de usuários
        </h3>
        <p className="text-[11px] text-muted-foreground mt-1">
          Uma pessoa = uma conta. Existem apenas dois tipos: <strong>Cliente</strong> e <strong>Equipe LLZ</strong>.
          Empresas são vínculos da conta. Cliente sem empresa é estado válido.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex gap-1 bg-secondary rounded-xl p-1 overflow-x-auto">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                filter === f.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8 h-9 text-sm"
            placeholder="Buscar por nome ou e-mail"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {isLoading && <p className="text-xs text-muted-foreground">Carregando contas...</p>}
      {!isLoading && filtered.length === 0 && (
        <p className="text-sm text-muted-foreground py-6 text-center">Nenhuma conta nesta visão.</p>
      )}

      <div className="space-y-2">
        {filtered.map((r) => (
          <div key={r.id} className="bg-card border border-border rounded-xl p-4 space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-sm truncate">{r.full_name || "Sem nome"}</p>
                <p className="text-xs text-muted-foreground truncate">{r.email}</p>
              </div>
              <div className="flex gap-1 flex-wrap">
                <Badge variant="outline" className="text-[10px]">{accountLabel(r)}</Badge>
                <Badge variant={r.is_approved ? "secondary" : "outline"} className="text-[10px]">
                  {statusLabel(r)}
                </Badge>
                {r.is_super_admin && <Badge className="text-[10px] gap-1"><Crown size={10} /> Super Admin</Badge>}
                {r.account_type === "llz_staff" && !r.is_staff_active && !r.is_super_admin && (
                  <Badge variant="outline" className="text-[10px]">Aguardando ativação</Badge>
                )}
              </div>
            </div>

            <div className="text-[11px] text-muted-foreground space-y-0.5">
              {r.account_type === "llz_staff" ? (
                <p>Empresa: Nenhuma (esperado para Equipe LLZ)</p>
              ) : r.companies.length === 0 ? (
                <p className="flex items-center gap-1"><Building2 size={11} /> Cliente · Sem empresa</p>
              ) : (
                <p className="flex items-center gap-1">
                  <Building2 size={11} />
                  {r.companies
                    .map(
                      (c) =>
                        `${c.company} (${COMPANY_ROLE_LABELS[c.role] ?? c.role}${c.is_active ? "" : " · bloqueado"}${
                          c.is_main_focal_point ? " · ponto focal" : ""
                        })`,
                    )
                    .join(", ")}
                </p>
              )}
              <p>
                Última atividade:{" "}
                {r.last_activity ? new Date(r.last_activity).toLocaleString("pt-BR") : "sem registro"}
              </p>
            </div>

            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setOpenId(r.id)}>
              Abrir e administrar
            </Button>
          </div>
        ))}
      </div>

      <UserDetailDialog userId={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}
