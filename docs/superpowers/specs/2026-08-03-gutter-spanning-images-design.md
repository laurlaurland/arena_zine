# Gutter-spanning images — design

**Date:** 2026-08-03, revised 2026-08-04
**Status:** awaiting approval

## Problem

There is no way to run a single image across a two-page spread. Blocks belong
to one page and their coordinates are percentages of that page.

Worse, the store actively prevents faking it by hand. `updateBlockPosition`
clamps `x` to `[0, 100 - width]` and `updateBlockSize` clamps `width` to
`[5, 100]`, so an image dragged toward the gutter stops dead at the page edge.

## Interaction

**Dragging an image across the seam is what makes it span.** No mode, no
dialog, no button — you push the image into the gutter and it keeps going onto
the facing page.

| Gesture | Result |
|---|---|
| Drag an image on the left page rightward until it crosses the seam | It spans; a partner half appears on the right page |
| Drag either half | Both move together; the seam stays continuous |
| Drag a spanned image fully back onto one page | The span dissolves; one ordinary block remains |

Spanning is only reachable in **spread view**, where the seam is visible and
the two pages are adjacent. That is a deliberate constraint, not a limitation:
the gesture means "across the fold," and there is no fold to cross in single
view.

This replaces the inspector-button interaction in the first draft of this
spec. Dragging is the gesture the rest of this app already uses for placing and
arranging, and it makes the inverse (un-spanning) fall out for free — the
button model had no natural inverse.

## Verified foundation

A block positioned partly off-page is clipped at the page edge by both
renderers — `ZinePage` and `PDFBlock` both set `overflow: hidden`. This was
confirmed empirically, not assumed: a `View` at `left: -200` on a 400pt page
rasterised red from x=0–200 and white beyond, proving `@react-pdf/renderer`
honours the negative offset rather than clamping it to zero.

So a gutter-spanning image is **one image drawn twice, offset by exactly one
page width**, each copy clipped by its own page. No new rendering primitive is
needed, and export still emits one PDF page per zine page — which is what riso
print masters require.

**Geometry.** One canonical value drives the pair: `xLeft`, the left half's x
in its own page's percentage space. The right half is always `xLeft - 100`.
That single invariant is what keeps the seam aligned.

| Half | on page | x | width |
|---|---|---|---|
| left | index `i` (odd) | `xLeft` | `W` |
| right | index `i+1` | `xLeft - 100` | `W` |

`W` is the total image width in single-page percent, so a full-bleed spread is
`W = 200`, `xLeft = 0`.

**Straddle condition.** The pair is valid while the image covers at least 5% of
each page: `xLeft ≤ 95` and `xLeft + W ≥ 105`. Equivalently `xLeft` is clamped
to `[105 - W, 95]`, which requires `W ≥ 10`.

## Decisions

| Decision | Choice |
|---|---|
| Model | Two blocks joined by a shared `spanId`; editing one mirrors to its partner; can be unlinked to compensate for gutter creep |
| Trigger | Drag across the seam creates the span; drag off dissolves it |
| Page binding | The two pages drag as a unit during reorder and can never separate |
| Parity | Auto-pad with a blank page when a pair would otherwise start on the wrong parity |
| Scope | Images only |

## Data model

`ZineBlock` gains:

```ts
spanId?: string;              // shared by exactly two blocks
spanSide?: 'left' | 'right';  // which half this is
```

`ZinePage` gains:

```ts
autoPad?: true;   // blank page inserted by the parity rule; GC-able while empty
```

## Slot arithmetic

`toSpreads()` already pairs pages as `[null, page0]`, `[page1, page2]`,
`[page3, page4]`… so **left slots are odd indices** and a bound pair must start
at an odd index. Page 0 is the cover and can never span. A trailing odd page
sits in a row with an empty right slot and has no seam; `SpreadRow` already
computes exactly this as `hasSpine`, and the same condition gates spanning.

## Store changes (`useZineStore`)

### One rule in `updateBlockPosition`

`updateBlockPosition` is called once per drag, from `handleDragEnd`, and pushes
history. That makes it the single place where a span is created, moved, or
dissolved — one gesture, one history entry, one code path.

It receives the **unclamped** proposed x. The decision tree:

1. **Block is not spanned, and the proposal crosses the seam** — the block is
   an image and its page has a facing partner. "Crosses" depends on which slot
   the block starts in:

   | starting slot | page index | crosses when | partner | `xLeft` |
   |---|---|---|---|---|
   | left | odd `i` | `x + W > 100` | `i + 1` | `x` |
   | right | even `i ≥ 2` | `x < 0` | `i - 1` | `x + 100` |

   Create the pair: clone onto the partner page with a new `instanceId`, shared
   `spanId`, mirrored `spanSide`. Clamp `xLeft` into the straddle range.

   Index 0 (the cover) and a missing partner are refused — the drag falls
   through to case 4 and clamps as it does today.
2. **Block is spanned, and the proposal still straddles** — move both halves.
   Normalise the proposal to `xLeft` first (add 100 if the dragged half is the
   right one), clamp to `[105 - W, 95]`, write `xLeft` and `xLeft - 100`.
3. **Block is spanned, and the proposal no longer straddles** — dissolve.
   Remove the half the image has left, clear `spanId`/`spanSide` on the
   survivor, and clamp it normally.
4. **Otherwise** — the existing clamp, unchanged.

Cases 1 and 3 are exact inverses, which is what makes the gesture feel
reversible.

### Clamp relaxation

Relaxed **only** for blocks carrying a `spanId`; ordinary blocks keep the
current clamps, since those are what stop a block being lost off-canvas.

| | ordinary | spanned |
|---|---|---|
| `x` | `[0, 100 - width]` | `[105 - W, 95]` on `xLeft`; right half derived |
| `width` | `[5, 100]` | `[max(10, 105 - xLeft), 200]` |

The spanned width floor keeps a resize from silently breaking the straddle.
**Only dragging creates or dissolves a span** — resizing, styling, and
reordering never do.

### Mirroring

`updateBlockSize`, `updateBlockStyle`, and `updateBlockRotation` propagate to
the partner when `spanId` is set:

- size → identical `width`/`height`
- style and rotation → copied verbatim, including `imageOffsetX/Y`, which must
  match or the halves will not line up

A single private helper resolves the partner so each mutation stays readable.

### Remaining actions

**`fillSpread(instanceId)`** — sets a spanned pair to `W = 200`, `xLeft = 0`,
`y = 0`, `height = 100`: full bleed across both pages. Kept as a button because
hitting exact full bleed by dragging is fiddly.

**`unlinkSpan(instanceId)`** — clears `spanId`/`spanSide` on both halves,
leaving two ordinary blocks whose positions are now independent. Used to nudge
one half when the binding eats a few mm at the gutter.

`spanAcrossGutter()` from the first draft is gone; the drag replaces it.

### `reorderPages` becomes unit-aware

1. Build units: pages `i` and `i+1` form one unit when a block on `i` has a
   `spanId` whose partner lives on `i+1`; otherwise each page is its own unit.
2. Move the unit containing `from` to the position of the unit containing `to`.
3. Flatten back to pages.
4. Parity pass: walk the result; where a bound pair starts at an even index,
   insert a blank `autoPad` page before it. Repeat until stable.
5. GC: drop `autoPad` pages that are still empty and no longer needed for
   parity.

`removePage` runs the same parity pass afterwards.

## Rendering

**No changes to any renderer.** Both halves are ordinary blocks on their own
pages; existing clipping does the work. Canvas, `PDFBlock`, and the riso
separations path are all untouched, since each operates per-block.

In single-page view a spanned pair reads as two half-cut blocks on consecutive
pages. That is correct, not a bug.

### Live preview during the drag

One problem the drag model introduces: while dragging toward the seam, the
block is still an ordinary block inside its page's `overflow: hidden`, so it is
clipped at the page edge and you cannot see where it will land.

Fix: transient preview state, set from a new `onDragMove` handler and cleared
on drag end.

```ts
spanPreview: { instanceId: string; xLeft: number; y: number } | null;
```

It lives in `useZineStore` alongside `zoom` and `viewMode`, which `partialize`
already excludes from persistence, and it never touches history. `SpreadRow`
reads it and renders a ghost copy of the block on the partner page at
`xLeft - 100`, clipped by that page. Both halves are then clipped by their own
pages for the whole gesture, so the seam is continuous from first movement to
drop, with no snap at the end.

This is the one piece that could be deferred if we want the core landed
sooner — without it the feature works, but you are dropping blind.

## Inspector

For a spanned image: **Fill spread** and **Unlink halves**. Nothing else
changes; there is no "span" button.

## Out of scope

- Spanning anything other than images.
- Spanning from a sidebar drop onto the gutter — place the image first, then
  drag it across.
- Creating a span from single-page view.
- Spanning across a non-facing pair (e.g. the outer edges of two spreads).
- Imposition for saddle-stitch printing — export stays one PDF page per zine
  page.

## Verification

`npm run build` and `npm run lint`. Logic checks with a throwaway script for
the straddle arithmetic, the four-case decision tree, unit-building, and the
parity pass across a range of page counts and pair positions. Then manually in
the app:

1. Drag an image across the seam; confirm it spans and the seam is continuous.
2. Drag one half; the other tracks it and the seam holds.
3. Drag a spanned image fully back onto one page; confirm it dissolves to a
   single block and the partner is gone.
4. Confirm the preview tracks the seam continuously, with no snap on drop.
5. Resize from a corner; the seam holds and the span never dissolves.
6. Unlink, nudge one half, confirm the other stays put.
7. Confirm an ordinary block still cannot be dragged off its page.
8. Confirm the cover and a trailing odd page refuse to span.
9. Reorder a bound page; its partner follows.
10. Reorder an unrelated page across a pair; confirm a blank page is inserted
    and the pair still lands on a facing spread.
11. Cmd+Z after each of span, move, and dissolve; confirm one undo per gesture.
12. Export a composite PDF; confirm the two pages carry matching halves.
