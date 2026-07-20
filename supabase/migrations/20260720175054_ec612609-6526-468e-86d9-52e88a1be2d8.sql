
DROP TRIGGER IF EXISTS trg_support_tickets_updated_at ON public.support_tickets;
CREATE TRIGGER trg_support_tickets_updated_at
BEFORE UPDATE ON public.support_tickets
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.bump_ticket_on_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  UPDATE public.support_tickets SET updated_at = now() WHERE id = NEW.ticket_id;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_bump_ticket_on_message ON public.support_ticket_messages;
CREATE TRIGGER trg_bump_ticket_on_message
AFTER INSERT ON public.support_ticket_messages
FOR EACH ROW EXECUTE FUNCTION public.bump_ticket_on_message();

CREATE OR REPLACE FUNCTION public.protect_support_ticket_updates()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_is_admin boolean;
BEGIN
  v_is_admin := public.has_role(auth.uid(), 'admin'::app_role);
  IF v_is_admin THEN
    IF NEW.status = 'closed' AND OLD.status <> 'closed' AND NEW.closed_at IS NULL THEN
      NEW.closed_at := now();
    END IF;
    IF NEW.status <> 'closed' AND OLD.status = 'closed' THEN
      NEW.closed_at := NULL;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.company_id <> OLD.company_id THEN RAISE EXCEPTION 'Não é permitido alterar a empresa do chamado'; END IF;
  IF NEW.created_by <> OLD.created_by THEN RAISE EXCEPTION 'Não é permitido alterar o autor do chamado'; END IF;
  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN RAISE EXCEPTION 'Somente a equipe LLZ pode alterar o responsável'; END IF;
  IF NEW.priority <> OLD.priority THEN RAISE EXCEPTION 'Somente a equipe LLZ pode alterar a prioridade'; END IF;
  IF NEW.status <> OLD.status THEN
    IF NOT (OLD.status = 'resolved' AND NEW.status = 'in_progress' AND OLD.created_by = auth.uid()) THEN
      RAISE EXCEPTION 'Somente a equipe LLZ pode alterar o status deste chamado';
    END IF;
  END IF;
  IF NEW.closed_at IS DISTINCT FROM OLD.closed_at THEN RAISE EXCEPTION 'Não é permitido alterar a data de fechamento'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_protect_support_ticket_updates ON public.support_tickets;
CREATE TRIGGER trg_protect_support_ticket_updates
BEFORE UPDATE ON public.support_tickets
FOR EACH ROW EXECUTE FUNCTION public.protect_support_ticket_updates();

CREATE OR REPLACE FUNCTION public.log_support_ticket_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.activity_log (user_id, action, entity_type, entity_id, details, company_id)
    VALUES (auth.uid(), 'support_ticket_created', 'support_ticket', NEW.id::text,
            jsonb_build_object('title', NEW.title, 'category', NEW.category, 'priority', NEW.priority), NEW.company_id);
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.status <> OLD.status THEN
      INSERT INTO public.activity_log (user_id, action, entity_type, entity_id, details, company_id)
      VALUES (auth.uid(), 'support_ticket_status_changed', 'support_ticket', NEW.id::text,
              jsonb_build_object('from', OLD.status, 'to', NEW.status), NEW.company_id);
    END IF;
    IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
      INSERT INTO public.activity_log (user_id, action, entity_type, entity_id, details, company_id)
      VALUES (auth.uid(), 'support_ticket_assigned', 'support_ticket', NEW.id::text,
              jsonb_build_object('to', NEW.assigned_to), NEW.company_id);
    END IF;
    IF NEW.priority <> OLD.priority THEN
      INSERT INTO public.activity_log (user_id, action, entity_type, entity_id, details, company_id)
      VALUES (auth.uid(), 'support_ticket_priority_changed', 'support_ticket', NEW.id::text,
              jsonb_build_object('from', OLD.priority, 'to', NEW.priority), NEW.company_id);
    END IF;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_log_support_ticket_activity ON public.support_tickets;
CREATE TRIGGER trg_log_support_ticket_activity
AFTER INSERT OR UPDATE ON public.support_tickets
FOR EACH ROW EXECUTE FUNCTION public.log_support_ticket_activity();

CREATE OR REPLACE FUNCTION public.log_support_ticket_message_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_company_id uuid;
BEGIN
  SELECT company_id INTO v_company_id FROM public.support_tickets WHERE id = NEW.ticket_id;
  INSERT INTO public.activity_log (user_id, action, entity_type, entity_id, details, company_id)
  VALUES (auth.uid(),
          CASE WHEN NEW.is_internal THEN 'support_ticket_internal_note' ELSE 'support_ticket_reply' END,
          'support_ticket', NEW.ticket_id::text,
          jsonb_build_object('is_internal', NEW.is_internal), v_company_id);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_log_support_ticket_message_activity ON public.support_ticket_messages;
CREATE TRIGGER trg_log_support_ticket_message_activity
AFTER INSERT ON public.support_ticket_messages
FOR EACH ROW EXECUTE FUNCTION public.log_support_ticket_message_activity();

INSERT INTO public.system_changelog (version, title, description, change_type, affected_modules, is_public) VALUES
('6.9', 'Central de Suporte da LLZ',
 'Nova Central de Suporte para abertura, acompanhamento e resposta de chamados, com isolamento por empresa e gestão administrativa.',
 'feature'::changelog_change_type, ARRAY['suporte','admin'], true),
('6.9-internal', 'Implementação técnica da Central de Suporte',
 'Páginas /suporte (cliente) e /admin/suporte (super admin). Triggers de proteção de campos sensíveis, auto updated_at, bump do ticket em nova mensagem, activity_log completo. RLS validada sem enfraquecimento. Notificações internas ficaram para próxima fase.',
 'security'::changelog_change_type, ARRAY['suporte','admin','activity_log'], false);
