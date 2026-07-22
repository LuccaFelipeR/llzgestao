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
});

const STORAGE_KEY = "llz:selected_company_id";

export function CompanyProvider({ children }: { children: ReactNode }) {
  const { user, isAdmin: isSuperAdmin } = useAuth();
  const [company, setCompany] = useState<Company | null>(null);
  const [availableCompanies, setAvailableCompanies] = useState<AvailableCompany[]>([]);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchCompany = useCallback(async () => {
    if (!user) {
      setCompany(null);
      setAvailableCompanies([]);
      setCurrentUserRole(null);
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

      // Super admin: can see all companies as available
      if (isSuperAdmin) {
        const { data: allCompanies } = await (supabase as any)
          .from("companies")
          .select("id, name")
          .order("name");
        const existingIds = new Set(available.map((a) => a.id));
        (allCompanies ?? []).forEach((c: any) => {
          if (!existingIds.has(c.id)) {
            available.push({ id: c.id, name: c.name, role: "super_admin" });
          }
        });
      }
      setAvailableCompanies(available);

      // Pick selected
      const stored = localStorage.getItem(STORAGE_KEY);
      const pickId =
        (stored && available.find((a) => a.id === stored)?.id) ??
        available[0]?.id ??
        null;

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
  }, [user?.id, isSuperAdmin]);

  useEffect(() => {
    fetchCompany();
  }, [fetchCompany]);

  const switchCompany = useCallback(
    async (companyId: string) => {
      const target = availableCompanies.find((a) => a.id === companyId);
      if (!target) return;
      // Only super admin can freely switch; regular users can switch among
      // companies they're members of.
      localStorage.setItem(STORAGE_KEY, companyId);
      const { data: companyData } = await (supabase as any)
        .from("companies")
        .select("*")
        .eq("id", companyId)
        .single();
      setCompany(companyData as Company | null);
      setCurrentUserRole(target.role);
    },
    [availableCompanies],
  );

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
      }}
    >
      {children}
    </CompanyContext.Provider>
  );
}

export const useCompany = () => useContext(CompanyContext);
