# Ciliar — Regras de negócio e módulos

Plataforma para **prestadores de serviço** (freelancers PF e pequenos negócios PJ) gerenciarem seus
negócios, clientes, pedidos, trabalhos e horas. Este diretório registra as **regras de negócio**
definidas em entrevista com o produto. Detalhes de implementação ficam em `aicontext/`.

> Referência de componentes, layout, padrões, estilos e funções: **`~/code/opex`** (somente leitura).
> Referência do tema por negócio: **`~/code/sipal/crm-marketing-campanhas`** (somente leitura).
> As regras do `AGENTS.md` continuam valendo (Perfix, auditoria, pt-BR, ferramentas do Agente Opex…).

## Fluxo geral

1. **Acesso**: o prestador entra com Google (cadastro público ou pré-cadastro feito pelo admin).
2. **Entrevista**: o **Agente Entrevistador** conduz um roteiro guiado e coleta os dados do negócio.
3. **Negócio**: ao fim da entrevista o Negócio é criado diretamente com as respostas.
4. **Espaço do negócio**: CRUD do negócio, metas, atividades (valor/hora), documentos e sucessos.
5. **Ramificações**: Portfólio (opcional) e Trabalhos (Kanban).
6. **Pedidos**: todo trabalho nasce de um pedido (cliente, necessidade, prazo/SLA, valor, horas).

## Módulos entregáveis (ordem de entrega)

| # | Módulo | Documento | Status |
|---|---|---|---|
| M0 | Acesso público (Google, cadastro, convite, perfil padrão) | [modulos/m0-acesso.md](modulos/m0-acesso.md) | Implementado |
| M1 | Agente Entrevistador + criação do Negócio | [modulos/m1-entrevistador-negocio.md](modulos/m1-entrevistador-negocio.md) | Implementado |
| M2 | Espaço do negócio (CRUD, metas, atividades, documentos, sucessos) | [modulos/m2-espaco-negocio.md](modulos/m2-espaco-negocio.md) | Implementado |
| M3 | Clientes + Pedidos | [modulos/m3-clientes-pedidos.md](modulos/m3-clientes-pedidos.md) | Definido |
| M4 | Trabalhos (Kanban + horas) | [modulos/m4-trabalhos.md](modulos/m4-trabalhos.md) | Definido |
| M5 | Portfólio | [modulos/m5-portfolio.md](modulos/m5-portfolio.md) | Definido |

Decisões pendentes de todos os módulos: [pendencias.md](pendencias.md).

## Glossário

| Termo | Significado |
|---|---|
| **Usuário** | Pessoa autenticada (conta Google). Pode ter vários negócios. |
| **Perfil (de acesso)** | Papel de permissões do Perfix (já existente). **Não** confundir com Negócio. |
| **Perfil padrão** | Perfil de acesso atribuído automaticamente no cadastro público (configurável). |
| **Negócio** | Entidade criada pela entrevista: a "ficha" do prestador naquele negócio. Um usuário tem N negócios. |
| **Espaço do negócio** | Área de trabalho de um negócio (perfil, metas, atividades, documentos, sucessos, trabalhos…). |
| **Agente Entrevistador** | Agente de IA que conduz o roteiro de onboarding de cada novo negócio. |
| **Roteiro** | Lista ordenada e versionada de perguntas, cada uma ligada a um campo nativo do Negócio. |
| **Entrevista** | Execução de um roteiro por um usuário para criar um negócio. |
| **Agente Opex** | Chat com ferramentas já existente; ganha ferramentas de negócio. |
| **Pedido** | Solicitação de um cliente que origina um Trabalho. |
| **Trabalho** | Card no Kanban (Abertura → Execução → Validação → Pago + colunas customizadas). |

## Decisões transversais

- **Tudo no mesmo app**: prestadores e administradores são usuários Perfix; menus e APIs seguem as
  permissões efetivas. Não há um "app do prestador" separado.
- **Isolamento**: cada negócio pertence a um único usuário (dono). Só o dono o acessa. Exceção:
  usuário com permissão específica de suporte (ex.: `businesses.view_all`), sempre auditado; o
  "Visualizar como usuário" mostra os negócios do alvo somente para quem tem essa permissão.
- **Sem equipe** por negócio nesta fase (um dono por negócio).
- **Moeda por negócio** (BRL, USD, EUR…); valores em unidades mínimas inteiras (centavos).
- **Idioma**: interface e agentes em pt-BR.
- Toda funcionalidade nova ganha ferramentas no **Agente Opex** (regra do `AGENTS.md`).
