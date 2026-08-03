
-- =========================================================
-- 6.16.3 — Limpeza seletiva de empresas (nada é executado aqui)
-- =========================================================

CREATE OR REPLACE FUNCTION public.platform_protected_company_names()
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $$ SELECT ARRAY['Lemon Haze Floricultura','Magrao Auto Peças','Congelados Sartorio'] $$;

CREATE OR REPLACE FUNCTION public.platform_protected_user_emails()
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $$ SELECT ARRAY['luccafelipe99@gmail.com','abel.beleleu@gmail.com','manus2silva01@gmail.com',
                   'leandrom.yamasaki@gmail.com','magraoautopecascbm@gmail.com','marco.sartorio@hotmail.com'] $$;

-- ---------------------------------------------------------
-- PREVIEW (somente leitura)
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.platform_cleanup_preview(_caller_id uuid, _company_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ids uuid[] := COALESCE(_company_ids, ARRAY[]::uuid[]);
  v_protected_names text[] := public.platform_protected_company_names();
  v_protected_emails text[] := public.platform_protected_user_emails();
  v_blockers text[] := ARRAY[]::text[];
  v_invalid text[];
  v_protected_selected text[];
  v_selected jsonb;
  v_preserve_companies jsonb;
  v_memberships jsonb;
  v_users_preserve jsonb;
  v_auth_delete jsonb;
  v_mixed jsonb;
  v_orphans jsonb;
  v_counts jsonb;
  v_platform_users jsonb;
BEGIN
  IF _caller_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = _caller_id AND role::text IN ('super_admin','admin')
  ) THEN
    RAISE EXCEPTION 'Apenas o super admin pode consultar a limpeza de ambiente';
  END IF;

  -- Papéis globais agrupados por usuário (uma linha por usuário)
  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'email'), '[]'::jsonb) INTO v_platform_users
  FROM (
    SELECT jsonb_build_object(
             'id', p.id, 'email', p.email, 'full_name', p.full_name,
             'roles', (SELECT jsonb_agg(DISTINCT ur2.role::text) FROM public.user_roles ur2 WHERE ur2.user_id = p.id)
           ) AS x
      FROM public.profiles p
     WHERE EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id)
  ) s;

  -- IDs inválidos
  SELECT COALESCE(array_agg(i::text), ARRAY[]::text[]) INTO v_invalid
    FROM unnest(v_ids) i
   WHERE NOT EXISTS (SELECT 1 FROM public.companies c WHERE c.id = i);

  -- Empresas protegidas selecionadas
  SELECT COALESCE(array_agg(c.name), ARRAY[]::text[]) INTO v_protected_selected
    FROM public.companies c
   WHERE c.id = ANY(v_ids) AND c.name = ANY(v_protected_names);

  IF array_length(v_ids,1) IS NULL THEN
    v_blockers := v_blockers || 'Nenhuma empresa selecionada.';
  END IF;
  IF array_length(v_invalid,1) IS NOT NULL THEN
    v_blockers := v_blockers || ('Empresa inexistente informada: ' || array_to_string(v_invalid, ', '));
  END IF;
  IF array_length(v_protected_selected,1) IS NOT NULL THEN
    v_blockers := v_blockers || ('Empresa de preservação obrigatória selecionada: ' || array_to_string(v_protected_selected, ', '));
  END IF;

  -- Empresas selecionadas + contagens
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

  -- Empresas preservadas
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', c.id, 'name', c.name,
           'reason', CASE WHEN c.name = ANY(v_protected_names)
                          THEN 'Preservação obrigatória' ELSE 'Não selecionada' END
         ) ORDER BY c.name), '[]'::jsonb)
    INTO v_preserve_companies
    FROM public.companies c WHERE NOT (c.id = ANY(v_ids));

  -- Vínculos que seriam removidos
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'user_id', cm.user_id, 'email', p.email, 'full_name', p.full_name,
           'company_id', cm.company_id, 'company', c.name, 'role', cm.role::text
         ) ORDER BY p.email), '[]'::jsonb)
    INTO v_memberships
    FROM public.company_members cm
    JOIN public.companies c ON c.id = cm.company_id
    LEFT JOIN public.profiles p ON p.id = cm.user_id
   WHERE cm.company_id = ANY(v_ids);

  -- Classificação dos usuários afetados
  CREATE TEMP TABLE IF NOT EXISTS _tmp_noop(x int); -- no-op (evita side effects estruturais)

  WITH touched AS (
    SELECT DISTINCT cm.user_id AS uid FROM public.company_members cm WHERE cm.company_id = ANY(v_ids)
  ), cls AS (
    SELECT t.uid,
           p.email, p.full_name,
           EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = t.uid) AS has_role,
           EXISTS (SELECT 1 FROM public.company_members cm2
                    WHERE cm2.user_id = t.uid AND NOT (cm2.company_id = ANY(v_ids))) AS has_kept,
           (p.email = ANY(v_protected_emails)) AS is_protected
      FROM touched t LEFT JOIN public.profiles p ON p.id = t.uid
  )
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'id', uid, 'email', email, 'full_name', full_name,
      'reason', CASE WHEN is_protected THEN 'Preservação obrigatória'
                     WHEN has_role THEN 'Papel global na plataforma'
                     ELSE 'Vínculo com empresa preservada' END)
      ORDER BY email) FILTER (WHERE has_role OR has_kept OR is_protected), '[]'::jsonb),
    COALESCE(jsonb_agg(jsonb_build_object('id', uid, 'email', email, 'full_name', full_name)
      ORDER BY email) FILTER (WHERE NOT has_role AND NOT has_kept AND NOT is_protected), '[]'::jsonb),
    COALESCE(jsonb_agg(jsonb_build_object('id', uid, 'email', email, 'full_name', full_name)
      ORDER BY email) FILTER (WHERE has_kept), '[]'::jsonb)
  INTO v_users_preserve, v_auth_delete, v_mixed
  FROM cls;

  DROP TABLE IF EXISTS _tmp_noop;

  -- Usuários órfãos (sem papel global e sem nenhum vínculo) — nunca excluídos aqui
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', p.id, 'email', p.email, 'full_name', p.full_name)
         ORDER BY p.email), '[]'::jsonb)
    INTO v_orphans
    FROM public.profiles p
   WHERE NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id)
     AND NOT EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.user_id = p.id);

  -- Contagens totais das empresas selecionadas
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

  -- Blockers de segurança sobre usuários
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_auth_delete) e
     WHERE (e->>'email') = ANY(v_protected_emails)
        OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = (e->>'id')::uuid)
  ) THEN
    v_blockers := v_blockers || 'Usuário protegido ou com papel global apareceu na lista de exclusão — limpeza abortada.';
  END IF;

  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_memberships) e WHERE e->>'email' IS NULL) THEN
    v_blockers := v_blockers || 'Existem vínculos sem perfil identificado — verifique a integridade antes de continuar.';
  END IF;

  RETURN jsonb_build_object(
    'selected_companies_to_delete', v_selected,
    'companies_to_preserve', v_preserve_companies,
    'memberships_to_delete', v_memberships,
    'users_to_preserve', v_users_preserve,
    'auth_users_to_delete', v_auth_delete,
    'users_with_mixed_memberships', v_mixed,
    'orphan_users', v_orphans,
    'platform_users', v_platform_users,
    'counts_to_delete', v_counts,
    'protected_company_names', to_jsonb(v_protected_names),
    'blockers', to_jsonb(v_blockers)
  );
END $function$;

-- ---------------------------------------------------------
-- EXECUÇÃO (não é chamada nesta fase)
-- ---------------------------------------------------------
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

  DELETE FROM public.company_members WHERE company_id = ANY(v_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_removed := v_removed || jsonb_build_object('company_members', v_n);

  DELETE FROM public.companies WHERE id = ANY(v_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_removed := v_removed || jsonb_build_object('companies', v_n);

  IF array_length(v_user_ids,1) IS NOT NULL THEN
    DELETE FROM public.user_tab_permissions WHERE user_id = ANY(v_user_ids);
    GET DIAGNOSTICS v_n = ROW_COUNT; v_removed := v_removed || jsonb_build_object('user_tab_permissions', v_n);

    DELETE FROM public.profiles p
     WHERE p.id = ANY(v_user_ids)
       AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id)
       AND NOT EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.user_id = p.id)
       AND NOT (p.email = ANY(public.platform_protected_user_emails()));
    GET DIAGNOSTICS v_n = ROW_COUNT; v_removed := v_removed || jsonb_build_object('profiles', v_n);
  END IF;

  INSERT INTO public.activity_log (user_id, action, entity_type, details)
  VALUES (_caller_id, 'platform_selective_cleanup', 'platform',
          jsonb_build_object('company_ids', to_jsonb(v_ids), 'removed', v_removed));

  RETURN jsonb_build_object('removed', v_removed, 'auth_users_to_delete', v_auth_delete);
END $function$;

REVOKE ALL ON FUNCTION public.platform_cleanup_preview(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.platform_cleanup_execute(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_cleanup_preview(uuid, uuid[]) TO service_role, postgres;
GRANT EXECUTE ON FUNCTION public.platform_cleanup_execute(uuid, uuid[]) TO service_role, postgres;

REVOKE ALL ON FUNCTION public.platform_protected_company_names() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.platform_protected_user_emails() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_protected_company_names() TO service_role, postgres;
GRANT EXECUTE ON FUNCTION public.platform_protected_user_emails() TO service_role, postgres;
