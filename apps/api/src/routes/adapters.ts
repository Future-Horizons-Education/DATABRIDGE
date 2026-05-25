import type { FastifyInstance } from "fastify";
import { ADAPTER_REGISTRY, findAdapter } from "../adapter-registry.js";

/**
 * Adapter routes:
 *   GET  /adapters        — list registered source adapters and capabilities
 *   GET  /adapters/:id    — describe a single adapter
 */
export async function adapterRoutes(app: FastifyInstance): Promise<void> {
  app.get("/adapters", async () => ({
    adapters: ADAPTER_REGISTRY.map((entry) => ({
      id: entry.id,
      displayName: entry.displayName,
      preferredAuth: entry.preferredAuth,
      capabilities: {
        supportsIncremental: entry.supportsIncremental,
        supportsSampling: entry.supportsSampling,
        supportsCodeLists: entry.supportsCodeLists,
        supportsDictionary: entry.supportsDictionary,
      },
    })),
  }));

  app.get<{ Params: { id: string } }>("/adapters/:id", async (req, reply) => {
    const entry = findAdapter(req.params.id);
    if (!entry) {
      return reply.code(404).send({ error: "adapter_not_found", id: req.params.id });
    }
    return {
      id: entry.id,
      displayName: entry.displayName,
      preferredAuth: entry.preferredAuth,
      capabilities: {
        supportsIncremental: entry.supportsIncremental,
        supportsSampling: entry.supportsSampling,
        supportsCodeLists: entry.supportsCodeLists,
        supportsDictionary: entry.supportsDictionary,
      },
    };
  });
}
