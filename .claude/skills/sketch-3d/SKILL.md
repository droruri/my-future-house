---
name: sketch-3d
description: Build or extend a standalone 3D viewer page (like my-house-3d.html, my-bathroom-3d.html) from a floor plan, hand sketch or photo, on the shared sketch3d engine. Use when asked to turn a plan or sketch into 3D, model a room or apartment, or add walls, furniture, fixtures or electrical points to one of those pages.
---

# 3D sketch page

A sketch page is one self-contained HTML file in the repo root: the original drawing embedded as
a data URL, a `#layout` block holding the user's saved edits, and a module script that describes
**only geometry** through `createSketch()` from `sketch3d/sketch3d.js`. The engine owns everything
else: renderer, lights, cut slider, walls/floors/labels/dimensions, items, navigation (orbit, top,
point-and-go, locked walk, touch pad), the full-screen sketch viewer, and edit mode (select, drag,
rotate, save back into the page). Its header comment and the JSDoc on `createSketch` are the API
reference; read them before writing a page. `my-house-3d.html` (metres, pixel plan, kitchen
cabinetry, electrical points, animated roof) and `my-bathroom-3d.html` (centimetres, items in
local frames) are the worked examples.

New page: start from [template.html](template.html) and follow every step. Extending a page: do
steps 3–6 for what you add, then step 7.

## 1. Embed the drawing

- Shrink a big photo first: `sips -Z 2000 in.jpg --out drawing.jpg`; read its pixel size with
  `sips -g pixelWidth -g pixelHeight drawing.jpg`.
- Put the data URL on one line in the page with a small Node script (`'data:image/jpeg;base64,' +
  readFileSync(path).toString('base64')`). Never paste or print the base64 into the conversation.
- Long-line gotcha: that line is hundreds of KB. Edit around it with scripts or exact `Edit`
  strings elsewhere in the file; read the page with `awk 'length($0) <= 2000'` so the line is skipped.

Done when: the page has `const SKETCH_SRC = 'data:…';` and you know the image's pixel size.

## 2. Fix the frame

Pick the **plan unit** and the **world unit**, then fill `perMetre`, `plan` and `sketch`:

- Plan unit = whatever you measure in on the drawing: image pixels for a scanned plan, cm for a
  sketch with a stated scale. World unit = metres (`perMetre: 1`) for a whole apartment, cm
  (`perMetre: 100`) for a single room where every number is cm.
- Scale comes from **labelled dimensions** on the drawing: divide a labelled length by its
  measured span, check it against two more labels, and write the arithmetic in a comment (the
  house: "bedroom 3 = 340 cm over ~235 px").
- `plan.origin` = a plan point near the middle (it becomes the orbit centre). `sketch.rect` = the
  plan rect the whole image covers (`[0, 0, w, h]` when plan units are image pixels).

Done when: the overlay (toggle "שרטוט על הרצפה") lies under the model at the right size.

## 3. Walls and openings

`hWall(y, x1, x2, t, kind, opts, material)` / `vWall(x, y1, y2, t, …)` along the drawing's wall
lines, split at every opening: `'door'` (`{ head }`), `'window'` (`{ sill, head }`, glass added),
`'glass'` (an opening the page closes with its own glass), default `'wall'`. Named opening specs
(`const SLIDER = { sill: 0, head: 2.3 }`) and a thickness table (`const T = { ext, int }`) keep
calls short. Group the calls by façade or room under one comment line each.

Done when: with dimensions on, every length written on the drawing matches its label within the
drawing's precision.

## 4. Floors and labels

One `addRooms([...])` entry per room: polygon in plan units, `kind: 'outside' | 'common'` for
balconies and shared space (left out of the interior area), `drop` for sunken floors (balcony
4 cm, shower 1 cm). Show the returned area with `setSubtitle`.

## 5. Items

Everything that could move is an `item(id, { name, at?, rot?, tag?, tagAt? }, build)`:
furniture, fixtures, appliances, the scale figure. Fixed construction (walls, built-in cabinetry,
pergola) stays outside items.

- `id` is stable camelCase: the user's saved layout is keyed by it, so renaming one drops their
  saved move. `name` is the Hebrew name shown when it is selected.
- One item per group that moves together (a table with its chairs).
- Build either in plan coordinates through `box(...)` (house style) or in a local cm frame placed
  by `at` + `rot` (bathroom style: `rot` 0 faces plan south, 90 east). Inside `build`, add meshes to
  `target()`.
- Real dimensions: the product's published size, or the drawing's label. Every piece gets a
  comment naming its source: product and model with its sizes, "read off the sketch", or
  "assumed" with the value.

Done when: in edit mode every item can be selected, dragged and turned, and spins in place.

## 6. Page-specific extras

Page toggles (`toggle(label, on, apply, { wide })`) for the page's own groups, `solid(group)` for
anything the walker must not pass through, `onFrame((dt, t) => …)` for motion, and materials as
`const MAT = { ...sk.MAT, … }` built with `mat(color, extra)` so they honour the cut slider. Call
`sk.start()` last.

## 7. Verify

- `pnpm lint && pnpm test` (`sketch3d/sketch3d.test.js` covers the layout format).
- Open the page through the `static-html` launch config (`http://localhost:8765/<page>.html`; ES
  modules need a server, not `file://`). Check the console is clean, the overlay lines up, the
  labelled dimensions match, walking stops at walls, and edit mode selects, moves and turns items.
  Share a screenshot.
- Engine change (`sketch3d.js` / `.css`): open **every** sketch page, since they all share it.

Done when: all of the above hold on every page you touched.
