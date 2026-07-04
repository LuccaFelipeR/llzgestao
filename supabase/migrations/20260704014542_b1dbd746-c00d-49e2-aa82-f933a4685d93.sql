
-- Helper trigger function (create if missing)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TYPE picking_list_status AS ENUM ('draft','in_progress','done','cancelled');
CREATE TYPE picking_item_status AS ENUM ('pending','picked','skipped');

CREATE TABLE public.picking_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  reference TEXT NOT NULL,
  customer TEXT,
  notes TEXT,
  status picking_list_status NOT NULL DEFAULT 'draft',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.picking_lists TO authenticated;
GRANT ALL ON public.picking_lists TO service_role;
ALTER TABLE public.picking_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "picking_lists_select" ON public.picking_lists
  FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "picking_lists_insert" ON public.picking_lists
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "picking_lists_update" ON public.picking_lists
  FOR UPDATE TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "picking_lists_delete" ON public.picking_lists
  FOR DELETE TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()) OR public.has_role(auth.uid(),'admin'));

CREATE TRIGGER picking_lists_updated_at BEFORE UPDATE ON public.picking_lists
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER picking_lists_block_blocked BEFORE INSERT OR UPDATE ON public.picking_lists
  FOR EACH ROW EXECUTE FUNCTION public.block_writes_for_blocked_companies();

CREATE TABLE public.picking_list_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  picking_list_id UUID NOT NULL REFERENCES public.picking_lists(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  requested_qty NUMERIC NOT NULL CHECK (requested_qty > 0),
  picked_qty NUMERIC NOT NULL DEFAULT 0,
  lot_id UUID REFERENCES public.lots(id),
  from_address_id UUID REFERENCES public.addresses(id),
  status picking_item_status NOT NULL DEFAULT 'pending',
  movement_id UUID REFERENCES public.movements(id),
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.picking_list_items TO authenticated;
GRANT ALL ON public.picking_list_items TO service_role;
ALTER TABLE public.picking_list_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "picking_items_select" ON public.picking_list_items
  FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "picking_items_insert" ON public.picking_list_items
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "picking_items_update" ON public.picking_list_items
  FOR UPDATE TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "picking_items_delete" ON public.picking_list_items
  FOR DELETE TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()) OR public.has_role(auth.uid(),'admin'));

CREATE TRIGGER picking_items_updated_at BEFORE UPDATE ON public.picking_list_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER picking_items_block_blocked BEFORE INSERT OR UPDATE ON public.picking_list_items
  FOR EACH ROW EXECUTE FUNCTION public.block_writes_for_blocked_companies();

CREATE INDEX idx_picking_lists_company_status ON public.picking_lists(company_id, status);
CREATE INDEX idx_picking_items_list ON public.picking_list_items(picking_list_id, sort_order);

INSERT INTO public.system_changelog (version, title, description, change_type, is_public, created_by)
VALUES ('6.2.0','Expedição guiada','Novo módulo de expedição baseado em lista de separação. Crie pedidos com itens e execute o picking guiado passo a passo com sugestão FEFO.','feature',true,NULL);
