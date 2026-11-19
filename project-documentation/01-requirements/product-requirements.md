---
document_type: requirements
version: "1.0.0"
status: draft
created_by: product_manager
created_at: "2026-11-19"
project: "my-future-house"
phase: 1
scope: Prototype (single user, local)
stack:
  frontend: Vite + React + TypeScript + three (raw, no R3F)
  backend: Node (Hono) — 3 endpoints, same repo
  ai: Gemini via Vercel AI SDK (ai, @ai-sdk/google, zod) behind one `Ai` port — LLM_DOCS_MODEL=gemini-2.5-pro (plan reading), LLM_AGENT_MODEL=gemini-2.5-flash (item / edit agents). No fallback provider.
  storage: localStorage + JSON export/import
---

# Product Requirements: My Future House

## Executive Summary

**Elevator pitch:** Drop your apartment's Hebrew sales documents, see the apartment in 3D, and let an AI add furniture or plan renovations you can accept or reject.

**Problem:** Israeli buyers get a תוכנית מכר, נספחים and a מפרט טכני as flat PDFs. It's hard to picture the space, test furniture from a shop's website, or try a change ("close the service balcony", "pergola over half the balcony") before talking to the contractor.

**Reference repo decision:** Do **not** fork `ch-bas/threejs-sims-house-builder` (~620 files, rectangle/L-shaped footprint only, no balcony/pergola model, no backend). Build fresh. Borrow ideas from it: one undo step per drag, locked items, a check that repairs bad data on load.

## Persona

**The owner — buyer of a new apartment.** Comfortable with technology. Has the developer's PDFs and wants to decide on furniture and renovations (שינויי דיירים) before handover. Uses it a few times a week until handover.
> "I want to see if this sofa fits in the living room and what the balcony looks like with a pergola."

## Decisions (agreed in the design round)

| # | Decision |
|---|----------|
| 1 | Build fresh. Small app with its own simple house format |
| 2 | One-level apartment with one or more balconies. The format keeps a `floors[]` array for later |
| 3 | PDFs and images go straight to Gemini as file parts. No OCR pipeline. The output is checked against the format before it's used |
| 4 | Small local Node server holds `GOOGLE_GENERATIVE_AI_API_KEY` in `.env`. Single user, no login. All model calls go through one `Ai` port (same pattern as the owner's other Gemini projects); `AI_FAKE=1` swaps in a scripted fake for tests |
| 5 | Floor plan raised into 3D: real-thickness walls, gaps for openings, room floors and labels, balcony railing, items as boxes |
| 6 | Undo/Redo (a whole drag is one step), Reset to the house built from the documents (asks first), Escape cancels a drag in progress |
| 7 | Fixed: walls, openings, kitchen, balcony. Draggable: loose items only. 10 cm snap, kept inside the walls |
| 8 | Item agent: URL or text → item proposal (ghost) → Accept/Reject. Asks for missing dimensions, never guesses |
| 9 | Renovation agent: returns a list of edits → before/after preview and a plain-words list of changes → Accept is one undo step. Also fixes mistakes from reading the documents |
| 10 | One house in localStorage, autosaved. JSON export/import |
| 11 | Hebrew interface, right-to-left |
| 12 | After reading the documents: a 2D plan with main dimensions next to the 3D view → "Confirm" or "Fix with a sentence" |

## Feature Prioritisation (MoSCoW)

### MUST
| Feature | Complexity |
|---|---|
| Entry page: drop documents → build the house → 2D/3D review | L |
| House format + check that repairs bad data | M |
| 3D view built from the house: walls, openings, rooms, balcony, roof areas, kitchen, items | L |
| Orbit camera + top view | S |
| Drag loose items (snap, kept inside walls), fixed elements can't be dragged | M |
| Undo / Redo / Reset / Escape | S |
| Item agent (URL or text) with Accept/Reject proposal | M |
| Renovation agent (list of edits) with preview and Accept/Reject | M |
| Autosave + JSON export/import | S |

### SHOULD
- Rotate selected item 90° (R key), delete item
- Item list in the side panel with total price
- Collision highlight (red) between items

### COULD
- Product photo as the box's front texture
- Walk-through camera, sun position
- Floor plan PDF shown under the 2D view

### WON'T (this release)
| Feature | Reason |
|---|---|
| Fork of the reference repo | Its format can't represent polygon floor plans and balconies |
| Manual wall drawing tool | Covered by "Fix with a sentence" |
| Detailed 3D furniture models | Boxes are enough to decide what fits |
| Multiple houses, accounts, sharing | One user, one house |
| Several floors in the UI | Apartment is one level. The format allows more later |

## House Format (`House` JSON — the single source of truth)

Written as Zod schemas (`HouseSchema`, `ItemSchema`, `EditSchema`); the TypeScript types below come from `z.infer`. The same schemas constrain the AI's structured output.

Units are metres. Plan coordinates are `x` (east) and `z` (south), with `y` up.

```ts
type Pt = { x: number; z: number };
type House = {
  version: 1;
  source: { files: string[]; notes: string };          // what the AI read
  walls: { id: string; a: Pt; b: Pt; thickness: number; height: number; exterior: boolean }[];
  openings: { id: string; wallId: string; kind: 'door' | 'window' | 'sliding'; offset: number; width: number; height: number; sill: number }[];
  rooms: { id: string; name: string; polygon: Pt[]; kind: 'room' | 'wet' | 'balcony' | 'service_balcony' | 'mamad' }[];
  roofs: { id: string; polygon: Pt[]; height: number; kind: 'pergola' | 'solid' }[];   // e.g. a pergola over part of the balcony
  kitchen: { polygon: Pt[]; counterHeight: number; hasIsland: boolean } | null;        // fixed
  items: { id: string; name: string; size: { w: number; d: number; h: number }; pos: Pt; rotation: 0 | 90 | 180 | 270; color: string; price?: number; url?: string }[];
};
```

- **Fixed vs draggable** is decided by type: only `items[]` can be dragged. No per-item flags.
- **Balcony railing** is drawn along the sides of a `balcony` room that have no wall.
- The **check** (`validateHouse` = `HouseSchema.safeParse` + repair) clamps sizes, drops openings that point to a missing wall, and closes polygons. The AI output, imports and localStorage all pass through it.

## Architecture (smallest that works)

```
my-future-house/
├── server/ai.ts           THE ONLY place a model is called. Ai = { extract<T>({ schema, system, prompt, files? }) → {ok,value} | {ok:false,error} }, never throws
│                          createAi(env): AI_FAKE=1 → scripted fake, else Gemini (createGoogleGenerativeAI + generateObject); env checked with Zod at startup
├── server/index.ts        POST /api/parse-docs   (files → House)        docs model, PDFs/images as file parts
│                          POST /api/item         (url|text → Item | {needs:'dimensions'})  agent model; server fetches the URL, strips HTML
│                          POST /api/edit         (House + request → Edit[])                 agent model
├── src/house.ts           House types + validateHouse + applyEdits(house, edits)   ← pure, unit-tested
├── src/store.ts           zustand: house, baseline, past[], future[], proposal; undo/redo/reset/commit
├── src/scene.ts           Three.js: buildHouse(house) → Group; drag controller (raycast onto floor plane)
├── src/plan2d.tsx         2D SVG plan with main dimensions (review screen)
├── src/pages/Entry.tsx    drop zone → parse → review (2D + 3D) → Confirm / Fix with a sentence
├── src/pages/Editor.tsx   3D view + edit panel + agent panel
├── .env.example           GOOGLE_GENERATIVE_AI_API_KEY=, AI_FAKE=1, LLM_DOCS_MODEL=, LLM_AGENT_MODEL=
└── .env                   real key (gitignored)
```

**Edits (`Edit[]`)** — the only way the renovation agent changes the house:
`addWall | removeWall | moveWall | addOpening | removeOpening | setRoom | addRoof | removeRoof | setKitchen | removeItem`.
`applyEdits` is pure. The preview shows `applyEdits(house, edits)` faded in next to the current house. Accept calls `commit(newHouse)`, which is one undo step.

**History:** `past: House[]`, `future: House[]` hold whole-house snapshots (the house is small). A drag commits once, on pointer-up. Escape during a drag restores the position from before the drag. Reset sets `house = baseline` (the confirmed house built from the documents), as one undo step so it can be undone too.

**Proposals:** `proposal: { kind: 'item', item } | { kind: 'edit', edits, summary }`. The proposal is drawn as a ghost (opacity 0.4). Accept calls `commit`. Reject clears the proposal.

## Key User Flows

### Flow 1 — Documents to house
```
┌──────────────────────────────────────────────┐
│               הבית העתידי שלי                 │
│  ┌────────────────────────────────────────┐  │
│  │   גררו לכאן: תוכנית מכר, נספחים,       │  │
│  │   מפרט טכני (PDF / תמונות)             │  │
│  └────────────────────────────────────────┘  │
│  ✓ tochnit-mecher.pdf   ✓ nispach-mitbach.pdf│
│              [ בנה את הבית ]                  │
└──────────────────────────────────────────────┘
        ↓ (spinner: "קורא את התוכניות…")
┌──────────────────────┬───────────────────────┐
│  2D plan + dimensions│   3D preview          │
├──────────────────────┴───────────────────────┤
│ [ אישור ]   [ תיקון במשפט: ______________ ]  │
└──────────────────────────────────────────────┘
```

### Flow 2 — Editor
```
┌──────────────┬───────────────────────────────┐
│ ↶ ↷  ⟲ איפוס │                               │
│ ייצוא  ייבוא │          3D view              │
├──────────────┤   (drag items; ghost =        │
│ סוכן:        │    proposal)                  │
│ (•) הוסף פריט│                               │
│ ( ) שינוי בבית│                               │
│ [URL / text] │                               │
│ [ שלח ]      │                               │
│ ─ proposal ─ │                               │
│ ספה 2.4×0.9  │                               │
│ [קבל] [דחה]  │                               │
└──────────────┴───────────────────────────────┘
```

## User Stories (MUST)

**US-1 Build the house from documents.** The owner drops PDFs/images and gets a 2D+3D house.
- Given the sales plan and a balcony appendix, when he clicks Build, then walls, openings, rooms (including the balcony and ממ"ד) appear with Hebrew names.
- Given a file Gemini can't read, then the app shows which file failed and keeps the rest.
- Given an AI response that fails the check, then the repaired house is shown, with a note listing what was repaired.

**US-2 Review and correct.** Given the review screen, when he types "המרפסת עמוקה 2 מטר ולא 1.6", then a proposal with the corrected balcony is shown, and Confirm saves it as the baseline.

**US-3 Drag items.** Given an item, dragging moves it on a 10 cm grid, inside the walls. Walls, kitchen and balcony don't respond to dragging. Pointer-up is one undo step. Escape during a drag puts the item back.

**US-4 Undo / Redo / Reset.** Ctrl/Cmd+Z and Shift+Ctrl/Cmd+Z, plus buttons. Reset asks for confirmation, then returns to the baseline, and can itself be undone.

**US-5 Add item from a URL or text.** Given a furniture product page with dimensions, a ghost box with the name, size and price appears in a suggested room. Accept makes it draggable, Reject removes it. If the page has no dimensions, the agent asks for them. If the URL can't be fetched, the app says so and offers the text option.

**US-6 Renovate.** Given "תוסיף פרגולה מעל חצי מהמרפסת" or "תוריד את הקיר בין המטבח לסלון", a before/after preview and a plain-words list of the changes are shown. Accept is one undo step. Edits that point to a missing wall or room are rejected with a message.

**US-7 Persist.** Autosave on every commit. Export/Import JSON passes through the check.

## Success Metrics
| Metric | Target |
|---|---|
| Sales plan → recognisable house | Outer walls within ±10 cm of the plan's dimensions after at most 2 "fix" sentences |
| Item from URL | Correct dimensions on 4 of 5 Israeli furniture sites tried |
| Renovation request | Preview matches intent on the first try for wall / kitchen / pergola requests |

## Milestones
1. `house.ts` + `store.ts` + `server/ai.ts` (with the fake) + unit tests (check, applyEdits, undo/redo/reset; every endpoint returns a checked answer with `AI_FAKE=1`) — with a hand-written sample house
2. `scene.ts` 3D view + drag + edit panel, on the sample house
3. `/api/parse-docs` + Entry and review pages, tried on your real documents
4. `/api/item` + proposals
5. `/api/edit` + preview

## Security Considerations
| ID | Consideration | Mitigation |
|---|---|---|
| SEC-1 | API key (`GOOGLE_GENERATIVE_AI_API_KEY`) | Server only, `.env`, gitignored, server listens on localhost only |
| SEC-2 | Server fetches the URLs you paste (`/api/item`) | http(s) only, block private/loopback addresses, 5 s timeout, 2 MB cap, text only |
| SEC-3 | AI output is untrusted | Always passes through `validateHouse` / edit checks before rendering |
| SEC-4 | Documents contain personal data (name, ID, address) | Sent only to the Google Gemini API — use a **paid-tier key** (on the free tier Google may use the data to improve its products). Stored only as filenames, not contents. Prompts and document contents are never logged |

## Open Questions
| Question | Impact | Status |
|---|---|---|
| Does Gemini 2.5 Pro read the תוכנית מכר dimensions within ±10 cm? | May need a "scale hint" input (one known dimension) | Check in milestone 3 |
| Do the shop sites block server-side fetching? | Text fallback already planned | Check in milestone 4 |
