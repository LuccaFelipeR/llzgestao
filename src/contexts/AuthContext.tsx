import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

/**
 * Papéis GLOBAIS da plataforma (equipe LLZ) — vivem em public.user_roles.
 * Papéis de EMPRESA (owner/admin/member/...) vivem em public.company_members
 * e são expostos pelo CompanyContext. Os dois modelos são independentes.
 */
export const PLATFORM_ROLES = [
  "super_admin",
  "admin", // legado = super admin
  "platform_admin",
  "support_agent",
  "developer",
] as const;

const SUPER_ADMIN_ROLES = ["super_admin", "admin"];
/** Administração de clientes: espelha public.is_platform_client_admin */
const CLIENT_ADMIN_ROLES = ["super_admin", "admin", "platform_admin"];
const SUPPORT_ROLES = ["super_admin", "admin", "platform_admin", "support_agent"];

export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export const PLATFORM_ROLE_LABEL: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Super Admin (legado)",
  platform_admin: "Admin da Plataforma",
  support_agent: "Agente de Suporte",
  developer: "Desenvolvedor",
};

interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  is_approved: boolean;
  rejection_reason?: string | null;
  /** Tipo de conta: 'customer' (cliente) ou 'llz_staff' (equipe LLZ) */
  account_type?: string | null;
}


interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  /** Primeiro papel global encontrado (compatibilidade) */
  role: string | null;
  roles: string[];
  platformRole: string | null;
  /** Tipo de conta declarado no profile (fonte de verdade do backend) */
  accountType: "customer" | "llz_staff";
  /** Conta marcada como equipe LLZ (independe de já possuir papel global) */
  isStaffAccount: boolean;
  /** Conta LLZ que ainda não recebeu papel global (aguardando ativação) */
  isStaffPendingActivation: boolean;
  /** true para qualquer papel global da equipe LLZ */
  isPlatformStaff: boolean;
  isPlatformSuperAdmin: boolean;
  /** super_admin/admin legado/platform_admin — pode administrar clientes e vínculos */
  isPlatformAdmin: boolean;
  isSupportStaff: boolean;
  /** Compat: "é equipe LLZ" (apenas visibilidade de áreas administrativas) */
  isAdmin: boolean;
  isApproved: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}


const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  role: null,
  roles: [],
  platformRole: null,
  accountType: "customer",
  isStaffAccount: false,
  isStaffPendingActivation: false,
  isPlatformStaff: false,

  isPlatformSuperAdmin: false,
  isPlatformAdmin: false,
  isSupportStaff: false,
  isAdmin: false,
  isApproved: false,
  loading: true,
  signOut: async () => {},
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchProfileAndRole(userId: string) {
    const [profileRes, rolesRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);
    setProfile(profileRes.data as Profile | null);
    setRoles(((rolesRes.data ?? []) as { role: string }[]).map((r) => r.role));
  }

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        if (session?.user) {
          // Use setTimeout to avoid Supabase auth deadlock
          setTimeout(() => fetchProfileAndRole(session.user.id), 0);
        } else {
          setProfile(null);
          setRoles([]);
        }
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        fetchProfileAndRole(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    setRoles([]);
  };

  const refreshProfile = async () => {
    if (session?.user) await fetchProfileAndRole(session.user.id);
  };

  const platformRoles = roles.filter((r) => (PLATFORM_ROLES as readonly string[]).includes(r));
  const isPlatformSuperAdmin = roles.some((r) => SUPER_ADMIN_ROLES.includes(r));
  const accountType: "customer" | "llz_staff" =
    profile?.account_type === "llz_staff" ? "llz_staff" : "customer";
  // Novo modelo: acesso interno vem da ATIVAÇÃO da conta LLZ (ou do super admin),
  // não de papéis globais. Papéis legados seguem valendo como ativação.
  const isStaffActivated =
    accountType === "llz_staff" && !!(profile as { staff_activated_at?: string | null } | null)?.staff_activated_at;
  const isPlatformStaff = isPlatformSuperAdmin || isStaffActivated || platformRoles.length > 0;
  const isPlatformAdmin = isPlatformStaff;
  const isSupportStaff = isPlatformStaff;
  const isStaffAccount = accountType === "llz_staff" || isPlatformStaff;
  const isStaffPendingActivation = accountType === "llz_staff" && !isPlatformStaff;


  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        profile,
        role: roles[0] ?? null,
        roles,
        platformRole: platformRoles[0] ?? null,
        accountType,
        isStaffAccount,
        isStaffPendingActivation,
        isPlatformStaff,

        isPlatformSuperAdmin,
        isPlatformAdmin,
        isSupportStaff,
        // Equipe LLZ acessa as áreas administrativas; ações destrutivas
        // continuam protegidas por RLS (super admin) no banco.
        isAdmin: isPlatformStaff,
        // Usuário global nunca fica preso na tela de aprovação
        isApproved: isPlatformStaff || (profile?.is_approved ?? false),
        loading,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
