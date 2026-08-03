
CREATE OR REPLACE FUNCTION public.platform_cleanup_inventory(_caller_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_names text[] := public.platform_protected_company_names();
  v_list jsonb;
  v_platform_users jsonb;
BEGIN
  IF _caller_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = _caller_id AND role::text IN ('super_admin','admin')
  ) THEN
    RAISE EXCEPTION 'Apenas o super admin pode consultar a limpeza de ambiente';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', c.id, 'name', c.name, 'status', c.status,
    'approval_status', c.approval_status, 'created_at', c.created_at,
    'protected', (c.name = ANY(v_names)),
    'counts', jsonb_build_object(
      'company_members', (SELECT COUNT(*) FROM public.company_members WHERE company_id=c.id),
      'products',        (SELECT COUNT(*) FROM public.products WHERE company_id=c.id),
      'addresses',       (SELECT COUNT(*) FROM public.addresses WHERE company_id=c.id),
      'lots',            (SELECT COUNT(*) FROM public.lots WHERE company_id=c.id),
      'stock_balance',   (SELECT COUNT(*) FROM public.stock_balance WHERE company_id=c.id),
      'movements',       (SELECT COUNT(*) FROM public.movements WHERE company_id=c.id),
      'support_tickets', (SELECT COUNT(*) FROM public.support_tickets WHERE company_id=c.id),
      'picking_lists',   (SELECT COUNT(*) FROM public.picking_lists WHERE company_id=c.id),
      'notifications',   (SELECT COUNT(*) FROM public.notifications WHERE company_id=c.id),
      'activity_log',    (SELECT COUNT(*) FROM public.activity_log WHERE company_id=c.id)
    ),
    'total_linked',
      (SELECT COUNT(*) FROM public.company_members WHERE company_id=c.id)
    + (SELECT COUNT(*) FROM public.products WHERE company_id=c.id)
    + (SELECT COUNT(*) FROM public.addresses WHERE company_id=c.id)
    + (SELECT COUNT(*) FROM public.lots WHERE company_id=c.id)
    + (SELECT COUNT(*) FROM public.stock_balance WHERE company_id=c.id)
    + (SELECT COUNT(*) FROM public.movements WHERE company_id=c.id)
    + (SELECT COUNT(*) FROM public.support_tickets WHERE company_id=c.id)
    + (SELECT COUNT(*) FROM public.picking_lists WHERE company_id=c.id)
    + (SELECT COUNT(*) FROM public.notifications WHERE company_id=c.id)
    + (SELECT COUNT(*) FROM public.activity_log WHERE company_id=c.id)
  ) ORDER BY c.name), '[]'::jsonb) INTO v_list
  FROM public.companies c;

  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'email'), '[]'::jsonb) INTO v_platform_users
  FROM (
    SELECT jsonb_build_object(
             'id', p.id, 'email', p.email, 'full_name', p.full_name,
             'roles', (SELECT jsonb_agg(DISTINCT ur2.role::text) FROM public.user_roles ur2 WHERE ur2.user_id = p.id)
           ) AS x
      FROM public.profiles p
     WHERE EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id)
  ) s;

  RETURN jsonb_build_object(
    'companies', v_list,
    'platform_users', v_platform_users,
    'protected_company_names', to_jsonb(v_names)
  );
END $function$;

REVOKE ALL ON FUNCTION public.platform_cleanup_inventory(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_cleanup_inventory(uuid) TO service_role, postgres;

DO $$
DECLARE r jsonb;
BEGIN
  r := public.platform_cleanup_inventory('623e7ca3-1d08-4bfe-b034-b4f4ea53c962');
  RAISE NOTICE 'inventory companies=%', jsonb_array_length(r->'companies');
END $$;
