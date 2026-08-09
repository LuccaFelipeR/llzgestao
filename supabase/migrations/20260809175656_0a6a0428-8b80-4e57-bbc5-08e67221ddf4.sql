-- 1. account_type em profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_type text NOT NULL DEFAULT 'customer';

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_account_type_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_account_type_check CHECK (account_type IN ('customer','llz_staff'));

-- Backfill inequívoco
UPDATE public.profiles p
SET account_type = 'llz_staff'
WHERE EXISTS (
  SELECT 1 FROM public.user_roles ur
  WHERE ur.user_id = p.id
    AND ur.role::text IN ('super_admin','admin','platform_admin','support_agent','developer')
);

UPDATE public.profiles p
SET account_type = 'customer'
WHERE EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.user_id = p.id)
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p.id
      AND ur.role::text IN ('super_admin','admin','platform_admin','support_agent','developer')
  );

-- Proteção: usuário não altera o próprio tipo de conta
CREATE OR REPLACE FUNCTION public.protect_account_type()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.account_type IS DISTINCT FROM OLD.account_type THEN
    IF auth.uid() IS NOT NULL AND NOT public.is_platform_super_admin(auth.uid()) THEN
      RAISE EXCEPTION 'Tipo de conta só pode ser alterado por administração da plataforma';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_account_type ON public.profiles;
CREATE TRIGGER trg_protect_account_type
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_account_type();

-- 2. Convites da equipe LLZ
CREATE TABLE IF NOT EXISTS public.platform_staff_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  full_name text,
  intended_role app_role NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  token_hash text,
  invited_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  registered_user_id uuid,
  registered_at timestamptz,
  approved_at timestamptz,
  revoked_at timestamptz,
  CONSTRAINT platform_staff_invites_status_check
    CHECK (status IN ('pending','registered','active','expired','revoked')),
  CONSTRAINT platform_staff_invites_role_check
    CHECK (intended_role::text IN ('platform_admin','support_agent','developer'))
);

GRANT SELECT, INSERT, UPDATE ON public.platform_staff_invites TO authenticated;
GRANT ALL ON public.platform_staff_invites TO service_role;

ALTER TABLE public.platform_staff_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admin manages staff invites" ON public.platform_staff_invites;
CREATE POLICY "Super admin manages staff invites"
ON public.platform_staff_invites FOR ALL TO authenticated
USING (public.is_platform_super_admin(auth.uid()))
WITH CHECK (public.is_platform_super_admin(auth.uid()));

CREATE UNIQUE INDEX IF NOT EXISTS platform_staff_invites_active_email_idx
ON public.platform_staff_invites (lower(email))
WHERE status IN ('pending','registered','active');

CREATE INDEX IF NOT EXISTS platform_staff_invites_status_idx
ON public.platform_staff_invites (status);

DROP TRIGGER IF EXISTS trg_staff_invites_updated_at ON public.platform_staff_invites;
CREATE TRIGGER trg_staff_invites_updated_at
BEFORE UPDATE ON public.platform_staff_invites
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. handle_new_user reconhece convite LLZ
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  found_company_id UUID;
  found_approval text;
  new_company_id UUID;
  v_invite public.platform_staff_invites%ROWTYPE;
BEGIN
  SELECT * INTO v_invite
  FROM public.platform_staff_invites
  WHERE lower(email) = lower(NEW.email)
    AND status = 'pending'
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;

  INSERT INTO public.profiles (id, email, full_name, is_approved, account_type)
  VALUES (
    NEW.id, NEW.email,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name',''), v_invite.full_name, ''),
    CASE WHEN NEW.email = 'luccafelipe99@gmail.com' THEN true ELSE false END,
    CASE WHEN v_invite.id IS NOT NULL THEN 'llz_staff' ELSE 'customer' END
  )
  ON CONFLICT (id) DO NOTHING;

  IF v_invite.id IS NOT NULL THEN
    UPDATE public.platform_staff_invites
    SET status = 'registered', registered_user_id = NEW.id, registered_at = now()
    WHERE id = v_invite.id;

    INSERT INTO public.activity_log (user_id, action, entity_type, entity_id, details)
    VALUES (NEW.id, 'staff_invite_registered', 'platform_staff_invite', v_invite.id::text,
            jsonb_build_object('email', NEW.email, 'intended_role', v_invite.intended_role));
    RETURN NEW;
  END IF;

  IF NEW.email = 'luccafelipe99@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
    ON CONFLICT DO NOTHING;
    UPDATE public.profiles SET account_type = 'llz_staff' WHERE id = NEW.id;
  END IF;

  IF public.is_platform_staff(NEW.id) THEN
    UPDATE public.profiles SET account_type = 'llz_staff' WHERE id = NEW.id;
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM public.company_members WHERE user_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  IF NEW.raw_user_meta_data->>'invite_code' IS NOT NULL AND NEW.raw_user_meta_data->>'invite_code' != '' THEN
    SELECT id, approval_status INTO found_company_id, found_approval FROM public.companies
      WHERE invite_code = NEW.raw_user_meta_data->>'invite_code' LIMIT 1;
    IF found_company_id IS NOT NULL THEN
      INSERT INTO public.company_members (company_id, user_id, role, is_active, approved_at)
      VALUES (found_company_id, NEW.id, 'member', true, now());
      IF found_approval = 'approved' THEN
        UPDATE public.profiles SET is_approved = true WHERE id = NEW.id;
      END IF;
      RETURN NEW;
    END IF;
  END IF;

  INSERT INTO public.companies (name, approval_status)
  VALUES (COALESCE(NULLIF(btrim(NEW.raw_user_meta_data->>'company_name'), ''), 'Minha Empresa'), 'pending')
  RETURNING id INTO new_company_id;

  INSERT INTO public.company_members (
    company_id, user_id, role, is_active, approved_at, is_main_focal_point
  ) VALUES (
    new_company_id, NEW.id, 'owner', true, now(), true
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'handle_new_user error for %: % %', NEW.email, SQLERRM, SQLSTATE;
  RETURN NEW;
END;
$$;

-- 4. RPCs de convite
CREATE OR REPLACE FUNCTION public.staff_invite_create(_email text, _full_name text, _role text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid; v_email text := lower(btrim(_email));
BEGIN
  IF NOT public.is_platform_super_admin(auth.uid()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Apenas o super administrador pode criar convites.');
  END IF;
  IF v_email IS NULL OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'E-mail inválido.');
  END IF;
  IF _role NOT IN ('platform_admin','support_agent','developer') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Papel inválido para convite.');
  END IF;
  IF EXISTS (SELECT 1 FROM public.platform_staff_invites
             WHERE lower(email) = v_email AND status IN ('pending','registered','active')) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Já existe convite ativo para este e-mail.');
  END IF;

  INSERT INTO public.platform_staff_invites (email, full_name, intended_role, invited_by, token_hash)
  VALUES (v_email, NULLIF(btrim(coalesce(_full_name,'')),''), _role::app_role, auth.uid(),
          encode(digest(gen_random_uuid()::text, 'sha256'), 'hex'))
  RETURNING id INTO v_id;

  INSERT INTO public.activity_log (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'staff_invite_created', 'platform_staff_invite', v_id::text,
          jsonb_build_object('email', v_email, 'intended_role', _role));

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_invite_revoke(_invite_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_super_admin(auth.uid()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Apenas o super administrador pode cancelar convites.');
  END IF;
  UPDATE public.platform_staff_invites
  SET status = 'revoked', revoked_at = now()
  WHERE id = _invite_id AND status IN ('pending','registered');
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Convite não encontrado ou já finalizado.');
  END IF;
  INSERT INTO public.activity_log (user_id, action, entity_type, entity_id)
  VALUES (auth.uid(), 'staff_invite_revoked', 'platform_staff_invite', _invite_id::text);
  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_invite_activate(_invite_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v public.platform_staff_invites%ROWTYPE;
BEGIN
  IF NOT public.is_platform_super_admin(auth.uid()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Apenas o super administrador pode ativar membros.');
  END IF;
  SELECT * INTO v FROM public.platform_staff_invites WHERE id = _invite_id;
  IF v.id IS NULL OR v.status <> 'registered' OR v.registered_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Convite ainda não possui cadastro concluído.');
  END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (v.registered_user_id, v.intended_role)
  ON CONFLICT DO NOTHING;

  UPDATE public.profiles
  SET account_type = 'llz_staff', is_approved = true
  WHERE id = v.registered_user_id;

  UPDATE public.platform_staff_invites
  SET status = 'active', approved_at = now()
  WHERE id = _invite_id;

  INSERT INTO public.activity_log (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'staff_invite_activated', 'platform_staff_invite', _invite_id::text,
          jsonb_build_object('user_id', v.registered_user_id, 'role', v.intended_role));

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- 5. Aprovação/bloqueio global de conta
CREATE OR REPLACE FUNCTION public.account_set_approval(_user_id uuid, _approved boolean, _reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_client_admin(auth.uid()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sem permissão para alterar contas.');
  END IF;
  UPDATE public.profiles
  SET is_approved = _approved,
      rejection_reason = CASE WHEN _approved THEN NULL ELSE NULLIF(btrim(coalesce(_reason,'')),'') END
  WHERE id = _user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Conta não encontrada.');
  END IF;
  INSERT INTO public.activity_log (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), CASE WHEN _approved THEN 'account_approved' ELSE 'account_blocked' END,
          'profile', _user_id::text, jsonb_build_object('reason', _reason));
  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.account_set_type(_user_id uuid, _account_type text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_super_admin(auth.uid()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Apenas o super administrador pode alterar o tipo de conta.');
  END IF;
  IF _account_type NOT IN ('customer','llz_staff') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Tipo de conta inválido.');
  END IF;
  UPDATE public.profiles SET account_type = _account_type WHERE id = _user_id;
  INSERT INTO public.activity_log (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'account_type_changed', 'profile', _user_id::text,
          jsonb_build_object('account_type', _account_type));
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.staff_invite_create(text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.staff_invite_revoke(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.staff_invite_activate(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.account_set_approval(uuid, boolean, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.account_set_type(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.protect_account_type() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_invite_create(text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.staff_invite_revoke(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.staff_invite_activate(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.account_set_approval(uuid, boolean, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.account_set_type(uuid, text) TO authenticated, service_role;

-- 6. Diagnóstico de acessos atualizado
CREATE OR REPLACE FUNCTION public.platform_access_diagnostics()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
    -- customer com papel global válido
    SELECT 'customer_with_global_role' AS code, 'critical' AS severity, p.id AS user_id, p.email,
           NULL::text AS company,
           'Conta marcada como Cliente possui papel global da plataforma' AS situation,
           'Revisar: remover o papel global ou reclassificar a conta como Equipe LLZ' AS recommendation
    FROM public.profiles p JOIN valid_global g ON g.user_id = p.id
    WHERE p.account_type = 'customer'

    UNION ALL
    -- llz_staff com company_members
    SELECT 'staff_with_membership', 'warning', p.id, p.email, c.name,
           'Membro da Equipe LLZ possui vínculo empresarial',
           'Avaliar se o vínculo é legítimo; equipe LLZ normalmente não pertence a empresas'
    FROM public.profiles p
    JOIN public.company_members cm ON cm.user_id = p.id
    JOIN public.companies c ON c.id = cm.company_id
    WHERE p.account_type = 'llz_staff'

    UNION ALL
    -- account_type indefinido
    SELECT 'account_type_undefined', 'warning', p.id, p.email, NULL,
           'Conta sem tipo definido',
           'Classificar manualmente como Cliente ou Equipe LLZ'
    FROM public.profiles p
    WHERE p.account_type IS NULL OR p.account_type NOT IN ('customer','llz_staff')

    UNION ALL
    -- convite ativo sem user_role
    SELECT 'active_invite_without_role', 'critical', i.registered_user_id, i.email, NULL,
           'Convite LLZ ativo sem papel global correspondente',
           'Reativar o papel global previsto ou revisar o convite'
    FROM public.platform_staff_invites i
    WHERE i.status = 'active' AND i.registered_user_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM valid_global g WHERE g.user_id = i.registered_user_id)

    UNION ALL
    -- papel empresarial dentro de user_roles
    SELECT 'company_role_in_user_roles', 'warning', ur.user_id, p.email, NULL,
           'Papel empresarial (' || ur.role::text || ') encontrado em papéis globais',
           'Remover o registro; cargos de empresa vivem em company_members'
    FROM public.user_roles ur
    LEFT JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.role::text IN ('supervisor','operator','member','owner')

    UNION ALL
    -- convite duplicado ativo
    SELECT 'duplicate_active_invite', 'warning', NULL, lower(i.email), NULL,
           'Mais de um convite LLZ ativo para o mesmo e-mail',
           'Cancelar os convites excedentes'
    FROM public.platform_staff_invites i
    WHERE i.status IN ('pending','registered','active')
    GROUP BY lower(i.email) HAVING count(*) > 1

    UNION ALL
    -- convite LLZ para e-mail de cliente
    SELECT 'invite_for_customer_email', 'warning', p.id, p.email, NULL,
           'Convite LLZ para e-mail já pertencente a um cliente',
           'Confirmar se a pessoa deve mesmo migrar para a Equipe LLZ'
    FROM public.platform_staff_invites i
    JOIN public.profiles p ON lower(p.email) = lower(i.email)
    WHERE i.status IN ('pending','registered') AND p.account_type = 'customer'

    UNION ALL
    -- user_role sem profile
    SELECT 'role_without_profile', 'critical', ur.user_id, NULL, NULL,
           'Papel global sem perfil correspondente',
           'Verificar a conta de origem antes de qualquer ação'
    FROM public.user_roles ur
    WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = ur.user_id)

    UNION ALL
    -- llz_staff sem papel global e sem convite pendente
    SELECT 'staff_without_role', 'info', p.id, p.email, NULL,
           'Conta Equipe LLZ sem papel global e sem convite pendente',
           'Ativar o papel global adequado ou reclassificar a conta'
    FROM public.profiles p
    WHERE p.account_type = 'llz_staff'
      AND NOT EXISTS (SELECT 1 FROM valid_global g WHERE g.user_id = p.id)
      AND NOT EXISTS (
        SELECT 1 FROM public.platform_staff_invites i
        WHERE lower(i.email) = lower(p.email) AND i.status IN ('pending','registered')
      )

    UNION ALL
    -- vínculo órfão
    SELECT 'membership_without_profile', 'warning', cm.user_id, NULL, c.name,
           'Vínculo empresarial sem perfil correspondente',
           'Revisar o vínculo; nenhuma exclusão automática é feita'
    FROM public.company_members cm
    JOIN public.companies c ON c.id = cm.company_id
    WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = cm.user_id)

    UNION ALL
    -- empresa com mais de um owner ativo
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
$$;

REVOKE EXECUTE ON FUNCTION public.platform_access_diagnostics() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_access_diagnostics() TO authenticated, service_role;