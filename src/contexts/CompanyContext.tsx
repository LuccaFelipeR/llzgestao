import { createContext, useContext, useEffect, useState, ReactNode } from "react";
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
}

interface CompanyContextType {
  company: Company | null;
  companyId: string | null;
  loading: boolean;
  refetch: () => Promise<void>;
}

const CompanyContext = createContext<CompanyContextType>({
  company: null,
  companyId: null,
  loading: true,
  refetch: async () => {},
});

export function CompanyProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);

  async function fetchCompany() {
    if (!user) {
      setCompany(null);
      setLoading(false);
      return;
    }
    try {
      const { data: membership } = await supabase
        .from("company_members" as any)
        .select("company_id")
        .eq("user_id", user.id)
        .limit(1)
        .single();

      if (membership?.company_id) {
        const { data: companyData } = await supabase
          .from("companies" as any)
          .select("*")
          .eq("id", membership.company_id)
          .single();
        setCompany(companyData as Company | null);
      }
    } catch {
      // No company yet
    }
    setLoading(false);
  }

  useEffect(() => {
    fetchCompany();
  }, [user?.id]);

  return (
    <CompanyContext.Provider value={{ company, companyId: company?.id ?? null, loading, refetch: fetchCompany }}>
      {children}
    </CompanyContext.Provider>
  );
}

export const useCompany = () => useContext(CompanyContext);
