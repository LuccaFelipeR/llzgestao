CREATE OR REPLACE FUNCTION public.is_platform_client_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role::text IN ('super_admin','admin','platform_admin')
  )
$$;

REVOKE ALL ON FUNCTION public.is_platform_client_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_client_admin(uuid) TO authenticated, service_role;

-- support_agent / developer não podem mais alterar vínculos nem cadastros de empresa
DROP POLICY IF EXISTS "Platform staff manage members" ON public.company_members;
CREATE POLICY "Platform client admins manage members"
ON public.company_members FOR UPDATE TO authenticated
USING (public.is_platform_client_admin(auth.uid()))
WITH CHECK (public.is_platform_client_admin(auth.uid()));

DROP POLICY IF EXISTS "Platform staff update companies" ON public.companies;
CREATE POLICY "Platform client admins update companies"
ON public.companies FOR UPDATE TO authenticated
USING (public.is_platform_client_admin(auth.uid()))
WITH CHECK (public.is_platform_client_admin(auth.uid()));
