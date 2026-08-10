-- 1) Colunas de implantação em companies
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS deployment_owner_id uuid,
  ADD COLUMN IF NOT EXISTS assisted_validation_at timestamptz,
  ADD COLUMN IF NOT EXISTS assisted_validation_by uuid,
  ADD COLUMN IF NOT EXISTS assisted_validation_note text;

-- 2) Notas internas da implantação (somente equipe LLZ)
CREATE TABLE IF NOT EXISTS public.company_deployment_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  category text NOT NULL DEFAULT 'geral',
  note text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.company_deployment_notes TO authenticated;
GRANT ALL ON public.company_deployment_notes TO service_role;

ALTER TABLE public.company_deployment_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_read_deployment_notes" ON public.company_deployment_notes;
CREATE POLICY "staff_read_deployment_notes" ON public.company_deployment_notes
  FOR SELECT TO authenticated
  USING (public.is_platform_staff(auth.uid()));

DROP POLICY IF EXISTS "staff_insert_deployment_notes" ON public.company_deployment_notes;
CREATE POLICY "staff_insert_deployment_notes" ON public.company_deployment_notes
  FOR INSERT TO authenticated
  WITH CHECK (public.is_platform_staff(auth.uid()) AND author_id = auth.uid());

DROP POLICY IF EXISTS "staff_update_own_deployment_notes" ON public.company_deployment_notes;
CREATE POLICY "staff_update_own_deployment_notes" ON public.company_deployment_notes
  FOR UPDATE TO authenticated
  USING (public.is_platform_staff(auth.uid()) AND author_id = auth.uid())
  WITH CHECK (public.is_platform_staff(auth.uid()) AND author_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_deployment_notes_company ON public.company_deployment_notes(company_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_deployment_notes_updated_at ON public.company_deployment_notes;
CREATE TRIGGER trg_deployment_notes_updated_at
  BEFORE UPDATE ON public.company_deployment_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Panorama das implantações (somente equipe LLZ)
CREATE OR REPLACE FUNCTION public.deployment_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _rows jsonb;
BEGIN
  IF NOT public.is_platform_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso restrito a equipe LLZ';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC), '[]'::jsonb) INTO _rows
  FROM (
    SELECT
      c.id, c.name, c.status, c.plan, c.segment, c.business_type, c.operation_mode,
      c.approval_status, c.approval_reason, c.onboarding_status, c.onboarding_step,
      c.uses_addressing, c.uses_expedition, c.controls_batch, c.controls_expiration,
      c.plans_csv_import, c.main_focal_user_id, c.created_at, c.max_users,
      c.deployment_owner_id, c.assisted_validation_at, c.assisted_validation_by,
      dop.full_name AS deployment_owner_name, dop.email AS deployment_owner_email,
      ownp.id AS owner_user_id, ownp.full_name AS owner_name, ownp.email AS owner_email,
      focp.full_name AS focal_name, focp.email AS focal_email,
      agg.members_total, agg.members_active, agg.members_blocked,
      agg.products, agg.addresses, agg.lots, agg.stock_positions, agg.stock_qty,
      agg.movements, agg.movements_in, agg.movements_out,
      agg.first_in_at, agg.first_out_at, agg.last_movement_at,
      agg.tickets_total, agg.tickets_open, agg.support_seen, agg.csv_imports,
      agg.last_activity_at, agg.notes_count
    FROM public.companies c
    LEFT JOIN LATERAL (
      SELECT p.id, p.full_name, p.email
      FROM public.company_members m
      JOIN public.profiles p ON p.id = m.user_id
      WHERE m.company_id = c.id AND m.role = 'owner'
      ORDER BY m.created_at ASC LIMIT 1
    ) ownp ON true
    LEFT JOIN public.profiles focp ON focp.id = c.main_focal_user_id
    LEFT JOIN public.profiles dop ON dop.id = c.deployment_owner_id
    CROSS JOIN LATERAL (
      SELECT
        (SELECT count(*) FROM public.company_members m WHERE m.company_id = c.id) AS members_total,
        (SELECT count(*) FROM public.company_members m WHERE m.company_id = c.id AND m.is_active) AS members_active,
        (SELECT count(*) FROM public.company_members m WHERE m.company_id = c.id AND NOT m.is_active) AS members_blocked,
        (SELECT count(*) FROM public.products p WHERE p.company_id = c.id) AS products,
        (SELECT count(*) FROM public.addresses a WHERE a.company_id = c.id) AS addresses,
        (SELECT count(*) FROM public.lots l WHERE l.company_id = c.id) AS lots,
        (SELECT count(*) FROM public.stock_balance s WHERE s.company_id = c.id AND s.qty > 0) AS stock_positions,
        (SELECT COALESCE(sum(s.qty), 0) FROM public.stock_balance s WHERE s.company_id = c.id AND s.qty > 0) AS stock_qty,
        (SELECT count(*) FROM public.movements mv WHERE mv.company_id = c.id) AS movements,
        (SELECT count(*) FROM public.movements mv WHERE mv.company_id = c.id AND mv.type = 'IN') AS movements_in,
        (SELECT count(*) FROM public.movements mv WHERE mv.company_id = c.id AND mv.type = 'OUT') AS movements_out,
        (SELECT min(mv.created_at) FROM public.movements mv WHERE mv.company_id = c.id AND mv.type = 'IN') AS first_in_at,
        (SELECT min(mv.created_at) FROM public.movements mv WHERE mv.company_id = c.id AND mv.type = 'OUT') AS first_out_at,
        (SELECT max(mv.created_at) FROM public.movements mv WHERE mv.company_id = c.id) AS last_movement_at,
        (SELECT count(*) FROM public.support_tickets t WHERE t.company_id = c.id) AS tickets_total,
        (SELECT count(*) FROM public.support_tickets t WHERE t.company_id = c.id AND t.status NOT IN ('resolved','closed')) AS tickets_open,
        (SELECT count(*) FROM public.activity_log al WHERE al.company_id = c.id AND al.action = 'support_center_viewed') AS support_seen,
        (SELECT count(*) FROM public.activity_log al WHERE al.company_id = c.id AND al.action = 'csv_import_completed') AS csv_imports,
        (SELECT max(al.created_at) FROM public.activity_log al WHERE al.company_id = c.id) AS last_activity_at,
        (SELECT count(*) FROM public.company_deployment_notes n WHERE n.company_id = c.id) AS notes_count
    ) agg
    WHERE EXISTS (
      SELECT 1 FROM public.company_members m
      JOIN public.profiles p ON p.id = m.user_id
      WHERE m.company_id = c.id AND COALESCE(p.account_type, 'customer') <> 'llz_staff'
    )
  ) x;

  RETURN jsonb_build_object('companies', _rows, 'generated_at', now());
END;
$$;

REVOKE ALL ON FUNCTION public.deployment_overview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deployment_overview() TO authenticated;

-- 4) Detalhe da implantação
CREATE OR REPLACE FUNCTION public.deployment_detail(_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _notes jsonb;
  _history jsonb;
  _members jsonb;
BEGIN
  IF NOT public.is_platform_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso restrito a equipe LLZ';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', n.id, 'category', n.category, 'note', n.note, 'created_at', n.created_at,
    'author_name', p.full_name, 'author_email', p.email
  ) ORDER BY n.created_at DESC), '[]'::jsonb) INTO _notes
  FROM public.company_deployment_notes n
  LEFT JOIN public.profiles p ON p.id = n.author_id
  WHERE n.company_id = _company_id;

  SELECT COALESCE(jsonb_agg(t), '[]'::jsonb) INTO _history FROM (
    SELECT al.id, al.action, al.entity_type, al.created_at, p.full_name AS actor_name, p.email AS actor_email
    FROM public.activity_log al
    LEFT JOIN public.profiles p ON p.id = al.user_id
    WHERE al.company_id = _company_id
    ORDER BY al.created_at DESC
    LIMIT 40
  ) t;

  SELECT COALESCE(jsonb_agg(t), '[]'::jsonb) INTO _members FROM (
    SELECT m.id, m.role, m.is_active, m.is_main_focal_point, p.full_name, p.email, p.account_type
    FROM public.company_members m
    LEFT JOIN public.profiles p ON p.id = m.user_id
    WHERE m.company_id = _company_id
    ORDER BY m.created_at ASC
  ) t;

  RETURN jsonb_build_object('notes', _notes, 'history', _history, 'members', _members);
END;
$$;

REVOKE ALL ON FUNCTION public.deployment_detail(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deployment_detail(uuid) TO authenticated;

-- 5) Responsável LLZ pela implantação
CREATE OR REPLACE FUNCTION public.deployment_set_owner(_company_id uuid, _user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _acct text;
BEGIN
  IF NOT public.is_platform_client_admin(auth.uid()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sem permissao para administrar implantacoes.');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = _company_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Empresa nao encontrada.');
  END IF;

  IF _user_id IS NOT NULL THEN
    SELECT COALESCE(account_type, 'customer') INTO _acct FROM public.profiles WHERE id = _user_id;
    IF _acct IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Conta nao encontrada.');
    END IF;
    IF _acct <> 'llz_staff' OR NOT public.is_platform_staff(_user_id) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Responsavel deve ser da equipe LLZ com papel global ativo.');
    END IF;
  END IF;

  UPDATE public.companies SET deployment_owner_id = _user_id, updated_at = now() WHERE id = _company_id;

  INSERT INTO public.activity_log (user_id, company_id, action, entity_type, entity_id, details)
  VALUES (
    auth.uid(), _company_id,
    CASE WHEN _user_id IS NULL THEN 'deployment_owner_removed' ELSE 'deployment_owner_set' END,
    'company', _company_id::text,
    jsonb_build_object('deployment_owner_id', _user_id)
  );

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.deployment_set_owner(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deployment_set_owner(uuid, uuid) TO authenticated;

-- 6) Homologacao assistida
CREATE OR REPLACE FUNCTION public.deployment_complete_validation(_company_id uuid, _note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _c public.companies%ROWTYPE;
  _products int;
  _in int;
  _stock int;
BEGIN
  IF NOT public.is_platform_client_admin(auth.uid()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sem permissao para homologar implantacoes.');
  END IF;

  SELECT * INTO _c FROM public.companies WHERE id = _company_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Empresa nao encontrada.');
  END IF;

  IF COALESCE(_c.approval_status, 'pending') <> 'approved' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'A empresa ainda nao foi aprovada.');
  END IF;
  IF COALESCE(_c.onboarding_status, '') <> 'completed' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'O onboarding da empresa ainda nao foi concluido.');
  END IF;

  SELECT count(*) INTO _products FROM public.products WHERE company_id = _company_id;
  IF _products = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'A empresa ainda nao cadastrou produtos.');
  END IF;

  SELECT count(*) INTO _in FROM public.movements WHERE company_id = _company_id AND type = 'IN';
  IF _in = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'A empresa ainda nao registrou a primeira entrada.');
  END IF;

  SELECT count(*) INTO _stock FROM public.stock_balance WHERE company_id = _company_id AND qty > 0;
  IF _stock = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'A empresa ainda nao possui saldo em estoque.');
  END IF;

  UPDATE public.companies
  SET assisted_validation_at = now(),
      assisted_validation_by = auth.uid(),
      assisted_validation_note = _note,
      updated_at = now()
  WHERE id = _company_id;

  INSERT INTO public.activity_log (user_id, company_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), _company_id, 'deployment_validated', 'company', _company_id::text,
          jsonb_build_object('note', _note));

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.deployment_complete_validation(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deployment_complete_validation(uuid, text) TO authenticated;