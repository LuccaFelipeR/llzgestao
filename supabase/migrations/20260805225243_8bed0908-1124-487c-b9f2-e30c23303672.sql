-- 1. Guard triggers respect an explicit, transaction-local cleanup flag
CREATE OR REPLACE FUNCTION public.prevent_delete_company_if_referenced()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_total int;
BEGIN
  IF coalesce(current_setting('app.cleanup_mode', true), '') = 'on' THEN
    RETURN OLD;
  END IF;
  SELECT
    (SELECT COUNT(*) FROM public.products        WHERE company_id = OLD.id)
  + (SELECT COUNT(*) FROM public.addresses       WHERE company_id = OLD.id)
  + (SELECT COUNT(*) FROM public.lots            WHERE company_id = OLD.id)
  + (SELECT COUNT(*) FROM public.stock_balance   WHERE company_id = OLD.id)
  + (SELECT COUNT(*) FROM public.movements       WHERE company_id = OLD.id)
  + (SELECT COUNT(*) FROM public.company_members WHERE company_id = OLD.id)
  + (SELECT COUNT(*) FROM public.notifications   WHERE company_id = OLD.id)
  + (SELECT COUNT(*) FROM public.picking_lists   WHERE company_id = OLD.id)
  + (SELECT COUNT(*) FROM public.activity_log    WHERE company_id = OLD.id)
  INTO v_total;
  IF v_total > 0 THEN
    RAISE EXCEPTION 'Esta empresa possui dados vinculados e não pode ser excluída definitivamente. Para preservar o histórico, use Desativar ou Bloquear.' USING ERRCODE='P0001';
  END IF;
  RETURN OLD;
END $function$;

CREATE OR REPLACE FUNCTION public.prevent_delete_product_if_referenced()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_stock NUMERIC; v_mov INT; v_lots INT;
BEGIN
  IF coalesce(current_setting('app.cleanup_mode', true), '') = 'on' THEN
    RETURN OLD;
  END IF;
  SELECT COALESCE(SUM(qty),0) INTO v_stock FROM public.stock_balance WHERE product_id = OLD.id AND qty > 0;
  IF v_stock > 0 THEN RAISE EXCEPTION 'Não é possível excluir: produto possui % unidade(s) em estoque. Zere o estoque antes.', v_stock; END IF;
  SELECT COUNT(*) INTO v_mov FROM public.movements WHERE product_id = OLD.id;
  IF v_mov > 0 THEN RAISE EXCEPTION 'Não é possível excluir: produto possui % movimento(s) no histórico. Movimentos são imutáveis; desative o produto.', v_mov; END IF;
  SELECT COUNT(*) INTO v_lots FROM public.lots WHERE product_id = OLD.id;
  IF v_lots > 0 THEN RAISE EXCEPTION 'Não é possível excluir: produto possui % lote(s) vinculado(s).', v_lots; END IF;
  RETURN OLD;
END $function$;

CREATE OR REPLACE FUNCTION public.prevent_delete_address_if_referenced()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_stock NUMERIC; v_mov INT;
BEGIN
  IF coalesce(current_setting('app.cleanup_mode', true), '') = 'on' THEN
    RETURN OLD;
  END IF;
  SELECT COALESCE(SUM(qty),0) INTO v_stock FROM public.stock_balance WHERE address_id = OLD.id AND qty > 0;
  IF v_stock > 0 THEN RAISE EXCEPTION 'Não é possível excluir: endereço possui % unidade(s) em estoque.', v_stock; END IF;
  SELECT COUNT(*) INTO v_mov FROM public.movements WHERE from_address_id = OLD.id OR to_address_id = OLD.id;
  IF v_mov > 0 THEN RAISE EXCEPTION 'Não é possível excluir: endereço aparece em % movimento(s) do histórico. Desative o endereço.', v_mov; END IF;
  RETURN OLD;
END $function$;

-- 2. Staged, diagnosable cleanup execution
CREATE OR REPLACE FUNCTION public.platform_cleanup_execute(_caller_id uuid, _company_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_ids uuid[] := COALESCE(_company_ids, ARRAY[]::uuid[]);
  v_preview jsonb;
  v_blockers jsonb;
  v_auth_delete jsonb;
  v_removed jsonb := '{}'::jsonb;
  v_n bigint;
  v_user_ids uuid[];
  v_stage text := 'preview';
  v_msg text; v_state text; v_detail text; v_hint text; v_ctx text;
BEGIN
  v_preview := public.platform_cleanup_preview(_caller_id, v_ids);
  v_blockers := v_preview->'blockers';
  IF jsonb_array_length(v_blockers) > 0 THEN
    RAISE EXCEPTION 'Limpeza bloqueada: %', (SELECT string_agg(value::text, ' ') FROM jsonb_array_elements_text(v_blockers) AS value);
  END IF;

  v_auth_delete := v_preview->'auth_users_to_delete';
  SELECT COALESCE(array_agg((e->>'id')::uuid), ARRAY[]::uuid[]) INTO v_user_ids
    FROM jsonb_array_elements(v_auth_delete) e;

  -- Bypass guard triggers ONLY inside this authorized transaction
  PERFORM set_config('app.cleanup_mode', 'on', true);

  BEGIN
    v_stage := 'delete_support_ticket_messages';
    DELETE FROM public.support_ticket_messages m USING public.support_tickets t
     WHERE m.ticket_id = t.id AND t.company_id = ANY(v_ids);
    GET DIAGNOSTICS v_n = ROW_COUNT; v_removed := v_removed || jsonb_build_object('support_ticket_messages', v_n);

    v_stage := 'delete_support_tickets';
    DELETE FROM public.support_tickets WHERE company_id = ANY(v_ids);
    GET DIAGNOSTICS v_n = ROW_COUNT; v_removed := v_removed || jsonb_build_object('support_tickets', v_n);

    v_stage := 'delete_picking_list_items';
    DELETE FROM public.picking_list_items WHERE company_id = ANY(v_ids)
       OR picking_list_id IN (SELECT id FROM public.picking_lists WHERE company_id = ANY(v_ids));
    GET DIAGNOSTICS v_n = ROW_COUNT; v_removed := v_removed || jsonb_build_object('picking_list_items', v_n);

    v_stage := 'delete_picking_lists';
    DELETE FROM public.picking_lists WHERE company_id = ANY(v_ids);
    GET DIAGNOSTICS v_n = ROW_COUNT; v_removed := v_removed || jsonb_build_object('picking_lists', v_n);

    v_stage := 'delete_notifications';
    DELETE FROM public.notifications WHERE company_id = ANY(v_ids);
    GET DIAGNOSTICS v_n = ROW_COUNT; v_removed := v_removed || jsonb_build_object('notifications', v_n);

    v_stage := 'delete_stock_balance';
    DELETE FROM public.stock_balance WHERE company_id = ANY(v_ids)
       OR product_id IN (SELECT id FROM public.products WHERE company_id = ANY(v_ids))
       OR address_id IN (SELECT id FROM public.addresses WHERE company_id = ANY(v_ids));
    GET DIAGNOSTICS v_n = ROW_COUNT; v_removed := v_removed || jsonb_build_object('stock_balance', v_n);

    v_stage := 'delete_movements';
    DELETE FROM public.movements WHERE company_id = ANY(v_ids)
       OR product_id IN (SELECT id FROM public.products WHERE company_id = ANY(v_ids))
       OR from_address_id IN (SELECT id FROM public.addresses WHERE company_id = ANY(v_ids))
       OR to_address_id IN (SELECT id FROM public.addresses WHERE company_id = ANY(v_ids));
    GET DIAGNOSTICS v_n = ROW_COUNT; v_removed := v_removed || jsonb_build_object('movements', v_n);

    v_stage := 'delete_lots';
    DELETE FROM public.lots WHERE company_id = ANY(v_ids)
       OR product_id IN (SELECT id FROM public.products WHERE company_id = ANY(v_ids));
    GET DIAGNOSTICS v_n = ROW_COUNT; v_removed := v_removed || jsonb_build_object('lots', v_n);

    v_stage := 'delete_addresses';
    DELETE FROM public.addresses WHERE company_id = ANY(v_ids);
    GET DIAGNOSTICS v_n = ROW_COUNT; v_removed := v_removed || jsonb_build_object('addresses', v_n);

    v_stage := 'delete_products';
    DELETE FROM public.products WHERE company_id = ANY(v_ids);
    GET DIAGNOSTICS v_n = ROW_COUNT; v_removed := v_removed || jsonb_build_object('products', v_n);

    v_stage := 'delete_activity_log';
    DELETE FROM public.activity_log WHERE company_id = ANY(v_ids);
    GET DIAGNOSTICS v_n = ROW_COUNT; v_removed := v_removed || jsonb_build_object('activity_log', v_n);

    v_stage := 'delete_company_members';
    DELETE FROM public.company_members WHERE company_id = ANY(v_ids);
    GET DIAGNOSTICS v_n = ROW_COUNT; v_removed := v_removed || jsonb_build_object('company_members', v_n);

    v_stage := 'clear_company_user_references';
    UPDATE public.companies
       SET main_focal_user_id = NULL
     WHERE NOT (id = ANY(v_ids)) AND main_focal_user_id = ANY(v_user_ids);
    UPDATE public.companies
       SET approved_by = NULL
     WHERE NOT (id = ANY(v_ids)) AND approved_by = ANY(v_user_ids);

    v_stage := 'delete_companies';
    DELETE FROM public.companies WHERE id = ANY(v_ids);
    GET DIAGNOSTICS v_n = ROW_COUNT; v_removed := v_removed || jsonb_build_object('companies', v_n);

    IF array_length(v_user_ids,1) IS NOT NULL THEN
      v_stage := 'delete_user_tab_permissions';
      DELETE FROM public.user_tab_permissions WHERE user_id = ANY(v_user_ids);
      GET DIAGNOSTICS v_n = ROW_COUNT; v_removed := v_removed || jsonb_build_object('user_tab_permissions', v_n);

      v_stage := 'delete_profiles';
      DELETE FROM public.profiles p
       WHERE p.id = ANY(v_user_ids)
         AND p.id <> _caller_id
         AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id)
         AND NOT EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.user_id = p.id);
      GET DIAGNOSTICS v_n = ROW_COUNT; v_removed := v_removed || jsonb_build_object('profiles', v_n);
    END IF;

    v_stage := 'insert_audit_log';
    INSERT INTO public.activity_log (user_id, action, entity_type, details)
    VALUES (_caller_id, 'platform_selective_cleanup', 'platform',
            jsonb_build_object('company_ids', to_jsonb(v_ids), 'removed', v_removed,
                               'warnings', v_preview->'warnings'));
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS
      v_msg = MESSAGE_TEXT, v_state = RETURNED_SQLSTATE,
      v_detail = PG_EXCEPTION_DETAIL, v_hint = PG_EXCEPTION_HINT, v_ctx = PG_EXCEPTION_CONTEXT;
    RAISE EXCEPTION '%', jsonb_build_object(
      'cleanup_error', true,
      'stage', v_stage,
      'error_code', v_state,
      'message', v_msg,
      'detail', v_detail,
      'hint', v_hint,
      'context', left(coalesce(v_ctx,''), 500)
    )::text USING ERRCODE = 'P0001';
  END;

  RETURN jsonb_build_object(
    'removed', v_removed,
    'auth_users_to_delete', v_auth_delete,
    'orphan_auth_candidates', v_preview->'orphan_auth_candidates',
    'warnings', v_preview->'warnings'
  );
END $function$;

REVOKE ALL ON FUNCTION public.platform_cleanup_execute(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_cleanup_execute(uuid, uuid[]) TO service_role;