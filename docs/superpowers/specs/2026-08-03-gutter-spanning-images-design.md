# Gutter-spanning images — design

**Date:** 2026-08-03
**Status:** awaiting approval

## Problem

There is no way to run a single image across a two-page spread. Blocks belong
to one page and their coordinates are percentages of that page.

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

**Geometry.** For a total image width `W` (percent of a single page width),
centred on the seam:

| Half | on page | x | width | visible |
|---|---|---|---|---|
| left | index `i` (odd) | `100 - W/2` | `W` | right `W/2` of the page |
| right | index `i+1` | `-W/2` | `W` | left `W/2` of the page |

The right half's x is always the left half's x minus 100. That single invariant
is what keeps the seam aligned.

## Decisions

| Decision | Choice |
|---|---|
| Model | Two blocks joined by a shared `spanId`; editing one mirrors to its partner; can be unlinked to compensate for gutter creep |
| Page binding | The two pages drag as a unit during reorder and can never separate |
| Parity | Auto-pad with a blank page when a pair would otherwise start on the wrong parity |

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

Rows are `[null, page0]`, `[page1, page2]`, `[page3, page4]`… so **left slots are
odd indices** and a bound pair must start at an odd index. Page 0 is the cover
and can never span.

## Store changes (`useZineStore`)

**`spanAcrossGutter(instanceId)`** — creates the pair.

- Resolve the facing partner page: from an odd index `i` the partner is `i+1`;
  from an even index `i >= 2` the partner is `i-1`. Index 0 (cover) and a
  missing partner are refused.
- Clone the block onto the partner page with a new `instanceId`, a shared
  `spanId`, and mirrored `spanSide`.
- Re-centre both halves on the seam using the geometry table above, at the
  block's current width. Explicit and predictable — spanning never leaves the
  image somewhere it isn't actually crossing the gutter.

**`fillSpread(instanceId)`** — sets a spanned pair to `W = 200`, `y = 0`,
`height = 100`, i.e. full bleed across both pages. This is the common case for
"a two-page spread with one image" and is a few lines on top of the geometry
above.

**`unlinkSpan(instanceId)`** — clears `spanId`/`spanSide` on both halves,
leaving two ordinary blocks. Used to nudge a half when the binding eats a few
mm at the gutter.

**Mirroring.** `updateBlockPosition`, `updateBlockSize`, `updateBlockStyle`, and
`updateBlockRotation` propagate to the partner when `spanId` is set:

- position → `partner.x = this.x ∓ 100`, `partner.y = this.y`
- size → identical `width`/`height`
- style and rotation → copied verbatim, including `imageOffsetX/Y`, which must
  match or the halves will not line up

A single private helper resolves the partner so each mutation stays readable.

**`reorderPages` becomes unit-aware.**

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

In single-page view a spanned pair simply reads as two half-cut blocks on
consecutive pages. That is correct, not a bug.

## Inspector

For an image block:

- **Span across gutter** — shown when the block's page has a facing partner.
- **Fill spread** and **Unlink halves** — shown when the block is already
  spanned.

## Out of scope

- Spanning anything other than images.
- Spanning across a non-facing pair (e.g. the outer edges of two spreads).
- Imposition for saddle-stitch printing — export stays one PDF page per zine
  page.

## Verification

`npm run build` and `npm run lint`. Logic checks with a throwaway script for
the slot arithmetic, unit-building, and the parity pass across a range of page
counts and pair positions. Then manually in the app:

1. Span an image; confirm the seam is continuous across the gutter.
2. Drag one half; the other tracks it and the seam holds.
3. Resize from a corner; the seam holds.
4. Unlink, nudge one half, confirm the other stays put.
5. Reorder a bound page; its partner follows.
6. Reorder an unrelated page across a pair; confirm a blank page is inserted
   and the pair still lands on a facing spread.
7. Export a composite PDF; confirm the two pages carry matching halves.
