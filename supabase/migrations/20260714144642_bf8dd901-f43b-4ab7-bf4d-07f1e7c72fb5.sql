
CREATE OR REPLACE FUNCTION public.prevent_delete_company_if_referenced()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_total int;
BEGIN
  SELECT
    (SELECT COUNT(*) FROM public.products        WHERE company_id = OLD.id)
  + (SELECT COUNT(*) FROM public.addresses       WHERE company_id = OLD.id)
  + (SELECT COUNT(*) FROM public.lots            WHERE company_id = OLD.id)
  + (SELECT COUNT(*) FROM public.stock_balance   WHERE company_id = OLD.id)
  + (SELECT COUNT(*) FROM public.movements       WHERE company_id = OLD.id)
  + (SELECT COUNT(*) FROM public.company_members WHERE company_id = OLD.id)
  + (SELECT COUNT(*) FROM public.notifications   WHERE company_id = OLD.id)
  + (SELECT COUNT(*) FROM public.picking_lists   WHERE company_id = OLD.id)
  + (SELECT COUNT(*) FROM public.activity_log    WHERE company_id = OLD.id)
  INTO v_total;
  IF v_total > 0 THEN
    RAISE EXCEPTION 'Esta empresa possui dados vinculados e não pode ser excluída definitivamente. Para preservar o histórico, use Desativar ou Bloquear.' USING ERRCODE='P0001';
  END IF;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_prevent_delete_company ON public.companies;
CREATE TRIGGER trg_prevent_delete_company
BEFORE DELETE ON public.companies
FOR EACH ROW EXECUTE FUNCTION public.prevent_delete_company_if_referenced();

CREATE OR REPLACE FUNCTION public.log_company_status_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_action text;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    v_action := CASE NEW.status::text
      WHEN 'blocked'  THEN 'company_blocked'
      WHEN 'active'   THEN 'company_restored'
      WHEN 'inactive' THEN 'company_deactivated'
      WHEN 'trial'    THEN 'company_trial'
      ELSE 'company_status_changed'
    END;
    INSERT INTO public.activity_log (user_id, action, entity_type, entity_id, details, company_id)
    VALUES (auth.uid(), v_action, 'company', NEW.id::text,
            jsonb_build_object('from', OLD.status, 'to', NEW.status), NEW.id);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_log_company_status ON public.companies;
CREATE TRIGGER trg_log_company_status
AFTER UPDATE OF status ON public.companies
FOR EACH ROW EXECUTE FUNCTION public.log_company_status_change();

DO $$ BEGIN
  CREATE TYPE public.support_ticket_status AS ENUM ('open','in_progress','waiting_customer','resolved','closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.support_ticket_priority AS ENUM ('low','medium','high','critical');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  assigned_to uuid REFERENCES auth.users(id),
  title text NOT NULL,
  description text NOT NULL,
  category text NOT NULL DEFAULT 'other',
  priority public.support_ticket_priority NOT NULL DEFAULT 'medium',
  status public.support_ticket_status NOT NULL DEFAULT 'open',
  module text,
  contact_email text,
  contact_phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.support_tickets TO authenticated;
GRANT ALL ON public.support_tickets TO service_role;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read own company tickets" ON public.support_tickets;
CREATE POLICY "Members read own company tickets" ON public.support_tickets
  FOR SELECT TO authenticated
  USING (public.is_member_of(auth.uid(), company_id) OR public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "Members create tickets for their company" ON public.support_tickets;
CREATE POLICY "Members create tickets for their company" ON public.support_tickets
  FOR INSERT TO authenticated
  WITH CHECK (public.is_member_of(auth.uid(), company_id) AND created_by = auth.uid());

DROP POLICY IF EXISTS "Members update own company tickets" ON public.support_tickets;
CREATE POLICY "Members update own company tickets" ON public.support_tickets
  FOR UPDATE TO authenticated
  USING (public.is_member_of(auth.uid(), company_id) OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.is_member_of(auth.uid(), company_id) OR public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "Super admin deletes tickets" ON public.support_tickets;
CREATE POLICY "Super admin deletes tickets" ON public.support_tickets
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

DROP TRIGGER IF EXISTS update_support_tickets_updated_at ON public.support_tickets;
CREATE TRIGGER update_support_tickets_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.support_ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id),
  message text NOT NULL,
  is_internal boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.support_ticket_messages TO authenticated;
GRANT ALL ON public.support_ticket_messages TO service_role;
ALTER TABLE public.support_ticket_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read messages of accessible tickets" ON public.support_ticket_messages;
CREATE POLICY "Read messages of accessible tickets" ON public.support_ticket_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.support_tickets t WHERE t.id = ticket_id
      AND (public.is_member_of(auth.uid(), t.company_id) OR public.has_role(auth.uid(),'admin')))
    AND (is_internal = false OR public.has_role(auth.uid(),'admin'))
  );

DROP POLICY IF EXISTS "Insert messages on accessible tickets" ON public.support_ticket_messages;
CREATE POLICY "Insert messages on accessible tickets" ON public.support_ticket_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.support_tickets t WHERE t.id = ticket_id
      AND (public.is_member_of(auth.uid(), t.company_id) OR public.has_role(auth.uid(),'admin')))
    AND (is_internal = false OR public.has_role(auth.uid(),'admin'))
  );

CREATE INDEX IF NOT EXISTS idx_support_tickets_company ON public.support_tickets(company_id);
CREATE INDEX IF NOT EXISTS idx_support_ticket_messages_ticket ON public.support_ticket_messages(ticket_id);

INSERT INTO public.system_changelog (version, title, change_type, is_public, description, affected_modules)
VALUES
  ('6.8', 'Prontidão comercial e melhorias operacionais', 'feature', true,
   'Exclusão de empresas passa a ser segura: empresas com histórico não podem mais ser apagadas — devem ser desativadas ou bloqueadas para preservar dados. Novas mensagens de erro em português para operações comuns. Base da Central de Suporte disponível para chamados internos.',
   ARRAY['admin','empresas','suporte','mensagens']),
  ('6.8-internal', 'Ajustes técnicos: guard de hard-delete, auditoria de status, tickets', 'security', false,
   'Trigger prevent_delete_company_if_referenced bloqueia DELETE físico quando existem dados vinculados. Novo trigger log_company_status_change registra transições de status no activity_log. Tabelas support_tickets e support_ticket_messages criadas com RLS por company + role, notas internas restritas a super admin.',
   ARRAY['db','rls','triggers','support']);
