-- ============ Phase 6.7-final: Multi-tenant hardening ============

-- 1) Fix global unique constraints — same SKU/code must be allowed across companies
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_sku_key;
ALTER TABLE public.addresses DROP CONSTRAINT IF EXISTS addresses_code_key;

-- Per-company uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS products_company_sku_unique
  ON public.products (company_id, sku) WHERE sku IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS addresses_company_code_unique
  ON public.addresses (company_id, code) WHERE code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS lots_company_product_lot_unique
  ON public.lots (company_id, product_id, lot_code) WHERE lot_code IS NOT NULL;

-- 2) Update handle_new_user so new companies get creator as active,
--    approved, main focal point owner. The sync_main_focal_point trigger
--    already propagates main_focal_user_id to companies.
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
    SELECT id INTO found_company_id FROM public.companies
      WHERE invite_code = NEW.raw_user_meta_data->>'invite_code' LIMIT 1;
    IF found_company_id IS NOT NULL THEN
      INSERT INTO public.company_members (company_id, user_id, role, is_active, approved_at)
      VALUES (found_company_id, NEW.id, 'member', true, now());
      RETURN NEW;
    END IF;
  END IF;

  INSERT INTO public.companies (name) VALUES ('Minha Empresa') RETURNING id INTO new_company_id;
  INSERT INTO public.company_members (
    company_id, user_id, role, is_active, approved_at, is_main_focal_point
  ) VALUES (
    new_company_id, NEW.id, 'owner', true, now(), true
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'handle_new_user error for %: % %', NEW.email, SQLERRM, SQLSTATE;
  RETURN NEW;
END;
$function$;

-- 3) Backfill: companies without a main focal point → oldest owner/admin becomes focal
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT c.id AS cid,
           (SELECT m.id FROM public.company_members m
              WHERE m.company_id = c.id
              ORDER BY (m.role='owner') DESC, (m.role='admin') DESC, m.created_at ASC
              LIMIT 1) AS mid
    FROM public.companies c
    WHERE c.main_focal_user_id IS NULL
  LOOP
    IF r.mid IS NOT NULL THEN
      UPDATE public.company_members
         SET is_main_focal_point = true,
             is_active = true,
             approved_at = COALESCE(approved_at, now())
       WHERE id = r.mid;
    END IF;
  END LOOP;
END $$;

-- 4) Changelog entries for phase 6.7-final
INSERT INTO public.system_changelog (version, title, change_type, is_public, description)
VALUES
  ('6.7-final', 'Correções finais SaaS multiempresa', 'fix', true,
   'Correções para garantir isolamento total entre empresas: mesmo SKU e mesmo código de endereço podem existir em empresas diferentes; duplicidade só é bloqueada dentro da mesma empresa. Toda nova empresa agora nasce com seu criador como administrador ativo e ponto focal principal.'),
  ('6.7-final-internal', 'Ajustes técnicos finais de isolamento e ponto focal', 'database', false,
   'Removidas restrições únicas globais em products.sku e addresses.code. Criados índices únicos por (company_id, sku), (company_id, code) e (company_id, product_id, lot_code). handle_new_user agora define is_active, approved_at e is_main_focal_point para o criador da empresa. Backfill: empresas sem main_focal_user_id receberam o membro mais antigo (owner/admin) como ponto focal.');
