
-- =============================================
-- 1. BUSINESS TYPE AND OPERATION MODE ENUMS
-- =============================================
CREATE TYPE public.business_type AS ENUM ('bakery', 'retail', 'distributor', 'warehouse', 'logistics_center', 'other');
CREATE TYPE public.operation_mode AS ENUM ('essential', 'operations', 'wms');

-- =============================================
-- 2. COMPANIES TABLE
-- =============================================
CREATE TABLE public.companies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  business_type public.business_type NOT NULL DEFAULT 'other',
  operation_mode public.operation_mode NOT NULL DEFAULT 'essential',
  plan TEXT NOT NULL DEFAULT 'free',
  logo_url TEXT,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  onboarding_completed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- =============================================
-- 3. COMPANY MEMBERS TABLE
-- =============================================
CREATE TABLE public.company_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, user_id)
);
ALTER TABLE public.company_members ENABLE ROW LEVEL SECURITY;

-- =============================================
-- 4. ADD COMPANY_ID TO EXISTING TABLES
-- =============================================
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id);
ALTER TABLE public.addresses ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id);
ALTER TABLE public.movements ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id);
ALTER TABLE public.stock_balance ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id);
ALTER TABLE public.lots ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id);
ALTER TABLE public.activity_log ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id);

-- =============================================
-- 5. HELPER FUNCTION: GET USER'S COMPANY ID
-- =============================================
CREATE OR REPLACE FUNCTION public.get_user_company_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM public.company_members WHERE user_id = _user_id LIMIT 1
$$;

-- =============================================
-- 6. RLS POLICIES FOR COMPANIES
-- =============================================
CREATE POLICY "Members can view their company"
  ON public.companies FOR SELECT TO authenticated
  USING (id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

CREATE POLICY "Admins can update their company"
  ON public.companies FOR UPDATE TO authenticated
  USING (id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

-- =============================================
-- 7. RLS POLICIES FOR COMPANY_MEMBERS
-- =============================================
CREATE POLICY "Members can view company members"
  ON public.company_members FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Company admins can insert members"
  ON public.company_members FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()) AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Company admins can delete members"
  ON public.company_members FOR DELETE TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()) AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "System can insert company_members"
  ON public.company_members FOR INSERT TO public
  WITH CHECK (true);

-- =============================================
-- 8. UPDATE RLS ON EXISTING TABLES (company isolation)
-- =============================================

-- PRODUCTS
DROP POLICY IF EXISTS "Authenticated users can read products" ON public.products;
DROP POLICY IF EXISTS "Authenticated users can insert products" ON public.products;
DROP POLICY IF EXISTS "Authenticated users can update products" ON public.products;

CREATE POLICY "Users can read company products" ON public.products FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "Users can insert company products" ON public.products FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "Users can update company products" ON public.products FOR UPDATE TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

-- ADDRESSES
DROP POLICY IF EXISTS "Authenticated users can read addresses" ON public.addresses;
DROP POLICY IF EXISTS "Authenticated users can insert addresses" ON public.addresses;
DROP POLICY IF EXISTS "Authenticated users can update addresses" ON public.addresses;

CREATE POLICY "Users can read company addresses" ON public.addresses FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "Users can insert company addresses" ON public.addresses FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "Users can update company addresses" ON public.addresses FOR UPDATE TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

-- MOVEMENTS
DROP POLICY IF EXISTS "Authenticated users can read movements" ON public.movements;
DROP POLICY IF EXISTS "Authenticated users can insert movements" ON public.movements;

CREATE POLICY "Users can read company movements" ON public.movements FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "Users can insert company movements" ON public.movements FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()));

-- STOCK_BALANCE
DROP POLICY IF EXISTS "Authenticated users can read stock_balance" ON public.stock_balance;
DROP POLICY IF EXISTS "System can insert stock_balance" ON public.stock_balance;
DROP POLICY IF EXISTS "System can update stock_balance" ON public.stock_balance;

CREATE POLICY "Users can read company stock" ON public.stock_balance FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "System can insert company stock" ON public.stock_balance FOR INSERT TO authenticated
  WITH CHECK (true);
CREATE POLICY "System can update company stock" ON public.stock_balance FOR UPDATE TO authenticated
  USING (true);

-- LOTS
DROP POLICY IF EXISTS "Authenticated users can read lots" ON public.lots;
DROP POLICY IF EXISTS "Authenticated users can insert lots" ON public.lots;

CREATE POLICY "Users can read company lots" ON public.lots FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "Users can insert company lots" ON public.lots FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()));

-- ACTIVITY_LOG
DROP POLICY IF EXISTS "Admins can read activity_log" ON public.activity_log;
DROP POLICY IF EXISTS "Authenticated can insert activity_log" ON public.activity_log;

CREATE POLICY "Admins can read company activity_log" ON public.activity_log FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()) AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "System can insert activity_log" ON public.activity_log FOR INSERT TO authenticated
  WITH CHECK (true);

-- =============================================
-- 9. RECREATE ALL TRIGGERS
-- =============================================

-- Drop existing triggers if any
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS check_stock_before_movement ON public.movements;
DROP TRIGGER IF EXISTS process_movement_after_insert ON public.movements;
DROP TRIGGER IF EXISTS log_movement_activity_after_insert ON public.movements;

-- Update handle_new_user to also create a company
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_company_id UUID;
BEGIN
  -- Create profile
  INSERT INTO public.profiles (id, email, full_name, is_approved)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    CASE WHEN NEW.email = 'luccafelipe99@gmail.com' THEN true ELSE false END
  );

  -- Auto-assign admin role for developer email
  IF NEW.email = 'luccafelipe99@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  END IF;

  -- Create a default company for the user
  INSERT INTO public.companies (name) VALUES ('Minha Empresa') RETURNING id INTO new_company_id;
  INSERT INTO public.company_members (company_id, user_id, role) VALUES (new_company_id, NEW.id, 'owner');

  RETURN NEW;
END;
$$;

-- Recreate auth trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Update process_movement to propagate company_id to stock_balance
CREATE OR REPLACE FUNCTION public.process_movement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.type IN ('OUT', 'TRANSFER') THEN
    UPDATE public.stock_balance
    SET qty = qty - NEW.qty, updated_at = now(), last_movement_at = now()
    WHERE product_id = NEW.product_id AND address_id = NEW.from_address_id AND lot_id = NEW.lot_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Saldo insuficiente: não existe estoque para este produto/endereço/lote.';
    END IF;
  END IF;

  IF NEW.type IN ('IN', 'TRANSFER') THEN
    INSERT INTO public.stock_balance (product_id, address_id, lot_id, qty, last_movement_at, updated_at, company_id)
    VALUES (NEW.product_id, NEW.to_address_id, NEW.lot_id, NEW.qty, now(), now(), NEW.company_id)
    ON CONFLICT (product_id, address_id, lot_id)
    DO UPDATE SET qty = stock_balance.qty + NEW.qty, updated_at = now(), last_movement_at = now();
  END IF;

  RETURN NEW;
END;
$$;

-- Update log_movement_activity to include company_id
CREATE OR REPLACE FUNCTION public.log_movement_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.activity_log (user_id, action, entity_type, entity_id, details, company_id)
  VALUES (
    NEW.operator_user_id,
    CASE NEW.type
      WHEN 'IN' THEN 'movement_in'
      WHEN 'OUT' THEN 'movement_out'
      WHEN 'TRANSFER' THEN 'movement_transfer'
    END,
    'movement',
    NEW.id::text,
    jsonb_build_object('qty', NEW.qty, 'product_id', NEW.product_id, 'type', NEW.type),
    NEW.company_id
  );
  RETURN NEW;
END;
$$;

-- Recreate movement triggers
CREATE TRIGGER check_stock_before_movement
  BEFORE INSERT ON public.movements
  FOR EACH ROW EXECUTE FUNCTION public.check_stock_before_movement();

CREATE TRIGGER process_movement_after_insert
  AFTER INSERT ON public.movements
  FOR EACH ROW EXECUTE FUNCTION public.process_movement();

CREATE TRIGGER log_movement_activity_after_insert
  AFTER INSERT ON public.movements
  FOR EACH ROW EXECUTE FUNCTION public.log_movement_activity();

-- =============================================
-- 10. INDEXES
-- =============================================
CREATE INDEX IF NOT EXISTS idx_products_company ON public.products(company_id);
CREATE INDEX IF NOT EXISTS idx_addresses_company ON public.addresses(company_id);
CREATE INDEX IF NOT EXISTS idx_movements_company ON public.movements(company_id);
CREATE INDEX IF NOT EXISTS idx_stock_balance_company ON public.stock_balance(company_id);
CREATE INDEX IF NOT EXISTS idx_lots_company ON public.lots(company_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_company ON public.activity_log(company_id);
CREATE INDEX IF NOT EXISTS idx_company_members_user ON public.company_members(user_id);
CREATE INDEX IF NOT EXISTS idx_company_members_company ON public.company_members(company_id);
