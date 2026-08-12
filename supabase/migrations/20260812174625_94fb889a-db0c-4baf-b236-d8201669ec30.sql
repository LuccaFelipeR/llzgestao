
REVOKE EXECUTE ON FUNCTION public.effective_limit(uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.has_feature(uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.company_usage(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.company_entitlements(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.assert_within_limit(uuid, text, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.plan_set_company_plan(uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.plan_set_company_override(uuid, jsonb, jsonb, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.plan_clear_company_override(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.effective_limit(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_feature(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.company_usage(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.company_entitlements(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assert_within_limit(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.plan_set_company_plan(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.plan_set_company_override(uuid, jsonb, jsonb, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.plan_clear_company_override(uuid) TO authenticated, service_role;
