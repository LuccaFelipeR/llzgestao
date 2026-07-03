
CREATE OR REPLACE FUNCTION public.prevent_delete_product_if_referenced()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_stock NUMERIC; v_mov INT; v_lots INT;
BEGIN
  SELECT COALESCE(SUM(qty),0) INTO v_stock FROM public.stock_balance WHERE product_id = OLD.id AND qty > 0;
  IF v_stock > 0 THEN RAISE EXCEPTION 'Não é possível excluir: produto possui % unidade(s) em estoque. Zere o estoque antes.', v_stock; END IF;
  SELECT COUNT(*) INTO v_mov FROM public.movements WHERE product_id = OLD.id;
  IF v_mov > 0 THEN RAISE EXCEPTION 'Não é possível excluir: produto possui % movimento(s) no histórico. Movimentos são imutáveis; desative o produto.', v_mov; END IF;
  SELECT COUNT(*) INTO v_lots FROM public.lots WHERE product_id = OLD.id;
  IF v_lots > 0 THEN RAISE EXCEPTION 'Não é possível excluir: produto possui % lote(s) vinculado(s).', v_lots; END IF;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS trg_prevent_delete_product ON public.products;
CREATE TRIGGER trg_prevent_delete_product BEFORE DELETE ON public.products FOR EACH ROW EXECUTE FUNCTION public.prevent_delete_product_if_referenced();

CREATE OR REPLACE FUNCTION public.prevent_delete_address_if_referenced()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_stock NUMERIC; v_mov INT;
BEGIN
  SELECT COALESCE(SUM(qty),0) INTO v_stock FROM public.stock_balance WHERE address_id = OLD.id AND qty > 0;
  IF v_stock > 0 THEN RAISE EXCEPTION 'Não é possível excluir: endereço possui % unidade(s) em estoque.', v_stock; END IF;
  SELECT COUNT(*) INTO v_mov FROM public.movements WHERE from_address_id = OLD.id OR to_address_id = OLD.id;
  IF v_mov > 0 THEN RAISE EXCEPTION 'Não é possível excluir: endereço aparece em % movimento(s) do histórico. Desative o endereço.', v_mov; END IF;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS trg_prevent_delete_address ON public.addresses;
CREATE TRIGGER trg_prevent_delete_address BEFORE DELETE ON public.addresses FOR EACH ROW EXECUTE FUNCTION public.prevent_delete_address_if_referenced();

INSERT INTO public.system_changelog (version, title, description, change_type, affected_modules, is_public)
VALUES (
  '6.1.0',
  'Correções administrativas e exclusões seguras',
  'Botões de excluir produto e endereço adicionados, com bloqueio automático quando há estoque, movimentos ou lotes vinculados. Corrigidos bugs de formatação e da análise "Visão Global" em IA Insights. Painel administrativo permite vincular usuários a empresas por e-mail.',
  'feature',
  ARRAY['admin','products','addresses','ai'],
  true
);
