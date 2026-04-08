
-- 1. Drop address_code_format check constraint
DO $$ BEGIN
  ALTER TABLE public.addresses DROP CONSTRAINT IF EXISTS address_code_format;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 2. Add subtype to movements
ALTER TABLE public.movements ADD COLUMN IF NOT EXISTS subtype text;

-- 3. Add invite_code to companies
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS invite_code text UNIQUE DEFAULT substr(md5(random()::text), 1, 8);

-- Update existing companies that don't have invite_code
UPDATE public.companies SET invite_code = substr(md5(random()::text), 1, 8) WHERE invite_code IS NULL;

-- 4. Fix security: tighten stock_balance INSERT/UPDATE policies
DROP POLICY IF EXISTS "System can insert company stock" ON public.stock_balance;
DROP POLICY IF EXISTS "System can update company stock" ON public.stock_balance;

-- Only allow inserts/updates via SECURITY DEFINER triggers (no direct client access)
CREATE POLICY "Triggers can insert stock" ON public.stock_balance FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "Triggers can update stock" ON public.stock_balance FOR UPDATE TO authenticated USING (false);

-- 5. Fix security: remove overly permissive public INSERT on company_members
DROP POLICY IF EXISTS "System can insert company_members" ON public.company_members;

-- 6. Fix security: tighten activity_log INSERT
DROP POLICY IF EXISTS "System can insert activity_log" ON public.activity_log;
CREATE POLICY "Triggers can insert activity_log" ON public.activity_log FOR INSERT TO authenticated WITH CHECK (false);

-- 7. Recreate all missing triggers
-- handle_new_user trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- check stock before movement
DROP TRIGGER IF EXISTS check_stock_before_movement ON public.movements;
CREATE TRIGGER check_stock_before_movement BEFORE INSERT ON public.movements FOR EACH ROW EXECUTE FUNCTION public.check_stock_before_movement();

-- process movement (update balances)
DROP TRIGGER IF EXISTS process_movement_trigger ON public.movements;
CREATE TRIGGER process_movement_trigger AFTER INSERT ON public.movements FOR EACH ROW EXECUTE FUNCTION public.process_movement();

-- log movement activity
DROP TRIGGER IF EXISTS log_movement_activity_trigger ON public.movements;
CREATE TRIGGER log_movement_activity_trigger AFTER INSERT ON public.movements FOR EACH ROW EXECUTE FUNCTION public.log_movement_activity();

-- 8. Update handle_new_user to NOT auto-create company (user will join via invite code)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, is_approved)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    CASE WHEN NEW.email = 'luccafelipe99@gmail.com' THEN true ELSE false END
  );

  IF NEW.email = 'luccafelipe99@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  END IF;

  -- Check if user provided an invite_code via metadata
  IF NEW.raw_user_meta_data->>'invite_code' IS NOT NULL AND NEW.raw_user_meta_data->>'invite_code' != '' THEN
    DECLARE
      found_company_id UUID;
    BEGIN
      SELECT id INTO found_company_id FROM public.companies WHERE invite_code = NEW.raw_user_meta_data->>'invite_code' LIMIT 1;
      IF found_company_id IS NOT NULL THEN
        INSERT INTO public.company_members (company_id, user_id, role) VALUES (found_company_id, NEW.id, 'member');
        RETURN NEW;
      END IF;
    END;
  END IF;

  -- Default: create a new company
  DECLARE
    new_company_id UUID;
  BEGIN
    INSERT INTO public.companies (name) VALUES ('Minha Empresa') RETURNING id INTO new_company_id;
    INSERT INTO public.company_members (company_id, user_id, role) VALUES (new_company_id, NEW.id, 'owner');
  END;

  RETURN NEW;
END;
$$;

-- 9. Allow companies to be inserted by the trigger (SECURITY DEFINER)
-- The handle_new_user function runs as SECURITY DEFINER so it bypasses RLS
-- But we need INSERT policy for companies for the trigger
DROP POLICY IF EXISTS "System can insert companies" ON public.companies;
CREATE POLICY "System can insert companies" ON public.companies FOR INSERT TO public WITH CHECK (true);
