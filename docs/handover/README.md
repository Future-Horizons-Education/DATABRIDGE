# DATABRIDGE — Claude Code Handover Prompts

This directory contains paste-into-Claude-Code prompts to drive each remaining phase of the DATABRIDGE delivery plan autonomously.

## Phase order

1. [PHASE_C_CLAUDE_CODE_PROMPT.md](./PHASE_C_CLAUDE_CODE_PROMPT.md) — Cloud target adapters (Azure family + Oracle family). 8 weeks. Cuts v1.5.0.
2. [PHASE_HESA_DF_CLAUDE_CODE_PROMPT.md](./PHASE_HESA_DF_CLAUDE_CODE_PROMPT.md) — **HESA Data Futures complete (Student stream).** 10 weeks. Cuts v1.6.0.
3. [PHASE_D_CLAUDE_CODE_PROMPT.md](./PHASE_D_CLAUDE_CODE_PROMPT.md) — Enterprise ops (RBAC, multi-tenancy, SSO, observability, Helm, SOC 2 evidence). 6 weeks. Cuts v1.7.0.
4. [PHASE_E_CLAUDE_CODE_PROMPT.md](./PHASE_E_CLAUDE_CODE_PROMPT.md) — UK HE ecosystem hardening (Jisc/UCAS/SLC/TEF + failure-mode controls). 6 weeks. Cuts v1.8.0.
5. [PHASE_F_CLAUDE_CODE_PROMPT.md](./PHASE_F_CLAUDE_CODE_PROMPT.md) — HESA-DF additional streams (Provider/Staff/EMR/GOS/AOS/Finance) + v2.0 UK HE COMPLETE milestone. 8 weeks. Cuts v2.0.0.

Total remaining: ~38 weeks (~9 months) of single-engineer-with-AI cadence to v2.0.

## How to use

For each phase:

1. Verify the previous phase's PR has been merged and tagged (e.g. v1.4.0 before starting Phase C).
2. Open Claude Code in the DATABRIDGE workspace.
3. Open the relevant `PHASE_*_CLAUDE_CODE_PROMPT.md` file.
4. Copy everything **below** the `---` divider in that file.
5. Paste into Claude Code as a single message.
6. Claude Code will read the referenced build history docs, branch, build, commit, push, and open the PR.
7. Review the PR, merge when satisfied, tag the release.
8. Move to the next phase prompt.

## What every phase prompt assumes is already in place

- Repo at `RJK134/DATABRIDGE`, public
- Git user configured as `Freddie Finn <finnfreddie51@gmail.com>`
- pnpm monorepo, TypeScript strict, `exactOptionalPropertyTypes: true`
- GitHub CLI installed and authenticated (via `gh auth login` or equivalent in your Claude Code environment)
- `docs/build-history/` documents in place (they are — committed in this branch)

## Source-of-truth documents the prompts reference

- `docs/build-history/00_BUILD_HISTORY.md` — what's been built v1.0 → v1.4
- `docs/build-history/01_HESA_DATA_FUTURES_AUDIT.md` — full HESA gap audit and build estimate
- `docs/build-history/02_REVISED_DELIVERY_PLAN.md` — six-phase revised plan with HESA-DF inserted
- `DATABRIDGE_GAP_ANALYSIS.md` (repo root) — original gap analysis
- `DATABRIDGE_DELIVERY_PLAN.md` (repo root) — original five-phase plan (kept for history)
