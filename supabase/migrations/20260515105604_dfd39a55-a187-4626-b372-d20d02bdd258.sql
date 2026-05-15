
-- ============================================================
-- FASE 2: Modelo Maduro de Produto e Lote
-- ============================================================

-- Enums
DO $$ BEGIN CREATE TYPE product_type AS ENUM ('raw_material','finished_product','resale_product','consumable','packaging','spare_part','service_item','other'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE product_classification AS ENUM ('perishable','non_perishable','consumer_good','controlled_validity','technical_item','fragile','hazardous','frozen','refrigerated','dry_storage','other'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE lot_status AS ENUM ('active','blocked','expired','consumed','quarantined'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- PRODUCTS — novos campos
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS product_type product_type NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS classification product_classification,
  ADD COLUMN IF NOT EXISTS controls_batch BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS controls_expiration BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_perishable BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS shelf_life_days INTEGER,
  ADD COLUMN IF NOT EXISTS storage_condition TEXT,
  ADD COLUMN IF NOT EXISTS temperature_control_required BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS min_temperature NUMERIC,
  ADD COLUMN IF NOT EXISTS max_temperature NUMERIC,
  ADD COLUMN IF NOT EXISTS brand TEXT,
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS subcategory TEXT,
  ADD COLUMN IF NOT EXISTS internal_code TEXT,
  ADD COLUMN IF NOT EXISTS ncm TEXT,
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- Trigger: perecível => força controle de validade
CREATE OR REPLACE FUNCTION public.enforce_perishable_rules()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF NEW.is_perishable THEN
    NEW.controls_expiration := true;
    IF NEW.classification IS NULL THEN
      NEW.classification := 'perishable';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_enforce_perishable_rules ON public.products;
CREATE TRIGGER trg_enforce_perishable_rules
  BEFORE INSERT OR UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.enforce_perishable_rules();

-- LOTS — novos campos
ALTER TABLE public.lots
  ADD COLUMN IF NOT EXISTS manufacturing_date DATE,
  ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS supplier TEXT,
  ADD COLUMN IF NOT EXISTS invoice_number TEXT,
  ADD COLUMN IF NOT EXISTS status lot_status NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- Trigger: validar manufacturing <= expiration; auto-marcar vencido
CREATE OR REPLACE FUNCTION public.validate_lot_dates()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF NEW.manufacturing_date IS NOT NULL AND NEW.expires_at IS NOT NULL
     AND NEW.manufacturing_date > NEW.expires_at THEN
    RAISE EXCEPTION 'Data de fabricação não pode ser posterior à data de validade';
  END IF;
  IF NEW.expires_at IS NOT NULL AND NEW.expires_at < CURRENT_DATE AND NEW.status = 'active' THEN
    NEW.status := 'expired';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_validate_lot_dates ON public.lots;
CREATE TRIGGER trg_validate_lot_dates
  BEFORE INSERT OR UPDATE ON public.lots
  FOR EACH ROW EXECUTE FUNCTION public.validate_lot_dates();

-- Permitir UPDATE em lots (por usuários da empresa) — necessário para corrigir status/fornecedor pós-recebimento
DROP POLICY IF EXISTS "Users can update company lots" ON public.lots;
CREATE POLICY "Users can update company lots" ON public.lots
  FOR UPDATE TO authenticated
  USING (company_id = get_user_company_id(auth.uid()));
