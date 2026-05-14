
-- 1) Remove duplicate triggers on movements (multiplied stock by 3, logs by 3)
DROP TRIGGER IF EXISTS process_movement_trigger ON public.movements;
DROP TRIGGER IF EXISTS trigger_process_movement ON public.movements;
DROP TRIGGER IF EXISTS log_movement_activity_trigger ON public.movements;
DROP TRIGGER IF EXISTS on_movement_created ON public.movements;
DROP TRIGGER IF EXISTS trigger_check_stock ON public.movements;
-- Keep: check_stock_before_movement (BEFORE), process_movement_after_insert (AFTER), log_movement_activity_after_insert (AFTER)

-- 2) Backfill missing profiles for existing auth users
INSERT INTO public.profiles (id, email, full_name, is_approved)
SELECT u.id, u.email, COALESCE(u.raw_user_meta_data->>'full_name', ''),
       CASE WHEN u.email = 'luccafelipe99@gmail.com' THEN true ELSE false END
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;

-- 3) Allow admins to update/delete companies
DROP POLICY IF EXISTS "Admins can update any company" ON public.companies;
CREATE POLICY "Admins can update any company" ON public.companies
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can delete any company" ON public.companies;
CREATE POLICY "Admins can delete any company" ON public.companies
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'));

-- 4) Ensure handle_new_user is idempotent (won't fail if profile already exists)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  found_company_id UUID;
  new_company_id UUID;
BEGIN
  INSERT INTO public.profiles (id, email, full_name, is_approved)
  VALUES (
    NEW.id, NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    CASE WHEN NEW.email = 'luccafelipe99@gmail.com' THEN true ELSE false END
  )
  ON CONFLICT (id) DO NOTHING;

  IF NEW.email = 'luccafelipe99@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
    ON CONFLICT DO NOTHING;
  END IF;

  IF EXISTS (SELECT 1 FROM public.company_members WHERE user_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  IF NEW.raw_user_meta_data->>'invite_code' IS NOT NULL AND NEW.raw_user_meta_data->>'invite_code' != '' THEN
    SELECT id INTO found_company_id FROM public.companies WHERE invite_code = NEW.raw_user_meta_data->>'invite_code' LIMIT 1;
    IF found_company_id IS NOT NULL THEN
      INSERT INTO public.company_members (company_id, user_id, role) VALUES (found_company_id, NEW.id, 'member');
      RETURN NEW;
    END IF;
  END IF;

  INSERT INTO public.companies (name) VALUES ('Minha Empresa') RETURNING id INTO new_company_id;
  INSERT INTO public.company_members (company_id, user_id, role) VALUES (new_company_id, NEW.id, 'owner');
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'handle_new_user error for %: % %', NEW.email, SQLERRM, SQLSTATE;
  RETURN NEW;
END;
$function$;
