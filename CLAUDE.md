# CLAUDE.md

Conventions for working in this repo. The design — scope, `House` format, architecture, user
stories — is in `project-documentation/01-requirements/product-requirements.md`; decisions are in
`project-documentation/_meta/decision-log.md`. Read the relevant section before starting a ticket.

## Intent: Planning vs Implementing

- If I ask for a plan, a ticket/issue, an explanation, or say "just questions", do NOT edit any
  files. Deliver the plan, issue, or answer, then stop.
- Only write code when I explicitly ask you to implement, build, or fix something, or when a ralph
  build/review/merge phase prompt tells you to.
- After opening a GitHub issue, report the issue number and URL and stop. Do not announce that you
  will resume coding.

## Layout

Single-package Vite + React + TypeScript app with a small local Node (Hono) server in the same
repo (see "Architecture" in the requirements doc):

- `server/ai.ts` — the **only** place a model is called (`Ai` port, Gemini via Vercel AI SDK;
  `AI_FAKE=1` swaps in a scripted fake).
- `server/index.ts` — the 3 endpoints: `/api/parse-docs`, `/api/item`, `/api/edit`.
- `src/house.ts` — `House` Zod schemas, `validateHouse`, `applyEdits` (pure, unit-tested).
- `src/store.ts` — zustand store: house, baseline, undo/redo history, proposal.
- `src/scene.ts` — raw Three.js (no R3F): `buildHouse(house)`, drag controller.
- `src/pages/` — Entry (documents → review) and Editor.
- `my-*-3d.html` + `sketch3d/` — standalone 3D sketch pages on a shared engine, outside the app;
  work on them through the `sketch-3d` skill.

## Commands

Defined in `package.json` once the walking skeleton (#1) lands; keep this list in sync:

```sh
pnpm dev          # vite + local server
pnpm lint
pnpm typecheck
pnpm test         # Vitest, AI_FAKE=1
```

Before finishing a change, run `pnpm lint && pnpm typecheck && pnpm test`.

## Conventions

- Styling: UI is styled with Tailwind utilities using the theme tokens in `src/styles.css`; no inline
  `style={{}}` except dynamic values (e.g. three.js mount sizing).
- TypeScript `strict` + `noUncheckedIndexedAccess`. No non-null assertions (`!`) and no lying
  `as` casts — narrow with real checks.
- Every boundary is parsed, not trusted: request bodies, env vars, AI output, fetched pages,
  imported JSON, localStorage — Zod `safeParse` / `validateHouse`, with the failure branch handled.
- `House` is the single source of truth. The renovation agent changes it only through `Edit[]` +
  `applyEdits`; every accepted change is one `commit` (one undo step).
- Tests: Vitest, next to the code (`foo.ts` → `foo.test.ts`). **No real LLM calls in any test or
  in CI** — use `AI_FAKE=1`.
- Never log prompts or document contents (they contain personal data).
- UI text is Hebrew, RTL.

## Local environment

- This is macOS. Avoid GNU-style `sed -i`; use `sed -i ''` or a small Node script for edits.
- Never overwrite `.env` or `.env.example`; only append to them. `.env` is gitignored.
- Don't include gitignored paths in git pathspecs.

## Planning

Every implementation plan (plan mode, or any "plan X" request) is built with these skills, loaded
before the plan is written:

- `/druri-plan` — always.
- `/mattpocock-skills:codebase-design` — always; its deep-module vocabulary frames the
  architecture step and the ticket boundaries.
- `/vercel-react-best-practices` — only when the plan touches React UI.

The plan ends with a ticket breakdown: tracer-bullet slices, each with title, blocked-by, and what
it delivers. Once approved, tickets are published as GitHub issues (see below) and implemented
through the ralph loop.

## Git

- Ticket work runs through the ralph loop (feature branch → PR → review → green CI → squash-merge).
- Outside a ticket, "commit and push" means commit to the **current** branch and push it — don't
  create a new branch unless asked.
- Otherwise, don't commit unless asked.

## GitHub Issues

- Issues must be self-contained. Embed the full plan (context, approach, files to touch,
  acceptance criteria as `- [ ]` checkboxes). Do not just summarize it or link to a local plan
  file.
- Label `ready-for-agent` for issues the ralph loop should pick; blockers listed as `- #N` lines
  under `## Blocked by` (or `None (can start immediately)`). Create blockers first, so issue
  number order is work order.
- Work only a person can do gets the `needs-human` label (the loop skips it).
- For a simple "open an issue" request, skip plan mode and extra clarifying rounds. Investigate,
  then create the issue directly.
- `gh` can't attach images, so describe screenshots in text.

## Scope

- Don't change `.ralph/` files or `.claude/skills/ralph-issue/` unless the request is about the
  ralph loop itself.
- A change is not done while CI is red. Fix it, or show the same failure on `main`.

## Tooling gotchas

- If `pnpm` isn't on PATH, use `npx pnpm`.
- If `gh pr edit` fails on token scope, use `gh api` (REST) instead.
- Don't run the formatter on hand-written planning docs.
- UI changes aren't done until checked in a browser.
