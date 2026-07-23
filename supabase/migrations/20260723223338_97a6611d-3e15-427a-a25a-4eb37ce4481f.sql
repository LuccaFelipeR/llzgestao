
-- Fase 6.11: tighten companies UPDATE policy to owner/admin/focal only

CREATE OR REPLACE FUNCTION public.is_company_admin_of(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.company_members
    WHERE user_id = _user_id
      AND company_id = _company_id
      AND is_active = true
      AND (role IN ('owner','admin') OR is_main_focal_point = true)
  )
$$;

REVOKE EXECUTE ON FUNCTION public.is_company_admin_of(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_company_admin_of(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Admins can update their company" ON public.companies;

CREATE POLICY "Company admins can update their company"
ON public.companies
FOR UPDATE
TO authenticated
USING (public.is_company_admin_of(auth.uid(), id))
WITH CHECK (public.is_company_admin_of(auth.uid(), id));
