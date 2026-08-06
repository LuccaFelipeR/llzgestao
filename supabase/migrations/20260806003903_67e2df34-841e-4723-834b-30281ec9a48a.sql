
-- =========================================================
-- 6.17A — Central de Gestão de Usuários Multiempresa (RPCs)
-- =========================================================

CREATE OR REPLACE FUNCTION public.can_manage_company_members(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.is_platform_client_admin(_user_id)
      OR public.is_company_admin_of(_user_id, _company_id)
$$;

REVOKE ALL ON FUNCTION public.can_manage_company_members(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_company_members(uuid, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------
-- Alterar cargo empresarial (nunca toca user_roles)
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.company_member_set_role(
  _company_id uuid,
  _member_id uuid,
  _role text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _caller uuid := auth.uid();
  _m public.company_members%ROWTYPE;
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

  SELECT * INTO _m FROM public.company_members
   WHERE id = _member_id AND company_id = _company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Membro não encontrado nesta empresa.' USING ERRCODE = 'P0002';
  END IF;
  IF _m.role = 'owner' THEN
    RAISE EXCEPTION 'O proprietário só muda de cargo pela transferência de propriedade.' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.company_members SET role = _role WHERE id = _member_id;

  INSERT INTO public.activity_log (user_id, company_id, action, entity_type, entity_id, previous_data, new_data)
  VALUES (_caller, _company_id, 'company_member_role_changed', 'company_member', _member_id::text,
          jsonb_build_object('role', _m.role), jsonb_build_object('role', _role));

  RETURN jsonb_build_object('ok', true, 'member_id', _member_id, 'role', _role);
END $$;

REVOKE ALL ON FUNCTION public.company_member_set_role(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.company_member_set_role(uuid, uuid, text) TO authenticated, service_role;

-- ---------------------------------------------------------
-- Transferência de propriedade
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.company_transfer_ownership(
  _company_id uuid,
  _new_owner_member_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _caller uuid := auth.uid();
  _current public.company_members%ROWTYPE;
  _new public.company_members%ROWTYPE;
  _allowed boolean;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO _new FROM public.company_members
   WHERE id = _new_owner_member_id AND company_id = _company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Novo proprietário não é membro desta empresa.' USING ERRCODE = 'P0002';
  END IF;
  IF _new.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'O novo proprietário precisa estar ativo na empresa.' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO _current FROM public.company_members
   WHERE company_id = _company_id AND role = 'owner'
   ORDER BY created_at LIMIT 1;

  _allowed := public.is_platform_client_admin(_caller)
              OR (_current.user_id IS NOT NULL AND _current.user_id = _caller);
  IF NOT _allowed THEN
    RAISE EXCEPTION 'Somente o proprietário atual ou a equipe LLZ autorizada pode transferir a propriedade.' USING ERRCODE = '42501';
  END IF;

  IF _current.id IS NOT NULL AND _current.id = _new_owner_member_id THEN
    RETURN jsonb_build_object('ok', true, 'unchanged', true);
  END IF;

  -- rebaixa todos os owners atuais e promove apenas o escolhido
  UPDATE public.company_members SET role = 'admin'
   WHERE company_id = _company_id AND role = 'owner' AND id <> _new_owner_member_id;

  UPDATE public.company_members
     SET role = 'owner', is_active = true, blocked_at = NULL
   WHERE id = _new_owner_member_id;

  INSERT INTO public.activity_log (user_id, company_id, action, entity_type, entity_id, previous_data, new_data)
  VALUES (_caller, _company_id, 'company_ownership_transferred', 'company', _company_id::text,
          jsonb_build_object('owner_user_id', _current.user_id),
          jsonb_build_object('owner_user_id', _new.user_id));

  RETURN jsonb_build_object('ok', true, 'previous_owner', _current.user_id, 'new_owner', _new.user_id);
END $$;

REVOKE ALL ON FUNCTION public.company_transfer_ownership(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.company_transfer_ownership(uuid, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------
-- Ponto focal (não altera cargo)
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.company_member_set_focal(
  _company_id uuid,
  _member_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _caller uuid := auth.uid();
  _m public.company_members%ROWTYPE;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = '28000';
  END IF;
  IF NOT public.can_manage_company_members(_caller, _company_id) THEN
    RAISE EXCEPTION 'Você não tem permissão para administrar usuários desta empresa.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _m FROM public.company_members
   WHERE id = _member_id AND company_id = _company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Membro não encontrado nesta empresa.' USING ERRCODE = 'P0002';
  END IF;
  IF _m.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'O ponto focal precisa estar ativo na empresa.' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.company_members SET is_main_focal_point = false
   WHERE company_id = _company_id AND id <> _member_id AND is_main_focal_point = true;

  UPDATE public.company_members SET is_main_focal_point = true WHERE id = _member_id;

  UPDATE public.companies
     SET main_focal_user_id = _m.user_id, updated_at = now()
   WHERE id = _company_id;

  INSERT INTO public.activity_log (user_id, company_id, action, entity_type, entity_id, new_data)
  VALUES (_caller, _company_id, 'company_focal_point_changed', 'company_member', _member_id::text,
          jsonb_build_object('user_id', _m.user_id));

  RETURN jsonb_build_object('ok', true, 'user_id', _m.user_id);
END $$;

REVOKE ALL ON FUNCTION public.company_member_set_focal(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.company_member_set_focal(uuid, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------
-- Bloqueio / reativação por empresa
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.company_member_set_active(
  _company_id uuid,
  _member_id uuid,
  _active boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _caller uuid := auth.uid();
  _m public.company_members%ROWTYPE;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = '28000';
  END IF;
  IF NOT public.can_manage_company_members(_caller, _company_id) THEN
    RAISE EXCEPTION 'Você não tem permissão para administrar usuários desta empresa.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _m FROM public.company_members
   WHERE id = _member_id AND company_id = _company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Membro não encontrado nesta empresa.' USING ERRCODE = 'P0002';
  END IF;
  IF _m.role = 'owner' AND _active = false THEN
    RAISE EXCEPTION 'O proprietário não pode ser bloqueado. Transfira a propriedade antes.' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.company_members
     SET is_active = _active,
         blocked_at = CASE WHEN _active THEN NULL ELSE now() END
   WHERE id = _member_id;

  INSERT INTO public.activity_log (user_id, company_id, action, entity_type, entity_id, new_data)
  VALUES (_caller, _company_id,
          CASE WHEN _active THEN 'company_member_reactivated' ELSE 'company_member_blocked' END,
          'company_member', _member_id::text,
          jsonb_build_object('user_id', _m.user_id, 'is_active', _active));

  RETURN jsonb_build_object('ok', true, 'is_active', _active);
END $$;

REVOKE ALL ON FUNCTION public.company_member_set_active(uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.company_member_set_active(uuid, uuid, boolean) TO authenticated, service_role;

-- ---------------------------------------------------------
-- Inclusão de usuário existente por e-mail
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.company_member_add_by_email(
  _company_id uuid,
  _email text,
  _role text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _caller uuid := auth.uid();
  _clean text := lower(btrim(coalesce(_email, '')));
  _profile public.profiles%ROWTYPE;
  _company public.companies%ROWTYPE;
  _count int;
  _new_id uuid;
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
  IF _clean = '' THEN
    RAISE EXCEPTION 'Informe o e-mail do usuário.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _company FROM public.companies WHERE id = _company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Empresa não encontrada.' USING ERRCODE = 'P0002';
  END IF;
  IF _company.status NOT IN ('active','trial') THEN
    RAISE EXCEPTION 'A empresa precisa estar ativa ou em trial para receber novos usuários.' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO _profile FROM public.profiles WHERE lower(email) = _clean;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nenhum usuário cadastrado com este e-mail. Use o fluxo de convite/cadastro.' USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (SELECT 1 FROM public.company_members WHERE company_id = _company_id AND user_id = _profile.id) THEN
    RAISE EXCEPTION 'Usuário já vinculado a esta empresa.' USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*) INTO _count FROM public.company_members
   WHERE company_id = _company_id AND is_active = true;
  IF _company.max_users IS NOT NULL AND _count >= _company.max_users THEN
    RAISE EXCEPTION 'Limite de usuários da empresa atingido (%).', _company.max_users USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.company_members (company_id, user_id, role, is_active, approved_at)
  VALUES (_company_id, _profile.id, _role, true, now())
  RETURNING id INTO _new_id;

  INSERT INTO public.activity_log (user_id, company_id, action, entity_type, entity_id, new_data)
  VALUES (_caller, _company_id, 'company_member_added', 'company_member', _new_id::text,
          jsonb_build_object('user_id', _profile.id, 'email', _profile.email, 'role', _role));

  RETURN jsonb_build_object('ok', true, 'member_id', _new_id, 'user_id', _profile.id);
END $$;

REVOKE ALL ON FUNCTION public.company_member_add_by_email(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.company_member_add_by_email(uuid, text, text) TO authenticated, service_role;

-- ---------------------------------------------------------
-- Diagnóstico de acessos (somente leitura, equipe LLZ)
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.platform_access_diagnostics()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _caller uuid := auth.uid();
  _items jsonb := '[]'::jsonb;
BEGIN
  IF _caller IS NULL OR NOT public.is_platform_staff(_caller) THEN
    RAISE EXCEPTION 'Acesso restrito à equipe LLZ.' USING ERRCODE = '42501';
  END IF;

  -- papéis globais indevidos
  SELECT _items || coalesce(jsonb_agg(jsonb_build_object(
      'code','invalid_global_role','severity','critical',
      'user_id', ur.user_id, 'email', p.email, 'company', NULL,
      'situation', 'Papel global indevido: ' || ur.role::text,
      'recommendation', 'Remover o papel global; cargos de empresa vivem em company_members.'
    )), '[]'::jsonb)
    INTO _items
  FROM public.user_roles ur
  LEFT JOIN public.profiles p ON p.id = ur.user_id
  WHERE ur.role::text NOT IN ('super_admin','admin','platform_admin','support_agent','developer');

  -- empresas sem owner
  SELECT _items || coalesce(jsonb_agg(jsonb_build_object(
      'code','company_without_owner','severity','critical',
      'user_id', NULL, 'email', NULL, 'company', c.name,
      'situation','Empresa sem proprietário ativo',
      'recommendation','Definir um proprietário pela transferência de propriedade.'
    )), '[]'::jsonb)
    INTO _items
  FROM public.companies c
  WHERE NOT EXISTS (
    SELECT 1 FROM public.company_members m
     WHERE m.company_id = c.id AND m.role = 'owner' AND m.is_active = true
  );

  -- empresas com mais de um owner
  SELECT _items || coalesce(jsonb_agg(jsonb_build_object(
      'code','company_multiple_owners','severity','critical',
      'user_id', NULL, 'email', NULL, 'company', c.name,
      'situation','Mais de um proprietário ativo',
      'recommendation','Manter apenas um proprietário; os demais devem virar Administrador.'
    )), '[]'::jsonb)
    INTO _items
  FROM public.companies c
  WHERE (SELECT count(*) FROM public.company_members m
          WHERE m.company_id = c.id AND m.role = 'owner' AND m.is_active = true) > 1;

  -- owner bloqueado
  SELECT _items || coalesce(jsonb_agg(jsonb_build_object(
      'code','owner_blocked','severity','critical',
      'user_id', m.user_id, 'email', p.email, 'company', c.name,
      'situation','Proprietário bloqueado na empresa',
      'recommendation','Reativar o proprietário ou transferir a propriedade.'
    )), '[]'::jsonb)
    INTO _items
  FROM public.company_members m
  JOIN public.companies c ON c.id = m.company_id
  LEFT JOIN public.profiles p ON p.id = m.user_id
  WHERE m.role = 'owner' AND m.is_active = false;

  -- empresa sem ponto focal
  SELECT _items || coalesce(jsonb_agg(jsonb_build_object(
      'code','company_without_focal','severity','warning',
      'user_id', NULL, 'email', NULL, 'company', c.name,
      'situation','Empresa sem ponto focal definido',
      'recommendation','Definir um ponto focal na central de usuários.'
    )), '[]'::jsonb)
    INTO _items
  FROM public.companies c
  WHERE c.main_focal_user_id IS NULL;

  -- membership sem profile
  SELECT _items || coalesce(jsonb_agg(jsonb_build_object(
      'code','membership_without_profile','severity','warning',
      'user_id', m.user_id, 'email', NULL, 'company', c.name,
      'situation','Vínculo sem perfil correspondente',
      'recommendation','Verificar a conta de origem antes de qualquer remoção.'
    )), '[]'::jsonb)
    INTO _items
  FROM public.company_members m
  JOIN public.companies c ON c.id = m.company_id
  WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = m.user_id);

  -- profile sem vínculo e sem papel global
  SELECT _items || coalesce(jsonb_agg(jsonb_build_object(
      'code','profile_without_membership','severity','info',
      'user_id', p.id, 'email', p.email, 'company', NULL,
      'situation','Usuário sem empresa e sem papel global',
      'recommendation','Vincular a uma empresa ou acompanhar o cadastro pendente.'
    )), '[]'::jsonb)
    INTO _items
  FROM public.profiles p
  WHERE NOT EXISTS (SELECT 1 FROM public.company_members m WHERE m.user_id = p.id)
    AND NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = p.id);

  -- usuário em várias empresas
  SELECT _items || coalesce(jsonb_agg(jsonb_build_object(
      'code','multi_company_user','severity','info',
      'user_id', t.user_id, 'email', t.email, 'company', NULL,
      'situation','Usuário vinculado a ' || t.n || ' empresas',
      'recommendation','Conferir cargos empresa a empresa.'
    )), '[]'::jsonb)
    INTO _items
  FROM (
    SELECT m.user_id, p.email, count(*) AS n
      FROM public.company_members m
      LEFT JOIN public.profiles p ON p.id = m.user_id
     GROUP BY m.user_id, p.email HAVING count(*) > 1
  ) t;

  -- usuário global também vinculado a empresa
  SELECT _items || coalesce(jsonb_agg(DISTINCT jsonb_build_object(
      'code','global_user_with_membership','severity','warning',
      'user_id', m.user_id, 'email', p.email, 'company', c.name,
      'situation','Usuário da equipe LLZ vinculado a empresa cliente',
      'recommendation','Confirmar se o vínculo é intencional.'
    )), '[]'::jsonb)
    INTO _items
  FROM public.company_members m
  JOIN public.companies c ON c.id = m.company_id
  JOIN public.user_roles r ON r.user_id = m.user_id
  LEFT JOIN public.profiles p ON p.id = m.user_id;

  -- empresa acima do limite
  SELECT _items || coalesce(jsonb_agg(jsonb_build_object(
      'code','company_over_user_limit','severity','warning',
      'user_id', NULL, 'email', NULL, 'company', c.name,
      'situation','Usuários ativos acima do limite do plano',
      'recommendation','Revisar o limite max_users ou bloquear acessos excedentes.'
    )), '[]'::jsonb)
    INTO _items
  FROM public.companies c
  WHERE c.max_users IS NOT NULL
    AND (SELECT count(*) FROM public.company_members m
          WHERE m.company_id = c.id AND m.is_active = true) > c.max_users;

  RETURN jsonb_build_object('generated_at', now(), 'items', _items);
END $$;

REVOKE ALL ON FUNCTION public.platform_access_diagnostics() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_access_diagnostics() TO authenticated, service_role;
