/**
 * Lista das migrações do app, na ordem de execução. Importado dinamicamente por
 * `runMigrations()` para evitar ciclos de import com os modelos.
 */
import { registerMigrations } from "./index"
import { seedIntegrationsFromEnv } from "./seed-integrations-from-env"
import { repairIntegrationIndexes } from "./repair-integration-indexes"
import { ensureAiUsageIndexes } from "./ensure-ai-usage-indexes"
import { ensureAiConsumptionIndexes } from "./ensure-ai-consumption-indexes"
import { ensureOpexIndexes } from "./ensure-opex-indexes"
import { ensureBusinessIndexes } from "./ensure-business-indexes"
import { ensureAgentMemoryIndexes } from "./ensure-agent-memory-indexes"
import { expandBusinessPermissions } from "./expand-business-permissions"
import { convertPortfolioBlocks } from "./convert-portfolio-blocks"

registerMigrations(
    { name: "seed-integrations-from-env", run: () => seedIntegrationsFromEnv() },
    { name: "repair-integration-indexes", run: () => repairIntegrationIndexes() },
    { name: "ensure-ai-usage-indexes", run: () => ensureAiUsageIndexes() },
    { name: "ensure-ai-consumption-indexes", run: () => ensureAiConsumptionIndexes() },
    { name: "ensure-opex-indexes", run: () => ensureOpexIndexes() },
    { name: "ensure-business-indexes", run: () => ensureBusinessIndexes() },
    { name: "ensure-agent-memory-indexes", run: () => ensureAgentMemoryIndexes() },
    { name: "expand-business-permissions", run: async () => void (await expandBusinessPermissions()) },
    { name: "convert-portfolio-blocks", run: async () => void (await convertPortfolioBlocks()) },
)
