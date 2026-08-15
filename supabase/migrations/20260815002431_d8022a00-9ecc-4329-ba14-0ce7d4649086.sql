-- ============ Central de Usuários ============
CREATE OR REPLACE FUNCTION public.admin_users_overview(_search text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v jsonb; v_q text := lower(btrim(coalesce(_search,'')));
BEGIN
  IF NOT public.is_platform_staff(auth.uid()) THEN
    RETURN jsonb_build_object('items', '[]'::jsonb, 'error', 'sem permissão');
  END IF;

  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'email'), '[]'::jsonb) INTO v
  FROM (
    SELECT jsonb_build_object(
      'id', p.id,
      'email', p.email,
      'full_name', p.full_name,
      'account_type', p.account_type,
      'is_approved', p.is_approved,
      'staff_activated_at', p.staff_activated_at,
      'is_super_admin', public.is_platform_super_admin(p.id),
      'is_staff_active', (p.account_type = 'llz_staff' AND p.staff_activated_at IS NOT NULL),
      'created_at', p.created_at,
      'last_activity', (SELECT max(a.created_at) FROM public.activity_log a WHERE a.user_id = p.id),
      'companies', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'membership_id', cm.id,
          'company_id', c.id,
          'company', c.name,
          'role', cm.role,
          'is_active', cm.is_active,
          'is_main_focal_point', cm.is_main_focal_point,
          'joined_at', cm.created_at
        ) ORDER BY c.name)
        FROM public.company_members cm JOIN public.companies c ON c.id = cm.company_id
        WHERE cm.user_id = p.id), '[]'::jsonb)
    ) AS x
    FROM public.profiles p
    WHERE v_q = '' OR lower(coalesce(p.email,'')) LIKE '%'||v_q||'%'
       OR lower(coalesce(p.full_name,'')) LIKE '%'||v_q||'%'
  ) s;

  RETURN jsonb_build_object('items', v);
END $$;

CREATE OR REPLACE FUNCTION public.admin_user_detail(_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v jsonb;
BEGIN
  IF NOT public.is_platform_staff(auth.uid()) THEN
    RETURN jsonb_build_object('error', 'sem permissão');
  END IF;
  SELECT jsonb_build_object(
    'id', p.id, 'email', p.email, 'full_name', p.full_name,
    'account_type', p.account_type, 'is_approved', p.is_approved,
    'rejection_reason', p.rejection_reason,
    'staff_activated_at', p.staff_activated_at,
    'staff_activated_by', p.staff_activated_by,
    'is_super_admin', public.is_platform_super_admin(p.id),
    'is_staff_active', (p.account_type = 'llz_staff' AND p.staff_activated_at IS NOT NULL),
    'created_at', p.created_at,
    'last_activity', (SELECT max(a.created_at) FROM public.activity_log a WHERE a.user_id = p.id),
    'companies', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'membership_id', cm.id, 'company_id', c.id, 'company', c.name,
        'role', cm.role, 'is_active', cm.is_active,
        'is_main_focal_point', cm.is_main_focal_point, 'joined_at', cm.created_at,
        'approval_status', c.approval_status, 'status', c.status
      ) ORDER BY c.name)
      FROM public.company_members cm JOIN public.companies c ON c.id = cm.company_id
      WHERE cm.user_id = p.id), '[]'::jsonb)
  ) INTO v FROM public.profiles p WHERE p.id = _user_id;

  RETURN COALESCE(v, jsonb_build_object('error', 'Conta não encontrada.'));
END $$;

-- ============ Vínculos empresariais ============
CREATE OR REPLACE FUNCTION public.company_member_link(_company_id uuid, _user_id uuid, _role text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _caller uuid := auth.uid(); _p public.profiles%ROWTYPE; _c public.companies%ROWTYPE; _new uuid;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = '28000';
  END IF;
  IF NOT public.can_manage_company_members(_caller, _company_id) THEN
    RAISE EXCEPTION 'Você não tem permissão para administrar usuários desta empresa.' USING ERRCODE = '42501';
  END IF;
  IF _role NOT IN ('admin','supervisor','member') THEN
    RAISE EXCEPTION 'Cargo inválido. Use Administrador, Supervisor ou Operador.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _c FROM public.companies WHERE id = _company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Empresa não encontrada.' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO _p FROM public.profiles WHERE id = _user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta não encontrada.' USING ERRCODE = 'P0002';
  END IF;
  IF _p.account_type = 'llz_staff' THEN
    RAISE EXCEPTION 'Contas da Equipe LLZ não podem ser vinculadas a empresas clientes.' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.company_members WHERE company_id = _company_id AND user_id = _user_id) THEN
    RAISE EXCEPTION 'Usuário já vinculado a esta empresa.' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.company_members (company_id, user_id, role, is_active, approved_at)
  VALUES (_company_id, _user_id, _role, true, now())
  RETURNING id INTO _new;

  INSERT INTO public.activity_log (user_id, company_id, action, entity_type, entity_id, new_data)
  VALUES (_caller, _company_id, 'company_member_linked', 'company_member', _new::text,
          jsonb_build_object('user_id', _user_id, 'email', _p.email, 'role', _role));

  RETURN jsonb_build_object('ok', true, 'membership_id', _new);
END $$;

CREATE OR REPLACE FUNCTION public.company_member_unlink(_company_id uuid, _member_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _caller uuid := auth.uid(); _m public.company_members%ROWTYPE; _focal_cleared boolean := false;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = '28000';
  END IF;
  IF NOT public.can_manage_company_members(_caller, _company_id) THEN
    RAISE EXCEPTION 'Você não tem permissão para administrar usuários desta empresa.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _m FROM public.company_members WHERE id = _member_id AND company_id = _company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vínculo não encontrado nesta empresa.' USING ERRCODE = 'P0002';
  END IF;
  IF _m.role = 'owner' THEN
    RAISE EXCEPTION 'O proprietário não pode ser desvinculado. Transfira a propriedade antes.' USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM public.company_members WHERE id = _member_id;

  IF _m.is_main_focal_point THEN
    UPDATE public.companies SET main_focal_user_id = NULL, updated_at = now()
     WHERE id = _company_id AND main_focal_user_id = _m.user_id;
    _focal_cleared := true;
  END IF;

  INSERT INTO public.activity_log (user_id, company_id, action, entity_type, entity_id, previous_data)
  VALUES (_caller, _company_id, 'company_member_unlinked', 'company_member', _member_id::text,
          jsonb_build_object('user_id', _m.user_id, 'role', _m.role, 'was_focal', _m.is_main_focal_point));

  RETURN jsonb_build_object('ok', true, 'focal_cleared', _focal_cleared, 'user_id', _m.user_id);
END $$;

REVOKE EXECUTE ON FUNCTION public.admin_users_overview(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_user_detail(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.company_member_link(uuid, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.company_member_unlink(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_users_overview(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_user_detail(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.company_member_link(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.company_member_unlink(uuid, uuid) TO authenticated;

-- ============ Diagnóstico ============
CREATE OR REPLACE FUNCTION public.platform_access_diagnostics()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_items jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.is_platform_staff(auth.uid()) THEN
    RETURN jsonb_build_object('items', '[]'::jsonb, 'error', 'sem permissão');
  END IF;

  WITH items AS (
    SELECT 'customer_with_staff_access' AS code, 'critical' AS severity, p.id AS user_id, p.email,
           NULL::text AS company,
           'Conta Cliente com acesso interno da Equipe LLZ' AS situation,
           'Remover a ativação LLZ ou reclassificar a conta' AS recommendation
    FROM public.profiles p
    WHERE p.account_type = 'customer' AND p.staff_activated_at IS NOT NULL

    UNION ALL
    SELECT 'company_role_in_user_roles', 'critical', ur.user_id, p.email, NULL,
           'Papel empresarial gravado incorretamente como papel global (' || ur.role::text || ')',
           'Remover o registro em papéis globais; cargos de empresa vivem em company_members'
    FROM public.user_roles ur
    LEFT JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.role::text IN ('supervisor','operator','member','owner','admin_empresa')

    UNION ALL
    SELECT 'legacy_global_role', 'warning', ur.user_id, p.email, NULL,
           'Papel global legado ainda presente (' || ur.role::text || ')',
           'Papéis platform_admin/support_agent/developer foram descontinuados; avaliar remoção'
    FROM public.user_roles ur
    LEFT JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.role::text IN ('platform_admin','support_agent','developer')

    UNION ALL
    SELECT 'staff_with_membership', 'warning', p.id, p.email, c.name,
           'Membro da Equipe LLZ possui vínculo empresarial',
           'Desvincular a empresa; equipe LLZ não pertence a empresas clientes'
    FROM public.profiles p
    JOIN public.company_members cm ON cm.user_id = p.id
    JOIN public.companies c ON c.id = cm.company_id
    WHERE p.account_type = 'llz_staff'

    UNION ALL
    SELECT 'staff_pending_activation', 'info', p.id, p.email, NULL,
           'Conta Equipe LLZ aguardando ativação',
           'Ativar na Central da Equipe LLZ'
    FROM public.profiles p
    WHERE p.account_type = 'llz_staff' AND p.staff_activated_at IS NULL

    UNION ALL
    SELECT 'staff_pending_too_long', 'warning', p.id, p.email, NULL,
           'Conta Equipe LLZ aguardando ativação há mais de 7 dias',
           'Ativar a conta ou reclassificar como Cliente'
    FROM public.profiles p
    WHERE p.account_type = 'llz_staff' AND p.staff_activated_at IS NULL
      AND p.created_at < now() - interval '7 days'

    UNION ALL
    SELECT 'role_without_profile', 'critical', ur.user_id, NULL, NULL,
           'Papel global sem cadastro correspondente',
           'Verificar a conta de origem antes de qualquer ação'
    FROM public.user_roles ur
    WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = ur.user_id)

    UNION ALL
    SELECT 'membership_without_profile', 'warning', cm.user_id, NULL, c.name,
           'Vínculo empresarial sem cadastro correspondente',
           'Revisar o vínculo; nenhuma exclusão automática é feita'
    FROM public.company_members cm
    JOIN public.companies c ON c.id = cm.company_id
    WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = cm.user_id)

    UNION ALL
    SELECT 'company_without_owner', 'warning', NULL, NULL, c.name,
           'Empresa sem proprietário ativo',
           'Definir um proprietário por transferência de propriedade'
    FROM public.companies c
    WHERE NOT EXISTS (SELECT 1 FROM public.company_members cm
                       WHERE cm.company_id = c.id AND cm.role = 'owner' AND cm.is_active)

    UNION ALL
    SELECT 'multiple_owners', 'warning', NULL, NULL, c.name,
           'Empresa com mais de um proprietário ativo',
           'Definir um único proprietário'
    FROM public.company_members cm
    JOIN public.companies c ON c.id = cm.company_id
    WHERE cm.role = 'owner' AND cm.is_active
    GROUP BY c.name HAVING count(*) > 1

    UNION ALL
    SELECT 'duplicate_active_invite', 'warning', NULL, lower(i.email), NULL,
           'Mais de um convite LLZ ativo para o mesmo e-mail',
           'Cancelar os convites excedentes'
    FROM public.platform_staff_invites i
    WHERE i.status IN ('pending','registered','active')
    GROUP BY lower(i.email) HAVING count(*) > 1
  )
  SELECT coalesce(jsonb_agg(to_jsonb(items)), '[]'::jsonb) INTO v_items FROM items;

  RETURN jsonb_build_object('items', v_items);
END $$;

-- ============ Limpeza seletiva: nunca exclui identidade ============
CREATE OR REPLACE FUNCTION public.platform_cleanup_preview(_caller_id uuid, _company_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_ids uuid[] := COALESCE(_company_ids, ARRAY[]::uuid[]);
  v_blockers text[] := ARRAY[]::text[];
  v_warnings text[] := ARRAY[]::text[];
  v_invalid text[];
  v_selected jsonb; v_preserve_companies jsonb; v_memberships jsonb;
  v_orphan_del jsonb; v_orphan_keep jsonb; v_orphan_auth jsonb;
  v_accounts jsonb; v_losing jsonb; v_mixed jsonb; v_orphans jsonb;
  v_counts jsonb; v_platform_users jsonb; v_hist bigint;
BEGIN
  IF _caller_id IS NULL OR NOT public.is_platform_super_admin(_caller_id) THEN
    RAISE EXCEPTION 'Apenas o super admin pode consultar a limpeza de ambiente';
  END IF;

  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'email'), '[]'::jsonb) INTO v_platform_users
  FROM (
    SELECT jsonb_build_object('id', p.id, 'email', p.email, 'full_name', p.full_name,
             'is_super_admin', public.is_platform_super_admin(p.id)) AS x
      FROM public.profiles p
     WHERE p.account_type = 'llz_staff'
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
    INTO v_selected FROM public.companies c WHERE c.id = ANY(v_ids);

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'reason', 'Não selecionada')
         ORDER BY c.name), '[]'::jsonb)
    INTO v_preserve_companies FROM public.companies c WHERE NOT (c.id = ANY(v_ids));

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'user_id', cm.user_id, 'email', p.email, 'full_name', p.full_name,
           'company_id', cm.company_id, 'company', c.name, 'role', cm.role::text
         ) ORDER BY p.email), '[]'::jsonb)
    INTO v_memberships
    FROM public.company_members cm
    JOIN public.companies c ON c.id = cm.company_id
    JOIN public.profiles p ON p.id = cm.user_id
   WHERE cm.company_id = ANY(v_ids);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'membership_id', cm.id, 'company_id', cm.company_id, 'company', c.name,
           'user_id', cm.user_id, 'role', cm.role::text) ORDER BY c.name), '[]'::jsonb)
    INTO v_orphan_del
    FROM public.company_members cm JOIN public.companies c ON c.id = cm.company_id
   WHERE cm.company_id = ANY(v_ids)
     AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = cm.user_id);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'membership_id', cm.id, 'company_id', cm.company_id, 'company', c.name,
           'user_id', cm.user_id, 'role', cm.role::text) ORDER BY c.name), '[]'::jsonb)
    INTO v_orphan_keep
    FROM public.company_members cm JOIN public.companies c ON c.id = cm.company_id
   WHERE NOT (cm.company_id = ANY(v_ids))
     AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = cm.user_id);

  SELECT COALESCE(jsonb_agg(DISTINCT jsonb_build_object('user_id', cm.user_id)), '[]'::jsonb)
    INTO v_orphan_auth FROM public.company_members cm
   WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = cm.user_id);

  WITH touched AS (
    SELECT DISTINCT cm.user_id AS uid FROM public.company_members cm
     WHERE cm.company_id = ANY(v_ids)
       AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = cm.user_id)
  ), cls AS (
    SELECT t.uid, p.email, p.full_name,
           EXISTS (SELECT 1 FROM public.company_members cm2
                    WHERE cm2.user_id = t.uid AND NOT (cm2.company_id = ANY(v_ids))) AS has_kept
      FROM touched t JOIN public.profiles p ON p.id = t.uid
  )
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object('id', uid, 'email', email, 'full_name', full_name,
       'outcome', CASE WHEN has_kept THEN 'Mantém vínculo em empresa preservada'
                       ELSE 'Ficará como Cliente sem empresa' END) ORDER BY email), '[]'::jsonb),
    COALESCE(jsonb_agg(jsonb_build_object('id', uid, 'email', email, 'full_name', full_name)
       ORDER BY email) FILTER (WHERE NOT has_kept), '[]'::jsonb),
    COALESCE(jsonb_agg(jsonb_build_object('id', uid, 'email', email, 'full_name', full_name)
       ORDER BY email) FILTER (WHERE has_kept), '[]'::jsonb)
  INTO v_accounts, v_losing, v_mixed FROM cls;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', p.id, 'email', p.email, 'full_name', p.full_name)
         ORDER BY p.email), '[]'::jsonb)
    INTO v_orphans FROM public.profiles p
   WHERE NOT EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.user_id = p.id)
     AND p.account_type = 'customer';

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

  IF jsonb_array_length(v_memberships) > 0 THEN
    v_warnings := v_warnings || (jsonb_array_length(v_memberships) ||
      ' vínculo(s) empresarial(is) serão removidos. Nenhuma conta será excluída.')::text;
  END IF;
  IF jsonb_array_length(v_losing) > 0 THEN
    v_warnings := v_warnings || (jsonb_array_length(v_losing) ||
      ' pessoa(s) perderão o vínculo com as empresas selecionadas e ficarão como "Cliente · Sem empresa". As contas serão preservadas.')::text;
  END IF;
  IF jsonb_array_length(v_orphan_del) > 0 THEN
    v_warnings := v_warnings || (jsonb_array_length(v_orphan_del) || ' vínculo(s) sem cadastro de usuário serão removidos junto com as empresas selecionadas.')::text;
  END IF;
  IF jsonb_array_length(v_orphan_keep) > 0 THEN
    v_warnings := v_warnings || (jsonb_array_length(v_orphan_keep) || ' vínculo(s) sem cadastro em empresas preservadas permanecerão intactos.')::text;
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

  RETURN jsonb_build_object(
    'selected_companies_to_delete', v_selected,
    'companies_to_preserve', v_preserve_companies,
    'memberships_to_delete', v_memberships,
    'orphan_memberships_to_delete', v_orphan_del,
    'orphan_memberships_preserved', v_orphan_keep,
    'accounts_preserved', v_accounts,
    'accounts_without_company_after', v_losing,
    'users_with_mixed_memberships', v_mixed,
    'orphan_auth_candidates', v_orphan_auth,
    'customer_accounts_without_company', v_orphans,
    'platform_users', v_platform_users,
    'counts_to_delete', v_counts,
    'warnings', to_jsonb(v_warnings),
    'blockers', to_jsonb(v_blockers)
  );
END $$;

CREATE OR REPLACE FUNCTION public.platform_cleanup_execute(_caller_id uuid, _company_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_ids uuid[] := COALESCE(_company_ids, ARRAY[]::uuid[]);
  v_preview jsonb; v_blockers jsonb; v_removed jsonb := '{}'::jsonb; v_n bigint;
  v_lot_ids uuid[]; v_user_ids uuid[]; v_stage text := 'preview';
  v_msg text; v_state text; v_detail text; v_hint text; v_ctx text;
BEGIN
  v_preview := public.platform_cleanup_preview(_caller_id, v_ids);
  v_blockers := v_preview->'blockers';
  IF jsonb_array_length(v_blockers) > 0 THEN
    RAISE EXCEPTION 'Limpeza bloqueada: %', (SELECT string_agg(value::text, ' ') FROM jsonb_array_elements_text(v_blockers) AS value);
  END IF;

  SELECT COALESCE(array_agg(DISTINCT cm.user_id), ARRAY[]::uuid[]) INTO v_user_ids
    FROM public.company_members cm WHERE cm.company_id = ANY(v_ids);

  SELECT COALESCE(array_agg(l.id), ARRAY[]::uuid[]) INTO v_lot_ids
    FROM public.lots l
   WHERE l.company_id = ANY(v_ids)
      OR l.product_id IN (SELECT id FROM public.products WHERE company_id = ANY(v_ids));

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
       OR picking_list_id IN (SELECT id FROM public.picking_lists WHERE company_id = ANY(v_ids))
       OR product_id IN (SELECT id FROM public.products WHERE company_id = ANY(v_ids))
       OR from_address_id IN (SELECT id FROM public.addresses WHERE company_id = ANY(v_ids))
       OR lot_id = ANY(v_lot_ids)
       OR movement_id IN (SELECT id FROM public.movements WHERE company_id = ANY(v_ids) OR lot_id = ANY(v_lot_ids));
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
       OR address_id IN (SELECT id FROM public.addresses WHERE company_id = ANY(v_ids))
       OR lot_id = ANY(v_lot_ids);
    GET DIAGNOSTICS v_n = ROW_COUNT; v_removed := v_removed || jsonb_build_object('stock_balance', v_n);

    v_stage := 'delete_movements';
    DELETE FROM public.movements WHERE company_id = ANY(v_ids)
       OR product_id IN (SELECT id FROM public.products WHERE company_id = ANY(v_ids))
       OR from_address_id IN (SELECT id FROM public.addresses WHERE company_id = ANY(v_ids))
       OR to_address_id IN (SELECT id FROM public.addresses WHERE company_id = ANY(v_ids))
       OR lot_id = ANY(v_lot_ids);
    GET DIAGNOSTICS v_n = ROW_COUNT; v_removed := v_removed || jsonb_build_object('movements', v_n);

    v_stage := 'delete_lots';
    DELETE FROM public.lots WHERE id = ANY(v_lot_ids)
       OR company_id = ANY(v_ids)
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
    UPDATE public.companies SET main_focal_user_id = NULL
     WHERE NOT (id = ANY(v_ids)) AND main_focal_user_id = ANY(v_user_ids);
    UPDATE public.companies SET approved_by = NULL
     WHERE NOT (id = ANY(v_ids)) AND approved_by = ANY(v_user_ids);

    v_stage := 'delete_companies';
    DELETE FROM public.companies WHERE id = ANY(v_ids);
    GET DIAGNOSTICS v_n = ROW_COUNT; v_removed := v_removed || jsonb_build_object('companies', v_n);

    -- IDENTIDADE PRESERVADA: nenhum DELETE em profiles/auth.users nesta rotina.

    v_stage := 'insert_audit_log';
    INSERT INTO public.activity_log (user_id, action, entity_type, details)
    VALUES (_caller_id, 'platform_selective_cleanup', 'platform',
            jsonb_build_object('company_ids', to_jsonb(v_ids), 'removed', v_removed,
                               'accounts_preserved', true, 'warnings', v_preview->'warnings'));
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS
      v_msg = MESSAGE_TEXT, v_state = RETURNED_SQLSTATE,
      v_detail = PG_EXCEPTION_DETAIL, v_hint = PG_EXCEPTION_HINT, v_ctx = PG_EXCEPTION_CONTEXT;
    RAISE EXCEPTION '%', jsonb_build_object(
      'cleanup_error', true, 'stage', v_stage, 'error_code', v_state,
      'message', v_msg, 'detail', v_detail, 'hint', v_hint,
      'context', left(coalesce(v_ctx,''), 500))::text USING ERRCODE = 'P0001';
  END;

  RETURN jsonb_build_object(
    'removed', v_removed,
    'accounts_preserved', v_preview->'accounts_preserved',
    'accounts_without_company_after', v_preview->'accounts_without_company_after',
    'orphan_auth_candidates', v_preview->'orphan_auth_candidates',
    'warnings', v_preview->'warnings'
  );
END $$;

-- ============ Reset completo: preserva identidade ============
CREATE OR REPLACE FUNCTION public.platform_reset_preview(_caller_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_staff jsonb; v_accounts jsonb; v_companies jsonb; v_counts jsonb;
BEGIN
  IF _caller_id IS NULL OR NOT public.is_platform_super_admin(_caller_id) THEN
    RAISE EXCEPTION 'Apenas o super admin pode consultar o reset de ambiente';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', p.id, 'email', p.email, 'full_name', p.full_name,
           'is_super_admin', public.is_platform_super_admin(p.id)) ORDER BY p.email), '[]'::jsonb)
    INTO v_staff FROM public.profiles p WHERE p.account_type = 'llz_staff';

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', p.id, 'email', p.email, 'full_name', p.full_name,
           'companies', COALESCE((SELECT jsonb_agg(c.name) FROM public.company_members cm
              JOIN public.companies c ON c.id = cm.company_id WHERE cm.user_id = p.id), '[]'::jsonb)
         ) ORDER BY p.email), '[]'::jsonb)
    INTO v_accounts FROM public.profiles p WHERE p.account_type = 'customer';

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name,
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
    INTO v_companies FROM public.companies c;

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
    'companies',               (SELECT COUNT(*) FROM public.companies)
  ) INTO v_counts;

  RETURN jsonb_build_object(
    'staff_accounts', v_staff,
    'customer_accounts_preserved', v_accounts,
    'companies_to_delete', v_companies,
    'counts_to_delete', v_counts,
    'users_to_delete', '[]'::jsonb,
    'preserved_tables', jsonb_build_array('profiles (todas as contas)','user_roles','system_changelog','estrutura/migrations')
  );
END $$;

CREATE OR REPLACE FUNCTION public.platform_reset_execute(_caller_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_report jsonb := '{}'::jsonb; v_n bigint;
BEGIN
  IF _caller_id IS NULL OR NOT public.is_platform_super_admin(_caller_id) THEN
    RAISE EXCEPTION 'Apenas o super admin pode executar o reset de ambiente';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role::text IN ('super_admin','admin')) THEN
    RAISE EXCEPTION 'Nenhum super admin válido — reset abortado';
  END IF;

  PERFORM set_config('app.cleanup_mode', 'on', true);

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
  UPDATE public.companies SET main_focal_user_id = NULL, approved_by = NULL;
  DELETE FROM public.companies; GET DIAGNOSTICS v_n = ROW_COUNT;
  v_report := v_report || jsonb_build_object('companies', v_n);

  -- IDENTIDADE PRESERVADA: profiles e contas de acesso nunca são excluídos aqui.
  v_report := v_report || jsonb_build_object('profiles', 0);

  INSERT INTO public.activity_log (user_id, action, entity_type, entity_id, details, company_id)
  VALUES (_caller_id, 'platform_environment_reset', 'platform', 'reset', v_report, NULL);

  RETURN v_report;
END $$;