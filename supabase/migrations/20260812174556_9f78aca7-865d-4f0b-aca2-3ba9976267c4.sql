
-- ============ CATÁLOGO DE PLANOS ============
CREATE TABLE public.plans (
  code text PRIMARY KEY,
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  limits jsonb NOT NULL DEFAULT '{}'::jsonb,
  features jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.plans TO authenticated;
GRANT ALL ON public.plans TO service_role;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plans_read_authenticated" ON public.plans FOR SELECT TO authenticated USING (true);
CREATE POLICY "plans_write_platform" ON public.plans FOR ALL TO authenticated
  USING (public.is_platform_client_admin(auth.uid()))
  WITH CHECK (public.is_platform_client_admin(auth.uid()));
CREATE TRIGGER update_plans_updated_at BEFORE UPDATE ON public.plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- -1 = ilimitado
INSERT INTO public.plans (code, name, description, sort_order, limits, features) VALUES
('free','Free','Plano inicial para começar a operar com volume reduzido.',10,
 '{"max_users":5,"max_products":500,"max_addresses":100,"max_monthly_movements":5000}'::jsonb,
 '{"csv_import":true,"addressing":true,"expedition":true,"ai_insights":false,"advanced_reports":false,"priority_support":false}'::jsonb),
('starter','Starter','Operação pequena com importação e endereçamento completos.',20,
 '{"max_users":10,"max_products":2000,"max_addresses":500,"max_monthly_movements":20000}'::jsonb,
 '{"csv_import":true,"addressing":true,"expedition":true,"ai_insights":false,"advanced_reports":true,"priority_support":false}'::jsonb),
('pro','Pro','Operação madura com inteligência e relatórios avançados.',30,
 '{"max_users":30,"max_products":20000,"max_addresses":5000,"max_monthly_movements":200000}'::jsonb,
 '{"csv_import":true,"addressing":true,"expedition":true,"ai_insights":true,"advanced_reports":true,"priority_support":true}'::jsonb),
('enterprise','Enterprise','Sem limites de volume, com suporte prioritário.',40,
 '{"max_users":-1,"max_products":-1,"max_addresses":-1,"max_monthly_movements":-1}'::jsonb,
 '{"csv_import":true,"addressing":true,"expedition":true,"ai_insights":true,"advanced_reports":true,"priority_support":true}'::jsonb);

-- ============ OVERRIDES COMERCIAIS POR EMPRESA ============
CREATE TABLE public.company_entitlement_overrides (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  limits jsonb NOT NULL DEFAULT '{}'::jsonb,
  features jsonb NOT NULL DEFAULT '{}'::jsonb,
  note text,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.company_entitlement_overrides TO authenticated;
GRANT ALL ON public.company_entitlement_overrides TO service_role;
ALTER TABLE public.company_entitlement_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ceo_read_member_or_staff" ON public.company_entitlement_overrides FOR SELECT TO authenticated
  USING (public.is_member_of(auth.uid(), company_id) OR public.is_platform_staff(auth.uid()));
CREATE POLICY "ceo_write_platform" ON public.company_entitlement_overrides FOR ALL TO authenticated
  USING (public.is_platform_client_admin(auth.uid()))
  WITH CHECK (public.is_platform_client_admin(auth.uid()));
CREATE TRIGGER update_ceo_updated_at BEFORE UPDATE ON public.company_entitlement_overrides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ FONTE DE VERDADE ============
-- limite efetivo: override > coluna legada da empresa > plano > ilimitado
CREATE OR REPLACE FUNCTION public.effective_limit(_company_id uuid, _key text)
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT NULLIF(o.limits ->> _key, '')::bigint FROM public.company_entitlement_overrides o WHERE o.company_id = _company_id),
    (SELECT CASE _key
        WHEN 'max_users' THEN c.max_users
        WHEN 'max_products' THEN c.max_products
        WHEN 'max_addresses' THEN c.max_addresses
        ELSE NULL END::bigint
     FROM public.companies c WHERE c.id = _company_id),
    (SELECT NULLIF(p.limits ->> _key, '')::bigint
     FROM public.companies c JOIN public.plans p ON p.code = c.plan WHERE c.id = _company_id),
    -1
  );
$$;

CREATE OR REPLACE FUNCTION public.has_feature(_company_id uuid, _feature text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT (o.features ->> _feature)::boolean FROM public.company_entitlement_overrides o WHERE o.company_id = _company_id),
    (SELECT (p.features ->> _feature)::boolean
     FROM public.companies c JOIN public.plans p ON p.code = c.plan WHERE c.id = _company_id),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.company_usage(_company_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'max_users', (SELECT count(*) FROM public.company_members m
                   JOIN public.profiles pr ON pr.id = m.user_id
                   WHERE m.company_id = _company_id AND m.is_active
                     AND COALESCE(pr.account_type,'customer') <> 'llz_staff'),
    'max_products', (SELECT count(*) FROM public.products WHERE company_id = _company_id),
    'max_addresses', (SELECT count(*) FROM public.addresses WHERE company_id = _company_id),
    'max_monthly_movements', (SELECT count(*) FROM public.movements
                               WHERE company_id = _company_id
                                 AND created_at >= date_trunc('month', now()))
  );
$$;

CREATE OR REPLACE FUNCTION public.company_entitlements(_company_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE c record; p record; o record; keys text[] := ARRAY['max_users','max_products','max_addresses','max_monthly_movements'];
  feats text[] := ARRAY['csv_import','addressing','expedition','ai_insights','advanced_reports','priority_support'];
  k text; lim jsonb := '{}'::jsonb; fe jsonb := '{}'::jsonb;
BEGIN
  IF NOT (public.is_member_of(auth.uid(), _company_id) OR public.is_platform_staff(auth.uid())) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sem permissão para consultar este plano.');
  END IF;
  SELECT * INTO c FROM public.companies WHERE id = _company_id;
  IF c IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Empresa não encontrada.'); END IF;
  SELECT * INTO p FROM public.plans WHERE code = c.plan;
  SELECT * INTO o FROM public.company_entitlement_overrides WHERE company_id = _company_id;

  FOREACH k IN ARRAY keys LOOP lim := lim || jsonb_build_object(k, public.effective_limit(_company_id, k)); END LOOP;
  FOREACH k IN ARRAY feats LOOP fe := fe || jsonb_build_object(k, public.has_feature(_company_id, k)); END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'company_id', _company_id,
    'company_name', c.name,
    'company_status', c.status,
    'trial_ends_at', c.trial_ends_at,
    'plan', jsonb_build_object('code', c.plan, 'name', COALESCE(p.name, c.plan),
                               'description', p.description, 'is_active', COALESCE(p.is_active, false),
                               'limits', COALESCE(p.limits,'{}'::jsonb), 'features', COALESCE(p.features,'{}'::jsonb)),
    'overrides', jsonb_build_object('limits', COALESCE(o.limits,'{}'::jsonb), 'features', COALESCE(o.features,'{}'::jsonb),
                                    'note', o.note, 'updated_at', o.updated_at,
                                    'has_any', (o.company_id IS NOT NULL AND (o.limits <> '{}'::jsonb OR o.features <> '{}'::jsonb))),
    'legacy_columns', jsonb_build_object('max_users', c.max_users, 'max_products', c.max_products, 'max_addresses', c.max_addresses),
    'limits', lim,
    'features', fe,
    'usage', public.company_usage(_company_id)
  );
END; $$;

-- ============ ENFORCEMENT ============
CREATE OR REPLACE FUNCTION public.assert_within_limit(_company_id uuid, _key text, _label text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE lim bigint; used bigint;
BEGIN
  IF _company_id IS NULL THEN RETURN; END IF;
  IF current_setting('app.cleanup_mode', true) = 'on' THEN RETURN; END IF;
  lim := public.effective_limit(_company_id, _key);
  IF lim IS NULL OR lim < 0 THEN RETURN; END IF;
  PERFORM pg_advisory_xact_lock(hashtext(_company_id::text || ':' || _key));
  used := (public.company_usage(_company_id) ->> _key)::bigint;
  IF used >= lim THEN
    RAISE EXCEPTION 'LIMITE_PLANO: % — limite do plano atingido (%/%). Ajuste o plano da empresa para continuar.', _label, used, lim
      USING ERRCODE = 'check_violation';
  END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.enforce_products_limit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM public.assert_within_limit(NEW.company_id, 'max_products', 'produtos'); RETURN NEW; END; $$;

CREATE OR REPLACE FUNCTION public.enforce_addresses_limit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM public.assert_within_limit(NEW.company_id, 'max_addresses', 'endereços'); RETURN NEW; END; $$;

CREATE OR REPLACE FUNCTION public.enforce_members_limit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.is_active AND (TG_OP = 'INSERT' OR NOT OLD.is_active) THEN
    IF EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.user_id AND COALESCE(account_type,'customer') = 'llz_staff') THEN
      RETURN NEW;
    END IF;
    PERFORM public.assert_within_limit(NEW.company_id, 'max_users', 'usuários ativos');
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.enforce_movements_limit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM public.assert_within_limit(NEW.company_id, 'max_monthly_movements', 'movimentações no mês'); RETURN NEW; END; $$;

CREATE TRIGGER enforce_plan_limit_products BEFORE INSERT ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.enforce_products_limit();
CREATE TRIGGER enforce_plan_limit_addresses BEFORE INSERT ON public.addresses
  FOR EACH ROW EXECUTE FUNCTION public.enforce_addresses_limit();
CREATE TRIGGER enforce_plan_limit_members BEFORE INSERT OR UPDATE ON public.company_members
  FOR EACH ROW EXECUTE FUNCTION public.enforce_members_limit();
CREATE TRIGGER aa_enforce_plan_limit_movements BEFORE INSERT ON public.movements
  FOR EACH ROW EXECUTE FUNCTION public.enforce_movements_limit();

-- preferência operacional nunca pode ligar recurso que o plano não oferece
CREATE OR REPLACE FUNCTION public.enforce_feature_flags() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.uses_addressing AND NOT public.has_feature(NEW.id, 'addressing') THEN
    RAISE EXCEPTION 'RECURSO_PLANO: endereçamento não está incluído no plano atual.' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.uses_expedition AND NOT public.has_feature(NEW.id, 'expedition') THEN
    RAISE EXCEPTION 'RECURSO_PLANO: expedição guiada não está incluída no plano atual.' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.plans_csv_import AND NOT public.has_feature(NEW.id, 'csv_import') THEN
    RAISE EXCEPTION 'RECURSO_PLANO: importação CSV não está incluída no plano atual.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER enforce_feature_flags_companies BEFORE UPDATE ON public.companies
  FOR EACH ROW WHEN (
    NEW.uses_addressing IS DISTINCT FROM OLD.uses_addressing
    OR NEW.uses_expedition IS DISTINCT FROM OLD.uses_expedition
    OR NEW.plans_csv_import IS DISTINCT FROM OLD.plans_csv_import
  ) EXECUTE FUNCTION public.enforce_feature_flags();

-- ============ GESTÃO PELA EQUIPE LLZ ============
CREATE OR REPLACE FUNCTION public.plan_set_company_plan(_company_id uuid, _plan_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE old_plan text;
BEGIN
  IF NOT public.is_platform_client_admin(auth.uid()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Apenas a equipe LLZ autorizada pode alterar planos.');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.plans WHERE code = _plan_code AND is_active) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Plano inexistente ou inativo.');
  END IF;
  SELECT plan INTO old_plan FROM public.companies WHERE id = _company_id;
  IF old_plan IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Empresa não encontrada.'); END IF;
  UPDATE public.companies SET plan = _plan_code, updated_at = now() WHERE id = _company_id;
  INSERT INTO public.activity_log (user_id, action, entity_type, entity_id, company_id, details)
  VALUES (auth.uid(), 'plan_changed', 'company', _company_id::text, _company_id,
          jsonb_build_object('from', old_plan, 'to', _plan_code));
  RETURN jsonb_build_object('ok', true, 'from', old_plan, 'to', _plan_code);
END; $$;

CREATE OR REPLACE FUNCTION public.plan_set_company_override(_company_id uuid, _limits jsonb, _features jsonb, _note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_client_admin(auth.uid()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Apenas a equipe LLZ autorizada pode aplicar exceções comerciais.');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = _company_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Empresa não encontrada.');
  END IF;
  INSERT INTO public.company_entitlement_overrides (company_id, limits, features, note, updated_by)
  VALUES (_company_id, COALESCE(_limits,'{}'::jsonb), COALESCE(_features,'{}'::jsonb), _note, auth.uid())
  ON CONFLICT (company_id) DO UPDATE
    SET limits = COALESCE(_limits,'{}'::jsonb), features = COALESCE(_features,'{}'::jsonb),
        note = _note, updated_by = auth.uid(), updated_at = now();
  INSERT INTO public.activity_log (user_id, action, entity_type, entity_id, company_id, details)
  VALUES (auth.uid(), 'plan_override_applied', 'company', _company_id::text, _company_id,
          jsonb_build_object('limits', COALESCE(_limits,'{}'::jsonb), 'features', COALESCE(_features,'{}'::jsonb), 'note', _note));
  RETURN jsonb_build_object('ok', true);
END; $$;

CREATE OR REPLACE FUNCTION public.plan_clear_company_override(_company_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_client_admin(auth.uid()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Apenas a equipe LLZ autorizada pode remover exceções comerciais.');
  END IF;
  DELETE FROM public.company_entitlement_overrides WHERE company_id = _company_id;
  INSERT INTO public.activity_log (user_id, action, entity_type, entity_id, company_id, details)
  VALUES (auth.uid(), 'plan_override_removed', 'company', _company_id::text, _company_id, '{}'::jsonb);
  RETURN jsonb_build_object('ok', true);
END; $$;

REVOKE EXECUTE ON FUNCTION public.enforce_products_limit() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enforce_addresses_limit() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enforce_members_limit() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enforce_movements_limit() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enforce_feature_flags() FROM PUBLIC;
