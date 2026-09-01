-- Fase 6.21 — endurecimento de EXECUTE em funções SECURITY DEFINER.
-- Nenhuma policy, tabela ou dado é alterado.

REVOKE EXECUTE ON FUNCTION public.deployment_overview() FROM anon;
REVOKE EXECUTE ON FUNCTION public.deployment_detail(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.deployment_set_owner(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.deployment_complete_validation(uuid, text) FROM anon;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_user_company_id(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_company_id(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_user_company_id(uuid) TO authenticated, service_role;