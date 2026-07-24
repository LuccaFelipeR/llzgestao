
-- Fase 6.12: substituir get_user_company_id (LIMIT 1) por is_company_admin_of
-- em políticas de DELETE de products/addresses/lots e nas políticas de
-- membership de company_members. Não enfraquece RLS; corrige acesso legítimo
-- para usuários vinculados a mais de uma empresa.

-- products DELETE
DROP POLICY IF EXISTS "Company admins can delete products" ON public.products;
CREATE POLICY "Company admins can delete products"
  ON public.products FOR DELETE
  USING (
    is_company_admin_of(auth.uid(), company_id)
    OR has_role(auth.uid(), 'admin'::app_role)
  );

-- addresses DELETE
DROP POLICY IF EXISTS "Company admins can delete addresses" ON public.addresses;
CREATE POLICY "Company admins can delete addresses"
  ON public.addresses FOR DELETE
  USING (
    is_company_admin_of(auth.uid(), company_id)
    OR has_role(auth.uid(), 'admin'::app_role)
  );

-- lots DELETE
DROP POLICY IF EXISTS "Company admins can delete lots" ON public.lots;
CREATE POLICY "Company admins can delete lots"
  ON public.lots FOR DELETE
  USING (
    is_company_admin_of(auth.uid(), company_id)
    OR has_role(auth.uid(), 'admin'::app_role)
  );

-- company_members INSERT/UPDATE/DELETE — habilita owner/admin da empresa
DROP POLICY IF EXISTS "Company admins can insert members" ON public.company_members;
CREATE POLICY "Company admins can insert members"
  ON public.company_members FOR INSERT
  WITH CHECK (
    is_company_admin_of(auth.uid(), company_id)
    OR has_role(auth.uid(), 'admin'::app_role)
  );

DROP POLICY IF EXISTS "Company admins can update own company members" ON public.company_members;
CREATE POLICY "Company admins can update own company members"
  ON public.company_members FOR UPDATE
  USING (
    is_company_admin_of(auth.uid(), company_id)
    OR has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    is_company_admin_of(auth.uid(), company_id)
    OR has_role(auth.uid(), 'admin'::app_role)
  );

DROP POLICY IF EXISTS "Company admins can delete members" ON public.company_members;
CREATE POLICY "Company admins can delete members"
  ON public.company_members FOR DELETE
  USING (
    is_company_admin_of(auth.uid(), company_id)
    OR has_role(auth.uid(), 'admin'::app_role)
  );

-- Registrar no changelog (público + interno)
INSERT INTO public.system_changelog (version, title, description, change_type, is_public)
VALUES
  ('6.12', 'Homologação operacional e estabilidade',
   'Correções de isolamento multiempresa nas políticas de exclusão de produtos, endereços e lotes; gestão de membros da própria empresa por owner/admin; ajuste de ordem @import no CSS; auditoria dos fluxos críticos e atualização da documentação.',
   'fix', true),
  ('6.12-internal', 'Auditoria técnica e homologação dos fluxos críticos',
   E'Auditoria da Fase 6.12:\n\n- Corrigidas 6 policies que ainda usavam get_user_company_id (LIMIT 1): products/addresses/lots DELETE e company_members INSERT/UPDATE/DELETE. Agora usam is_company_admin_of + super admin bypass.\n- Corrigido warning do Vite (ordem de @import no index.css).\n- Typecheck: OK. Build: OK. Lint: 252 erros preexistentes (no-explicit-any/no-require-imports) — não são regressão desta fase.\n- RLS revisada tabela por tabela: SELECT/INSERT/UPDATE de todas as tabelas operacionais usam is_member_of + super admin.\n- movements permanece imutável (UPDATE/DELETE = false).\n- Testes multiempresa reais com dados vivos NÃO foram executados automaticamente — dependem de contas A e B controladas.\n- Riscos conhecidos: profiles não permite leitura entre membros da mesma empresa (nomes podem faltar em Activity Log/Suporte para não-admins); e-mail transacional, WhatsApp, cobrança e franquias seguem não implementados conforme roadmap.',
   'security', false);
