
-- Fix companies INSERT: scope to authenticated but remove overly permissive WITH CHECK (true)
-- Companies are created by the handle_new_user trigger (SECURITY DEFINER), so direct inserts should be restricted
DROP POLICY IF EXISTS "Authenticated users can insert companies" ON public.companies;
CREATE POLICY "System can insert companies" ON public.companies
  FOR INSERT TO authenticated
  WITH CHECK (false);
