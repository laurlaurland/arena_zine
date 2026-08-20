# Spread view + page reordering — design

**Date:** 2026-08-03
**Status:** approved, ready for implementation

## Problem

The canvas stacks every page in a single centred column. There is no way to see
the zine as it would read once assembled — facing pages, cover standing alone —
and no way to change page order at all except by deleting from the end.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Mode | A `Single \| Spread` toggle; spread stays fully editable | Proofing and editing are the same activity for a zine; a read-only preview would need a parallel render path that deliberately strips interactivity |
| Spine | Pages touch, pair casts one shadow, soft fold gradient over the gutter | Reads as one opened sheet rather than two sheets near each other |
| Page size | Unchanged at 560px; existing zoom handles fit | Toggling modes never resizes anything, so blocks don't jump; a spread at 80% zoom is 896px and fits a typical window between sidebar and inspector |
| Mode persistence | Not persisted | UI state, same class as `zoom` and selection; `partialize` keeps only `document` and is not widened |

## Layout model

Pages pair off with the cover alone in the right-hand slot:

```
row 0:  [        ] [ cover  ]
row 1:  [ page 1 ] [ page 2 ]
row 2:  [ page 3 ] [ page 4 ]
```

An empty slot renders an invisible spacer of identical dimensions — that is what
pushes the cover right.

## Components

### New: `src/lib/spreads.ts`

```ts
// [cover, 1, 2, 3, 4] -> [[null, cover], [1, 2], [3, 4]]
export function toSpreads<T>(pages: T[]): [T | null, T | null][]
```

Pure and independently testable. Cases:

| Input | Output |
|---|---|
| `[]` | `[]` |
| `[cover]` | `[[null, cover]]` |
| `[cover, 1]` | `[[null, cover], [1, null]]` |
| `[cover, 1, 2]` | `[[null, cover], [1, 2]]` |

### New: `src/components/canvas/SpreadRow.tsx`

Renders one row: left slot, right slot, and owns the shared drop shadow around
the pair. The fold shading is a single absolutely-positioned overlay centred on
the spine — roughly 64px wide, symmetric dark gradient falling off to
transparent, `pointerEvents: 'none'` so it never intercepts clicks or drags.
Skipped on rows with an empty slot, since a lone cover has no spine.

### Changed: `src/components/canvas/ZinePage.tsx`

One new optional prop, `inSpread`. When set, the page drops its own `boxShadow`
and `mb-12`; the row wrapper owns both. Everything else is untouched — same
`useDroppable`, same `page-${id}` DOM id, same block rendering.

The caption below the page becomes the reorder drag handle (see below).

### Changed: `src/components/canvas/Canvas.tsx`

A `Single | Spread` segmented control beside the zoom buttons, and a branch:
single mode renders today's column, spread mode maps `toSpreads()` over the
sorted pages. `PageControls` is document-level and stays at the top in both
modes. Page captions stay sequential in both modes — the cover is "Page 1",
matching the data model.

### Changed: `src/store/useZineStore.ts`

Add `viewMode: 'single' | 'spread'` and `setViewMode`. Not added to
`partialize`; mode resets to `single` on reload.

## Page reordering

No store changes. `reorderPages(fromIndex, toIndex)` already splices-and-
renormalises `order` and pushes an undo snapshot, so Cmd+Z undoes a reorder.

**Drag source — the "Page N" caption.** Not the page surface: it is already a
droppable for block drops *and* contains draggable blocks, so making it
draggable would fight both. The caption is a sibling of the page div and so is
conflict-free. It gets
`useDraggable({ data: { source: 'page', pageId } })` and a grab cursor. The
existing `PointerSensor` activation distance of 8px means a click on the caption
does not start a drag.

**Drop target — the existing page droppable.** Every `ZinePage` already
registers `useDroppable({ id: 'page-{id}', data: { pageId } })`. Dropping page A
onto page B moves A to B's index. No new drop targets.

**`App.tsx`** gains a third branch in `handleDragEnd`, alongside `'sidebar'` and
`'canvas'`:

```ts
if (activeData?.source === 'page' && overData?.pageId) {
  const from = doc.pages.findIndex(p => p.id === activeData.pageId);
  const to   = doc.pages.findIndex(p => p.id === overData.pageId);
  if (from !== -1 && to !== -1 && from !== to) reorderPages(from, to);
  return;
}
```

Indices come from `doc.pages` directly rather than a sorted copy, because that
is the array `reorderPages` splices. Safe because `addPage`, `removePage`, and
`reorderPages` all keep `order` equal to array index.

A small "Page N" chip is added to the existing `DragOverlay`.

In spread mode reordering reflows the pairing automatically, since `toSpreads()`
derives from the sorted list. Dropping a page at index 0 makes it the new cover
and it moves to the lone right-hand slot; this falls out of the model rather
than being special-cased.

## Interaction with existing systems

- **Drag-and-drop for blocks:** unchanged. `App.tsx` resolves drop targets via
  `getBoundingClientRect` on `page-${id}`, which is layout-agnostic, so sidebar
  drops and block repositioning work identically in spread mode.
- **Zoom:** unchanged. The canvas wrapper is still CSS-scaled, and per the
  existing model `getBoundingClientRect` already returns zoom-scaled dimensions,
  so no drop or resize math changes.
- **Undo:** reordering already pushes history. `viewMode` is not part of
  `document` and so is correctly absent from undo snapshots.

## Out of scope

- Back-cover special casing (a lone final page sits in the left slot).
- Auto-fit page sizing.
- Persisting `viewMode` across reloads.
- Reordering by dragging the page surface rather than the caption.

## Verification

`npm run build` and `npm run lint` are the correctness check; there is no test
suite. Manual checks in the running app:

1. Toggle Single/Spread — cover alone on the right, then 1|2, 3|4.
2. Odd page count — trailing page sits alone in the left slot, no fold overlay.
3. Drag a block from the sidebar onto both slots of a spread.
4. Move and corner-resize a block in spread mode.
5. Drag a page caption onto another page; order changes and pairing reflows.
6. Cmd+Z restores the previous order.
