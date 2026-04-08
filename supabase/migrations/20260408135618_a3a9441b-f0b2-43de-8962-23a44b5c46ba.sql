
-- 1. Fix profiles: replace public INSERT with authenticated-only
DROP POLICY IF EXISTS "System can insert profiles" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

-- 2. Fix companies: replace public INSERT with authenticated-only
DROP POLICY IF EXISTS "System can insert companies" ON public.companies;
CREATE POLICY "Authenticated users can insert companies" ON public.companies
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- 3. Add explicit deny UPDATE on user_roles
CREATE POLICY "No one can update roles" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (false);

-- 4. Fix get_user_company_id to be deterministic
CREATE OR REPLACE FUNCTION public.get_user_company_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT company_id FROM public.company_members WHERE user_id = _user_id ORDER BY created_at ASC LIMIT 1
$$;
