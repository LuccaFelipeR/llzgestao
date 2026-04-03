
-- Reconnect trigger: handle_new_user on auth.users
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Reconnect trigger: check stock before movement
CREATE OR REPLACE TRIGGER check_stock_before_movement
  BEFORE INSERT ON public.movements
  FOR EACH ROW EXECUTE FUNCTION public.check_stock_before_movement();

-- Reconnect trigger: process movement (update stock_balance)
CREATE OR REPLACE TRIGGER process_movement_trigger
  AFTER INSERT ON public.movements
  FOR EACH ROW EXECUTE FUNCTION public.process_movement();

-- Reconnect trigger: log movement activity
CREATE OR REPLACE TRIGGER log_movement_activity_trigger
  AFTER INSERT ON public.movements
  FOR EACH ROW EXECUTE FUNCTION public.log_movement_activity();
