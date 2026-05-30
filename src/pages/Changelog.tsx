import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileClock, Loader2, Sparkles, Bug, Shield, Database, Palette, Zap, Wrench } from "lucide-react";

const TYPE_META: Record<string, { icon: any; color: string; label: string }> = {
  feature: { icon: Sparkles, color: "bg-primary/10 text-primary border-primary/20", label: "Feature" },
  fix: { icon: Bug, color: "bg-warning/10 text-warning border-warning/20", label: "Fix" },
  security: { icon: Shield, color: "bg-destructive/10 text-destructive border-destructive/20", label: "Security" },
  database: { icon: Database, color: "bg-accent/10 text-accent border-accent/20", label: "Database" },
  ui: { icon: Palette, color: "bg-secondary text-secondary-foreground border-border", label: "UI" },
  performance: { icon: Zap, color: "bg-success/10 text-success border-success/20", label: "Performance" },
  refactor: { icon: Wrench, color: "bg-muted text-muted-foreground border-border", label: "Refactor" },
};

export default function Changelog() {
  const { data, isLoading } = useQuery({
    queryKey: ["system-changelog"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_changelog")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <FileClock className="text-primary" size={20} />
        </div>
        <div>
          <h1 className="text-2xl font-black tracking-tight">Changelog do Sistema</h1>
          <p className="text-sm text-muted-foreground">Histórico de evolução, correções e novas features.</p>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="animate-spin text-primary" />
        </div>
      )}

      <div className="space-y-4">
        {data?.map((entry) => {
          const meta = TYPE_META[entry.change_type] ?? TYPE_META.feature;
          const Icon = meta.icon;
          return (
            <Card key={entry.id} className="overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Icon size={18} className="text-primary" />
                    <CardTitle className="text-base sm:text-lg">{entry.title}</CardTitle>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {entry.version && (
                      <Badge variant="outline" className="font-mono text-[10px]">v{entry.version}</Badge>
                    )}
                    <Badge className={`text-[10px] border ${meta.color}`} variant="outline">{meta.label}</Badge>
                    <span className="text-[11px] text-muted-foreground">
                      {new Date(entry.created_at).toLocaleDateString("pt-BR")}
                    </span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{entry.description}</p>
                {entry.affected_modules?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {entry.affected_modules.map((m: string) => (
                      <span key={m} className="text-[10px] px-2 py-0.5 rounded-md bg-secondary text-secondary-foreground font-mono">
                        {m}
                      </span>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
        {data && data.length === 0 && (
          <div className="text-center py-12 text-sm text-muted-foreground">Nenhuma entrada no changelog ainda.</div>
        )}
      </div>
    </div>
  );
}
