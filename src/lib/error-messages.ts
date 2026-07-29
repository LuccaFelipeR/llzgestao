// Traduz erros técnicos (Postgres / Supabase) em mensagens amigáveis em português.
// Sempre chamar via `friendlyError(err)` antes de exibir em toast.

type AnyError = { message?: string; code?: string; details?: string; hint?: string } | Error | unknown;

const RULES: Array<{ test: (m: string, code?: string) => boolean; message: string }> = [
  {
    test: (m) => /products.*sku|sku.*products|idx_products_company_sku/i.test(m),
    message: "Já existe um produto com este SKU nesta empresa. Edite o cadastro existente ou informe outro SKU.",
  },
  {
    test: (m) => /addresses.*code|code.*addresses|idx_addresses_company_code/i.test(m),
    message: "Já existe um endereço com este código nesta empresa. Edite o endereço existente ou informe outro código.",
  },
  {
    test: (m) => /lot_code|idx_lots_company_product_lot/i.test(m),
    message: "Já existe um lote com este código para este produto nesta empresa.",
  },
  {
    test: (m) => /saldo insuficiente|insufficient/i.test(m),
    message: "Não há saldo suficiente para concluir esta saída.",
  },
  {
    test: (m) => /empresa bloqueada/i.test(m),
    message: "Esta empresa está bloqueada e não pode registrar novas operações.",
  },
  {
    test: (m) => /empresa possui dados vinculados|não pode ser excluída/i.test(m),
    message: "Esta empresa possui histórico e não pode ser excluída definitivamente. Utilize Desativar ou Bloquear.",
  },
  {
    test: (m) => /produto pertence a outra empresa|lote pertence a outra empresa|endereço.*outra empresa/i.test(m),
    message: "Dados de outra empresa não podem ser usados nesta operação.",
  },
  {
    test: (m, code) => code === "42501" || /row-level security|permission denied|não possui permissão/i.test(m),
    message: "Você não possui permissão para realizar esta ação.",
  },
  {
    test: (m, code) => code === "23505" || /duplicate key|already exists/i.test(m),
    message: "Já existe um registro com estes dados nesta empresa.",
  },
  {
    test: (m, code) => code === "23503" || /violates foreign key/i.test(m),
    message: "Não é possível concluir: este registro está vinculado a outros dados.",
  },
  // ---- Autenticação (Supabase Auth) ----
  {
    test: (m) => /email not confirmed|not confirmed|email_not_confirmed/i.test(m),
    message: "E-mail ainda não confirmado. Confirme o link enviado para sua caixa de entrada e tente novamente.",
  },
  {
    test: (m) => /user already registered|already been registered|user_already_exists/i.test(m),
    message: "Já existe uma conta com este e-mail. Faça login ou use \"Esqueci minha senha\".",
  },
  {
    test: (m) => /invalid login credentials/i.test(m),
    message: "E-mail ou senha incorretos.",
  },
  {
    test: (m) => /password.*(short|least|weak)|weak_password/i.test(m),
    message: "Senha muito fraca. Use no mínimo 6 caracteres, combinando letras e números.",
  },
  {
    test: (m) => /pwned|leaked|compromised password/i.test(m),
    message: "Esta senha aparece em vazamentos públicos. Escolha outra senha.",
  },
  {
    test: (m) => /rate limit|too many requests|over_email_send_rate_limit/i.test(m),
    message: "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.",
  },
  {
    test: (m) => /(token|link).*(expired|invalid)|otp_expired/i.test(m),
    message: "Este link de confirmação expirou ou já foi utilizado. Solicite um novo e-mail de confirmação.",
  },
  {
    test: (m) => /jwt|not authenticated|invalid token/i.test(m),
    message: "Sua sessão expirou. Faça login novamente.",
  },
];


export function friendlyError(err: AnyError, fallback = "Ocorreu um erro ao processar a operação."): string {
  const anyErr = err as any;
  const raw = (anyErr?.message ?? anyErr?.error_description ?? String(err ?? "")) as string;
  const code = anyErr?.code as string | undefined;
  for (const r of RULES) {
    try {
      if (r.test(raw, code)) return r.message;
    } catch {}
  }
  // Mensagens do próprio banco em português já são úteis
  if (/^[A-ZÁÉÍÓÚÇ]/.test(raw) && raw.length < 200 && !/^error/i.test(raw)) return raw;
  return fallback;
}
