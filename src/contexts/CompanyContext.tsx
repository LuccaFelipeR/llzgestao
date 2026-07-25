import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface Company {
  id: string;
  name: string;
  business_type: string;
  operation_mode: string;
  plan: string;
  logo_url: string | null;
  settings: any;
  onboarding_completed: boolean;
  status?: string;
  main_focal_user_id?: string | null;
  approval_status?: string;
  approval_reason?: string | null;
  // Phase 6.10 - operational configuration
  controls_batch?: boolean;
  controls_expiration?: boolean;
  handles_perishables?: boolean;
  uses_addressing?: boolean;
  uses_expedition?: boolean;
  plans_csv_import?: boolean;
  segment?: string | null;
  estimated_size?: string | null;
  estimated_users?: string | null;
  onboarding_step?: number;
  onboarding_status?: string;
  onboarding_completed_at?: string | null;
  activation_checklist_dismissed?: boolean;
  created_at?: string;
  updated_at?: string;
}

interface AvailableCompany {
  id: string;
  name: string;
  role: string;
  is_main_focal_point?: boolean;
}

interface CompanyContextType {
  // Legacy (kept for backward compatibility)
  company: Company | null;
  companyId: string | null;
  loading: boolean;
  refetch: () => Promise<void>;
  // Phase 3 additions
  currentCompany: Company | null;
  currentCompanyId: string | null;
  currentUserRole: string | null;
  isSuperAdmin: boolean;
  isCompanyAdmin: boolean;
  isFocalPoint: boolean;
  availableCompanies: AvailableCompany[];
  switchCompany: (companyId: string) => Promise<void>;
  // Phase 6.14 — modo de manutenção da equipe LLZ
  isMaintenanceMode: boolean;
  exitMaintenanceMode: () => Promise<void>;
  isMemberOfCurrent: boolean;
}

const CompanyContext = createContext<CompanyContextType>({
  company: null,
  companyId: null,
  loading: true,
  refetch: async () => {},
  currentCompany: null,
  currentCompanyId: null,
  currentUserRole: null,
  isSuperAdmin: false,
  isCompanyAdmin: false,
  isFocalPoint: false,
  availableCompanies: [],
  switchCompany: async () => {},
  isMaintenanceMode: false,
  exitMaintenanceMode: async () => {},
  isMemberOfCurrent: false,
});

const STORAGE_KEY = "llz:selected_company_id";
const MAINT_KEY = "llz:maintenance_company_id";

export function CompanyProvider({ children }: { children: ReactNode }) {
  const { user, isPlatformStaff, isPlatformSuperAdmin } = useAuth();
  const isSuperAdmin = isPlatformSuperAdmin;
  const [company, setCompany] = useState<Company | null>(null);
  const [availableCompanies, setAvailableCompanies] = useState<AvailableCompany[]>([]);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [memberCompanyIds, setMemberCompanyIds] = useState<string[]>([]);
  const [isMaintenanceMode, setIsMaintenanceMode] = useState(false);
  const [loading, setLoading] = useState(true);

  async function logActivity(action: string, companyId: string, details: any) {
    if (!user) return;
    try {
      await (supabase as any).from("activity_log").insert({
        user_id: user.id,
        action,
        entity_type: "company",
        entity_id: companyId,
        details,
        company_id: companyId,
      });
    } catch {
      /* auditoria nunca deve travar a navegação */
    }
  }

  const fetchCompany = useCallback(async () => {
    if (!user) {
      setCompany(null);
      setAvailableCompanies([]);
      setCurrentUserRole(null);
      setMemberCompanyIds([]);
      setIsMaintenanceMode(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // Memberships of this user
      const { data: memberships } = await (supabase as any)
        .from("company_members")
        .select("company_id, role, is_main_focal_point, companies(id,name)")
        .eq("user_id", user.id);

      let available: AvailableCompany[] = (memberships ?? [])
        .filter((m: any) => m.companies)
        .map((m: any) => ({
          id: m.company_id,
          name: m.companies?.name ?? "—",
          role: m.role,
          is_main_focal_point: m.is_main_focal_point,
        }));

      const memberIds = available.map((a) => a.id);
      setMemberCompanyIds(memberIds);

      // Equipe LLZ: pode listar todas as empresas para manutenção
      if (isPlatformStaff) {
        const { data: allCompanies } = await (supabase as any)
          .from("companies")
          .select("id, name")
          .order("name");
        const existingIds = new Set(available.map((a) => a.id));
        (allCompanies ?? []).forEach((c: any) => {
          if (!existingIds.has(c.id)) {
            available.push({ id: c.id, name: c.name, role: "platform_staff" });
          }
        });
      }
      setAvailableCompanies(available);

      // Seleção da empresa atual.
      // Equipe LLZ: NUNCA seleciona automaticamente — só via modo de manutenção
      // explícito (ou empresa própria, quando existir membership).
      let pickId: string | null = null;
      let maintenance = false;

      if (isPlatformStaff) {
        const maint = sessionStorage.getItem(MAINT_KEY);
        if (maint && available.some((a) => a.id === maint)) {
          pickId = maint;
          maintenance = !memberIds.includes(maint);
        }
      } else {
        const stored = localStorage.getItem(STORAGE_KEY);
        pickId =
          (stored && available.find((a) => a.id === stored)?.id) ??
          available[0]?.id ??
          null;
      }

      setIsMaintenanceMode(maintenance);

      if (pickId) {
        const { data: companyData } = await (supabase as any)
          .from("companies")
          .select("*")
          .eq("id", pickId)
          .single();
        setCompany(companyData as Company | null);
        const picked = available.find((a) => a.id === pickId);
        setCurrentUserRole(picked?.role ?? null);
      } else {
        setCompany(null);
        setCurrentUserRole(null);
      }
    } catch (e) {
      console.error("CompanyContext fetch error", e);
    }
    setLoading(false);
  }, [user?.id, isPlatformStaff]);

  useEffect(() => {
    fetchCompany();
  }, [fetchCompany]);

  const switchCompany = useCallback(
    async (companyId: string) => {
      const target = availableCompanies.find((a) => a.id === companyId);
      if (!target) return;

      const { data: companyData } = await (supabase as any)
        .from("companies")
        .select("*")
        .eq("id", companyId)
        .single();

      const maintenance = isPlatformStaff && !memberCompanyIds.includes(companyId);
      if (maintenance) {
        sessionStorage.setItem(MAINT_KEY, companyId);
        setIsMaintenanceMode(true);
        await logActivity("maintenance_mode_entered", companyId, {
          company_name: (companyData as any)?.name ?? null,
        });
      } else {
        if (isPlatformStaff) sessionStorage.setItem(MAINT_KEY, companyId);
        localStorage.setItem(STORAGE_KEY, companyId);
        setIsMaintenanceMode(false);
      }

      setCompany(companyData as Company | null);
      setCurrentUserRole(target.role);
    },
    [availableCompanies, isPlatformStaff, memberCompanyIds, user?.id],
  );

  const exitMaintenanceMode = useCallback(async () => {
    const leaving = company;
    sessionStorage.removeItem(MAINT_KEY);
    setIsMaintenanceMode(false);
    setCompany(null);
    setCurrentUserRole(null);
    if (leaving) {
      await logActivity("maintenance_mode_exited", leaving.id, { company_name: leaving.name });
    }
  }, [company?.id, user?.id]);

  const currentCompanyId = company?.id ?? null;
  const isFocalPoint =
    !!user && !!company && company.main_focal_user_id === user.id;
  const isCompanyAdmin =
    currentUserRole === "owner" ||
    currentUserRole === "admin" ||
    isSuperAdmin;

  return (
    <CompanyContext.Provider
      value={{
        company,
        companyId: currentCompanyId,
        loading,
        refetch: fetchCompany,
        currentCompany: company,
        currentCompanyId,
        currentUserRole,
        isSuperAdmin,
        isCompanyAdmin,
        isFocalPoint,
        availableCompanies,
        switchCompany,
        isMaintenanceMode,
        exitMaintenanceMode,
        isMemberOfCurrent: !!currentCompanyId && memberCompanyIds.includes(currentCompanyId),
      }}
    >
      {children}
    </CompanyContext.Provider>
  );
}

export const useCompany = () => useContext(CompanyContext);
