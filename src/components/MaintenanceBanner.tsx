import { ShieldAlert, LogOut } from "lucide-react";
import { useCompany } from "@/contexts/CompanyContext";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function MaintenanceBanner() {
  const { isMaintenanceMode, company, exitMaintenanceMode } = useCompany();
  const navigate = useNavigate();

  if (!isMaintenanceMode || !company) return null;

  return (
    <div className="sticky top-14 z-20 bg-warning/15 border-b border-warning/40 px-3 sm:px-6 py-2 flex items-center gap-3">
      <ShieldAlert size={16} className="text-warning shrink-0" />
      <p className="text-xs font-semibold text-foreground truncate">
        Modo de manutenção — Empresa: {company.name}
      </p>
      <Button
        variant="outline"
        size="sm"
        className="ml-auto h-7 text-[11px] shrink-0"
        onClick={async () => {
          await exitMaintenanceMode();
          navigate("/admin/global");
        }}
      >
        <LogOut size={12} className="mr-1" /> Sair do modo de manutenção
      </Button>
    </div>
  );
}
