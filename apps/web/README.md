# @databridge/web

Next.js 14 (App Router) front-end for DataBridge.

## Routes

- `/` — landing page
- `/adapters` — source-adapter catalogue (reads from `apps/api` `/adapters`)
- `/profiles` — target-profile catalogue (reads from `apps/api` `/profiles`)

## Development

```bash
# In one shell:
pnpm --filter @databridge/api dev    # http://localhost:3001

# In another shell:
pnpm --filter @databridge/web dev    # http://localhost:3000
```

The web app reads `NEXT_PUBLIC_API_URL` (default `http://localhost:3001`)
when fetching adapter / profile data.

## End-to-end tests (Playwright)

The `/query` NL bar has a Playwright spec under `e2e/`. It is **not** part of
the hermetic `pnpm test` gate (it needs a browser). Run it locally:

```bash
npx playwright install chromium   # one-time, downloads the browser
pnpm --filter @databridge/web test:e2e
```

The spec mocks `/v1/rules:compile`, so only the web dev server is required;
Playwright starts it automatically (set `PLAYWRIGHT_NO_SERVER=1` to reuse a
server you've already started).

## Phase B scope

Phase B delivers the scaffold (App Router, layout, three pages, API fetches).
Mapping studio, audit dashboards, and authentication land in Phase D+.
