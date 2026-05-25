import type { FastifyInstance } from "fastify";
import { CANONICAL_ENTITY_NAMES, CANONICAL_SCHEMAS } from "@databridge/canonical";

/**
 * Canonical-model routes:
 *   GET  /canonical/entities          — list canonical entity names
 *   GET  /canonical/entities/:name    — describe a single canonical entity (zod schema -> JSON)
 */
export async function canonicalRoutes(app: FastifyInstance): Promise<void> {
  app.get("/canonical/entities", async () => ({ entities: [...CANONICAL_ENTITY_NAMES] }));

  app.get<{ Params: { name: string } }>("/canonical/entities/:name", async (req, reply) => {
    const schema = (CANONICAL_SCHEMAS as Record<string, unknown>)[req.params.name];
    if (!schema) {
      return reply.code(404).send({ error: "canonical_entity_not_found", name: req.params.name });
    }
    // Return a minimal descriptor; full zod-to-JSON-schema conversion is a later concern.
    return {
      name: req.params.name,
      hasSchema: true,
      // zod schemas don't expose fields without a converter; document the
      // intent instead of leaking implementation details.
      note: "Full JSON Schema export will land alongside the validation endpoint.",
    };
  });
}
