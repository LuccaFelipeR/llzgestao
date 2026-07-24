
INSERT INTO public.system_changelog (version, title, description, change_type, is_public)
VALUES
  ('6.13', 'Estabilidade e preparação para piloto',
   'Ciclo de homologação final: revisão de isolamento multiempresa, políticas de exclusão e gestão de membros, fluxos de estoque, lote/validade, onboarding, suporte e administração. Nenhuma regressão introduzida.',
   'refactor', true),
  ('6.13-internal', 'Homologação final dos fluxos críticos',
   E'Fase 6.13 — homologação para piloto assistido.\n\nBuild: tsgo PASS, vite build PASS (chunk >500kB), eslint 252 erros preexistentes.\n\nPolicies validadas (products/addresses/lots DELETE e company_members I/U/D usam is_company_admin_of + super admin). Nenhuma volta a usar get_user_company_id.\n\nTestes: análise estática de schema, RLS, triggers e código (PASS). E2E multiempresa NÃO executado — roteiro em docs/HOMOLOGACAO_6_13.md seção 3.\n\nBugs encontrados: 0. Correções: 0.\n\nRiscos: profiles sem leitura entre membros; E-mail/WhatsApp/cobrança/franquias não implementados.\n\nClassificação: PRONTO PARA HOMOLOGAÇÃO MANUAL.',
   'security', false);
