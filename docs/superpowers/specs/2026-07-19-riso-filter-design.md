# Riso Filter — Design

**Date:** 2026-07-19
**Branch:** `feature/riso-filter`
**Inspiration:** [p5.riso](https://github.com/laurlaurland/p5.riso) — its halftone algorithm, threshold behavior, and authentic RISO ink palette. Algorithms are ported off p5 onto raw canvas; p5 is **not** a dependency.

## Summary

A per-block "Riso" effect for image blocks: circle-halftone the image in a single
riso ink color with transparent paper, controlled by an ink swatch and one
intensity slider. The effect renders on the canvas, bakes into the composite PDF
export, and powers a new **riso separations** export that produces one
black-coverage PDF per ink (plus a key layer) for actual risograph printing.

## What the user sees

### Inspector

When an **image block** is selected, `BlockInspector` gains a **Riso** section:

- **On/off toggle.** Off = block renders untouched (default; `riso` field absent).
- **Ink swatches:** a curated subset (~16) of p5.riso's 80 authentic inks —
  Black, Fluorescent Pink, Blue, Green, Teal, Purple, Orange, Red, Yellow,
  Burgundy, Medium Blue, Bright Red, Flat Gold, Hunter Green, Light Gray,
  Metallic Gold. Stored by ink *name*; the full 80-color table lives in code so
  the subset can grow later.
- **Intensity slider** (0–100): maps to the halftone threshold (p5.riso's
  `intensity`). Low = airy sparse dots, high = heavy ink coverage.
  Follows the existing continuous-gesture undo pattern: `captureHistory()` on
  pointerdown, mutate on change without pushing history.

### Canvas

The block's image is replaced by the processed halftone: dots in the ink's RGB,
everything else **fully transparent** so the page background and blocks
underneath show through — overlapping riso blocks read like layered ink passes.
While processing (first render or param change), the original image shows.

### Export (toolbar)

The Export PDF button becomes a two-option menu:

1. **Composite PDF** — current behavior; riso blocks are baked in, processed
   from `imageUrlLarge` at export time with the same algorithm.
2. **Riso separations** — downloads a set of grayscale PDFs:
   - One per distinct ink used in the document: all pages, that ink's riso
     blocks rendered as **black halftone coverage** (darkness = ink density,
     matching p5.riso's channel `export()`), all other blocks omitted.
     Filename: `<zinetitle>_<INKNAME>.pdf`.
   - One `<zinetitle>_KEY.pdf` with all untreated content — text blocks, plain
     images (grayscaled), link blocks, page backgrounds — so nothing silently
     disappears. Print it with the black drum or skip it.
   - Registration is guaranteed: every layer renders identical page geometry,
     only block visibility/colorization differs.

## Data model

New optional field on `ZineBlock` (`src/types/zine.ts`):

```ts
riso?: {
  ink: string;       // RISO ink name, e.g. "FLUORESCENTPINK"
  intensity: number; // 0–100
}
```

Only these two params persist (localStorage via the existing Zustand `persist`);
processed image data is never stored. Set/cleared via `updateBlockStyle`-style
store action with the one-shot history pattern for toggle/ink changes and the
continuous pattern for the slider.

## Processing module — `src/lib/riso.ts`

p5-free port of the p5.riso pipeline:

- `RISO_COLORS`: the full 80-entry name→RGB table from p5.riso, plus the
  curated subset list for the inspector.
- `processRisoImage(url, { ink, intensity, mode })` → `Promise<string>` (data URL):
  1. Load image with `crossOrigin='anonymous'` (CORS on `images.are.na`
     verified: `access-control-allow-origin: *`).
  2. Draw to offscreen canvas; grayscale via luminance.
  3. Circle halftone at 45°, dot pitch scaled to image resolution (the p5.riso
     default of a 10px grid at ~display size, scaled proportionally for the
     large export renders so composite and canvas look alike).
  4. Threshold the result by intensity (p5.riso's `ditherImage(…, 'none',
     threshold)` finishing pass).
  5. Colorize: dot pixels → ink RGB (`mode: 'ink'`) or black (`mode:
     'coverage'` for separations); non-dot pixels → transparent
     (`mode: 'ink'`) or white (`mode: 'coverage'`, for print masters).
- In-memory cache keyed by `url|ink|intensity|mode`. No LRU needed at this
  scale; cleared on page reload.
- On image load/CORS failure: reject; callers fall back to the original image
  (canvas) or unprocessed image (PDF) — never a broken block.

## Rendering integration

- **`ImageBlock`**: a `useRisoImage(block)` hook returns the processed data URL
  (or the original while pending/absent/failed). Re-runs when `riso` params
  change; slider changes hit the cache after first computation of each value —
  processing is debounced (~150 ms) during drags.
- **PDF**: `ZinePDF`/`PDFPage`/`PDFBlock` get an optional render mode:
  - default (composite): riso blocks use a pre-processed data URL passed in via
    a map built in `exportPDF()` before rendering (async processing happens
    outside the react-pdf tree; `imageUrlLarge` preferred).
  - `separation: { ink: string } | 'key'`: filters which blocks render;
    ink layers render riso blocks in coverage mode; the key layer renders
    untreated blocks, images grayscaled, text/backgrounds in black/gray.
- **`exportPDF.ts`**: `exportPDF()` unchanged in behavior; new
  `exportRisoSeparations()` walks the document for distinct inks, renders one
  `pdf()` document per layer sequentially, and triggers one download per file.
  Both stay behind the existing lazy-load split.

## Error handling

- CORS/load failure → block renders original image; separations export skips it
  into the key layer and the export completes (no hard failure).
- A document with zero riso blocks: separations menu item disabled (tooltip
  explains why).

## Testing

No test suite exists; `npm run build` is the correctness check (per CLAUDE.md).
Manual verification: apply effect, tweak params, undo/redo, reload persistence,
composite export, separations export with 2 inks + key layer, zero-riso
document, non-image blocks unaffected.

## Out of scope (future work)

- Dither modes (Bayer, Floyd–Steinberg, Atkinson) and halftone shapes
  (line/square/ellipse/cross) — the `riso` field and processing module are
  shaped to accept an `effect`/`shape` param later.
- RGB/CMYK channel extraction.
- Whole-zine ink separation (auto-mapping every block to N chosen inks).
- Ink assignment for text/link blocks (today they only ever print in the key
  layer).
- Halftone angle control and per-ink angle offsets for moiré control.
