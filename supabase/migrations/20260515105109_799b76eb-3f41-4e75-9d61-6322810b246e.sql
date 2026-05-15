
-- ============================================================
-- FASE 1: Hardening Multi-Tenant
-- ============================================================

-- 1) COMPANIES — novos campos
DO $$ BEGIN
  CREATE TYPE company_status AS ENUM ('active','inactive','blocked','trial');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS legal_name TEXT,
  ADD COLUMN IF NOT EXISTS document_number TEXT,
  ADD COLUMN IF NOT EXISTS trade_name TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS state TEXT,
  ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'BR',
  ADD COLUMN IF NOT EXISTS status company_status NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS main_focal_user_id UUID,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS max_users INTEGER,
  ADD COLUMN IF NOT EXISTS max_products INTEGER,
  ADD COLUMN IF NOT EXISTS max_addresses INTEGER;

-- 2) COMPANY_MEMBERS — novos campos
ALTER TABLE public.company_members
  ADD COLUMN IF NOT EXISTS is_main_focal_point BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMPTZ;

-- 3) UNIQUE CONSTRAINTS company-scoped
CREATE UNIQUE INDEX IF NOT EXISTS uq_addresses_company_code
  ON public.addresses (company_id, UPPER(code))
  WHERE company_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_products_company_sku
  ON public.products (company_id, UPPER(sku))
  WHERE company_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_lots_company_product_code
  ON public.lots (company_id, product_id, UPPER(lot_code))
  WHERE company_id IS NOT NULL;

-- 4) Apenas 1 focal point principal por empresa
CREATE UNIQUE INDEX IF NOT EXISTS uq_company_main_focal_point
  ON public.company_members (company_id)
  WHERE is_main_focal_point = true;

-- Trigger sync: quando set is_main_focal_point=true, zerar os outros e atualizar companies.main_focal_user_id
CREATE OR REPLACE FUNCTION public.sync_main_focal_point()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.is_main_focal_point = true THEN
    UPDATE public.company_members
      SET is_main_focal_point = false
      WHERE company_id = NEW.company_id AND id <> NEW.id AND is_main_focal_point = true;
    UPDATE public.companies
      SET main_focal_user_id = NEW.user_id, updated_at = now()
      WHERE id = NEW.company_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_main_focal_point ON public.company_members;
CREATE TRIGGER trg_sync_main_focal_point
  BEFORE INSERT OR UPDATE OF is_main_focal_point ON public.company_members
  FOR EACH ROW EXECUTE FUNCTION public.sync_main_focal_point();

-- 5) Validação cross-company em movements
CREATE OR REPLACE FUNCTION public.validate_movement_cross_company()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_cid UUID;
BEGIN
  IF NEW.company_id IS NULL THEN
    RAISE EXCEPTION 'Movimento sem company_id';
  END IF;

  SELECT company_id INTO v_cid FROM public.products WHERE id = NEW.product_id;
  IF v_cid IS NOT NULL AND v_cid <> NEW.company_id THEN
    RAISE EXCEPTION 'Produto pertence a outra empresa';
  END IF;

  IF NEW.lot_id IS NOT NULL THEN
    SELECT company_id INTO v_cid FROM public.lots WHERE id = NEW.lot_id;
    IF v_cid IS NOT NULL AND v_cid <> NEW.company_id THEN
      RAISE EXCEPTION 'Lote pertence a outra empresa';
    END IF;
  END IF;

  IF NEW.from_address_id IS NOT NULL THEN
    SELECT company_id INTO v_cid FROM public.addresses WHERE id = NEW.from_address_id;
    IF v_cid IS NOT NULL AND v_cid <> NEW.company_id THEN
      RAISE EXCEPTION 'Endereço de origem pertence a outra empresa';
    END IF;
  END IF;

  IF NEW.to_address_id IS NOT NULL THEN
    SELECT company_id INTO v_cid FROM public.addresses WHERE id = NEW.to_address_id;
    IF v_cid IS NOT NULL AND v_cid <> NEW.company_id THEN
      RAISE EXCEPTION 'Endereço de destino pertence a outra empresa';
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_validate_movement_cross_company ON public.movements;
CREATE TRIGGER trg_validate_movement_cross_company
  BEFORE INSERT ON public.movements
  FOR EACH ROW EXECUTE FUNCTION public.validate_movement_cross_company();

-- 6) Bloquear escrita em empresas com status='blocked'
CREATE OR REPLACE FUNCTION public.block_writes_for_blocked_companies()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_status company_status;
BEGIN
  IF NEW.company_id IS NULL THEN RETURN NEW; END IF;
  SELECT status INTO v_status FROM public.companies WHERE id = NEW.company_id;
  IF v_status = 'blocked' THEN
    RAISE EXCEPTION 'Empresa bloqueada — operação não permitida';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_block_writes_products ON public.products;
CREATE TRIGGER trg_block_writes_products
  BEFORE INSERT OR UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.block_writes_for_blocked_companies();

DROP TRIGGER IF EXISTS trg_block_writes_addresses ON public.addresses;
CREATE TRIGGER trg_block_writes_addresses
  BEFORE INSERT OR UPDATE ON public.addresses
  FOR EACH ROW EXECUTE FUNCTION public.block_writes_for_blocked_companies();

DROP TRIGGER IF EXISTS trg_block_writes_lots ON public.lots;
CREATE TRIGGER trg_block_writes_lots
  BEFORE INSERT ON public.lots
  FOR EACH ROW EXECUTE FUNCTION public.block_writes_for_blocked_companies();

DROP TRIGGER IF EXISTS trg_block_writes_movements ON public.movements;
CREATE TRIGGER trg_block_writes_movements
  BEFORE INSERT ON public.movements
  FOR EACH ROW EXECUTE FUNCTION public.block_writes_for_blocked_companies();
