
-- 1. Tighten changelog RLS: add is_public field; only admins read full, others read public only
ALTER TABLE public.system_changelog ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT true;

DROP POLICY IF EXISTS "Authenticated can read changelog" ON public.system_changelog;
DROP POLICY IF EXISTS "Super admins manage changelog" ON public.system_changelog;

CREATE POLICY "Public changelog entries readable by all"
  ON public.system_changelog FOR SELECT TO authenticated
  USING (is_public = true);

CREATE POLICY "Admins read all changelog"
  ON public.system_changelog FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins insert changelog"
  ON public.system_changelog FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins update changelog"
  ON public.system_changelog FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins delete changelog"
  ON public.system_changelog FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- 2. Notifications table for in-app alerts
DO $$ BEGIN
  CREATE TYPE public.notification_severity AS ENUM ('info','warning','critical');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid,
  user_id uuid,
  title text NOT NULL,
  message text,
  category text NOT NULL DEFAULT 'system',
  severity public.notification_severity NOT NULL DEFAULT 'info',
  is_read boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_company ON public.notifications(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read company notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (
    (company_id IS NOT NULL AND company_id = get_user_company_id(auth.uid()))
    OR user_id = auth.uid()
    OR has_role(auth.uid(),'admin'::app_role)
  );

CREATE POLICY "Users mark notifications read"
  ON public.notifications FOR UPDATE TO authenticated
  USING (
    (company_id IS NOT NULL AND company_id = get_user_company_id(auth.uid()))
    OR user_id = auth.uid()
    OR has_role(auth.uid(),'admin'::app_role)
  );

CREATE POLICY "Admins insert notifications"
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(),'admin'::app_role)
    OR (company_id IS NOT NULL AND company_id = get_user_company_id(auth.uid()))
  );
