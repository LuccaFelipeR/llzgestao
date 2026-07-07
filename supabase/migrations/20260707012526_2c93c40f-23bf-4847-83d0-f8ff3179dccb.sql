
INSERT INTO public.system_changelog (version, title, description, change_type, affected_modules, is_public)
VALUES
(
  '6.7.2',
  'Correção de filtros por empresa e aba Atividades',
  E'Melhorias e correções aplicadas para reforçar o isolamento por empresa em toda a interface operacional:\n\n- Todas as páginas operacionais (Produtos, Endereços, Movimentações, Scanner, Recebimento Guiado, Expedição, Picking, Consulta de Estoque, Dashboard, Alertas) agora aplicam filtro explícito por empresa selecionada.\n- Componentes do painel (Saúde do Estoque, Alertas de Validade, Ações Urgentes, Busca Conversacional) passam a respeitar a empresa ativa.\n- Novo bloco "Nenhuma empresa selecionada" impede visualização de dados sem contexto de empresa.\n- Aba de Atividades corrigida: agora carrega corretamente para donos e administradores de empresa, com filtro automático por empresa.\n- Página de IA Insights exibe alerta visual quando super admin escolhe "Visão Global".',
  'fix',
  ARRAY['produtos','enderecos','movimentacoes','scanner','recebimento','expedicao','estoque','dashboard','atividades','ia-insights'],
  true
),
(
  '6.7.2-internal',
  'Hardening interno: filtros defensivos e correção do join de profiles',
  E'Ajustes técnicos internos:\n\n- Adicionado .eq("company_id", currentCompanyId) e enabled: !!companyId em todas as queries operacionais do frontend (defesa em profundidade, complementar às políticas RLS baseadas em is_member_of).\n- Corrigido join da aba Atividades (activity_log -> profiles): substituído o embed PostgREST por busca separada em profiles usando .in("id", userIds), evitando falhas por ausência de FK declarada.\n- Novo componente src/components/NoCompanySelected.tsx.\n- ConversationalSearch refatorado para receber companyId por closure e propagar o filtro em todos os padrões de pergunta.\n- Preservados: imutabilidade de movimentos, bloqueio de estoque negativo, validate_movement_cross_company, block_writes_for_blocked_companies, RLS baseada em is_member_of + super admin, CompanyContext e get_user_company_id.',
  'security',
  ARRAY['frontend','rls','activity_log','company_context'],
  false
);
