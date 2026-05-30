-- 1) system_changelog table
DO $$ BEGIN
  CREATE TYPE public.changelog_change_type AS ENUM ('feature','fix','security','database','ui','performance','refactor');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.system_changelog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version TEXT,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  change_type public.changelog_change_type NOT NULL DEFAULT 'feature',
  affected_modules TEXT[] NOT NULL DEFAULT '{}',
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.system_changelog TO authenticated;
GRANT ALL ON public.system_changelog TO service_role;

ALTER TABLE public.system_changelog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read changelog" ON public.system_changelog;
CREATE POLICY "Authenticated can read changelog" ON public.system_changelog
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Super admins manage changelog" ON public.system_changelog;
CREATE POLICY "Super admins manage changelog" ON public.system_changelog
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_changelog_created_at ON public.system_changelog(created_at DESC);

-- 2) Extend activity_log
ALTER TABLE public.activity_log
  ADD COLUMN IF NOT EXISTS previous_data JSONB,
  ADD COLUMN IF NOT EXISTS new_data JSONB,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

DROP POLICY IF EXISTS "Super admins read all activity_log" ON public.activity_log;
CREATE POLICY "Super admins read all activity_log" ON public.activity_log
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_activity_log_company_created ON public.activity_log(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_action ON public.activity_log(action);

-- 3) Seed changelog
INSERT INTO public.system_changelog (version, title, description, change_type, affected_modules)
SELECT v.version, v.title, v.description, v.change_type::public.changelog_change_type, v.affected_modules
FROM (VALUES
  ('1.0','Fase 1 — Hardening Multi-Tenant',
   'Adicionados campos completos em companies (CNPJ, status, focal point, limites), unicidade por empresa em produtos/endereços/lotes, triggers de validação cross-company e bloqueio de writes para empresas bloqueadas. Movimentos permanecem imutáveis e estoque negativo continua bloqueado.',
   'security', ARRAY['companies','products','addresses','lots','movements']),
  ('2.0','Fase 2 — Maturidade de Produto e Lote',
   'Novos campos de classificação (perecível, controle de lote, controle de validade, vida útil, temperatura). Lotes ganharam manufacturing_date, fornecedor, nota fiscal, status e validações de data. Recebimento adaptativo conforme as regras do produto.',
   'feature', ARRAY['products','lots','receiving']),
  ('3.0','Fase 3 — Gestão de Empresas e Focal Point',
   'Painel admin expandido com detalhes da empresa, gestão de focal point único, seletor de empresa no header para super admins e bloqueio de operações para empresas sem vínculo.',
   'feature', ARRAY['admin','companies','auth']),
  ('4.0','Fase 4 — Auditoria, Changelog e Data Quality',
   'Nova tabela system_changelog, activity_log estendido (previous_data, new_data, metadata) e Data Quality Center com 20+ verificações de integridade. Páginas admin: Changelog, Data Quality e Audit Logs.',
   'feature', ARRAY['admin','audit','data-quality'])
) AS v(version,title,description,change_type,affected_modules)
WHERE NOT EXISTS (SELECT 1 FROM public.system_changelog s WHERE s.title = v.title);