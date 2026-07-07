
-- =========================================================================
-- Phase 6.7.1 — Membership-based multi-tenant RLS
-- =========================================================================

-- 1) Membership helper (SECURITY DEFINER, avoids RLS recursion on company_members)
CREATE OR REPLACE FUNCTION public.is_member_of(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.company_members
    WHERE user_id = _user_id AND company_id = _company_id
  )
$$;

REVOKE ALL ON FUNCTION public.is_member_of(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_member_of(uuid, uuid) TO authenticated, anon;

-- =========================================================================
-- PRODUCTS
-- =========================================================================
DROP POLICY IF EXISTS "Users can read company products" ON public.products;
DROP POLICY IF EXISTS "Users can insert company products" ON public.products;
DROP POLICY IF EXISTS "Users can update company products" ON public.products;

CREATE POLICY "Members or super admin read products"
  ON public.products FOR SELECT TO authenticated
  USING (public.is_member_of(auth.uid(), company_id) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Members or super admin insert products"
  ON public.products FOR INSERT TO authenticated
  WITH CHECK (public.is_member_of(auth.uid(), company_id) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Members or super admin update products"
  ON public.products FOR UPDATE TO authenticated
  USING (public.is_member_of(auth.uid(), company_id) OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.is_member_of(auth.uid(), company_id) OR public.has_role(auth.uid(), 'admin'));

-- DELETE policy (owner/admin scoped) stays as-is.

-- =========================================================================
-- ADDRESSES
-- =========================================================================
DROP POLICY IF EXISTS "Users can read company addresses" ON public.addresses;
DROP POLICY IF EXISTS "Users can insert company addresses" ON public.addresses;
DROP POLICY IF EXISTS "Users can update company addresses" ON public.addresses;

CREATE POLICY "Members or super admin read addresses"
  ON public.addresses FOR SELECT TO authenticated
  USING (public.is_member_of(auth.uid(), company_id) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Members or super admin insert addresses"
  ON public.addresses FOR INSERT TO authenticated
  WITH CHECK (public.is_member_of(auth.uid(), company_id) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Members or super admin update addresses"
  ON public.addresses FOR UPDATE TO authenticated
  USING (public.is_member_of(auth.uid(), company_id) OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.is_member_of(auth.uid(), company_id) OR public.has_role(auth.uid(), 'admin'));

-- =========================================================================
-- LOTS
-- =========================================================================
DROP POLICY IF EXISTS "Users can read company lots" ON public.lots;
DROP POLICY IF EXISTS "Users can insert company lots" ON public.lots;
DROP POLICY IF EXISTS "Users can update company lots" ON public.lots;

CREATE POLICY "Members or super admin read lots"
  ON public.lots FOR SELECT TO authenticated
  USING (public.is_member_of(auth.uid(), company_id) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Members or super admin insert lots"
  ON public.lots FOR INSERT TO authenticated
  WITH CHECK (public.is_member_of(auth.uid(), company_id) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Members or super admin update lots"
  ON public.lots FOR UPDATE TO authenticated
  USING (public.is_member_of(auth.uid(), company_id) OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.is_member_of(auth.uid(), company_id) OR public.has_role(auth.uid(), 'admin'));

-- =========================================================================
-- STOCK BALANCE  (writes stay trigger-only; SELECT opens to members/admin)
-- =========================================================================
DROP POLICY IF EXISTS "Users can read company stock" ON public.stock_balance;

CREATE POLICY "Members or super admin read stock"
  ON public.stock_balance FOR SELECT TO authenticated
  USING (public.is_member_of(auth.uid(), company_id) OR public.has_role(auth.uid(), 'admin'));

-- =========================================================================
-- MOVEMENTS  (immutability preserved: UPDATE/DELETE stay false)
-- =========================================================================
DROP POLICY IF EXISTS "Users can read company movements" ON public.movements;
DROP POLICY IF EXISTS "Users can insert company movements" ON public.movements;

CREATE POLICY "Members or super admin read movements"
  ON public.movements FOR SELECT TO authenticated
  USING (public.is_member_of(auth.uid(), company_id) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Members or super admin insert movements"
  ON public.movements FOR INSERT TO authenticated
  WITH CHECK (public.is_member_of(auth.uid(), company_id) OR public.has_role(auth.uid(), 'admin'));

-- UPDATE (false) and DELETE (false) immutability policies stay untouched.

-- =========================================================================
-- NOTIFICATIONS
-- =========================================================================
DROP POLICY IF EXISTS "Users read company notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users mark notifications read" ON public.notifications;
DROP POLICY IF EXISTS "Admins insert notifications" ON public.notifications;

CREATE POLICY "Members or super admin read notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (
    (company_id IS NOT NULL AND public.is_member_of(auth.uid(), company_id))
    OR user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Members or super admin update notifications"
  ON public.notifications FOR UPDATE TO authenticated
  USING (
    (company_id IS NOT NULL AND public.is_member_of(auth.uid(), company_id))
    OR user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
  )
  WITH CHECK (
    (company_id IS NOT NULL AND public.is_member_of(auth.uid(), company_id))
    OR user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Members or super admin insert notifications"
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR (company_id IS NOT NULL AND public.is_member_of(auth.uid(), company_id))
  );

-- =========================================================================
-- PICKING LISTS + ITEMS
-- =========================================================================
DROP POLICY IF EXISTS picking_lists_select ON public.picking_lists;
DROP POLICY IF EXISTS picking_lists_insert ON public.picking_lists;
DROP POLICY IF EXISTS picking_lists_update ON public.picking_lists;
DROP POLICY IF EXISTS picking_lists_delete ON public.picking_lists;

CREATE POLICY picking_lists_select ON public.picking_lists FOR SELECT TO authenticated
  USING (public.is_member_of(auth.uid(), company_id) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY picking_lists_insert ON public.picking_lists FOR INSERT TO authenticated
  WITH CHECK (public.is_member_of(auth.uid(), company_id) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY picking_lists_update ON public.picking_lists FOR UPDATE TO authenticated
  USING (public.is_member_of(auth.uid(), company_id) OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.is_member_of(auth.uid(), company_id) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY picking_lists_delete ON public.picking_lists FOR DELETE TO authenticated
  USING (public.is_member_of(auth.uid(), company_id) OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS picking_items_select ON public.picking_list_items;
DROP POLICY IF EXISTS picking_items_insert ON public.picking_list_items;
DROP POLICY IF EXISTS picking_items_update ON public.picking_list_items;
DROP POLICY IF EXISTS picking_items_delete ON public.picking_list_items;

CREATE POLICY picking_items_select ON public.picking_list_items FOR SELECT TO authenticated
  USING (public.is_member_of(auth.uid(), company_id) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY picking_items_insert ON public.picking_list_items FOR INSERT TO authenticated
  WITH CHECK (public.is_member_of(auth.uid(), company_id) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY picking_items_update ON public.picking_list_items FOR UPDATE TO authenticated
  USING (public.is_member_of(auth.uid(), company_id) OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.is_member_of(auth.uid(), company_id) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY picking_items_delete ON public.picking_list_items FOR DELETE TO authenticated
  USING (public.is_member_of(auth.uid(), company_id) OR public.has_role(auth.uid(), 'admin'));

-- =========================================================================
-- COMPANY MEMBERS  (broaden SELECT to any member of same company + super admin)
-- =========================================================================
DROP POLICY IF EXISTS "Members can view company members" ON public.company_members;

CREATE POLICY "Members or super admin view company members"
  ON public.company_members FOR SELECT TO authenticated
  USING (public.is_member_of(auth.uid(), company_id) OR public.has_role(auth.uid(), 'admin') OR user_id = auth.uid());

-- INSERT/UPDATE/DELETE policies on company_members remain admin-scoped
-- (activity_log policy for company owners is intentionally deferred to 6.7.2)
