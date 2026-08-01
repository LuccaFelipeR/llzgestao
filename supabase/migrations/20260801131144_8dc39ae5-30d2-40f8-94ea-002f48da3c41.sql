DROP FUNCTION IF EXISTS public.platform_reset_preview();
DROP FUNCTION IF EXISTS public.platform_reset_execute();

CREATE OR REPLACE FUNCTION public.platform_reset_preview(_caller_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_preserved jsonb;
  v_users jsonb;
  v_companies jsonb;
  v_counts jsonb;
BEGIN
  IF _caller_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = _caller_id AND role::text IN ('super_admin','admin')
  ) THEN
    RAISE EXCEPTION 'Apenas o super admin pode consultar o reset de ambiente';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', p.id, 'email', p.email, 'full_name', p.full_name, 'role', ur.role::text
         ) ORDER BY p.email), '[]'::jsonb)
    INTO v_preserved
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.id
   WHERE ur.role::text IN ('super_admin','admin','platform_admin','support_agent','developer');

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', p.id, 'email', p.email, 'full_name', p.full_name,
           'companies', COALESCE((
              SELECT jsonb_agg(c.name) FROM public.company_members cm
              JOIN public.companies c ON c.id = cm.company_id
              WHERE cm.user_id = p.id), '[]'::jsonb)
         ) ORDER BY p.email), '[]'::jsonb)
    INTO v_users
    FROM public.profiles p
   WHERE NOT public.is_platform_staff(p.id);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', c.id, 'name', c.name,
           'linked_records',
             (SELECT COUNT(*) FROM public.products WHERE company_id = c.id)
           + (SELECT COUNT(*) FROM public.addresses WHERE company_id = c.id)
           + (SELECT COUNT(*) FROM public.lots WHERE company_id = c.id)
           + (SELECT COUNT(*) FROM public.stock_balance WHERE company_id = c.id)
           + (SELECT COUNT(*) FROM public.movements WHERE company_id = c.id)
           + (SELECT COUNT(*) FROM public.company_members WHERE company_id = c.id)
           + (SELECT COUNT(*) FROM public.activity_log WHERE company_id = c.id)
           + (SELECT COUNT(*) FROM public.support_tickets WHERE company_id = c.id)
         ) ORDER BY c.name), '[]'::jsonb)
    INTO v_companies
    FROM public.companies c;

  SELECT jsonb_build_object(
    'support_ticket_messages', (SELECT COUNT(*) FROM public.support_ticket_messages),
    'support_tickets',         (SELECT COUNT(*) FROM public.support_tickets),
    'picking_list_items',      (SELECT COUNT(*) FROM public.picking_list_items),
    'picking_lists',           (SELECT COUNT(*) FROM public.picking_lists),
    'notifications',           (SELECT COUNT(*) FROM public.notifications),
    'stock_balance',           (SELECT COUNT(*) FROM public.stock_balance),
    'movements',               (SELECT COUNT(*) FROM public.movements),
    'lots',                    (SELECT COUNT(*) FROM public.lots),
    'addresses',               (SELECT COUNT(*) FROM public.addresses),
    'products',                (SELECT COUNT(*) FROM public.products),
    'activity_log',            (SELECT COUNT(*) FROM public.activity_log WHERE company_id IS NOT NULL),
    'company_members',         (SELECT COUNT(*) FROM public.company_members),
    'companies',               (SELECT COUNT(*) FROM public.companies),
    'user_tab_permissions',    (SELECT COUNT(*) FROM public.user_tab_permissions
                                 WHERE NOT public.is_platform_staff(user_id)),
    'profiles_clientes',       (SELECT COUNT(*) FROM public.profiles p WHERE NOT public.is_platform_staff(p.id))
  ) INTO v_counts;

  RETURN jsonb_build_object(
    'preserved_platform_users', v_preserved,
    'users_to_delete', v_users,
    'companies_to_delete', v_companies,
    'counts_to_delete', v_counts,
    'preserved_tables', jsonb_build_array('system_changelog','user_roles (globais)','profiles (equipe LLZ)','estrutura/migrations')
  );
END $function$;

CREATE OR REPLACE FUNCTION public.platform_reset_execute(_caller_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_report jsonb := '{}'::jsonb;
  v_n bigint;
BEGIN
  IF _caller_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = _caller_id AND role::text IN ('super_admin','admin')
  ) THEN
    RAISE EXCEPTION 'Apenas o super admin pode executar o reset de ambiente';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE role::text IN ('super_admin','admin')
  ) THEN
    RAISE EXCEPTION 'Nenhum super admin válido — reset abortado';
  END IF;

  IF NOT public.is_platform_staff(_caller_id) THEN
    RAISE EXCEPTION 'O usuário atual não está na lista de preservação — reset abortado';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.id = _caller_id AND NOT public.is_platform_staff(p.id)
  ) THEN
    RAISE EXCEPTION 'O usuário atual está na lista de exclusão — reset abortado';
  END IF;

  DELETE FROM public.support_ticket_messages; GET DIAGNOSTICS v_n = ROW_COUNT;
  v_report := v_report || jsonb_build_object('support_ticket_messages', v_n);
  DELETE FROM public.support_tickets; GET DIAGNOSTICS v_n = ROW_COUNT;
  v_report := v_report || jsonb_build_object('support_tickets', v_n);
  DELETE FROM public.picking_list_items; GET DIAGNOSTICS v_n = ROW_COUNT;
  v_report := v_report || jsonb_build_object('picking_list_items', v_n);
  DELETE FROM public.picking_lists; GET DIAGNOSTICS v_n = ROW_COUNT;
  v_report := v_report || jsonb_build_object('picking_lists', v_n);
  DELETE FROM public.notifications; GET DIAGNOSTICS v_n = ROW_COUNT;
  v_report := v_report || jsonb_build_object('notifications', v_n);
  DELETE FROM public.stock_balance; GET DIAGNOSTICS v_n = ROW_COUNT;
  v_report := v_report || jsonb_build_object('stock_balance', v_n);
  DELETE FROM public.movements; GET DIAGNOSTICS v_n = ROW_COUNT;
  v_report := v_report || jsonb_build_object('movements', v_n);
  DELETE FROM public.lots; GET DIAGNOSTICS v_n = ROW_COUNT;
  v_report := v_report || jsonb_build_object('lots', v_n);
  DELETE FROM public.addresses; GET DIAGNOSTICS v_n = ROW_COUNT;
  v_report := v_report || jsonb_build_object('addresses', v_n);
  DELETE FROM public.products; GET DIAGNOSTICS v_n = ROW_COUNT;
  v_report := v_report || jsonb_build_object('products', v_n);
  DELETE FROM public.activity_log WHERE company_id IS NOT NULL; GET DIAGNOSTICS v_n = ROW_COUNT;
  v_report := v_report || jsonb_build_object('activity_log', v_n);
  DELETE FROM public.company_members; GET DIAGNOSTICS v_n = ROW_COUNT;
  v_report := v_report || jsonb_build_object('company_members', v_n);
  DELETE FROM public.companies; GET DIAGNOSTICS v_n = ROW_COUNT;
  v_report := v_report || jsonb_build_object('companies', v_n);
  DELETE FROM public.user_tab_permissions WHERE NOT public.is_platform_staff(user_id);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_report := v_report || jsonb_build_object('user_tab_permissions', v_n);
  DELETE FROM public.profiles p WHERE NOT public.is_platform_staff(p.id);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_report := v_report || jsonb_build_object('profiles', v_n);

  INSERT INTO public.activity_log (user_id, action, entity_type, entity_id, details, company_id)
  VALUES (_caller_id, 'platform_environment_reset', 'platform', 'reset', v_report, NULL);

  RETURN v_report;
END $function$;

REVOKE ALL ON FUNCTION public.platform_reset_preview(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.platform_reset_execute(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_reset_preview(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.platform_reset_execute(uuid) TO service_role;