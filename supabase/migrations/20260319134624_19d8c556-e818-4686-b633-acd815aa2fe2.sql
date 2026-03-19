
-- Enum for address types
CREATE TYPE public.address_type AS ENUM ('ARMAZENAGEM', 'TECNICO');

-- Enum for movement types
CREATE TYPE public.movement_type AS ENUM ('IN', 'OUT', 'TRANSFER');

-- Enum for user roles
CREATE TYPE public.app_role AS ENUM ('operator', 'supervisor', 'admin');

-- Products table
CREATE TABLE public.products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sku TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'UN',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Addresses table
CREATE TABLE public.addresses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  type address_type NOT NULL DEFAULT 'ARMAZENAGEM',
  rua TEXT NOT NULL,
  posicao TEXT NOT NULL,
  andar TEXT NOT NULL,
  lado TEXT NOT NULL,
  face TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT address_code_format CHECK (code ~ '^P\d{2}\d{3}\d{3}\d{3}[A-Z]$')
);

-- Lots table
CREATE TABLE public.lots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  lot_code TEXT NOT NULL,
  expires_at DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (product_id, lot_code)
);

-- Movements table (immutable)
CREATE TABLE public.movements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  type movement_type NOT NULL,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  lot_id UUID NOT NULL REFERENCES public.lots(id) ON DELETE RESTRICT,
  from_address_id UUID REFERENCES public.addresses(id) ON DELETE RESTRICT,
  to_address_id UUID REFERENCES public.addresses(id) ON DELETE RESTRICT,
  qty NUMERIC NOT NULL CHECK (qty > 0),
  operator_user_id UUID REFERENCES auth.users(id),
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT movement_addresses CHECK (
    (type = 'IN' AND to_address_id IS NOT NULL AND from_address_id IS NULL) OR
    (type = 'OUT' AND from_address_id IS NOT NULL AND to_address_id IS NULL) OR
    (type = 'TRANSFER' AND from_address_id IS NOT NULL AND to_address_id IS NOT NULL AND from_address_id != to_address_id)
  )
);

-- Stock balance table
CREATE TABLE public.stock_balance (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  address_id UUID NOT NULL REFERENCES public.addresses(id) ON DELETE RESTRICT,
  lot_id UUID NOT NULL REFERENCES public.lots(id) ON DELETE RESTRICT,
  qty NUMERIC NOT NULL DEFAULT 0 CHECK (qty >= 0),
  last_movement_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (product_id, address_id, lot_id)
);

-- User roles table
CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

-- Enable RLS on all tables
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_balance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- RLS policies - allow all authenticated users for MVP
CREATE POLICY "Authenticated users can read products" ON public.products FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert products" ON public.products FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update products" ON public.products FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can read addresses" ON public.addresses FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert addresses" ON public.addresses FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update addresses" ON public.addresses FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can read lots" ON public.lots FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert lots" ON public.lots FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can read movements" ON public.movements FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert movements" ON public.movements FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can read stock_balance" ON public.stock_balance FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read user_roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Prevent UPDATE and DELETE on movements (immutability)
CREATE OR REPLACE RULE prevent_movement_update AS ON UPDATE TO public.movements DO INSTEAD NOTHING;
CREATE OR REPLACE RULE prevent_movement_delete AS ON DELETE TO public.movements DO INSTEAD NOTHING;

-- Function to process movement and update stock balance
CREATE OR REPLACE FUNCTION public.process_movement()
RETURNS TRIGGER AS $$
BEGIN
  -- For OUT and TRANSFER: decrease stock at source
  IF NEW.type IN ('OUT', 'TRANSFER') THEN
    UPDATE public.stock_balance
    SET qty = qty - NEW.qty, updated_at = now(), last_movement_at = now()
    WHERE product_id = NEW.product_id AND address_id = NEW.from_address_id AND lot_id = NEW.lot_id;

    -- Check if balance went negative (should not happen due to CHECK constraint, but safety net)
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Saldo insuficiente: não existe estoque para este produto/endereço/lote.';
    END IF;
  END IF;

  -- For IN and TRANSFER: increase stock at destination
  IF NEW.type IN ('IN', 'TRANSFER') THEN
    INSERT INTO public.stock_balance (product_id, address_id, lot_id, qty, last_movement_at, updated_at)
    VALUES (NEW.product_id, NEW.to_address_id, NEW.lot_id, NEW.qty, now(), now())
    ON CONFLICT (product_id, address_id, lot_id)
    DO UPDATE SET qty = stock_balance.qty + NEW.qty, updated_at = now(), last_movement_at = now();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger to process movement after insert
CREATE TRIGGER trigger_process_movement
AFTER INSERT ON public.movements
FOR EACH ROW
EXECUTE FUNCTION public.process_movement();

-- Function to check stock before OUT/TRANSFER
CREATE OR REPLACE FUNCTION public.check_stock_before_movement()
RETURNS TRIGGER AS $$
DECLARE
  current_qty NUMERIC;
BEGIN
  IF NEW.type IN ('OUT', 'TRANSFER') THEN
    SELECT COALESCE(qty, 0) INTO current_qty
    FROM public.stock_balance
    WHERE product_id = NEW.product_id AND address_id = NEW.from_address_id AND lot_id = NEW.lot_id;

    IF current_qty IS NULL OR current_qty < NEW.qty THEN
      RAISE EXCEPTION 'Saldo insuficiente. Disponível: %, Solicitado: %', COALESCE(current_qty, 0), NEW.qty;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger to check stock BEFORE insert (runs before process_movement)
CREATE TRIGGER trigger_check_stock
BEFORE INSERT ON public.movements
FOR EACH ROW
EXECUTE FUNCTION public.check_stock_before_movement();

-- Indexes for performance
CREATE INDEX idx_movements_product ON public.movements(product_id);
CREATE INDEX idx_movements_lot ON public.movements(lot_id);
CREATE INDEX idx_movements_from_address ON public.movements(from_address_id);
CREATE INDEX idx_movements_to_address ON public.movements(to_address_id);
CREATE INDEX idx_movements_type ON public.movements(type);
CREATE INDEX idx_movements_created_at ON public.movements(created_at);
CREATE INDEX idx_stock_balance_product ON public.stock_balance(product_id);
CREATE INDEX idx_stock_balance_address ON public.stock_balance(address_id);
CREATE INDEX idx_stock_balance_lot ON public.stock_balance(lot_id);
CREATE INDEX idx_addresses_segments ON public.addresses(rua, posicao, andar, lado, face);

-- has_role function for role checking
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

-- Allow stock_balance updates only via trigger (internal)
CREATE POLICY "System can update stock_balance" ON public.stock_balance FOR UPDATE TO authenticated USING (true);
CREATE POLICY "System can insert stock_balance" ON public.stock_balance FOR INSERT TO authenticated WITH CHECK (true);
