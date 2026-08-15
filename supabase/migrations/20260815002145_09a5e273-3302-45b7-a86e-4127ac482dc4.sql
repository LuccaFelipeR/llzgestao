-- 1) Campos canônicos de ativação LLZ
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS staff_activated_at timestamptz,
  ADD COLUMN IF NOT EXISTS staff_activated_by uuid;

ALTER TABLE public.platform_staff_invites ALTER COLUMN intended_role DROP NOT NULL;

-- 2) Backfill: quem tem papel global legado vira staff ativado
UPDATE public.profiles p
   SET account_type = 'llz_staff',
       staff_activated_at = COALESCE(p.staff_activated_at, now())
 WHERE EXISTS (
   SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p.id
      AND ur.role::text IN ('super_admin','admin','platform_admin','support_agent','developer')
 );

-- 3) Helpers canônicos
CREATE OR REPLACE FUNCTION public.is_platform_super_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = _user_id AND role::text IN ('super_admin','admin')
  )
$$;

-- LLZ ativo = tipo de conta llz_staff + ativação explícita (super admin sempre ativo)
CREATE OR REPLACE FUNCTION public.is_platform_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.is_platform_super_admin(_user_id)
      OR EXISTS (
        SELECT 1 FROM public.profiles p
         WHERE p.id = _user_id
           AND p.account_type = 'llz_staff'
           AND p.staff_activated_at IS NOT NULL
      )
$$;

-- Compatibilidade: administração de clientes e suporte = LLZ ativo
CREATE OR REPLACE FUNCTION public.is_platform_client_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.is_platform_staff(_user_id)
$$;

CREATE OR REPLACE FUNCTION public.is_support_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.is_platform_staff(_user_id)
$$;

-- 4) Normalização histórica dos papéis globais legados
DELETE FROM public.user_roles
 WHERE role::text IN ('platform_admin','support_agent','developer');

-- 5) Cadastro por convite não concede papel global
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
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
            jsonb_build_object('email', NEW.email));
    RETURN NEW;
  END IF;

  IF NEW.email = 'luccafelipe99@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
    ON CONFLICT DO NOTHING;
    UPDATE public.profiles
       SET account_type = 'llz_staff', staff_activated_at = now()
     WHERE id = NEW.id;
    RETURN NEW;
  END IF;

  -- conta já é equipe LLZ (tipo definido) => nunca cria empresa
  IF EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = NEW.id AND p.account_type = 'llz_staff') THEN
    RETURN NEW;
  END IF;

  -- idempotência: já possui vínculo empresarial
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
$function$;

-- 6) RPCs da Equipe LLZ (sem cargo global)
DROP FUNCTION IF EXISTS public.staff_role_apply(uuid, text, text);
DROP FUNCTION IF EXISTS public.staff_role_remove(uuid, text);
DROP FUNCTION IF EXISTS public.staff_add_existing_account(uuid, text);
DROP FUNCTION IF EXISTS public.staff_invite_create(text, text, text);

CREATE OR REPLACE FUNCTION public.staff_invite_create(_email text, _full_name text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid; v_email text := lower(btrim(_email));
BEGIN
  IF NOT public.is_platform_super_admin(auth.uid()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Apenas o super administrador pode criar convites.');
  END IF;
  IF v_email IS NULL OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'E-mail inválido.');
  END IF;
  IF EXISTS (SELECT 1 FROM public.platform_staff_invites
             WHERE lower(email) = v_email AND status IN ('pending','registered','active')) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Já existe convite ativo para este e-mail.');
  END IF;

  INSERT INTO public.platform_staff_invites (email, full_name, invited_by, token_hash)
  VALUES (v_email, NULLIF(btrim(coalesce(_full_name,'')),''), auth.uid(),
          encode(digest(gen_random_uuid()::text, 'sha256'), 'hex'))
  RETURNING id INTO v_id;

  INSERT INTO public.activity_log (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'staff_invite_created', 'platform_staff_invite', v_id::text,
          jsonb_build_object('email', v_email));

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END $$;

CREATE OR REPLACE FUNCTION public.staff_activate(_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_profile public.profiles%ROWTYPE;
BEGIN
  IF NOT public.is_platform_super_admin(auth.uid()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Apenas o super administrador pode ativar membros da Equipe LLZ.');
  END IF;
  SELECT * INTO v_profile FROM public.profiles WHERE id = _user_id;
  IF v_profile.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Conta não encontrada.');
  END IF;

  UPDATE public.profiles
     SET account_type = 'llz_staff',
         is_approved = true,
         staff_activated_at = COALESCE(staff_activated_at, now()),
         staff_activated_by = COALESCE(staff_activated_by, auth.uid())
   WHERE id = _user_id;

  UPDATE public.platform_staff_invites
     SET status = 'active', approved_at = now()
   WHERE registered_user_id = _user_id AND status = 'registered';

  INSERT INTO public.activity_log (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'staff_activated', 'profile', _user_id::text,
          jsonb_build_object('email', v_profile.email));

  RETURN jsonb_build_object('ok', true);
END $$;

CREATE OR REPLACE FUNCTION public.staff_invite_activate(_invite_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v public.platform_staff_invites%ROWTYPE;
BEGIN
  IF NOT public.is_platform_super_admin(auth.uid()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Apenas o super administrador pode ativar membros.');
  END IF;
  SELECT * INTO v FROM public.platform_staff_invites WHERE id = _invite_id;
  IF v.id IS NULL OR v.status <> 'registered' OR v.registered_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Convite ainda não possui cadastro concluído.');
  END IF;
  RETURN public.staff_activate(v.registered_user_id);
END $$;

CREATE OR REPLACE FUNCTION public.staff_add_existing_account(_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_profile public.profiles%ROWTYPE; v_companies text[];
BEGIN
  IF NOT public.is_platform_super_admin(auth.uid()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Apenas o super administrador pode gerenciar a Equipe LLZ.');
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
    RETURN jsonb_build_object('ok', false, 'companies', to_jsonb(v_companies),
      'error', 'Esta conta ainda possui vínculo com empresa cliente. Desvincule as empresas antes de transformá-la em membro da Equipe LLZ.');
  END IF;

  RETURN public.staff_activate(_user_id);
END $$;

CREATE OR REPLACE FUNCTION public.staff_remove(_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_profile public.profiles%ROWTYPE;
BEGIN
  IF NOT public.is_platform_super_admin(auth.uid()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Apenas o super administrador pode gerenciar a Equipe LLZ.');
  END IF;
  IF _user_id = auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Não é possível remover o próprio acesso por esta tela.');
  END IF;
  IF public.is_platform_super_admin(_user_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Contas de super administrador exigem fluxo administrativo específico.');
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = _user_id;
  IF v_profile.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Conta não encontrada.');
  END IF;

  UPDATE public.profiles
     SET account_type = 'customer', staff_activated_at = NULL, staff_activated_by = NULL
   WHERE id = _user_id;

  UPDATE public.platform_staff_invites
     SET status = 'revoked', revoked_at = now()
   WHERE registered_user_id = _user_id AND status IN ('registered','active');

  INSERT INTO public.activity_log (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'staff_removed', 'profile', _user_id::text,
          jsonb_build_object('email', v_profile.email));

  RETURN jsonb_build_object('ok', true);
END $$;

REVOKE EXECUTE ON FUNCTION public.staff_invite_create(text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.staff_activate(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.staff_add_existing_account(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.staff_remove(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.staff_invite_activate(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.staff_invite_create(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_activate(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_add_existing_account(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_remove(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_invite_activate(uuid) TO authenticated;