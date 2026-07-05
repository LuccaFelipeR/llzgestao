
-- DELETE policies for company members (owner/admin) on addresses, lots, products
CREATE POLICY "Company admins can delete addresses" ON public.addresses
  FOR DELETE TO authenticated
  USING (
    company_id = public.get_user_company_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.user_id = auth.uid()
        AND cm.company_id = addresses.company_id
        AND cm.role IN ('owner','admin')
    )
  );

CREATE POLICY "Company admins can delete lots" ON public.lots
  FOR DELETE TO authenticated
  USING (
    company_id = public.get_user_company_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.user_id = auth.uid()
        AND cm.company_id = lots.company_id
        AND cm.role IN ('owner','admin')
    )
  );

CREATE POLICY "Company admins can delete products" ON public.products
  FOR DELETE TO authenticated
  USING (
    company_id = public.get_user_company_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.user_id = auth.uid()
        AND cm.company_id = products.company_id
        AND cm.role IN ('owner','admin')
    )
  );

-- Explicit immutability policies for movements (deny update/delete)
CREATE POLICY "Movements are immutable - no update" ON public.movements
  FOR UPDATE TO authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY "Movements are immutable - no delete" ON public.movements
  FOR DELETE TO authenticated
  USING (false);

-- Restrict trigger-only SECURITY DEFINER functions from public API roles
REVOKE EXECUTE ON FUNCTION public.block_writes_for_blocked_companies() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_stock_before_movement() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_movement_activity() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_delete_address_if_referenced() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_delete_product_if_referenced() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.process_movement() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_main_focal_point() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_movement_cross_company() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_lot_dates() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_perishable_rules() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
