# Inter local

Inter variável, estilo normal, pesos 100–900, subconjunto Latin (inclui os acentos do pt-BR).
Carregada por `next/font/local` em `src/app/layout.tsx`, mantendo `--font-sans`.
O arquivo é versionado: **não baixar fontes durante o build**.

Obtida em 21/10/2026 pela folha oficial Google Fonts:

- CSS: https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap
- WOFF2 (Inter v20): https://fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7.woff2
- Licença SIL OFL 1.1: `OFL.txt`, de https://github.com/google/fonts/blob/main/ofl/inter/OFL.txt

Ao atualizar, substituir o WOFF2 e conferir pesos, acentos, licença e o teste
`__tests__/app/local-font.test.ts`. A fonte é incluída no contexto Docker pelo `COPY . .`.
