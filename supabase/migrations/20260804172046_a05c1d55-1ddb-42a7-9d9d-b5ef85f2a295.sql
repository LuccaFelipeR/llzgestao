
-- =========================================================
-- 6.16.4 — limpeza seletiva dinâmica (sem listas fixas)
-- =========================================================

CREATE OR REPLACE FUNCTION public.platform_cleanup_inventory(_caller_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
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
    'protected', false,
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
    'protected_company_names', '[]'::jsonb
  );
END $function$;

CREATE OR REPLACE FUNCTION public.platform_cleanup_preview(_caller_id uuid, _company_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ids uuid[] := COALESCE(_company_ids, ARRAY[]::uuid[]);
  v_blockers text[] := ARRAY[]::text[];
  v_warnings text[] := ARRAY[]::text[];
  v_invalid text[];
  v_selected jsonb;
  v_preserve_companies jsonb;
  v_memberships jsonb;
  v_orphan_del jsonb;
  v_orphan_keep jsonb;
  v_orphan_auth jsonb;
  v_users_preserve jsonb;
  v_auth_delete jsonb;
  v_mixed jsonb;
  v_orphans jsonb;
  v_counts jsonb;
  v_platform_users jsonb;
  v_hist bigint;
BEGIN
  IF _caller_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = _caller_id AND role::text IN ('super_admin','admin')
  ) THEN
    RAISE EXCEPTION 'Apenas o super admin pode consultar a limpeza de ambiente';
  END IF;

  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'email'), '[]'::jsonb) INTO v_platform_users
  FROM (
    SELECT jsonb_build_object(
             'id', p.id, 'email', p.email, 'full_name', p.full_name,
             'roles', (SELECT jsonb_agg(DISTINCT ur2.role::text) FROM public.user_roles ur2 WHERE ur2.user_id = p.id)
           ) AS x
      FROM public.profiles p
     WHERE EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id)
  ) s;

  SELECT COALESCE(array_agg(i::text), ARRAY[]::text[]) INTO v_invalid
    FROM unnest(v_ids) i
   WHERE NOT EXISTS (SELECT 1 FROM public.companies c WHERE c.id = i);

  IF array_length(v_ids,1) IS NULL THEN
    v_blockers := v_blockers || 'Nenhuma empresa selecionada.'::text;
  END IF;
  IF array_length(v_invalid,1) IS NOT NULL THEN
    v_blockers := v_blockers || ('Empresa inexistente informada: ' || array_to_string(v_invalid, ', '))::text;
  END IF;

  -- empresas selecionadas
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', c.id, 'name', c.name, 'status', c.status,
           'approval_status', c.approval_status, 'created_at', c.created_at,
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
           )
         ) ORDER BY c.name), '[]'::jsonb)
    INTO v_selected
    FROM public.companies c WHERE c.id = ANY(v_ids);

  -- toda empresa não selecionada é preservada (regra dinâmica)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', c.id, 'name', c.name, 'reason', 'Não selecionada'
         ) ORDER BY c.name), '[]'::jsonb)
    INTO v_preserve_companies
    FROM public.companies c WHERE NOT (c.id = ANY(v_ids));

  -- vínculos das empresas selecionadas (com profile)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'user_id', cm.user_id, 'email', p.email, 'full_name', p.full_name,
           'company_id', cm.company_id, 'company', c.name, 'role', cm.role::text
         ) ORDER BY p.email), '[]'::jsonb)
    INTO v_memberships
    FROM public.company_members cm
    JOIN public.companies c ON c.id = cm.company_id
    JOIN public.profiles p ON p.id = cm.user_id
   WHERE cm.company_id = ANY(v_ids);

  -- vínculos órfãos (sem profile) em empresas SELECIONADAS
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'membership_id', cm.id, 'company_id', cm.company_id, 'company', c.name,
           'user_id', cm.user_id, 'role', cm.role::text,
           'has_global_role', EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = cm.user_id)
         ) ORDER BY c.name), '[]'::jsonb)
    INTO v_orphan_del
    FROM public.company_members cm
    JOIN public.companies c ON c.id = cm.company_id
   WHERE cm.company_id = ANY(v_ids)
     AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = cm.user_id);

  -- vínculos órfãos em empresas NÃO selecionadas (preservados)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'membership_id', cm.id, 'company_id', cm.company_id, 'company', c.name,
           'user_id', cm.user_id, 'role', cm.role::text
         ) ORDER BY c.name), '[]'::jsonb)
    INTO v_orphan_keep
    FROM public.company_members cm
    JOIN public.companies c ON c.id = cm.company_id
   WHERE NOT (cm.company_id = ANY(v_ids))
     AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = cm.user_id);

  -- contas Auth possivelmente órfãs (a verificar, nunca excluídas)
  SELECT COALESCE(jsonb_agg(DISTINCT jsonb_build_object('user_id', cm.user_id)), '[]'::jsonb)
    INTO v_orphan_auth
    FROM public.company_members cm
   WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = cm.user_id);

  -- classificação dos usuários com profile tocados pela seleção
  WITH touched AS (
    SELECT DISTINCT cm.user_id AS uid
      FROM public.company_members cm
     WHERE cm.company_id = ANY(v_ids)
       AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = cm.user_id)
  ), cls AS (
    SELECT t.uid, p.email, p.full_name,
           EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = t.uid) AS has_role,
           EXISTS (SELECT 1 FROM public.company_members cm2
                    WHERE cm2.user_id = t.uid AND NOT (cm2.company_id = ANY(v_ids))) AS has_kept,
           (t.uid = _caller_id) AS is_caller
      FROM touched t JOIN public.profiles p ON p.id = t.uid
  )
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'id', uid, 'email', email, 'full_name', full_name,
      'reason', CASE WHEN is_caller THEN 'Usuário autenticado da operação'
                     WHEN has_role THEN 'Papel global na plataforma'
                     ELSE 'Vínculo com empresa preservada' END)
      ORDER BY email) FILTER (WHERE has_role OR has_kept OR is_caller), '[]'::jsonb),
    COALESCE(jsonb_agg(jsonb_build_object('id', uid, 'email', email, 'full_name', full_name)
      ORDER BY email) FILTER (WHERE NOT has_role AND NOT has_kept AND NOT is_caller), '[]'::jsonb),
    COALESCE(jsonb_agg(jsonb_build_object('id', uid, 'email', email, 'full_name', full_name)
      ORDER BY email) FILTER (WHERE has_kept), '[]'::jsonb)
  INTO v_users_preserve, v_auth_delete, v_mixed
  FROM cls;

  -- perfis sem nenhum vínculo (nunca excluídos aqui)
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', p.id, 'email', p.email, 'full_name', p.full_name)
         ORDER BY p.email), '[]'::jsonb)
    INTO v_orphans
    FROM public.profiles p
   WHERE NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id)
     AND NOT EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.user_id = p.id);

  SELECT jsonb_build_object(
    'support_ticket_messages', (SELECT COUNT(*) FROM public.support_ticket_messages m
                                 JOIN public.support_tickets t ON t.id = m.ticket_id
                                WHERE t.company_id = ANY(v_ids)),
    'support_tickets',         (SELECT COUNT(*) FROM public.support_tickets WHERE company_id = ANY(v_ids)),
    'picking_list_items',      (SELECT COUNT(*) FROM public.picking_list_items WHERE company_id = ANY(v_ids)),
    'picking_lists',           (SELECT COUNT(*) FROM public.picking_lists WHERE company_id = ANY(v_ids)),
    'notifications',           (SELECT COUNT(*) FROM public.notifications WHERE company_id = ANY(v_ids)),
    'stock_balance',           (SELECT COUNT(*) FROM public.stock_balance WHERE company_id = ANY(v_ids)),
    'movements',               (SELECT COUNT(*) FROM public.movements WHERE company_id = ANY(v_ids)),
    'lots',                    (SELECT COUNT(*) FROM public.lots WHERE company_id = ANY(v_ids)),
    'addresses',               (SELECT COUNT(*) FROM public.addresses WHERE company_id = ANY(v_ids)),
    'products',                (SELECT COUNT(*) FROM public.products WHERE company_id = ANY(v_ids)),
    'activity_log',            (SELECT COUNT(*) FROM public.activity_log WHERE company_id = ANY(v_ids)),
    'company_members',         (SELECT COUNT(*) FROM public.company_members WHERE company_id = ANY(v_ids)),
    'companies',               (SELECT COUNT(*) FROM public.companies WHERE id = ANY(v_ids))
  ) INTO v_counts;

  -- ---------------- blockers ----------------
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_auth_delete) e
     WHERE EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = (e->>'id')::uuid)
  ) THEN
    v_blockers := v_blockers || 'Usuário com papel global apareceu na lista de exclusão — limpeza abortada.'::text;
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_auth_delete) e
     WHERE EXISTS (SELECT 1 FROM public.company_members cm
                    WHERE cm.user_id = (e->>'id')::uuid AND NOT (cm.company_id = ANY(v_ids)))
  ) THEN
    v_blockers := v_blockers || 'Usuário com vínculo em empresa preservada apareceu na lista de exclusão — limpeza abortada.'::text;
  END IF;

  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_auth_delete) e WHERE (e->>'id')::uuid = _caller_id) THEN
    v_blockers := v_blockers || 'O usuário autenticado apareceu na lista de exclusão — limpeza abortada.'::text;
  END IF;

  -- ---------------- warnings ----------------
  IF jsonb_array_length(v_orphan_del) > 0 THEN
    v_warnings := v_warnings || (jsonb_array_length(v_orphan_del) || ' vínculo(s) sem cadastro de usuário serão removidos junto com as empresas selecionadas.')::text;
  END IF;
  IF jsonb_array_length(v_orphan_keep) > 0 THEN
    v_warnings := v_warnings || (jsonb_array_length(v_orphan_keep) || ' vínculo(s) sem cadastro de usuário em empresas preservadas permanecerão intactos (qualidade de dados).')::text;
  END IF;
  IF jsonb_array_length(v_orphan_auth) > 0 THEN
    v_warnings := v_warnings || 'Existem contas de acesso que precisam ser verificadas manualmente (vínculo sem cadastro).'::text;
  END IF;
  IF jsonb_array_length(v_orphans) > 0 THEN
    v_warnings := v_warnings || (jsonb_array_length(v_orphans) || ' cadastro(s) sem vínculo com empresa — não serão removidos.')::text;
  END IF;

  SELECT COALESCE(SUM(v),0) INTO v_hist FROM (
    SELECT (v_counts->>'products')::bigint AS v
    UNION ALL SELECT (v_counts->>'movements')::bigint
    UNION ALL SELECT (v_counts->>'stock_balance')::bigint
    UNION ALL SELECT (v_counts->>'activity_log')::bigint
  ) q;
  IF v_hist > 0 THEN
    v_warnings := v_warnings || 'As empresas selecionadas possuem histórico operacional que será removido permanentemente.'::text;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.companies c
     WHERE c.id = ANY(v_ids)
       AND NOT EXISTS (SELECT 1 FROM public.company_members cm
                        WHERE cm.company_id = c.id AND cm.role = 'owner')
  ) THEN
    v_warnings := v_warnings || 'Existe empresa selecionada sem responsável (owner) definido.'::text;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.companies c
     WHERE c.id = ANY(v_ids) AND c.main_focal_user_id IS NULL
  ) THEN
    v_warnings := v_warnings || 'Existe empresa selecionada sem ponto focal principal.'::text;
  END IF;

  RETURN jsonb_build_object(
    'selected_companies_to_delete', v_selected,
    'companies_to_preserve', v_preserve_companies,
    'memberships_to_delete', v_memberships,
    'orphan_memberships_to_delete', v_orphan_del,
    'orphan_memberships_preserved', v_orphan_keep,
    'users_to_preserve', v_users_preserve,
    'users_with_mixed_memberships', v_mixed,
    'auth_users_to_delete', v_auth_delete,
    'orphan_auth_candidates', v_orphan_auth,
    'orphan_users', v_orphans,
    'platform_users', v_platform_users,
    'counts_to_delete', v_counts,
    'warnings', to_jsonb(v_warnings),
    'blockers', to_jsonb(v_blockers)
  );
END $function$;

CREATE OR REPLACE FUNCTION public.platform_cleanup_execute(_caller_id uuid, _company_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ids uuid[] := COALESCE(_company_ids, ARRAY[]::uuid[]);
  v_preview jsonb;
  v_blockers jsonb;
  v_auth_delete jsonb;
  v_removed jsonb := '{}'::jsonb;
  v_n bigint;
  v_user_ids uuid[];
BEGIN
  v_preview := public.platform_cleanup_preview(_caller_id, v_ids);
  v_blockers := v_preview->'blockers';
  IF jsonb_array_length(v_blockers) > 0 THEN
    RAISE EXCEPTION 'Limpeza bloqueada: %', (SELECT string_agg(value::text, ' ') FROM jsonb_array_elements_text(v_blockers) AS value);
  END IF;

  v_auth_delete := v_preview->'auth_users_to_delete';
  SELECT COALESCE(array_agg((e->>'id')::uuid), ARRAY[]::uuid[]) INTO v_user_ids
    FROM jsonb_array_elements(v_auth_delete) e;

  DELETE FROM public.support_ticket_messages m
   USING public.support_tickets t
   WHERE m.ticket_id = t.id AND t.company_id = ANY(v_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_removed := v_removed || jsonb_build_object('support_ticket_messages', v_n);

  DELETE FROM public.support_tickets WHERE company_id = ANY(v_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_removed := v_removed || jsonb_build_object('support_tickets', v_n);

  DELETE FROM public.picking_list_items WHERE company_id = ANY(v_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_removed := v_removed || jsonb_build_object('picking_list_items', v_n);

  DELETE FROM public.picking_lists WHERE company_id = ANY(v_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_removed := v_removed || jsonb_build_object('picking_lists', v_n);

  DELETE FROM public.notifications WHERE company_id = ANY(v_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_removed := v_removed || jsonb_build_object('notifications', v_n);

  DELETE FROM public.stock_balance WHERE company_id = ANY(v_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_removed := v_removed || jsonb_build_object('stock_balance', v_n);

  DELETE FROM public.movements WHERE company_id = ANY(v_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_removed := v_removed || jsonb_build_object('movements', v_n);

  DELETE FROM public.lots WHERE company_id = ANY(v_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_removed := v_removed || jsonb_build_object('lots', v_n);

  DELETE FROM public.addresses WHERE company_id = ANY(v_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_removed := v_removed || jsonb_build_object('addresses', v_n);

  DELETE FROM public.products WHERE company_id = ANY(v_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_removed := v_removed || jsonb_build_object('products', v_n);

  DELETE FROM public.activity_log WHERE company_id = ANY(v_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_removed := v_removed || jsonb_build_object('activity_log', v_n);

  -- inclui vínculos órfãos: filtro SEMPRE por company_id selecionado
  DELETE FROM public.company_members WHERE company_id = ANY(v_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_removed := v_removed || jsonb_build_object('company_members', v_n);

  DELETE FROM public.companies WHERE id = ANY(v_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_removed := v_removed || jsonb_build_object('companies', v_n);

  IF array_length(v_user_ids,1) IS NOT NULL THEN
    DELETE FROM public.user_tab_permissions WHERE user_id = ANY(v_user_ids);
    GET DIAGNOSTICS v_n = ROW_COUNT; v_removed := v_removed || jsonb_build_object('user_tab_permissions', v_n);

    DELETE FROM public.profiles p
     WHERE p.id = ANY(v_user_ids)
       AND p.id <> _caller_id
       AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id)
       AND NOT EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.user_id = p.id);
    GET DIAGNOSTICS v_n = ROW_COUNT; v_removed := v_removed || jsonb_build_object('profiles', v_n);
  END IF;

  INSERT INTO public.activity_log (user_id, action, entity_type, details)
  VALUES (_caller_id, 'platform_selective_cleanup', 'platform',
          jsonb_build_object('company_ids', to_jsonb(v_ids), 'removed', v_removed,
                             'warnings', v_preview->'warnings'));

  RETURN jsonb_build_object(
    'removed', v_removed,
    'auth_users_to_delete', v_auth_delete,
    'orphan_auth_candidates', v_preview->'orphan_auth_candidates',
    'warnings', v_preview->'warnings'
  );
END $function$;

DROP FUNCTION IF EXISTS public.platform_protected_company_names();
DROP FUNCTION IF EXISTS public.platform_protected_user_emails();

REVOKE ALL ON FUNCTION public.platform_cleanup_inventory(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.platform_cleanup_preview(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.platform_cleanup_execute(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_cleanup_inventory(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.platform_cleanup_preview(uuid, uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.platform_cleanup_execute(uuid, uuid[]) TO service_role;
