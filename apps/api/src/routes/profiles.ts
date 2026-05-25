import type { FastifyInstance } from "fastify";
import { listProfileSummaries, describeProfile } from "../profile-registry.js";

/**
 * Profile routes:
 *   GET  /profiles        — list available source/target profiles
 *   GET  /profiles/:id    — describe a single profile (entities/fields/rules counts)
 */
export async function profileRoutes(app: FastifyInstance): Promise<void> {
  app.get("/profiles", async () => ({ profiles: listProfileSummaries() }));

  app.get<{ Params: { id: string } }>("/profiles/:id", async (req, reply) => {
    const summary = describeProfile(req.params.id);
    if (!summary) {
      return reply.code(404).send({ error: "profile_not_found", id: req.params.id });
    }
    return summary;
  });
}
