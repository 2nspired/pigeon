/**
 * Web shim over `src/lib/services/edition.ts`.
 *
 * Mirrors `handoff-service.ts` — binds the shared factory against the
 * Next.js-bound `db` (FTS-extended PrismaClient) so server components and
 * tRPC procedures can call the service without importing the factory
 * directly. The MCP process binds the same factory against `src/mcp/db.ts`
 * inside `src/mcp/tools/squawk-tools.ts`.
 */

import { createEditionService } from "@/lib/services/edition";
import { db } from "@/server/db";

export const editionService = createEditionService(db);
