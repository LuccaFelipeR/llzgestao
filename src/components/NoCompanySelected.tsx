import { Building2 } from "lucide-react";
import { Link } from "react-router-dom";

interface Props {
  title?: string;
  description?: string;
}

export default function NoCompanySelected({
  title = "Nenhuma empresa selecionada",
  description = "Selecione uma empresa no seletor superior para visualizar dados operacionais isolados por empresa.",
}: Props) {
  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="bg-card border border-border rounded-2xl p-8 text-center">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <Building2 className="text-primary" size={24} />
        </div>
        <h2 className="text-lg font-bold mb-1">{title}</h2>
        <p className="text-sm text-muted-foreground mb-4">{description}</p>
        <Link
          to="/admin"
          className="inline-flex items-center gap-2 text-xs font-semibold text-primary hover:underline"
        >
          Ir para o painel administrativo
        </Link>
      </div>
    </div>
  );
}
