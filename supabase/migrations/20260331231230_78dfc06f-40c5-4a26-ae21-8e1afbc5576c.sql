DROP TRIGGER IF EXISTS check_stock_before_movement ON public.movements;
DROP TRIGGER IF EXISTS process_movement_after_insert ON public.movements;
DROP TRIGGER IF EXISTS log_movement_activity_after_insert ON public.movements;

CREATE TRIGGER check_stock_before_movement
  BEFORE INSERT ON public.movements
  FOR EACH ROW
  EXECUTE FUNCTION public.check_stock_before_movement();

CREATE TRIGGER process_movement_after_insert
  AFTER INSERT ON public.movements
  FOR EACH ROW
  EXECUTE FUNCTION public.process_movement();

CREATE TRIGGER log_movement_activity_after_insert
  AFTER INSERT ON public.movements
  FOR EACH ROW
  EXECUTE FUNCTION public.log_movement_activity();