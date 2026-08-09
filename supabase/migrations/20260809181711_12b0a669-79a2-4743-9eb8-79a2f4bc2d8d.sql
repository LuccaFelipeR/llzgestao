-- 6.17C: gestão completa da Equipe LLZ

CREATE OR REPLACE FUNCTION public.staff_add_existing_account(_user_id uuid, _role text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_profile public.profiles%ROWTYPE; v_companies text[];
BEGIN
  IF NOT public.is_platform_super_admin(auth.uid()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Apenas o super administrador pode gerenciar a Equipe LLZ.');
  END IF;
  IF _role NOT IN ('platform_admin','support_agent','developer') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Papel global inválido para esta operação.');
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = _user_id;
  IF v_profile.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Conta não encontrada.');
  END IF;

  SELECT array_agg(c.name ORDER BY c.name) INTO v_companies
  FROM public.company_members cm JOIN public.companies c ON c.id = cm.company_id
  WHERE cm.user_id = _user_id;

  IF v_companies IS NOT NULL AND array_length(v_companies, 1) > 0 THEN
    INSERT INTO public.activity_log (user_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), 'staff_add_blocked_by_membership', 'profile', _user_id::text,
            jsonb_build_object('companies', v_companies));
    RETURN jsonb_build_object(
      'ok', false,
      'companies', to_jsonb(v_companies),
      'error', 'Esta conta ainda possui vínculo com empresa cliente. Remova ou regularize os vínculos antes de transformá-la em membro da Equipe LLZ.');
  END IF;

  UPDATE public.profiles SET account_type = 'llz_staff', is_approved = true WHERE id = _user_id;
  INSERT INTO public.user_roles (user_id, role) VALUES (_user_id, _role::public.app_role)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.activity_log (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'staff_account_added', 'profile', _user_id::text,
          jsonb_build_object('role', _role, 'email', v_profile.email));

  RETURN jsonb_build_object('ok', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.staff_role_apply(_user_id uuid, _role text, _mode text DEFAULT 'replace')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_profile public.profiles%ROWTYPE;
BEGIN
  IF NOT public.is_platform_super_admin(auth.uid()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Apenas o super administrador pode gerenciar papéis globais.');
  END IF;
  IF _role NOT IN ('platform_admin','support_agent','developer') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Papel global inválido para esta operação.');
  END IF;
  IF _mode NOT IN ('replace','add') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Modo inválido.');
  END IF;
  IF _user_id = auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Não é possível alterar o próprio acesso por esta tela.');
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = _user_id;
  IF v_profile.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Conta não encontrada.');
  END IF;
  IF public.is_platform_super_admin(_user_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Contas de super administrador exigem fluxo administrativo específico.');
  END IF;

  UPDATE public.profiles SET account_type = 'llz_staff', is_approved = true WHERE id = _user_id;

  IF _mode = 'replace' THEN
    DELETE FROM public.user_roles
    WHERE user_id = _user_id
      AND role::text IN ('platform_admin','support_agent','developer')
      AND role::text <> _role;
  END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (_user_id, _role::public.app_role)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.activity_log (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'staff_role_changed', 'profile', _user_id::text,
          jsonb_build_object('role', _role, 'mode', _mode, 'email', v_profile.email));

  RETURN jsonb_build_object('ok', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.staff_role_remove(_user_id uuid, _role text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_platform_super_admin(auth.uid()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Apenas o super administrador pode gerenciar papéis globais.');
  END IF;
  IF _role NOT IN ('platform_admin','support_agent','developer') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Este papel não pode ser removido por esta tela.');
  END IF;
  IF _user_id = auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Não é possível alterar o próprio acesso por esta tela.');
  END IF;

  DELETE FROM public.user_roles WHERE user_id = _user_id AND role::text = _role;

  INSERT INTO public.activity_log (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'staff_role_removed', 'profile', _user_id::text,
          jsonb_build_object('role', _role));

  RETURN jsonb_build_object('ok', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.staff_add_existing_account(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.staff_role_apply(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.staff_role_remove(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_add_existing_account(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_role_apply(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_role_remove(uuid, text) TO authenticated;

-- diagnóstico atualizado
CREATE OR REPLACE FUNCTION public.platform_access_diagnostics()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_items jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.is_platform_staff(auth.uid()) THEN
    RETURN jsonb_build_object('items', '[]'::jsonb, 'error', 'sem permissão');
  END IF;

  WITH valid_global AS (
    SELECT DISTINCT user_id FROM public.user_roles
    WHERE role::text IN ('super_admin','admin','platform_admin','support_agent','developer')
  ),
  items AS (
    SELECT 'customer_with_global_role' AS code, 'critical' AS severity, p.id AS user_id, p.email,
           NULL::text AS company,
           'Conta marcada como Cliente possui papel global da plataforma' AS situation,
           'Revisar: remover o papel global ou reclassificar a conta como Equipe LLZ' AS recommendation
    FROM public.profiles p JOIN valid_global g ON g.user_id = p.id
    WHERE p.account_type = 'customer'

    UNION ALL
    SELECT 'staff_with_membership', 'warning', p.id, p.email, c.name,
           'Membro da Equipe LLZ possui vínculo empresarial',
           'Avaliar se o vínculo é legítimo; equipe LLZ normalmente não pertence a empresas'
    FROM public.profiles p
    JOIN public.company_members cm ON cm.user_id = p.id
    JOIN public.companies c ON c.id = cm.company_id
    WHERE p.account_type = 'llz_staff'

    UNION ALL
    SELECT 'account_type_undefined', 'warning', p.id, p.email, NULL,
           'Conta sem tipo definido',
           'Classificar manualmente como Cliente ou Equipe LLZ'
    FROM public.profiles p
    WHERE p.account_type IS NULL OR p.account_type NOT IN ('customer','llz_staff')

    UNION ALL
    SELECT 'active_invite_without_role', 'critical', i.registered_user_id, i.email, NULL,
           'Convite LLZ ativo sem papel global correspondente',
           'Reativar o papel global previsto ou revisar o convite'
    FROM public.platform_staff_invites i
    WHERE i.status = 'active' AND i.registered_user_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM valid_global g WHERE g.user_id = i.registered_user_id)

    UNION ALL
    SELECT 'company_role_in_user_roles', 'critical', ur.user_id, p.email, NULL,
           'Papel empresarial gravado incorretamente como papel global (' || ur.role::text || ')',
           'Remover o registro em papéis globais; cargos de empresa vivem em company_members. Nenhuma correção automática é feita.'
    FROM public.user_roles ur
    LEFT JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.role::text IN ('supervisor','operator','member','owner')

    UNION ALL
    SELECT 'duplicate_active_invite', 'warning', NULL, lower(i.email), NULL,
           'Mais de um convite LLZ ativo para o mesmo e-mail',
           'Cancelar os convites excedentes'
    FROM public.platform_staff_invites i
    WHERE i.status IN ('pending','registered','active')
    GROUP BY lower(i.email) HAVING count(*) > 1

    UNION ALL
    SELECT 'invite_for_customer_email', 'warning', p.id, p.email, NULL,
           'Convite LLZ para e-mail já pertencente a um cliente',
           'Confirmar se a pessoa deve mesmo migrar para a Equipe LLZ'
    FROM public.platform_staff_invites i
    JOIN public.profiles p ON lower(p.email) = lower(i.email)
    WHERE i.status IN ('pending','registered') AND p.account_type = 'customer'

    UNION ALL
    SELECT 'role_without_profile', 'critical', ur.user_id, NULL, NULL,
           'Papel global sem perfil correspondente',
           'Verificar a conta de origem antes de qualquer ação'
    FROM public.user_roles ur
    WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = ur.user_id)

    UNION ALL
    SELECT 'staff_without_role', 'info', p.id, p.email, NULL,
           'Conta Equipe LLZ aguardando ativação (sem papel global)',
           'Definir o papel global na aba Equipe LLZ'
    FROM public.profiles p
    WHERE p.account_type = 'llz_staff'
      AND NOT EXISTS (SELECT 1 FROM valid_global g WHERE g.user_id = p.id)

    UNION ALL
    SELECT 'staff_pending_too_long', 'warning', p.id, p.email, NULL,
           'Conta Equipe LLZ aguardando ativação há mais de 7 dias',
           'Ativar o papel global ou reclassificar a conta'
    FROM public.profiles p
    WHERE p.account_type = 'llz_staff'
      AND p.created_at < now() - interval '7 days'
      AND NOT EXISTS (SELECT 1 FROM valid_global g WHERE g.user_id = p.id)

    UNION ALL
    SELECT 'membership_without_profile', 'warning', cm.user_id, NULL, c.name,
           'Vínculo empresarial sem perfil correspondente',
           'Revisar o vínculo; nenhuma exclusão automática é feita'
    FROM public.company_members cm
    JOIN public.companies c ON c.id = cm.company_id
    WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = cm.user_id)

    UNION ALL
    SELECT 'multiple_owners', 'warning', NULL, NULL, c.name,
           'Empresa com mais de um proprietário ativo',
           'Definir um único proprietário na aba Usuários das Empresas'
    FROM public.company_members cm
    JOIN public.companies c ON c.id = cm.company_id
    WHERE cm.role = 'owner' AND cm.is_active
    GROUP BY c.name HAVING count(*) > 1
  )
  SELECT coalesce(jsonb_agg(to_jsonb(items)), '[]'::jsonb) INTO v_items FROM items;

  RETURN jsonb_build_object('items', v_items);
END;
$function$;