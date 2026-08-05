-- Substitui as RULES DO INSTEAD NOTHING por triggers que respeitam o modo de limpeza
DROP RULE IF EXISTS prevent_movement_delete ON public.movements;
DROP RULE IF EXISTS prevent_movement_update ON public.movements;

CREATE OR REPLACE FUNCTION public.prevent_movement_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Durante a limpeza administrativa autorizada, permite a remoção
  IF coalesce(current_setting('app.cleanup_mode', true), '') = 'on' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  -- Fora dela, movimentações permanecem imutáveis (operação ignorada)
  RETURN NULL;
END $$;

REVOKE ALL ON FUNCTION public.prevent_movement_mutation() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_prevent_movement_delete
BEFORE DELETE ON public.movements
FOR EACH ROW EXECUTE FUNCTION public.prevent_movement_mutation();

CREATE TRIGGER trg_prevent_movement_update
BEFORE UPDATE ON public.movements
FOR EACH ROW EXECUTE FUNCTION public.prevent_movement_mutation();