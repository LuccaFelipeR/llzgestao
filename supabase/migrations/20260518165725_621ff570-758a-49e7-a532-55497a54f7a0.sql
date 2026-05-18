-- Super admins can view all companies
CREATE POLICY "Admins can view all companies"
ON public.companies FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Super admins can view all company members
CREATE POLICY "Admins can view all company members"
ON public.company_members FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Super admins can update any company member (for focal point / activation)
CREATE POLICY "Admins can update company members"
ON public.company_members FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Allow company admins (within same company) to update their members
CREATE POLICY "Company admins can update own company members"
ON public.company_members FOR UPDATE
TO authenticated
USING (
  company_id = public.get_user_company_id(auth.uid())
  AND public.has_role(auth.uid(), 'admin')
)
WITH CHECK (
  company_id = public.get_user_company_id(auth.uid())
  AND public.has_role(auth.uid(), 'admin')
);