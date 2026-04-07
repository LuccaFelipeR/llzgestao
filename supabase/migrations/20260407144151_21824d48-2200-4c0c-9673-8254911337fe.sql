
-- Table for tab access control per user
CREATE TABLE IF NOT EXISTS public.user_tab_permissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  tab_key TEXT NOT NULL,
  is_allowed BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, tab_key)
);

ALTER TABLE public.user_tab_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage tab permissions"
  ON public.user_tab_permissions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can read own tab permissions"
  ON public.user_tab_permissions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Allow admins to delete profiles (for user deletion)
CREATE POLICY "Admins can delete profiles"
  ON public.profiles FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to delete company_members 
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Company admins can delete members') THEN
    NULL; -- already exists
  END IF;
END$$;

-- Reconnect triggers
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

DROP TRIGGER IF EXISTS check_stock_before_movement ON public.movements;
CREATE TRIGGER check_stock_before_movement
  BEFORE INSERT ON public.movements
  FOR EACH ROW EXECUTE FUNCTION public.check_stock_before_movement();

DROP TRIGGER IF EXISTS process_movement_trigger ON public.movements;
CREATE TRIGGER process_movement_trigger
  AFTER INSERT ON public.movements
  FOR EACH ROW EXECUTE FUNCTION public.process_movement();

DROP TRIGGER IF EXISTS log_movement_activity_trigger ON public.movements;
CREATE TRIGGER log_movement_activity_trigger
  AFTER INSERT ON public.movements
  FOR EACH ROW EXECUTE FUNCTION public.log_movement_activity();
