
REVOKE EXECUTE ON FUNCTION public.prevent_delete_product_if_referenced() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_delete_address_if_referenced() FROM PUBLIC, anon, authenticated;
