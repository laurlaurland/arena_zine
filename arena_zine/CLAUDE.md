# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start dev server at http://localhost:5173
npm run build     # TypeScript check + production build
npm run preview   # Preview production build locally
```

## Architecture

**Stack:** Vite + React 18 + TypeScript, Zustand state, @dnd-kit drag-and-drop, @react-pdf/renderer for PDF export, Tailwind CSS (v4 via @tailwindcss/vite plugin), arena-ts Are.na API client.

### Data flow

1. `TokenGate` → user pastes Are.na personal access token → validated against `/v3/me` → stored in `localStorage`
2. `useArenaStore` fetches the user's channels via `user(slug).channels()` and blocks via `channel(slug).contents()` (paginated, 100/page)
3. User drags `BlockThumbnail` from sidebar onto a `ZinePage` drop target → `useZineStore.addBlock()` converts the `ArenaBlock` to a `ZineBlock` with percentage-based coordinates (0–100% of page dimensions)
4. Placed blocks are repositioned by dragging (dnd-kit delta → percentage conversion) and resized via pointer-event corner handles
5. Export: `exportPDF()` in `src/lib/exportPDF.ts` passes the `ZineDocument` to `@react-pdf/renderer` components in `src/components/pdf/` which map percentage coordinates to PDF points

### State

- **`useArenaStore`** (`src/store/useArenaStore.ts`): token, user slug, channels list, selected channel slug, fetched blocks. Token persisted in `localStorage`; block content is not (re-fetched each session).
- **`useZineStore`** (`src/store/useZineStore.ts`): the `ZineDocument` (pages, blocks, page size, title). Persisted to `localStorage` via Zustand `persist` middleware under key `arena-zine-document`.

### Key coordinate model

All block positions and sizes are stored as **percentages of page dimensions** (0–100). This makes layout resolution-independent and maps directly to both the scaled canvas (multiply by canvas pixel width) and the PDF renderer (multiply by `pageSize.widthPt` / `heightPt`). The page sizes in points are defined in `src/lib/pageSizes.ts`.

### Drag-and-drop

`Canvas.tsx` is the single `DndContext` root. Two drag modes handled in `onDragEnd`:
- `source: 'sidebar'` → dropped onto a `useDroppable` page → compute drop center relative to page rect, convert to %, call `addBlock()`
- `source: 'canvas'` → `PlacedBlock` repositioned → apply `delta.x / zoom / pageRect.width * 100` offset to existing coordinates

Resize handles on `PlacedBlock` use raw pointer events (`onPointerDown`/`onPointerMove`/`onPointerUp`) — not dnd-kit. Deltas are divided by `zoom` before converting to percentages.

### PDF rendering

`src/components/pdf/` contains a parallel React tree using `@react-pdf/renderer` primitives (`View`, `Text`, `Image`, `Page`, `Document`). `PDFBlock` converts percentage coordinates to absolute points: `left = block.x / 100 * pageSize.widthPt`. The `pdf()` call is in `src/lib/exportPDF.ts`.

### Are.na API

`src/api/arena.ts` wraps `arena-ts`. The `ArenaClient` is instantiated with `{ token }`. Key methods used: `client.me()`, `client.user(slug).channels({ per, page })`, `client.channel(slug).contents({ per, page })`. The contents response includes both blocks and sub-channels; filter by `base_class === 'Block'`.
