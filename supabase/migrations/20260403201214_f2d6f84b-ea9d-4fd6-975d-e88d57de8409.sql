
-- Fix stock_balance INSERT policy
DROP POLICY IF EXISTS "System can insert company stock" ON public.stock_balance;
CREATE POLICY "System can insert company stock" ON public.stock_balance
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Fix stock_balance UPDATE policy  
DROP POLICY IF EXISTS "System can update company stock" ON public.stock_balance;
CREATE POLICY "System can update company stock" ON public.stock_balance
  FOR UPDATE TO authenticated
  USING (true);

-- Fix activity_log INSERT policy
DROP POLICY IF EXISTS "System can insert activity_log" ON public.activity_log;
CREATE POLICY "System can insert activity_log" ON public.activity_log
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Note: profiles and company_members system insert policies with true are needed
-- for the handle_new_user trigger (SECURITY DEFINER) which runs as the function owner
