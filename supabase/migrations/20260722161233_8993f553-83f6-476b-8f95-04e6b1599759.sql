
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS controls_batch boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS controls_expiration boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS handles_perishables boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS uses_addressing boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS uses_expedition boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS plans_csv_import boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS segment text,
  ADD COLUMN IF NOT EXISTS estimated_size text,
  ADD COLUMN IF NOT EXISTS estimated_users text,
  ADD COLUMN IF NOT EXISTS onboarding_step integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS onboarding_status text NOT NULL DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS activation_checklist_dismissed boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.log_company_settings_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_changes jsonb;
BEGIN
  IF NEW.onboarding_status IS DISTINCT FROM OLD.onboarding_status THEN
    INSERT INTO public.activity_log (user_id, action, entity_type, entity_id, details, company_id)
    VALUES (auth.uid(),
      CASE NEW.onboarding_status
        WHEN 'in_progress' THEN 'onboarding_started'
        WHEN 'completed'   THEN 'onboarding_completed'
        WHEN 'skipped'     THEN 'onboarding_skipped'
        ELSE 'onboarding_status_changed'
      END,
      'company', NEW.id::text,
      jsonb_build_object('from', OLD.onboarding_status, 'to', NEW.onboarding_status),
      NEW.id);
  END IF;

  IF NEW.controls_batch      IS DISTINCT FROM OLD.controls_batch
  OR NEW.controls_expiration IS DISTINCT FROM OLD.controls_expiration
  OR NEW.handles_perishables IS DISTINCT FROM OLD.handles_perishables
  OR NEW.uses_addressing     IS DISTINCT FROM OLD.uses_addressing
  OR NEW.uses_expedition     IS DISTINCT FROM OLD.uses_expedition
  OR NEW.plans_csv_import    IS DISTINCT FROM OLD.plans_csv_import
  OR NEW.segment             IS DISTINCT FROM OLD.segment
  OR NEW.estimated_size      IS DISTINCT FROM OLD.estimated_size
  OR NEW.estimated_users     IS DISTINCT FROM OLD.estimated_users THEN
    v_changes := jsonb_strip_nulls(jsonb_build_object(
      'controls_batch',      CASE WHEN NEW.controls_batch      IS DISTINCT FROM OLD.controls_batch      THEN jsonb_build_object('from', OLD.controls_batch,      'to', NEW.controls_batch)      END,
      'controls_expiration', CASE WHEN NEW.controls_expiration IS DISTINCT FROM OLD.controls_expiration THEN jsonb_build_object('from', OLD.controls_expiration, 'to', NEW.controls_expiration) END,
      'handles_perishables', CASE WHEN NEW.handles_perishables IS DISTINCT FROM OLD.handles_perishables THEN jsonb_build_object('from', OLD.handles_perishables, 'to', NEW.handles_perishables) END,
      'uses_addressing',     CASE WHEN NEW.uses_addressing     IS DISTINCT FROM OLD.uses_addressing     THEN jsonb_build_object('from', OLD.uses_addressing,     'to', NEW.uses_addressing)     END,
      'uses_expedition',     CASE WHEN NEW.uses_expedition     IS DISTINCT FROM OLD.uses_expedition     THEN jsonb_build_object('from', OLD.uses_expedition,     'to', NEW.uses_expedition)     END,
      'plans_csv_import',    CASE WHEN NEW.plans_csv_import    IS DISTINCT FROM OLD.plans_csv_import    THEN jsonb_build_object('from', OLD.plans_csv_import,    'to', NEW.plans_csv_import)    END,
      'segment',             CASE WHEN NEW.segment             IS DISTINCT FROM OLD.segment             THEN jsonb_build_object('from', OLD.segment,             'to', NEW.segment)             END,
      'estimated_size',      CASE WHEN NEW.estimated_size      IS DISTINCT FROM OLD.estimated_size      THEN jsonb_build_object('from', OLD.estimated_size,      'to', NEW.estimated_size)      END,
      'estimated_users',     CASE WHEN NEW.estimated_users     IS DISTINCT FROM OLD.estimated_users     THEN jsonb_build_object('from', OLD.estimated_users,     'to', NEW.estimated_users)     END
    ));
    INSERT INTO public.activity_log (user_id, action, entity_type, entity_id, details, company_id)
    VALUES (auth.uid(), 'company_settings_changed', 'company', NEW.id::text, v_changes, NEW.id);
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_log_company_settings_change ON public.companies;
CREATE TRIGGER trg_log_company_settings_change
AFTER UPDATE ON public.companies
FOR EACH ROW EXECUTE FUNCTION public.log_company_settings_change();

UPDATE public.companies
   SET onboarding_status = 'completed',
       onboarding_completed_at = COALESCE(onboarding_completed_at, updated_at, now())
 WHERE onboarding_completed = true
   AND onboarding_status = 'not_started';

INSERT INTO public.system_changelog (version, title, description, change_type, is_public, created_at)
VALUES
  ('6.10',
   'Onboarding inteligente e ativação da empresa',
   'Nova experiência de configuração inicial com perguntas vinculadas a comportamentos reais, checklist de ativação e acompanhamento do progresso da empresa.',
   'feature'::changelog_change_type, true, now()),
  ('6.10-internal',
   'Configurações operacionais e regras do onboarding',
   'Colunas em companies (controls_batch, controls_expiration, handles_perishables, uses_addressing, uses_expedition, plans_csv_import, segment, estimated_size, estimated_users, onboarding_step, onboarding_status, onboarding_completed_at, activation_checklist_dismissed). Trigger log_company_settings_change registra transições e mudanças no activity_log. Backfill marca completed empresas com onboarding_completed=true. Checklist calculado no frontend com dados reais. Painel de configurações em /configuracoes. Admin exibe progresso de ativação.',
   'database'::changelog_change_type, false, now());
