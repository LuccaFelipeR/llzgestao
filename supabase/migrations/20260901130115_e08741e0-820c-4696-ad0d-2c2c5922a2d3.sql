-- Fase 6.21 (parte 2) — nenhuma função SECURITY DEFINER do schema public
-- deve ser chamável sem sessão. Nenhuma policy, tabela ou dado é alterado.
DO $$
DECLARE
  f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prosecdef
       AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', f.sig);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', f.sig);
  END LOOP;
END;
$$;

-- Reafirma o acesso de quem realmente precisa.
GRANT EXECUTE ON FUNCTION public.is_member_of(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_users_overview(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_user_detail(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.company_member_link(uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.company_member_unlink(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.staff_activate(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.staff_add_existing_account(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.staff_invite_create(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.staff_remove(uuid) TO authenticated, service_role;