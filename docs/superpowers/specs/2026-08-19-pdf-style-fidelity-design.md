# PDF style fidelity

**Status:** awaiting approval
**Date:** 2026-08-19

## Problem

The canvas is the design surface. Whatever a user arranges there is what they
expect the exported PDF to contain. Today five block styles are applied on the
canvas and silently discarded on export, and one more is applied in units that
mean different things to the two renderers.

Nothing catches this. A style `@react-pdf/renderer` ignores is not a type
error, so `npm run build` — the project's only correctness check — has been
green for the entire life of the bug.

| Style | Canvas | PDF today |
| --- | --- | --- |
| `rotation` | `PlacedBlock.tsx:160` | dropped |
| `borderRadius` | `PlacedBlock.tsx:207` | dropped |
| `cropShape: 'circle'` | `PlacedBlock.tsx:205` | dropped |
| `imageOffsetX/Y` | `ImageBlock.tsx:33` | dropped |
| `opacity` on image/text content | `PlacedBlock.tsx:193` | dropped (background only) |
| `fontSize` | 13 px on a 560 px page | 10 pt on a 595 pt page |

All six are reachable from the inspector except `fontSize`, which no UI can
set — but its unit gap is a live trap for whoever adds that control, so it is
in scope.

**Not in scope:** `fontFamily`. Nothing in the app writes it, and honouring it
would require `Font.register()` with real font files. It stays dead.

## Root causes

None of these are `@react-pdf/renderer` limitations. Each is a style the app
never passes, or passes to the wrong node.

**1. Radius was never passed.** `clipNode` reads `borderTopLeftRadius` and
friends, and runs only when `overflow === 'hidden'`. `PDFBlock` sets the
overflow but never a radius, so every clip is a plain rectangle.

**2. Opacity is on the wrong node.** `renderImage` reads
`opacity: node.style?.opacity` from the *image* node
(`render/lib/index.js:1250`); text reads it from run attributes. react-pdf has
no group opacity for `View`. A container's opacity therefore reaches only its
own background fill, via `drawBackground`'s
`Math.min(color.opacity, nodeOpacity)`.

**3. Rotation and clipping cannot share a node.** `renderNode`
(`render/lib/index.js:2125`) runs:

```js
ctx.save();
if (overflowHidden) clipNode(ctx, node);  // clip, in the PARENT's space
applyTransformations(ctx, node);           // then transform
```

Clip precedes transform — the reverse of CSS. Put `transform` and
`overflow: hidden` on one `View` and a rotated block is clipped by an
unrotated rectangle.

**4. `fontSize` crosses a unit boundary with no conversion.** Positions and
sizes are percentages and so survive the canvas/PDF gap untouched. `fontSize`
is a raw number handed to both renderers: 13 on a 560 px canvas page, 10 on a
595.28 pt A4 page. Canvas text is 13 x (595.28 / 560) = 13.8 pt page-relative,
so the PDF renders it at 10 pt — about 28 % too small. Correcting it therefore
makes exported text about 38 % larger.

## Design

### Structure: mirror the canvas's two-node split

`PlacedBlock` already solves the clip/transform ordering problem — the outer
div carries rotation, an inner div carries `overflow: hidden` and the radius.
`PDFBlock` adopts the same shape, so the inner node's clip is laid down after
the outer's `applyTransformations` and therefore lands in rotated space.

```
<View outer>    position, size, transform, transformOrigin
  <View inner>  overflow: hidden, borderRadius, backgroundColor, opacity
    <Image>     objectFit, objectPosition, opacity
    <Text>      fontSize (converted), color, opacity
```

`backgroundColor` moves to the inner node so it is clipped by the radius
rather than painting square corners behind a rounded image.

### A pure mapping module

The style decisions live in `src/lib/pdfBlockStyles.ts`, a pure function of
`(block, pageSize)` returning the four style objects. `PDFBlock` becomes a
thin renderer that spreads what it is handed.

This follows the pattern `spanGeometry.ts` and `pageUnits.ts` already
establish in this repo: pure module, headless verification, thin consumer. It
also means every judgement call below is one expression in one testable file,
revisable without touching the render tree.

The module handles **geometry and opacity only**. Colour remains in
`PDFBlock`, because colour is the one thing that legitimately varies by
separation (`hexToGray` on the key plate). Geometry must never vary by
separation — see below.

### Radius, and the stadium

`block.borderRadius` is 0–50 meaning a CSS percentage; react-pdf wants points.
Both radius cases resolve against the smaller dimension:

```ts
const radiusPt =
  block.cropShape === 'circle' ? Math.min(width, height) / 2
  : block.borderRadius        ? (block.borderRadius / 100) * Math.min(width, height)
  : 0;
```

A square block at `borderRadius: 50` and a square block with
`cropShape: 'circle'` both land on `side / 2`. One circle, two routes, no
discontinuity at the boundary.

**Accepted divergence.** CSS `border-radius: 50%` on a non-square block draws
an *ellipse*; a single-valued PDF radius can only draw a *stadium* — round
ends, straight sides. `clipNode` clamps every corner to
`Math.min(r, 0.5 * width, 0.5 * height)`, so the stadium is enforced by the
library regardless of what we pass. On square blocks the two agree exactly.

A true ellipse is reachable via `Svg` + `ClipPath` + `Ellipse`, which the
primitives package exposes. It is deliberately not taken: it would give
circle-cropped images a second render path distinct from every other block,
including the riso and separation paths, to fix an approximation that is
invisible on square crops.

### Opacity, pushed to the leaves

`opacity` is applied to every node that actually paints: the inner `View`
(background), and every `Image` and `Text` leaf — including the ones inside
link blocks and the untyped fallback block, which render an image and a caption
together. Not the outer node, which paints nothing.

**Accepted divergence.** CSS opacity composites a group: background and image
fade together as one. Per-leaf opacity fades each independently, so a
translucent image over a translucent background composites slightly
differently. Blocks have one painting child plus an optional background, so
the difference is invisible unless both are translucent at once.

### Font size conversion

```ts
const ptPerPx = pageSize.widthPt / CANVAS_PAGE_WIDTH;
fontSize: (block.fontSize ?? 13) * ptPerPx
```

The default becomes 13, matching the canvas, in place of the current
unexplained 10. Because the factor is page-relative, A5 text scales down with
the page instead of staying at a fixed point size.

`CANVAS_PAGE_WIDTH` currently lives in `ZinePage.tsx`, a canvas *component*.
The PDF tree must not import from `components/canvas/`, so the constant moves
to `src/lib/pageSizes.ts` alongside the other page geometry. Only `ZinePage`
and `SpreadRow` import it today.

**This is the only change that alters existing documents' output** — every
text block in every saved zine exports about 38 % larger (10 pt to 13.8 pt on
A4). It lands as its own commit so it can be reverted independently of the
rest.

## Interactions

**Separations must not vary.** `exportRisoSeparations()` renders one PDF per
ink plus a key plate, and those plates are physically overprinted. Geometry
that differs between plates is misregistration — worse than no separations at
all. Because `pdfBlockStyles` is a pure function of `(block, pageSize)` and
never consults `separation`, this holds by construction rather than by
discipline. Only colour branches on separation, and it stays in `PDFBlock`.

**Spanned pairs survive rotation.** A span's two halves are the same size and
sit at `xLeft` and `xLeft - 100` on facing pages — which is the *same world
position* once the page offset is applied. Rotating each half about its own
centre is therefore rotating about a single shared world point, and the seam
holds. `updateBlockSize`, `updateBlockStyle`, and `updateBlockRotation`
already mirror to the partner, so both halves receive identical values. Radius
applies to the whole span box, with each page showing its half of the rounded
rectangle. This must be verified, not assumed.

**Riso ordering is unchanged.** A riso block's `risoImage` is a pre-processed
data URL substituted for the source. Halftoning happens first, then
`objectFit`/`objectPosition`, then the clip — the same order as the canvas,
where the riso URL goes into an `img` inside the rounded, clipping wrapper.

**Page-edge clipping is unaffected.** Content outside the page box falls
outside the PDF MediaBox and does not print. Gutter spanning already relies on
this. A rotated block overhanging a page edge is clipped equivalently on both
sides.

## Verification

Two layers, because they fail differently.

**Layer 1 — the mapping, asserted directly.** A headless script exercises
`pdfBlockStyles.ts` against exact expected values: a 90° rotation emits the
right `transform` string, a 50 % radius on a 100 × 200 pt block yields 50 pt,
a circle crop on that block also yields 50 pt, pan defaults to `50% 50%`,
`fontSize` converts per page size. Fast, precise, and it localises a failure to
one expression.

**Layer 2 — the bytes, as a guard.** Layer 1 passes happily if `PDFBlock`
forgets to spread what the module returns; only the rendered file proves the
styles reached the page. A fixture document renders through `pdf()` to a
buffer, its content streams are inflated, and the script asserts the operator
families each style must emit: a non-identity `cm` for rotation, curve
operators followed by `W n` for a rounded clip, a shifted image placement for
pan, and — for a translucent image — a `/Gs<N> gs` operator backed by an
`ExtGState` carrying `/ca` below 1, which is how pdfkit encodes fill alpha
(`pdfkit.js:1931-1962`). There is no literal opacity operator to grep for. Each
assertion is paired with a negative control — the same fixture without the
style — so a test that would pass on anything is caught.

Both scripts are written before the implementation and must fail first, matching
how `spanGeometry` and `pageUnits` were built.

Per repo convention: `npm run build` and `npm run lint` also pass, with the one
known `ChannelPicker.tsx` exhaustive-deps warning.

## Documentation

The "PDF rendering" section of `CLAUDE.md` currently states that rotation,
`borderRadius`, circle crop, and image pan are canvas-only and dropped on
export. That becomes wrong when this lands and must be rewritten, including the
two accepted divergences (stadium, per-leaf opacity) and the `fontSize`
conversion.

## Out of scope

- `fontFamily`, and any font registration.
- Adding inspector controls for `fontSize` or `fontFamily`.
- A true elliptical circle crop.
- Any change to canvas rendering. The canvas is the reference; the PDF moves
  toward it.
