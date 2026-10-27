# Contexto do Ciliar

Base independente copiada do Opex em 17/10/2026. Mantém Next.js 16.1.4, React 19.2.3 e
pnpm 11.8.0. Em 18/10 ganhou autenticação, usuários e Perfix, com referência no Shekinah. Em 20/10
ganhou o Agente Opex (chat com ferramentas) copiado do Opex.

## Módulos

- [Base, layout e UI](modules/base.md): origem, tema, componentes e navegação protegida.
- [Autenticação e acessos](modules/access.md): login, usuários, perfis, simulação, transações e CLI.
- [Plataforma](modules/platform.md): cadastro público (perfil padrão), termos/privacidade versionados, retenção e documentos.
- [Integrações](modules/integrations.md): catálogo, persistência, APIs, logs, crons e provedores.
- [Agente Opex](modules/opex-agent.md): chat com ferramentas, sessões, arquivos, confirmações e catálogo.
- [Memórias dos agentes e Resumo](modules/ai-memories.md): instruções permanentes por agente, formatadas pelo uso "Resumo".
- [Negócios e Agente Entrevistador](modules/businesses.md) (M1): entrevista guiada, roteiro versionado, limite por perfil, onboarding e arquivamento.
- [Espaço do negócio](modules/business-space.md) (M2): dashboard com período e gráficos, ficha com tema por negócio, atividades com histórico de preço, metas com progresso, documentos e sucessos.
- [Clientes e Pedidos](modules/orders.md) (M3): clientes globais, pedidos globais e por negócio, versões, IA de título, link público e aceite com trabalho mínimo.
- [Trabalhos](modules/works.md) (M4): Kanban | Tabela por negócio e visão geral, colunas fixas + customizadas, Pago com faturamento, horas, notas, anexos e sucesso.
- [Portfólio](modules/portfolio.md) (M5): página pública `/p/[slug]` opcional, seleção um a um em ordem, cliente confidencial, itens avulsos, URLs assinadas e pré-visualização.
- [Docker e deploy](modules/deployment.md): infraestrutura copiada, Compose dev/produção e ambiente.

Este diretório é também a documentação viva consultada em tempo real pelo Agente Opex
(`list_app_docs`/`read_app_doc`/`search_app_docs`): módulo novo deve ser classificado em
`APP_DOC_AUDIENCE` (`src/features/opex-agent/app-docs.ts`); fora do mapa, só a administração lê.

Leia também `AGENTS.md`. Alterações devem manter este contexto e testes Vitest atualizados.
