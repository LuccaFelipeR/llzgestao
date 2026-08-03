
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

  SELECT COALESCE(array_agg(c.name), ARRAY[]::text[]) INTO v_protected_selected
    FROM public.companies c
   WHERE c.id = ANY(v_ids) AND c.name = ANY(v_protected_names);

  IF array_length(v_ids,1) IS NULL THEN
    v_blockers := v_blockers || 'Nenhuma empresa selecionada.'::text;
  END IF;
  IF array_length(v_invalid,1) IS NOT NULL THEN
    v_blockers := v_blockers || ('Empresa inexistente informada: ' || array_to_string(v_invalid, ', '))::text;
  END IF;
  IF array_length(v_protected_selected,1) IS NOT NULL THEN
    v_blockers := v_blockers || ('Empresa de preservação obrigatória selecionada: ' || array_to_string(v_protected_selected, ', '))::text;
  END IF;

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

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', c.id, 'name', c.name,
           'reason', CASE WHEN c.name = ANY(v_protected_names)
                          THEN 'Preservação obrigatória' ELSE 'Não selecionada' END
         ) ORDER BY c.name), '[]'::jsonb)
    INTO v_preserve_companies
    FROM public.companies c WHERE NOT (c.id = ANY(v_ids));

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'user_id', cm.user_id, 'email', p.email, 'full_name', p.full_name,
           'company_id', cm.company_id, 'company', c.name, 'role', cm.role::text
         ) ORDER BY p.email), '[]'::jsonb)
    INTO v_memberships
    FROM public.company_members cm
    JOIN public.companies c ON c.id = cm.company_id
    LEFT JOIN public.profiles p ON p.id = cm.user_id
   WHERE cm.company_id = ANY(v_ids);

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
      ORDER BY email) FILTER (WHERE NOT COALESCE(has_role,false) AND NOT COALESCE(has_kept,false) AND NOT COALESCE(is_protected,false)), '[]'::jsonb),
    COALESCE(jsonb_agg(jsonb_build_object('id', uid, 'email', email, 'full_name', full_name)
      ORDER BY email) FILTER (WHERE has_kept), '[]'::jsonb)
  INTO v_users_preserve, v_auth_delete, v_mixed
  FROM cls;

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

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_auth_delete) e
     WHERE (e->>'email') = ANY(v_protected_emails)
        OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = (e->>'id')::uuid)
  ) THEN
    v_blockers := v_blockers || 'Usuário protegido ou com papel global apareceu na lista de exclusão — limpeza abortada.'::text;
  END IF;

  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_memberships) e WHERE e->>'email' IS NULL) THEN
    v_blockers := v_blockers || 'Existem vínculos sem perfil identificado — verifique a integridade antes de continuar.'::text;
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

-- Validação somente leitura (nada é alterado)
DO $$
DECLARE r jsonb; s jsonb; b jsonb;
BEGIN
  -- 1) seleção vazia -> blocker
  r := public.platform_cleanup_preview('623e7ca3-1d08-4bfe-b034-b4f4ea53c962', ARRAY[]::uuid[]);
  RAISE NOTICE 'TESTE1 blockers=%', r->'blockers';

  -- 2) empresa protegida -> blocker
  s := (SELECT to_jsonb(array_agg(id)) FROM public.companies WHERE name = 'Lemon Haze Floricultura');
  r := public.platform_cleanup_preview('623e7ca3-1d08-4bfe-b034-b4f4ea53c962',
        ARRAY(SELECT id FROM public.companies WHERE name='Lemon Haze Floricultura'));
  RAISE NOTICE 'TESTE2 blockers=%', r->'blockers';

  -- 3) empresa de teste
  r := public.platform_cleanup_preview('623e7ca3-1d08-4bfe-b034-b4f4ea53c962',
        ARRAY(SELECT id FROM public.companies WHERE name='LUCCATESTE01'));
  RAISE NOTICE 'TESTE3 blockers=% auth_delete=% preserve=%',
    r->'blockers', r->'auth_users_to_delete', r->'users_to_preserve';
END $$;
