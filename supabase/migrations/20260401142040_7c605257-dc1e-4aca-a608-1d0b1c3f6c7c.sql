
-- Recreate all missing triggers

-- 1. Auth trigger for new user profile creation
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 2. Check stock before OUT/TRANSFER
DROP TRIGGER IF EXISTS check_stock_before_movement ON public.movements;
CREATE TRIGGER check_stock_before_movement
  BEFORE INSERT ON public.movements
  FOR EACH ROW
  EXECUTE FUNCTION public.check_stock_before_movement();

-- 3. Process movement (update stock_balance)
DROP TRIGGER IF EXISTS process_movement_after_insert ON public.movements;
CREATE TRIGGER process_movement_after_insert
  AFTER INSERT ON public.movements
  FOR EACH ROW
  EXECUTE FUNCTION public.process_movement();

-- 4. Log activity
DROP TRIGGER IF EXISTS log_movement_activity_after_insert ON public.movements;
CREATE TRIGGER log_movement_activity_after_insert
  AFTER INSERT ON public.movements
  FOR EACH ROW
  EXECUTE FUNCTION public.log_movement_activity();
