
-- Disable only user-defined triggers
ALTER TABLE public.movements DISABLE TRIGGER check_stock_before_movement;
ALTER TABLE public.movements DISABLE TRIGGER process_movement_after_insert;
ALTER TABLE public.movements DISABLE TRIGGER log_movement_activity_after_insert;

-- Clean data using TRUNCATE CASCADE
TRUNCATE public.movements CASCADE;
TRUNCATE public.stock_balance CASCADE;
TRUNCATE public.activity_log CASCADE;
TRUNCATE public.lots CASCADE;
TRUNCATE public.user_roles CASCADE;
TRUNCATE public.profiles CASCADE;
DELETE FROM auth.users;

-- Re-enable triggers
ALTER TABLE public.movements ENABLE TRIGGER check_stock_before_movement;
ALTER TABLE public.movements ENABLE TRIGGER process_movement_after_insert;
ALTER TABLE public.movements ENABLE TRIGGER log_movement_activity_after_insert;

-- Add product fields
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS barcode text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS min_stock numeric NOT NULL DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS price numeric NOT NULL DEFAULT 0;

-- Add notification settings to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS whatsapp_number text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS notify_min_stock boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS notify_daily_summary boolean NOT NULL DEFAULT false;
