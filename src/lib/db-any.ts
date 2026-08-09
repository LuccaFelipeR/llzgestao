/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from "@/integrations/supabase/client";

/**
 * Acesso ao cliente sem os tipos gerados — usado apenas para tabelas/RPCs
 * criadas depois da última geração de tipos. Isolado aqui para não espalhar
 * `any` pelos componentes.
 */
export const sb = supabase as any;

/** Executa uma RPC que devolve { ok, error } e converte falha lógica em Error. */
export async function rpcOk(name: string, args: Record<string, unknown>) {
  const { data, error } = await sb.rpc(name, args);
  if (error) throw error;
  if (data && data.ok === false) throw new Error(data.error ?? "Operação não permitida.");
  return data;
}
