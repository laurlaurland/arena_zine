# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start dev server at http://localhost:5173
npm run build     # TypeScript check + production build (tsc -b && vite build)
npm run lint      # ESLint
npm run preview   # Preview production build locally
```

There is no test suite; `npm run build` is the correctness check.

## Architecture

**Stack:** Vite 8 + React 19 + TypeScript, Zustand 5 state, @dnd-kit/core drag-and-drop, @react-pdf/renderer for PDF export, Tailwind CSS v4 (via @tailwindcss/vite plugin). The Are.na API is called through a hand-rolled fetch client (`src/api/arena.ts`) — **not** a client library.

### Data flow

1. `TokenGate` → user pastes Are.na personal access token → validated via `GET /v3/me` → stored in `localStorage` (`arena_token`, `arena_user_slug`)
2. `useArenaStore` fetches channels (`/v3/users/{slug}/contents?type=Channel`) and the selected channel's blocks (`/v3/channels/{slug}/contents`), both paginated 100/page
3. User drags a `BlockThumbnail` from the sidebar onto a `ZinePage` drop target → `useZineStore.addBlock()` converts the `ArenaBlock` into a `ZineBlock` **content snapshot** with percentage-based coordinates — placed blocks never re-fetch from Are.na
4. Placed blocks are repositioned via dnd-kit drag, and resized/rotated via raw pointer-event handles on `PlacedBlock`
5. Export: `exportPDF()` in `src/lib/exportPDF.ts` renders the `ZineDocument` through the `@react-pdf/renderer` tree in `src/components/pdf/` and triggers a download

### State

- **`useArenaStore`** (`src/store/useArenaStore.ts`): token, user slug, channels list, selected channel slug, fetched blocks. Token/slug persisted manually to `localStorage`; channel/block content is re-fetched each session.
- **`useZineStore`** (`src/store/useZineStore.ts`): the `ZineDocument` (pages, blocks, page size, title), undo history, selection, zoom. Persisted via Zustand `persist` under key `arena-zine-document`, with `partialize` so **only `document`** is persisted (history/selection/zoom are not).

**Undo model:** `history` holds the last 10 `ZineDocument` snapshots. One-shot mutations (add/remove/reorder, drag-end position, z-order, title, page size) push a snapshot inline in the same `set()`. Continuous gestures (resize, rotate, inspector sliders) call `captureHistory()` once on pointerdown, then mutate on every pointermove without pushing. Cmd/Ctrl+Z undoes; Delete/Backspace removes the selected block (keyboard handling in `App.tsx`).

### Key coordinate model

All block positions and sizes are stored as **percentages of page dimensions** (0–100). This is resolution-independent and maps directly to the canvas (CSS `%`) and the PDF (`block.x / 100 * pageSize.widthPt`). Page sizes (A4, LETTER, A5, HALF_LETTER — mm and pt) are defined in `src/lib/pageSizes.ts`.

Because width% and height% are relative to *different* page dimensions, preserving an image's pixel aspect ratio requires the page aspect ratio: `height% = width% / (imageRatio * pageAR)` where `pageAR = heightMm / widthMm`. See `arenaBlockToZineBlock()` and `updateAspectRatio()` in `useZineStore.ts`.

### Block conversion

`arenaBlockToZineBlock()` (in `useZineStore.ts`) snapshots Are.na content into the `ZineBlock`: `imageUrl` (display size) + `imageUrlLarge` (for PDF) via `pickImageUrl()`, text content, link/media/attachment fields. v3 block `type` may arrive in either casing (`'Image'`/`'image'`) — always normalize to lowercase. v3 text `content` is an object `{markdown, html, plain}`; a plain string means v2-shaped data.

### Drag-and-drop

The single `DndContext` root is the `Editor` component in **`App.tsx`** (with a `DragOverlay` preview for sidebar drags). Two modes in `handleDragEnd`, keyed by `active.data.current.source`:

- `'sidebar'` → dropped onto a `useDroppable` page (`over.data.current.pageId`): find the page DOM node by id `page-${pageId}`, compute the drop center relative to its rect, convert to %, subtract half the default block size (20, 15), call `addBlock()`
- `'canvas'` → a `PlacedBlock` was repositioned: `delta.x / pageRect.width * 100` added to the block's stored coordinates

Note on zoom: the canvas wrapper is CSS-`scale(zoom)`d, so `getBoundingClientRect()` on a page already returns zoom-scaled dimensions — drop/resize math needs **no** explicit zoom division. The only place zoom is divided out is `PlacedBlock`'s live drag transform (`transform.x / zoom`), because dnd-kit's transform is applied inside the scaled subtree.

Resize (8 handles: corners + edges) and rotation (handle above the block; Shift snaps to 15°) use raw pointer events with `setPointerCapture` — not dnd-kit. Corner resizes lock to the image's `naturalAspectRatio` when known.

### Gutter-spanning images

An image can run across a two-page spread. It is modelled as **two blocks on
facing pages sharing a `spanId`**, offset by exactly one page width, each
clipped by its own page's `overflow: hidden` — so no renderer needs changing,
and export still emits one PDF page per zine page.

One value drives the pair: `xLeft`, the left half's x in its own page space;
the right half is always at `xLeft - 100`. The core arithmetic lives in
`src/lib/spanGeometry.ts`, whose `resolveSpanDrop()` folds create / move /
dissolve into one decision (the resize-time width floor is computed inline in
the store from `toXLeft`/`STRADDLE_MIN`).

**Dragging is the whole interaction.** Drag an image across the seam in spread
view and it spans; drag it fully back onto one page and the span dissolves.
Both run through `updateBlockPosition`, which already fired once per drag and
pushed history, so one gesture is always one undo. Spanning requires an image,
spread view, a minimum straddle width, and a facing partner page — the cover
(index 0) and a trailing odd page have no seam and refuse.

Clamps relax **only** for blocks carrying a `spanId` (`xLeft` into the straddle
range, width up to 200); ordinary blocks keep `x ∈ [0, 100 - width]`, which is
what stops a block being lost off-canvas. `updateBlockSize`, `updateBlockStyle`,
and `updateBlockRotation` mirror to the partner — `imageOffsetX/Y` especially,
since mismatched pan is what makes a seam stop lining up. Deleting either half
via the Delete key removes both; deleting a *page* that holds half a span only
unlinks the stranded survivor into an ordinary block (`removePage` in
`useZineStore.ts`) rather than destroying content on a page the user didn't
touch.

`src/lib/pageUnits.ts` keeps a pair on a facing spread: `reorderWithUnits()`
(invoked by the store's `reorderPages` action) moves whole units, and
`applyParity()` inserts a blank `autoPad` page when a pair would otherwise
start at an even index, stripping unneeded empty pads first so the pass is
idempotent.

While a drag is in flight the store holds transient `spanPreview` state (not
persisted, not in history) and `ZinePage` renders a ghost half on the facing
page, so the image stays visible while crossing the gutter. The ghost is
gated on spread view, and `onDragCancel` clears the preview so a cancelled
drag never leaves a stray ghost behind.

For a block that is already spanned, the inspector offers **Fill spread**,
which resets the pair to full bleed across both pages, and **Unlink halves**,
which breaks the pair so each side can be nudged independently to compensate
for gutter creep. There is deliberately no "span" button — the drag is the
gesture.

### PDF rendering

`src/components/pdf/` is a parallel React tree using `@react-pdf/renderer` primitives (`Document`, `Page`, `View`, `Text`, `Image`). `PDFBlock` converts percentages to absolute points and prefers `imageUrlLarge`. Only a subset of block styles is applied in the PDF (position/size, z-order, opacity, backgroundColor, fontSize, color, riso halftone); **rotation, borderRadius, circle crop, and image pan are currently canvas-only** and silently dropped on export. The `pdf()` call is in `src/lib/exportPDF.ts`.

### Riso effect

`src/lib/riso.ts` is a p5-free canvas port of p5.riso's circle-halftone pipeline. Image blocks may carry `riso: { ink, intensity }` (ink names from `src/lib/risoColors.ts`, the authentic 80-color RISO palette); only these params persist — processed images are in-memory data URLs cached by `url|ink|intensity|mode`. Canvas display goes through `useRisoImage` (150 ms debounce, 'ink' mode: ink-colored dots, transparent paper). Export offers **Composite PDF** (riso baked in from `imageUrlLarge`) and **Riso separations** (`exportRisoSeparations()`): one black-coverage PDF per distinct ink plus a `_KEY.pdf` of untreated content (images grayscaled), for actual riso print masters. `ZinePDF`/`PDFPage`/`PDFBlock` accept `risoImages` (instanceId → data URL) and a `separation` render mode.

### Are.na API

`src/api/arena.ts` is a direct fetch client for the **v3** API (`https://api.are.na/v3`, `Authorization: Bearer <token>`). The token lives in a module-level variable set by `initClient()`, falling back to `localStorage.arena_token`. Endpoints used:

- `GET /me` — token validation
- `GET /users/{slug}/contents?type=Channel&per=100&page=N` — the user's channels, including private ones. **v3 has no `/users/{slug}/channels` route**; channels come from the mixed contents feed narrowed by `type` (`ContentTypeFilter` enum: `Text|Image|Link|Attachment|Embed|Channel|Block`). The feed also includes channels shared via the user's groups, so `fetchUserChannels()` drops those where `owner.type === 'Group'`
- `GET /channels/{slug}/contents?per=100&page=N` — returns blocks *and* sub-channels; filter with `type !== 'Channel'`

Pagination loops on `meta.has_more_pages`. All v3 response types (`ArenaBlock`, `ArenaChannel`, `ArenaImageData`, …) are defined in this file; `pickImageUrl()` selects the best sized image variant with fallback to the original `src`.
