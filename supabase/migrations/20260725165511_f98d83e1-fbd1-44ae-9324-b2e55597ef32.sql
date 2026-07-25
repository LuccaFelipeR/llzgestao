-- ============ 1. HELPERS DE PAPEL GLOBAL ============
CREATE OR REPLACE FUNCTION public.is_platform_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role::text IN ('super_admin','admin','platform_admin','support_agent','developer')
  )
$$;

CREATE OR REPLACE FUNCTION public.is_platform_super_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role::text IN ('super_admin','admin')
  )
$$;

CREATE OR REPLACE FUNCTION public.is_support_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role::text IN ('super_admin','admin','platform_admin','support_agent')
  )
$$;

REVOKE EXECUTE ON FUNCTION public.is_platform_staff(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_platform_super_admin(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_support_staff(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_staff(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_platform_super_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_support_staff(uuid) TO authenticated, service_role;

-- ============ 2. APROVAÇÃO DE EMPRESAS ============
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS approval_reason text,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid;

UPDATE public.companies SET approval_status = 'approved', approved_at = COALESCE(approved_at, created_at)
WHERE approval_status = 'pending';

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS rejection_reason text;

-- ============ 3. POLICIES PARA PAPÉIS GLOBAIS ============
DROP POLICY IF EXISTS "Platform staff read all profiles" ON public.profiles;
CREATE POLICY "Platform staff read all profiles" ON public.profiles
  FOR SELECT TO authenticated USING (public.is_platform_staff(auth.uid()));
DROP POLICY IF EXISTS "Platform staff update profiles" ON public.profiles;
CREATE POLICY "Platform staff update profiles" ON public.profiles
  FOR UPDATE TO authenticated USING (public.is_platform_staff(auth.uid()))
  WITH CHECK (public.is_platform_staff(auth.uid()));

DROP POLICY IF EXISTS "Platform staff read all companies" ON public.companies;
CREATE POLICY "Platform staff read all companies" ON public.companies
  FOR SELECT TO authenticated USING (public.is_platform_staff(auth.uid()));
DROP POLICY IF EXISTS "Platform staff update companies" ON public.companies;
CREATE POLICY "Platform staff update companies" ON public.companies
  FOR UPDATE TO authenticated USING (public.is_platform_staff(auth.uid()))
  WITH CHECK (public.is_platform_staff(auth.uid()));

DROP POLICY IF EXISTS "Platform staff read all members" ON public.company_members;
CREATE POLICY "Platform staff read all members" ON public.company_members
  FOR SELECT TO authenticated USING (public.is_platform_staff(auth.uid()));
DROP POLICY IF EXISTS "Platform staff manage members" ON public.company_members;
CREATE POLICY "Platform staff manage members" ON public.company_members
  FOR UPDATE TO authenticated USING (public.is_platform_staff(auth.uid()))
  WITH CHECK (public.is_platform_staff(auth.uid()));

DROP POLICY IF EXISTS "Platform staff read all activity_log" ON public.activity_log;
CREATE POLICY "Platform staff read all activity_log" ON public.activity_log
  FOR SELECT TO authenticated USING (public.is_platform_staff(auth.uid()));
DROP POLICY IF EXISTS "Platform staff insert activity_log" ON public.activity_log;
CREATE POLICY "Platform staff insert activity_log" ON public.activity_log
  FOR INSERT TO authenticated
  WITH CHECK (public.is_platform_staff(auth.uid()) AND user_id = auth.uid());

DROP POLICY IF EXISTS "Platform staff read all roles" ON public.user_roles;
CREATE POLICY "Platform staff read all roles" ON public.user_roles
  FOR SELECT TO authenticated USING (public.is_platform_staff(auth.uid()));

DROP POLICY IF EXISTS "Support staff read all tickets" ON public.support_tickets;
CREATE POLICY "Support staff read all tickets" ON public.support_tickets
  FOR SELECT TO authenticated USING (public.is_support_staff(auth.uid()));
DROP POLICY IF EXISTS "Support staff update all tickets" ON public.support_tickets;
CREATE POLICY "Support staff update all tickets" ON public.support_tickets
  FOR UPDATE TO authenticated USING (public.is_support_staff(auth.uid()))
  WITH CHECK (public.is_support_staff(auth.uid()));

DROP POLICY IF EXISTS "Support staff read all messages" ON public.support_ticket_messages;
CREATE POLICY "Support staff read all messages" ON public.support_ticket_messages
  FOR SELECT TO authenticated USING (public.is_support_staff(auth.uid()));
DROP POLICY IF EXISTS "Support staff insert messages" ON public.support_ticket_messages;
CREATE POLICY "Support staff insert messages" ON public.support_ticket_messages
  FOR INSERT TO authenticated
  WITH CHECK (public.is_support_staff(auth.uid()) AND sender_id = auth.uid());

-- ============ 4. PROTEÇÃO DE TICKETS: equipe de suporte ============
CREATE OR REPLACE FUNCTION public.protect_support_ticket_updates()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_is_staff boolean;
BEGIN
  v_is_staff := public.is_support_staff(auth.uid());
  IF v_is_staff THEN
    IF NEW.status = 'closed' AND OLD.status <> 'closed' AND NEW.closed_at IS NULL THEN
      NEW.closed_at := now();
    END IF;
    IF NEW.status <> 'closed' AND OLD.status = 'closed' THEN
      NEW.closed_at := NULL;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.company_id <> OLD.company_id THEN RAISE EXCEPTION 'Não é permitido alterar a empresa do chamado'; END IF;
  IF NEW.created_by <> OLD.created_by THEN RAISE EXCEPTION 'Não é permitido alterar o autor do chamado'; END IF;
  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN RAISE EXCEPTION 'Somente a equipe LLZ pode alterar o responsável'; END IF;
  IF NEW.priority <> OLD.priority THEN RAISE EXCEPTION 'Somente a equipe LLZ pode alterar a prioridade'; END IF;
  IF NEW.status <> OLD.status THEN
    IF NOT (OLD.status = 'resolved' AND NEW.status = 'in_progress' AND OLD.created_by = auth.uid()) THEN
      RAISE EXCEPTION 'Somente a equipe LLZ pode alterar o status deste chamado';
    END IF;
  END IF;
  IF NEW.closed_at IS DISTINCT FROM OLD.closed_at THEN RAISE EXCEPTION 'Não é permitido alterar a data de fechamento'; END IF;
  RETURN NEW;
END $$;

-- ============ 5. APROVAR / REJEITAR EMPRESA ============
CREATE OR REPLACE FUNCTION public.approve_company(_company_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_owner uuid;
BEGIN
  IF NOT public.is_platform_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas a equipe da plataforma pode aprovar cadastros';
  END IF;

  SELECT user_id INTO v_owner FROM public.company_members
   WHERE company_id = _company_id
   ORDER BY (role = 'owner') DESC, created_at ASC LIMIT 1;

  UPDATE public.companies
     SET approval_status = 'approved', approval_reason = NULL,
         approved_at = now(), approved_by = auth.uid(),
         status = CASE WHEN status = 'blocked' THEN 'active'::company_status ELSE status END,
         main_focal_user_id = COALESCE(main_focal_user_id, v_owner),
         updated_at = now()
   WHERE id = _company_id;

  IF v_owner IS NOT NULL THEN
    UPDATE public.company_members
       SET is_active = true, approved_at = COALESCE(approved_at, now()),
           is_main_focal_point = CASE WHEN user_id = v_owner THEN true ELSE is_main_focal_point END
     WHERE company_id = _company_id AND user_id = v_owner;
  END IF;

  UPDATE public.profiles p
     SET is_approved = true, rejection_reason = NULL
   WHERE p.id IN (SELECT user_id FROM public.company_members WHERE company_id = _company_id);

  INSERT INTO public.activity_log (user_id, action, entity_type, entity_id, details, company_id)
  VALUES (auth.uid(), 'company_registration_approved', 'company', _company_id::text,
          jsonb_build_object('owner_user_id', v_owner), _company_id);
END $$;

CREATE OR REPLACE FUNCTION public.reject_company(_company_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas a equipe da plataforma pode rejeitar cadastros';
  END IF;
  IF _reason IS NULL OR length(btrim(_reason)) < 5 THEN
    RAISE EXCEPTION 'Informe o motivo da rejeição (mínimo 5 caracteres)';
  END IF;

  UPDATE public.companies
     SET approval_status = 'rejected', approval_reason = _reason,
         approved_at = NULL, approved_by = auth.uid(), updated_at = now()
   WHERE id = _company_id;

  UPDATE public.profiles p
     SET is_approved = false, rejection_reason = _reason
   WHERE p.id IN (SELECT user_id FROM public.company_members WHERE company_id = _company_id);

  INSERT INTO public.activity_log (user_id, action, entity_type, entity_id, details, company_id)
  VALUES (auth.uid(), 'company_registration_rejected', 'company', _company_id::text,
          jsonb_build_object('reason', _reason), _company_id);
END $$;

REVOKE EXECUTE ON FUNCTION public.approve_company(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reject_company(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_company(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reject_company(uuid, text) TO authenticated, service_role;

-- ============ 6. NOVOS CADASTROS: empresa nasce pendente ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  found_company_id UUID;
  found_approval text;
  new_company_id UUID;
BEGIN
  INSERT INTO public.profiles (id, email, full_name, is_approved)
  VALUES (
    NEW.id, NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    CASE WHEN NEW.email = 'luccafelipe99@gmail.com' THEN true ELSE false END
  )
  ON CONFLICT (id) DO NOTHING;

  IF NEW.email = 'luccafelipe99@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
    ON CONFLICT DO NOTHING;
  END IF;

  -- Usuários globais da plataforma não recebem empresa automática
  IF public.is_platform_staff(NEW.id) THEN
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