ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'super_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'platform_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'support_agent';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'developer';