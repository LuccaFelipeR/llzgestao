
-- =========================================================================
-- Phase 6.7.2 — Activity log visibility + activity triggers
-- =========================================================================

-- Rewrite SELECT policy: super admin OR company owner/admin
DROP POLICY IF EXISTS "Admins can read company activity_log" ON public.activity_log;
DROP POLICY IF EXISTS "Super admins read all activity_log" ON public.activity_log;

CREATE POLICY "Super admins read all activity_log"
  ON public.activity_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Company owners/admins read company activity_log"
  ON public.activity_log FOR SELECT TO authenticated
  USING (
    company_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.user_id = auth.uid()
        AND cm.company_id = activity_log.company_id
        AND cm.role IN ('owner', 'admin')
    )
  );

-- Allow authenticated users to insert their own log entries scoped to their company
DROP POLICY IF EXISTS "Triggers can insert activity_log" ON public.activity_log;

CREATE POLICY "Members insert own activity_log"
  ON public.activity_log FOR INSERT TO authenticated
  WITH CHECK (
    (user_id = auth.uid() AND public.is_member_of(auth.uid(), company_id))
    OR public.has_role(auth.uid(), 'admin')
  );

-- =========================================================================
-- Generic activity logger for products / addresses / lots
-- =========================================================================
CREATE OR REPLACE FUNCTION public.log_entity_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action text;
  v_entity text;
  v_row jsonb;
  v_details jsonb;
  v_actor uuid;
BEGIN
  v_entity := TG_ARGV[0];
  v_action := lower(v_entity) || '_' || lower(TG_OP);
  v_row := to_jsonb(NEW);
  v_actor := auth.uid();

  -- Build a small details payload with the most useful fields per entity
  v_details := jsonb_strip_nulls(jsonb_build_object(
    'sku', v_row->>'sku',
    'code', v_row->>'code',
    'lot_code', v_row->>'lot_code',
    'description', v_row->>'description',
    'is_active', v_row->'is_active'
  ));

  INSERT INTO public.activity_log (user_id, action, entity_type, entity_id, details, company_id)
  VALUES (v_actor, v_action, v_entity, (v_row->>'id'), v_details, (v_row->>'company_id')::uuid);

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never break the underlying write because logging failed
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_log_activity_products ON public.products;
CREATE TRIGGER trg_log_activity_products
  AFTER INSERT OR UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.log_entity_activity('product');

DROP TRIGGER IF EXISTS trg_log_activity_addresses ON public.addresses;
CREATE TRIGGER trg_log_activity_addresses
  AFTER INSERT OR UPDATE ON public.addresses
  FOR EACH ROW EXECUTE FUNCTION public.log_entity_activity('address');

DROP TRIGGER IF EXISTS trg_log_activity_lots ON public.lots;
CREATE TRIGGER trg_log_activity_lots
  AFTER INSERT OR UPDATE ON public.lots
  FOR EACH ROW EXECUTE FUNCTION public.log_entity_activity('lot');

-- Lock down direct EXECUTE on the trigger function; it only needs to run in trigger context
REVOKE ALL ON FUNCTION public.log_entity_activity() FROM PUBLIC;
