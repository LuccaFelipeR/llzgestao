-- 1. Garante super_admin para a staff oficial
INSERT INTO public.user_roles (user_id, role)
SELECT p.id, 'super_admin'::app_role
FROM public.profiles p
WHERE p.email = 'luccafelipe99@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;

-- 2. Remove qualquer outro papel (global ou legado) de todos os usuários
--    que não estão na lista oficial da equipe LLZ,
--    e remove o papel legado 'admin' do super admin oficial.
DELETE FROM public.user_roles ur
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles p
  WHERE p.id = ur.user_id
    AND p.email = 'luccafelipe99@gmail.com'
    AND ur.role = 'super_admin'::app_role
);

-- 3. Auditoria
INSERT INTO public.activity_log (user_id, action, entity_type, details)
SELECT p.id, 'platform_roles_normalized', 'user_roles',
       jsonb_build_object('phase', '6.16', 'preserved_staff', jsonb_build_array('luccafelipe99@gmail.com'))
FROM public.profiles p WHERE p.email = 'luccafelipe99@gmail.com';