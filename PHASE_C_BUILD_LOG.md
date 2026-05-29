# Phase C — Cloud Target Adapters — Build Log

**Branch:** `claude/gracious-faraday-63zXQ`
**Baseline:** v1.4 (DEMO milestone), ~1182 tests.
**Outcome:** all three workstreams shipped; repo-wide `typecheck` + `build` +
`test` green (113/113 turbo tasks). Total tests **1289** (≈ +107).

Reconciliations vs. the handover prompt (`docs/handover/PHASE_C_CLAUDE_CODE_PROMPT.md`):
- Cloud adapters are **separate packages** (per the prompt) that reuse a shared
  contract added to `@databridge/target-adapters` (`BufferedTargetTransport`,
  `ConfigurableTargetAdapter`, `CloudArtifact`/`CloudTargetBundle`).
- The API endpoint follows the repo's Fastify convention: **`POST /migration/land`**
  (`?target=` query or body) + `GET /migration/targets`, not the prompt's literal
  `/v1/migrations/{runId}:land`.
- Branch/PR per this session: develop on `claude/gracious-faraday-63zXQ`, one draft
  PR to `main` (not the prompt's `feat/phase-c-cloud-targets` / `Freddie Finn` / `gh`).

## C1 — Azure target family — DONE
- `@databridge/azure-auth` — managed-identity / service-principal / az-cli token
  resolution; `@azure/identity` optional lazy peer; deterministic stub fallback.
- `@databridge/target-adapter-azure-adf` — ADF pipeline JSON emitter.
- `@databridge/target-adapter-azure-synapse` — COPY INTO (dedicated/serverless).
- `@databridge/target-adapter-azure-sql` — TVP MERGE/INSERT loader.
- `@databridge/target-adapter-microsoft-fabric` — OneLake Delta load plan.
- `apps/api`: `target-adapter-registry.ts` + `/migration/land` + `/migration/targets`.

## C2 — Oracle target family — DONE
- `@databridge/oracle-auth` — wallet (secrets) / IAM / instance-principal;
  `oracledb` + `oci-common` optional lazy peers; stub fallback.
- `@databridge/target-adapter-oracle-goldengate` — replicat `.prm` emitter.
- `@databridge/target-adapter-oracle-adw` — Oracle MERGE/INSERT load script.
- `@databridge/target-adapter-oracle-oci-di` — OCI DI task-definition emitter.
- Registered all three in `target-adapter-registry.ts`.

## C3 — Phase B carry-overs — DONE (one item Partial)
- **ONNX embeddings** — DONE with a documented Partial. `OnnxEmbedding` now runs the
  real pipeline (tokenise → `session.run` → mean-pool → L2-normalise), injectable for
  hermetic tests, with the deterministic hash fallback retained. **Partial:** the real
  model + WordPiece `vocab.txt` are not shipped (binary size / sandbox); the install
  path is documented (`packages/schema-mapper-llm/README.md`) and `HashingTokeniser`
  is a dependency-free stand-in until the real vocab is supplied.
- **Playwright `/query` E2E** — DONE. `apps/web/e2e/query.e2e.ts` + `playwright.config.ts`
  + `test:e2e` script. Intentionally **outside** the hermetic `pnpm test` gate (needs a
  browser via `npx playwright install`); the spec mocks `/v1/rules:compile`.
- **Demo web auto-launch** — DONE. `apps/demo --launch-web` (default off) spawns the web
  dev server via an injectable launcher (`launch-web.ts`); flag logic unit-tested.

## Safety / hermeticity
- No real Azure/Oracle tenant calls. Every adapter is dry-run / stub by default; cloud
  SDKs are optional peers, lazy-loaded, fake-injected in tests. Live writes require an
  explicitly wired `sink` + credentials (documented, deferred).

## Known issues (pre-existing, NOT introduced by Phase C)
- **Repo-wide ESLint debt** — `pnpm lint` is red on ~22 pre-existing errors across 10
  packages (`adapter-techone-financeone`, `adapter-sits-oracle`, `adapter-dynamics365-edu`,
  `adapter-salesforce-edu`, `rule-core`, `schema-mapper`, `schema-mapper-llm`, `dhp-core`,
  `profile-hesa-tdp`, `apps/api`'s `audit-queue.ts` + `routes/findings-narrate.ts`). This is
  the v1.4 "CI red" known issue. All Phase C code is lint-clean; fixing the pre-existing
  debt was kept out of scope (flagged for a separate green-up pass).

## Verification
```sh
pnpm install
pnpm -r typecheck && pnpm -r build && pnpm -r test    # all green
# land demo (stub, no real cloud):
pnpm --filter @databridge/api dev    # then:
curl -s localhost:3001/migration/targets
curl -s -X POST 'localhost:3001/migration/land?target=azure-adf' \
  -H 'content-type: application/json' \
  -d '{"rows":[{"entity":"stu","data":{"stu_code":"S1"}}]}'
```
