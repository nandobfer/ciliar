# Landing page (CIL-2)

Página pública de produto na raiz `/`, separada do login e fora do shell. Usa o **modo claro**
padrão do app (`applyDocumentMode("light")` ao montar); o login continua escuro.

## Rota e sessão

- `src/app/page.tsx` (Server Component, `force-dynamic`) chama `auth()` **só** para saber se há
  sessão (`session.user.id`) e renderiza `LandingPage authenticated`. Não lê banco nem permissões.
- CTA (`landingCta` em `src/features/landing/content.ts`): visitante vê **"Testar grátis"** →
  `/login` (lá o cadastro público com Google acontece); quem tem sessão vê **"Ir para o painel"** →
  `HOME_HREF`. O `AccessProvider` continua decidindo o resto: termos pendentes, onboarding (M1) e
  `homeHrefOf` (prestador sem o painel vai para `/negocios`).
- Logout continua indo para `/login`. A 404 ("Voltar para o início") e o link "Ciliar" de
  `/termos`/`/privacidade` levam à landing.

## Estrutura (`src/features/landing`)

- `content.ts`: catálogo puro de textos/ícones (topo, passos, recursos, segurança, prévia da
  entrevista, planos, CTA final). Só descreve o que está implementado ou **definido** em `docs/`
  (M0–M5 apresentados como produto, sem selo "em breve"); sem preços, métricas ou depoimentos.
- `components/`: `LandingPage` (composição + rolagem suave das âncoras só nesta página),
  `LandingHeader` (fixo, âncoras, menu do celular), `LandingHero` (reaproveita `LoginBackdrop`:
  gradiente + partículas), `InterviewPreview` (conversa ilustrativa do Entrevistador + progresso do
  roteiro padrão), `LandingSteps`, `LandingFeatures`/`LandingSecurity`, `LandingPlans`,
  `LandingFinalCta`, `LandingFooter`, `LandingSection` (seção com âncora e `h2`) e `Reveal`.
- Âncoras: `#como-funciona`, `#recursos`, `#seguranca`, `#planos`.
- **Planos**: placeholder com selo **"Em desenvolvimento"** e 3 cards esmaecidos sem preço nem
  botão. Quando os planos existirem, substituir `LANDING_PLANS` e o componente.

## Animações

Framer Motion: entrada escalonada do topo, prévia do chat com mensagens em sequência, seções e
cards que aparecem ao rolar (`whileInView`, uma vez) e leve elevação no hover. Com movimento
reduzido (`useReducedMotion`) tudo é renderizado no estado final, as partículas ficam paradas e a
rolagem não é suave.

## Agente Opex

Documentação registrada em `APP_DOC_AUDIENCE` (`modules/landing.md` → público `all`).
Sem ferramentas: a landing é estática e pública, sem dados, API nem ação equivalente para o agente.

## Testes

`__tests__/features/landing/landing.test.tsx` (CTA por sessão, seções/âncoras, Planos sem preço,
rodapé legal, menu do celular, movimento reduzido) e `home-page.test.tsx` (rota `/` renderiza a
landing com o estado da sessão, sem redirecionar).
