CREATE OR REPLACE FUNCTION public.mark_support_center_viewed(_company_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL OR _company_id IS NULL THEN
    RETURN false;
  END IF;
  -- Somente usuário da própria empresa; equipe LLZ não marca o item
  IF public.is_platform_staff(v_user) THEN
    RETURN false;
  END IF;
  IF NOT public.is_member_of(v_user, _company_id) THEN
    RETURN false;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.activity_log
    WHERE company_id = _company_id AND action = 'support_center_viewed'
  ) THEN
    RETURN false;
  END IF;
  INSERT INTO public.activity_log (user_id, company_id, action, entity_type, details)
  VALUES (v_user, _company_id, 'support_center_viewed', 'support_center',
          jsonb_build_object('source', 'app'));
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_support_center_viewed(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_support_center_viewed(uuid) TO authenticated;