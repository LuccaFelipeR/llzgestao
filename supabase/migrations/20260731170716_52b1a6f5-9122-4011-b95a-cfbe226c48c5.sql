-- P0.1: compatibilidade temporária — super admin oficial volta a ter o papel legado 'admin'
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'admin'::app_role
FROM auth.users u
WHERE u.email = 'luccafelipe99@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;

-- P0.2: migra todas as policies que usam o bypass legado has_role(auth.uid(),'admin')
-- para o helper de plataforma is_platform_super_admin(auth.uid()).
-- A semântica é preservada (is_platform_super_admin aceita 'super_admin' e o legado 'admin').
DO $migrate$
DECLARE
  r record;
  v_qual text;
  v_check text;
  v_roles text;
  v_sql text;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (coalesce(qual,'') || coalesce(with_check,'')) LIKE '%has_role(auth.uid(), ''admin''::app_role)%'
  LOOP
    v_qual  := replace(coalesce(r.qual,''),  'has_role(auth.uid(), ''admin''::app_role)', 'public.is_platform_super_admin(auth.uid())');
    v_check := replace(coalesce(r.with_check,''), 'has_role(auth.uid(), ''admin''::app_role)', 'public.is_platform_super_admin(auth.uid())');
    v_roles := array_to_string(r.roles, ', ');

    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);

    v_sql := format('CREATE POLICY %I ON public.%I AS %s FOR %s TO %s',
                    r.policyname, r.tablename,
                    CASE WHEN r.permissive = 'PERMISSIVE' THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
                    r.cmd, v_roles);
    IF r.qual IS NOT NULL THEN
      v_sql := v_sql || format(' USING (%s)', v_qual);
    END IF;
    IF r.with_check IS NOT NULL THEN
      v_sql := v_sql || format(' WITH CHECK (%s)', v_check);
    END IF;

    EXECUTE v_sql;
  END LOOP;
END
$migrate$;
