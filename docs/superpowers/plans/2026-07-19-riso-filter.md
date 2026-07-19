# Riso Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per-block risograph halftone effect (ink color + intensity) for image blocks, rendered on canvas, baked into the composite PDF, and exportable as per-ink black-coverage separations for actual riso printing.

**Architecture:** A p5-free canvas port of p5.riso's halftone pipeline lives in `src/lib/riso.ts` (pure functions + in-memory cache producing data URLs). The persisted document stores only `riso: { ink, intensity }` per block. Canvas rendering swaps the `<img>` src via a `useRisoImage` hook; PDF export pre-processes images outside the react-pdf tree and passes an `instanceId → dataURL` map down through `ZinePDF`, which also accepts a `separation` render mode that filters blocks and forces black/grayscale.

**Tech Stack:** Vite 8 + React 19 + TypeScript, Zustand 5, @react-pdf/renderer (lazy-loaded), Tailwind CSS v4. No new dependencies — p5 is NOT added.

**Spec:** `docs/superpowers/specs/2026-07-19-riso-filter-design.md`

## Global Constraints

- **No test suite exists; `npm run build` (tsc -b && vite build) is the correctness check** (per CLAUDE.md — this overrides the default TDD cycle; tasks end with a build check and, where meaningful, a manual browser check via `npm run dev` at http://localhost:5173).
- Do not add any npm dependency. p5 must not be imported.
- Block coordinates stay percentage-based; the riso effect never changes layout fields.
- `@react-pdf/renderer` must stay out of the main bundle (only imported via the existing `await import('../../lib/exportPDF')` lazy path).
- Only `document` is persisted (Zustand `persist` + `partialize`); never store processed image data in the store.
- Continuous slider gestures: `captureHistory()` on pointerdown, then mutate via `updateBlockStyle` on every change without pushing history (existing pattern in `BlockInspector.tsx`).
- Commit messages end with: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` (use a second `-m` flag).
- Work happens on the existing `feature/riso-filter` branch.

---

### Task 1: Riso ink data + document model field

**Files:**
- Create: `src/lib/risoColors.ts`
- Modify: `src/types/zine.ts` (add `RisoEffect`, add `riso?` to `ZineBlock`)
- Modify: `src/store/useZineStore.ts:29` (extend the `updateBlockStyle` Pick union)

**Interfaces:**
- Consumes: nothing (first task).
- Produces:
  - `RISO_COLORS: RisoInk[]` where `RisoInk = { name: string; color: [number, number, number] }`
  - `CURATED_RISO_INKS: string[]` (16 ink names shown in the inspector)
  - `getRisoInk(name: string): RisoInk | undefined`
  - `risoInkCss(name: string): string` (CSS `rgb(...)` string)
  - `RisoEffect = { ink: string; intensity: number }` exported from `src/types/zine.ts`
  - `ZineBlock.riso?: RisoEffect`
  - `updateBlockStyle` accepts `{ riso: RisoEffect | undefined }`

- [ ] **Step 1: Create `src/lib/risoColors.ts`**

The full 80-ink table is copied from p5.riso (`lib/p5.riso.js` `RISOCOLORS`), reshaped to tuples:

```ts
// Authentic RISO ink colors, from p5.riso (https://github.com/laurlaurland/p5.riso)
export interface RisoInk {
  name: string;
  color: [number, number, number];
}

export const RISO_COLORS: RisoInk[] = [
  { name: 'BLACK', color: [0, 0, 0] },
  { name: 'BURGUNDY', color: [145, 78, 114] },
  { name: 'BLUE', color: [0, 120, 191] },
  { name: 'GREEN', color: [0, 169, 92] },
  { name: 'MEDIUMBLUE', color: [50, 85, 164] },
  { name: 'BRIGHTRED', color: [241, 80, 96] },
  { name: 'RISOFEDERALBLUE', color: [61, 85, 136] },
  { name: 'PURPLE', color: [118, 91, 167] },
  { name: 'TEAL', color: [0, 131, 138] },
  { name: 'FLATGOLD', color: [187, 139, 65] },
  { name: 'HUNTERGREEN', color: [64, 112, 96] },
  { name: 'RED', color: [255, 102, 94] },
  { name: 'BROWN', color: [146, 95, 82] },
  { name: 'YELLOW', color: [255, 232, 0] },
  { name: 'MARINERED', color: [210, 81, 94] },
  { name: 'ORANGE', color: [255, 108, 47] },
  { name: 'FLUORESCENTPINK', color: [255, 72, 176] },
  { name: 'LIGHTGRAY', color: [136, 137, 138] },
  { name: 'METALLICGOLD', color: [172, 147, 110] },
  { name: 'CRIMSON', color: [228, 93, 80] },
  { name: 'FLUORESCENTORANGE', color: [255, 116, 119] },
  { name: 'CORNFLOWER', color: [98, 168, 229] },
  { name: 'SKYBLUE', color: [73, 130, 207] },
  { name: 'SEABLUE', color: [0, 116, 162] },
  { name: 'LAKE', color: [35, 91, 168] },
  { name: 'INDIGO', color: [72, 77, 122] },
  { name: 'MIDNIGHT', color: [67, 80, 96] },
  { name: 'MIST', color: [213, 228, 192] },
  { name: 'GRANITE', color: [165, 170, 168] },
  { name: 'CHARCOAL', color: [112, 116, 124] },
  { name: 'SMOKYTEAL', color: [95, 130, 137] },
  { name: 'STEEL', color: [55, 94, 119] },
  { name: 'SLATE', color: [94, 105, 94] },
  { name: 'TURQUOISE', color: [0, 170, 147] },
  { name: 'EMERALD', color: [25, 151, 93] },
  { name: 'GRASS', color: [57, 126, 88] },
  { name: 'FOREST', color: [81, 110, 90] },
  { name: 'SPRUCE', color: [74, 99, 93] },
  { name: 'MOSS', color: [104, 114, 77] },
  { name: 'SEAFOAM', color: [98, 194, 177] },
  { name: 'KELLYGREEN', color: [103, 179, 70] },
  { name: 'LIGHTTEAL', color: [0, 157, 165] },
  { name: 'IVY', color: [22, 155, 98] },
  { name: 'PINE', color: [35, 126, 116] },
  { name: 'LAGOON', color: [47, 97, 101] },
  { name: 'VIOLET', color: [157, 122, 210] },
  { name: 'ORCHID', color: [170, 96, 191] },
  { name: 'PLUM', color: [132, 89, 145] },
  { name: 'RAISIN', color: [119, 93, 122] },
  { name: 'GRAPE', color: [108, 93, 128] },
  { name: 'SCARLET', color: [246, 80, 88] },
  { name: 'TOMATO', color: [210, 81, 94] },
  { name: 'CRANBERRY', color: [209, 81, 122] },
  { name: 'MAROON', color: [158, 76, 110] },
  { name: 'RASPBERRYRED', color: [209, 81, 122] },
  { name: 'BRICK', color: [167, 81, 84] },
  { name: 'LIGHTLIME', color: [227, 237, 85] },
  { name: 'SUNFLOWER', color: [255, 181, 17] },
  { name: 'MELON', color: [255, 174, 59] },
  { name: 'APRICOT', color: [246, 160, 77] },
  { name: 'PAPRIKA', color: [238, 127, 75] },
  { name: 'PUMPKIN', color: [255, 111, 76] },
  { name: 'BRIGHTOLIVEGREEN', color: [180, 159, 41] },
  { name: 'BRIGHTGOLD', color: [186, 128, 50] },
  { name: 'COPPER', color: [189, 100, 57] },
  { name: 'MAHOGANY', color: [142, 89, 90] },
  { name: 'BISQUE', color: [242, 205, 207] },
  { name: 'BUBBLEGUM', color: [249, 132, 202] },
  { name: 'LIGHTMAUVE', color: [230, 181, 201] },
  { name: 'DARKMAUVE', color: [189, 140, 166] },
  { name: 'WINE', color: [145, 78, 114] },
  { name: 'GRAY', color: [146, 141, 136] },
  { name: 'CORAL', color: [255, 142, 145] },
  { name: 'WHITE', color: [255, 255, 255] },
  { name: 'AQUA', color: [94, 200, 229] },
  { name: 'MINT', color: [130, 216, 213] },
  { name: 'CLEARMEDIUM', color: [242, 242, 242] },
  { name: 'FLUORESCENTYELLOW', color: [255, 233, 22] },
  { name: 'FLUORESCENTRED', color: [255, 76, 101] },
  { name: 'FLUORESCENTGREEN', color: [68, 214, 44] },
];

// Subset shown as inspector swatches (per spec)
export const CURATED_RISO_INKS: string[] = [
  'BLACK',
  'FLUORESCENTPINK',
  'BLUE',
  'GREEN',
  'MEDIUMBLUE',
  'BRIGHTRED',
  'PURPLE',
  'TEAL',
  'FLATGOLD',
  'HUNTERGREEN',
  'RED',
  'YELLOW',
  'ORANGE',
  'BURGUNDY',
  'LIGHTGRAY',
  'METALLICGOLD',
];

export function getRisoInk(name: string): RisoInk | undefined {
  return RISO_COLORS.find((c) => c.name === name);
}

export function risoInkCss(name: string): string {
  const ink = getRisoInk(name);
  return ink ? `rgb(${ink.color[0]}, ${ink.color[1]}, ${ink.color[2]})` : '#000';
}
```

- [ ] **Step 2: Add `RisoEffect` to `src/types/zine.ts`**

Insert above `export interface ZineBlock`:

```ts
export interface RisoEffect {
  ink: string;       // name from RISO_COLORS, e.g. "FLUORESCENTPINK"
  intensity: number; // 0–100 halftone threshold: low = airy dots, high = heavy coverage
}
```

Inside `ZineBlock`, after `imageOffsetY?: number;` add:

```ts
  riso?: RisoEffect;       // riso halftone effect (image blocks only)
```

- [ ] **Step 3: Extend `updateBlockStyle` signature in `src/store/useZineStore.ts:29`**

Change the Pick union to include `'riso'`:

```ts
  updateBlockStyle: (instanceId: string, style: Partial<Pick<ZineBlock, 'fontSize' | 'fontFamily' | 'backgroundColor' | 'color' | 'opacity' | 'borderRadius' | 'cropShape' | 'imageOffsetX' | 'imageOffsetY' | 'riso'>>) => void;
```

No implementation change needed — the existing `{ ...b, ...style }` spread already handles the new key, and `riso: undefined` clears it (JSON persistence drops undefined keys).

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: exits 0 (tsc + vite succeed).

- [ ] **Step 5: Commit**

```bash
git add src/lib/risoColors.ts src/types/zine.ts src/store/useZineStore.ts
git commit -m "feat: riso ink palette data and riso field on ZineBlock" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Riso processing module

**Files:**
- Create: `src/lib/riso.ts`

**Interfaces:**
- Consumes: `getRisoInk` from `src/lib/risoColors.ts` (Task 1).
- Produces:
  - `RisoParams = { ink: string; intensity: number; mode: 'ink' | 'coverage' }`
  - `processRisoImage(url: string, params: RisoParams): Promise<string>` → PNG data URL. `'ink'` mode: dots in ink RGB, non-dots transparent. `'coverage'` mode: black dots on opaque white (print master).
  - `grayscaleImage(url: string): Promise<string>` → PNG data URL, luminance grayscale (for the KEY layer).
  - `hexToGray(hex: string): string` → `#rrggbb` luminance gray (non-`#rrggbb` input returned unchanged).
  - All results cached in-memory by `url|ink|intensity|mode` (or `url|gray`); failed promises are evicted so retries are possible.

- [ ] **Step 1: Create `src/lib/riso.ts`**

A faithful canvas port of p5.riso's `halftoneImage` (circle shape, 45° screen angle) finished with its `ditherImage(…, 'none', threshold)` pass, plus colorization. Pipeline: load → grayscale (alpha composited onto white) → rotate −45° onto a 2× white canvas → stamp circle dots sized by darkness on a grid → rotate back +45° → crop center → threshold by intensity → colorize.

```ts
// Canvas port of p5.riso's halftone pipeline (https://github.com/laurlaurland/p5.riso)
// — no p5 dependency. Produces data URLs; results are cached in-memory only.
import { getRisoInk } from './risoColors';

export interface RisoParams {
  ink: string;
  intensity: number; // 0–100
  mode: 'ink' | 'coverage';
}

const MAX_DIM = 2000;    // cap processing resolution (≈300dpi for A5)
const BASE_DIM = 1200;   // p5.riso's default 10px grid reads right at ~1200px
const BASE_PITCH = 10;
const ANGLE = (45 * Math.PI) / 180;

const cache = new Map<string, Promise<string>>();

function cached(key: string, make: () => Promise<string>): Promise<string> {
  let p = cache.get(key);
  if (!p) {
    p = make();
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return p;
}

export function processRisoImage(url: string, params: RisoParams): Promise<string> {
  const key = `${url}|${params.ink}|${params.intensity}|${params.mode}`;
  return cached(key, () => renderRiso(url, params));
}

export function grayscaleImage(url: string): Promise<string> {
  return cached(`${url}|gray`, () => renderGrayscale(url));
}

export function hexToGray(hex: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const lum = Math.round(0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255));
  const g = lum.toString(16).padStart(2, '0');
  return `#${g}${g}${g}`;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous'; // images.are.na sends access-control-allow-origin: *
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`riso: failed to load image ${url}`));
    img.src = url;
  });
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('riso: 2d canvas context unavailable');
  return ctx;
}

// Draw the source scaled to ≤ MAX_DIM and reduce to luminance grayscale,
// compositing transparent pixels onto white (transparent must never print).
function grayscaleCanvas(img: HTMLImageElement): HTMLCanvasElement {
  const scale = Math.min(1, MAX_DIM / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const c = makeCanvas(w, h);
  const ctx = ctx2d(c);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h);
  const d = data.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }
  ctx.putImageData(data, 0, 0);
  return c;
}

// p5.riso halftoneImage, circle shape, 45°: rotate onto a 2× canvas, stamp
// dots sized by darkness on a pitch grid, rotate back, crop the center.
function halftone(src: HTMLCanvasElement, pitch: number): HTMLCanvasElement {
  const w = src.width;
  const h = src.height;
  const w2 = w * 2;
  const h2 = h * 2;

  const rot = makeCanvas(w2, h2);
  const rctx = ctx2d(rot);
  rctx.fillStyle = '#fff';
  rctx.fillRect(0, 0, w2, h2);
  rctx.translate(w, h);
  rctx.rotate(-ANGLE);
  rctx.drawImage(src, -w / 2, -h / 2);
  const rotData = rctx.getImageData(0, 0, w2, h2).data;

  const dots = makeCanvas(w2, h2);
  const dctx = ctx2d(dots);
  dctx.fillStyle = '#fff';
  dctx.fillRect(0, 0, w2, h2);
  dctx.fillStyle = '#000';
  for (let y = 0; y < h2; y += pitch) {
    for (let x = 0; x < w2; x += pitch) {
      const v = rotData[(y * w2 + x) * 4];
      if (v < 255) {
        const darkness = (255 - v) / 255;
        dctx.beginPath();
        dctx.arc(x + pitch / 2, y + pitch / 2, (pitch * darkness) / 2, 0, Math.PI * 2);
        dctx.fill();
      }
    }
  }

  rctx.setTransform(1, 0, 0, 1, 0, 0);
  rctx.fillStyle = '#fff';
  rctx.fillRect(0, 0, w2, h2);
  rctx.translate(w, h);
  rctx.rotate(ANGLE);
  rctx.drawImage(dots, -w, -h);

  const out = makeCanvas(w, h);
  ctx2d(out).drawImage(rot, w / 2, h / 2, w, h, 0, 0, w, h);
  return out;
}

async function renderRiso(url: string, { ink, intensity, mode }: RisoParams): Promise<string> {
  const inkColor = getRisoInk(ink)?.color ?? [0, 0, 0];
  const img = await loadImage(url);
  const gray = grayscaleCanvas(img);
  const pitch = Math.max(4, Math.round((BASE_PITCH * Math.max(gray.width, gray.height)) / BASE_DIM));
  const ht = halftone(gray, pitch);

  // p5.riso finishes with ditherImage(result, 'none', intensity): a plain
  // threshold. 0 = no ink at all, 50 ≈ p5.riso's default 127, 100 = heaviest.
  const threshold = Math.round((intensity / 100) * 255);
  const ctx = ctx2d(ht);
  const data = ctx.getImageData(0, 0, ht.width, ht.height);
  const d = data.data;
  const [r, g, b] = mode === 'ink' ? inkColor : [0, 0, 0];
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] < threshold) {
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
      d[i + 3] = 255;
    } else if (mode === 'ink') {
      d[i + 3] = 0; // paper shows through
    } else {
      d[i] = d[i + 1] = d[i + 2] = 255;
      d[i + 3] = 255; // opaque white on the print master
    }
  }
  ctx.putImageData(data, 0, 0);
  return ht.toDataURL('image/png');
}

async function renderGrayscale(url: string): Promise<string> {
  const img = await loadImage(url);
  return grayscaleCanvas(img).toDataURL('image/png');
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: exits 0. (`riso.ts` is not imported anywhere yet — tsc still type-checks it as part of the project.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/riso.ts
git commit -m "feat: p5-free riso halftone processing module" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Canvas rendering — useRisoImage hook + ImageBlock

**Files:**
- Create: `src/hooks/useRisoImage.ts` (new `src/hooks/` directory)
- Modify: `src/components/blocks/ImageBlock.tsx`

**Interfaces:**
- Consumes: `processRisoImage` (Task 2), `ZineBlock.riso` (Task 1).
- Produces: `useRisoImage(block: ZineBlock): string | undefined` — processed 'ink'-mode data URL, or `undefined` while pending / when the effect is off / on failure. Debounces param changes by 150 ms.

- [ ] **Step 1: Create `src/hooks/useRisoImage.ts`**

```ts
import { useEffect, useState } from 'react';
import type { ZineBlock } from '../types/zine';
import { processRisoImage } from '../lib/riso';

// Returns the riso-processed data URL for a block's display image, or
// undefined while processing / when the effect is off / if processing fails
// (callers fall back to the original image). Param changes are debounced so
// slider drags don't process every intermediate value.
export function useRisoImage(block: ZineBlock): string | undefined {
  const [processed, setProcessed] = useState<string | undefined>(undefined);
  const url = block.imageUrl;
  const ink = block.riso?.ink;
  const intensity = block.riso?.intensity;
  const enabled = block.riso !== undefined && url !== undefined;

  useEffect(() => {
    if (!enabled) {
      setProcessed(undefined);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      processRisoImage(url!, { ink: ink!, intensity: intensity!, mode: 'ink' })
        .then((dataUrl) => {
          if (!cancelled) setProcessed(dataUrl);
        })
        .catch((e) => {
          console.warn(e);
          if (!cancelled) setProcessed(undefined);
        });
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [enabled, url, ink, intensity]);

  return enabled ? processed : undefined;
}
```

- [ ] **Step 2: Use it in `src/components/blocks/ImageBlock.tsx`**

Add the import and hook call (the hook must run before the early return), and swap the `src`:

```tsx
import type { ZineBlock } from '../../types/zine';
import { useRisoImage } from '../../hooks/useRisoImage';

interface Props {
  block: ZineBlock;
  onNaturalSize?: (width: number, height: number) => void;
}

export default function ImageBlock({ block, onNaturalSize }: Props) {
  const risoUrl = useRisoImage(block);

  if (!block.imageUrl) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#e7e5e4', color: '#a8a29e', fontSize: 12 }}>
        Image
      </div>
    );
  }

  return (
    <img
      src={risoUrl ?? block.imageUrl}
      alt={block.title ?? ''}
      referrerPolicy="no-referrer"
      draggable={false}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        objectPosition: `${block.imageOffsetX ?? 50}% ${block.imageOffsetY ?? 50}%`,
        pointerEvents: 'none',
      }}
      onLoad={(e) => {
        const img = e.currentTarget;
        if (img.naturalWidth && img.naturalHeight) {
          onNaturalSize?.(img.naturalWidth, img.naturalHeight);
        }
      }}
      onError={(e) => {
        const img = e.currentTarget;
        if (!risoUrl && block.imageUrlLarge && img.src !== block.imageUrlLarge) {
          img.src = block.imageUrlLarge;
        }
      }}
    />
  );
}
```

Note the `!risoUrl` guard added to `onError` so the large-image fallback never fights the processed data URL.

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useRisoImage.ts src/components/blocks/ImageBlock.tsx
git commit -m "feat: render riso-processed images on the canvas" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Inspector Riso section

**Files:**
- Modify: `src/components/inspector/BlockInspector.tsx`

**Interfaces:**
- Consumes: `CURATED_RISO_INKS`, `risoInkCss` (Task 1); `updateBlockStyle` with `riso` (Task 1); `captureHistory` (existing).
- Produces: the user-facing Riso UI. Defaults on enable: `{ ink: 'FLUORESCENTPINK', intensity: 50 }`.

- [ ] **Step 1: Add the import**

At the top of `BlockInspector.tsx`:

```ts
import { CURATED_RISO_INKS, risoInkCss } from '../../lib/risoColors';
```

- [ ] **Step 2: Add the Riso section**

Inside the `{isImage && (<>…</>)}` fragment, after the closing `</Section>` of "Crop position", insert (riso applies only to true image blocks with an image, per spec — hence the extra `block.type === 'image'` check inside `isImage`):

```tsx
            {/* Riso halftone effect */}
            {block.type === 'image' && block.imageUrl && (
              <Section label="Riso">
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => {
                      captureHistory();
                      updateBlockStyle(selectedInstanceId, {
                        riso: block.riso ? undefined : { ink: 'FLUORESCENTPINK', intensity: 50 },
                      });
                    }}
                    className={`text-xs rounded px-2 py-1.5 transition-colors ${
                      block.riso
                        ? 'bg-stone-800 text-white hover:bg-stone-700'
                        : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                    }`}
                  >
                    {block.riso ? 'Riso on' : 'Riso off'}
                  </button>

                  {block.riso && (
                    <>
                      <div className="grid grid-cols-8 gap-1">
                        {CURATED_RISO_INKS.map((name) => (
                          <button
                            key={name}
                            title={name}
                            onClick={() => {
                              captureHistory();
                              updateBlockStyle(selectedInstanceId, { riso: { ...block.riso!, ink: name } });
                            }}
                            className={`w-4 h-4 rounded-sm border ${
                              block.riso!.ink === name
                                ? 'border-stone-900 ring-1 ring-stone-900'
                                : 'border-stone-200'
                            }`}
                            style={{ backgroundColor: risoInkCss(name) }}
                          />
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={1}
                          value={block.riso!.intensity}
                          onPointerDown={captureHistory}
                          onChange={(e) =>
                            updateBlockStyle(selectedInstanceId, {
                              riso: { ...block.riso!, intensity: parseFloat(e.target.value) },
                            })
                          }
                          className="flex-1 h-1 accent-stone-800"
                        />
                        <span className="text-xs text-stone-500 w-8 text-right">{block.riso!.intensity}</span>
                      </div>
                    </>
                  )}
                </div>
              </Section>
            )}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 4: Manual browser check**

Run `npm run dev`, open http://localhost:5173 (needs a valid Are.na token + a channel with images):
1. Drag an image onto a page, select it → inspector shows the Riso section with "Riso off".
2. Click the toggle → after ~a second the image becomes pink halftone dots; page background visible between dots.
3. Click other swatches → ink color changes.
4. Drag the intensity slider → coverage gets airier (left) / heavier (right); no per-tick jank.
5. Cmd+Z → steps back through the riso changes.
6. Reload the page → the effect re-appears (params persisted, image re-processed).

- [ ] **Step 5: Commit**

```bash
git add src/components/inspector/BlockInspector.tsx
git commit -m "feat: riso effect controls in block inspector" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Composite PDF export with riso baked in

**Files:**
- Modify: `src/components/pdf/ZinePDF.tsx`
- Modify: `src/components/pdf/PDFPage.tsx`
- Modify: `src/components/pdf/PDFBlock.tsx`
- Modify: `src/lib/exportPDF.ts`

**Interfaces:**
- Consumes: `processRisoImage` (Task 2), `ZineBlock.riso` (Task 1).
- Produces (used again by Task 6):
  - `ZinePDF` props: `{ document: ZineDocument; risoImages?: Record<string, string>; separation?: Separation }`
  - `export type Separation = { kind: 'ink'; ink: string } | { kind: 'key'; includeInstanceIds?: string[] }` exported from `ZinePDF.tsx` (defined now, consumed in Task 6)
  - `PDFPage` props gain `risoImages?: Record<string, string>; separation?: Separation`
  - `PDFBlock` props gain `risoImage?: string; separation?: Separation`
  - `exportPDF(document)` unchanged signature; now pre-processes riso blocks ('ink' mode, `imageUrlLarge ?? imageUrl`) into the map before rendering.
  - Internal helpers in `exportPDF.ts` reused by Task 6: `allBlocks(doc)`, `bestUrl(block)`, `safeTitle(title)`, `renderPDF(doc, risoImages, separation?)`, `downloadBlob(blob, filename)`.

- [ ] **Step 1: Rewrite `src/components/pdf/ZinePDF.tsx`**

```tsx
import { Document } from '@react-pdf/renderer';
import type { ZineDocument } from '../../types/zine';
import { PAGE_SIZES } from '../../lib/pageSizes';
import PDFPage from './PDFPage';

// Separation render mode for riso printing: an ink layer shows only that
// ink's riso blocks as black coverage; the key layer shows untreated blocks
// (plus any riso blocks listed in includeInstanceIds — processing failures).
export type Separation =
  | { kind: 'ink'; ink: string }
  | { kind: 'key'; includeInstanceIds?: string[] };

interface Props {
  document: ZineDocument;
  risoImages?: Record<string, string>; // instanceId → processed data URL
  separation?: Separation;
}

export default function ZinePDF({ document: doc, risoImages = {}, separation }: Props) {
  const pageSize = PAGE_SIZES[doc.pageSize];

  return (
    <Document title={doc.title}>
      {doc.pages
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((page) => (
          <PDFPage
            key={page.id}
            page={page}
            pageSize={pageSize}
            risoImages={risoImages}
            separation={separation}
          />
        ))}
    </Document>
  );
}
```

- [ ] **Step 2: Rewrite `src/components/pdf/PDFPage.tsx`**

```tsx
import { Page, View } from '@react-pdf/renderer';
import type { ZineBlock, ZinePage } from '../../types/zine';
import type { PageSize } from '../../types/zine';
import { hexToGray } from '../../lib/riso';
import type { Separation } from './ZinePDF';
import PDFBlock from './PDFBlock';

interface Props {
  page: ZinePage;
  pageSize: PageSize;
  risoImages?: Record<string, string>;
  separation?: Separation;
}

function isVisible(block: ZineBlock, separation: Separation | undefined, risoImages: Record<string, string>): boolean {
  if (!separation) return true;
  if (separation.kind === 'ink') {
    // only this ink's blocks, and only when coverage processing succeeded
    return block.riso?.ink === separation.ink && risoImages[block.instanceId] !== undefined;
  }
  return !block.riso || (separation.includeInstanceIds?.includes(block.instanceId) ?? false);
}

export default function PDFPage({ page, pageSize, risoImages = {}, separation }: Props) {
  const background = !separation
    ? (page.backgroundColor ?? '#ffffff')
    : separation.kind === 'ink'
      ? '#ffffff'
      : hexToGray(page.backgroundColor ?? '#ffffff');

  return (
    <Page
      size={[pageSize.widthPt, pageSize.heightPt]}
      style={{ backgroundColor: background, position: 'relative' }}
    >
      <View style={{ position: 'relative', width: '100%', height: '100%' }}>
        {page.blocks
          .slice()
          .sort((a, b) => a.zIndex - b.zIndex)
          .filter((block) => isVisible(block, separation, risoImages))
          .map((block) => (
            <PDFBlock
              key={block.instanceId}
              block={block}
              pageSize={pageSize}
              risoImage={risoImages[block.instanceId]}
              separation={separation}
            />
          ))}
      </View>
    </Page>
  );
}
```

- [ ] **Step 3: Update `src/components/pdf/PDFBlock.tsx`**

Full new content:

```tsx
import { View, Text, Image } from '@react-pdf/renderer';
import type { ZineBlock } from '../../types/zine';
import type { PageSize } from '../../types/zine';
import { hexToGray } from '../../lib/riso';
import type { Separation } from './ZinePDF';

interface Props {
  block: ZineBlock;
  pageSize: PageSize;
  risoImage?: string;   // pre-processed data URL (riso 'ink'/'coverage', or key-layer grayscale)
  separation?: Separation;
}

export default function PDFBlock({ block, pageSize, risoImage, separation }: Props) {
  const left = (block.x / 100) * pageSize.widthPt;
  const top = (block.y / 100) * pageSize.heightPt;
  const width = (block.width / 100) * pageSize.widthPt;
  const height = (block.height / 100) * pageSize.heightPt;

  const backgroundColor = !separation
    ? (block.backgroundColor ?? 'transparent')
    : separation.kind === 'key' && block.backgroundColor
      ? hexToGray(block.backgroundColor)
      : 'transparent';

  const containerStyle = {
    position: 'absolute' as const,
    left,
    top,
    width,
    height,
    overflow: 'hidden' as const,
    opacity: block.opacity ?? 1,
    backgroundColor,
  };

  const imageSrc = risoImage ?? block.imageUrlLarge ?? block.imageUrl;
  const textColor = separation?.kind === 'key' ? '#000000' : (block.color ?? '#000000');

  if (block.type === 'image' && imageSrc) {
    return (
      <View style={containerStyle}>
        <Image src={imageSrc} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </View>
    );
  }

  if (block.type === 'text') {
    return (
      <View style={containerStyle}>
        <Text
          style={{
            fontSize: block.fontSize ?? 10,
            fontFamily: undefined,
            color: textColor,
            padding: 4,
          }}
        >
          {block.content ?? block.title ?? ''}
        </Text>
      </View>
    );
  }

  if (block.type === 'link') {
    return (
      <View style={{ ...containerStyle, border: '1pt solid #e7e5e4' }}>
        {imageSrc && (
          <Image src={imageSrc} style={{ width: '100%', height: '70%', objectFit: 'cover' }} />
        )}
        <Text style={{ fontSize: 8, padding: 4, color: '#1c1917' }}>
          {block.linkTitle ?? block.linkUrl ?? ''}
        </Text>
      </View>
    );
  }

  if ((block.type === 'media' || block.type === 'attachment') && imageSrc) {
    return (
      <View style={containerStyle}>
        <Image src={imageSrc} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </View>
    );
  }

  // Fallback: title text
  return (
    <View style={{ ...containerStyle, backgroundColor: '#f5f5f4', border: '1pt solid #e7e5e4' }}>
      <Text style={{ fontSize: 8, padding: 4, color: '#78716c' }}>
        {block.title ?? block.type}
      </Text>
    </View>
  );
}
```

- [ ] **Step 4: Rewrite `src/lib/exportPDF.ts`**

`exportPDF` keeps its signature but pre-processes riso blocks; the helpers are shared with Task 6's `exportRisoSeparations`:

```ts
import { pdf } from '@react-pdf/renderer';
import { createElement } from 'react';
import ZinePDF from '../components/pdf/ZinePDF';
import type { Separation } from '../components/pdf/ZinePDF';
import type { ZineBlock, ZineDocument } from '../types/zine';
import { processRisoImage } from './riso';

function allBlocks(doc: ZineDocument): ZineBlock[] {
  return doc.pages.flatMap((p) => p.blocks);
}

function bestUrl(block: ZineBlock): string | undefined {
  return block.imageUrlLarge ?? block.imageUrl;
}

function safeTitle(title: string): string {
  return title.replace(/\s+/g, '_');
}

async function renderPDF(
  doc: ZineDocument,
  risoImages: Record<string, string>,
  separation?: Separation
): Promise<Blob> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const element = createElement(ZinePDF, { document: doc, risoImages, separation }) as any;
  return pdf(element).toBlob();
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = window.document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportPDF(document: ZineDocument): Promise<void> {
  const risoImages: Record<string, string> = {};
  const risoBlocks = allBlocks(document).filter((b) => b.riso && bestUrl(b));
  await Promise.all(
    risoBlocks.map(async (b) => {
      try {
        risoImages[b.instanceId] = await processRisoImage(bestUrl(b)!, {
          ink: b.riso!.ink,
          intensity: b.riso!.intensity,
          mode: 'ink',
        });
      } catch (e) {
        console.warn('riso processing failed, exporting original image:', b.instanceId, e);
      }
    })
  );
  const blob = await renderPDF(document, risoImages);
  downloadBlob(blob, `${safeTitle(document.title)}.pdf`);
}
```

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 6: Manual browser check**

With `npm run dev`: apply riso to one image (leave another untreated), click Export PDF. The downloaded PDF shows the halftone-in-ink image over the page background (transparent dots), and the untreated image unchanged.

- [ ] **Step 7: Commit**

```bash
git add src/components/pdf/ZinePDF.tsx src/components/pdf/PDFPage.tsx src/components/pdf/PDFBlock.tsx src/lib/exportPDF.ts
git commit -m "feat: bake riso effect into composite PDF export" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Riso separations export

**Files:**
- Modify: `src/lib/exportPDF.ts` (append `exportRisoSeparations`)

**Interfaces:**
- Consumes: `Separation` render mode (Task 5 — already implemented in the PDF tree), `processRisoImage` + `grayscaleImage` (Task 2), helpers from Task 5 (`allBlocks`, `bestUrl`, `safeTitle`, `renderPDF`, `downloadBlob`).
- Produces: `exportRisoSeparations(document: ZineDocument): Promise<void>` — downloads `<title>_<INK>.pdf` per distinct ink plus `<title>_KEY.pdf`. Consumed by Task 7's toolbar menu.

- [ ] **Step 1: Add imports and `sleep` helper to `src/lib/exportPDF.ts`**

Change the riso import line to:

```ts
import { grayscaleImage, processRisoImage } from './riso';
```

Add below `downloadBlob`:

```ts
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

- [ ] **Step 2: Append `exportRisoSeparations`**

```ts
// One grayscale/black PDF per ink drum, plus a KEY layer of everything
// untreated — the standard riso print-master workflow. Registration is
// guaranteed because every layer renders identical page geometry.
export async function exportRisoSeparations(document: ZineDocument): Promise<void> {
  const blocks = allBlocks(document);
  const risoBlocks = blocks.filter((b) => b.riso && bestUrl(b));
  const failed: string[] = [];

  // Process every riso block as black coverage up front.
  const coverage: Record<string, string> = {};
  await Promise.all(
    risoBlocks.map(async (b) => {
      try {
        coverage[b.instanceId] = await processRisoImage(bestUrl(b)!, {
          ink: b.riso!.ink,
          intensity: b.riso!.intensity,
          mode: 'coverage',
        });
      } catch (e) {
        console.warn('riso separation processing failed, block moved to key layer:', b.instanceId, e);
        failed.push(b.instanceId);
      }
    })
  );
  // Riso blocks with no usable image URL can only appear in the key layer.
  blocks.filter((b) => b.riso && !bestUrl(b)).forEach((b) => failed.push(b.instanceId));

  const inks = [...new Set(risoBlocks.filter((b) => coverage[b.instanceId]).map((b) => b.riso!.ink))];
  for (const ink of inks) {
    const blob = await renderPDF(document, coverage, { kind: 'ink', ink });
    downloadBlob(blob, `${safeTitle(document.title)}_${ink}.pdf`);
    // Give the browser room between programmatic downloads.
    await sleep(400);
  }

  // KEY layer: untreated blocks (images grayscaled) + failed riso blocks.
  const gray: Record<string, string> = {};
  const keyImageBlocks = blocks.filter(
    (b) => bestUrl(b) && (!b.riso || failed.includes(b.instanceId))
  );
  await Promise.all(
    keyImageBlocks.map(async (b) => {
      try {
        gray[b.instanceId] = await grayscaleImage(bestUrl(b)!);
      } catch {
        // fall back to the original (color) image in the key layer
      }
    })
  );
  const blob = await renderPDF(document, gray, { kind: 'key', includeInstanceIds: failed });
  downloadBlob(blob, `${safeTitle(document.title)}_KEY.pdf`);
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: exits 0. (Full manual verification happens in Task 7 once the menu exists.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/exportPDF.ts
git commit -m "feat: riso separations export (per-ink coverage PDFs + key layer)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Toolbar export menu

**Files:**
- Modify: `src/components/toolbar/Toolbar.tsx`

**Interfaces:**
- Consumes: `exportPDF` + `exportRisoSeparations` via the lazy `import('../../lib/exportPDF')` (Tasks 5–6); `ZineBlock.riso` for the disabled state.
- Produces: the Export dropdown ("Composite PDF" / "Riso separations", the latter disabled with a tooltip when no block has a riso effect).

- [ ] **Step 1: Rewrite `src/components/toolbar/Toolbar.tsx`**

```tsx
import { useState } from 'react';
import { useZineStore } from '../../store/useZineStore';
import PageSizeSelector from './PageSizeSelector';

export default function Toolbar() {
  const { document: doc, setDocumentTitle } = useZineStore();
  const [exporting, setExporting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const hasRiso = doc.pages.some((p) => p.blocks.some((b) => b.riso));

  async function runExport(kind: 'composite' | 'separations') {
    setMenuOpen(false);
    setExporting(true);
    try {
      // Lazy-load so @react-pdf/renderer stays out of the main bundle
      const mod = await import('../../lib/exportPDF');
      if (kind === 'composite') {
        await mod.exportPDF(doc);
      } else {
        await mod.exportRisoSeparations(doc);
      }
    } catch (e) {
      console.error('PDF export failed:', e);
      alert('Export failed. See console for details.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <header className="flex items-center justify-between px-4 py-2 bg-white border-b border-stone-200 shrink-0">
      <div className="flex items-center gap-3">
        <input
          value={doc.title}
          onChange={(e) => setDocumentTitle(e.target.value)}
          className="text-sm font-medium text-stone-900 bg-transparent border-b border-transparent hover:border-stone-300 focus:border-stone-500 outline-none px-1 py-0.5 w-48"
          aria-label="Document title"
        />
      </div>

      <div className="flex items-center gap-4">
        <PageSizeSelector />
        <div className="relative">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            disabled={exporting}
            className="bg-stone-900 text-white rounded-lg px-4 py-1.5 text-sm font-medium hover:bg-stone-700 disabled:opacity-40 transition-colors"
          >
            {exporting ? 'Exporting…' : 'Export ▾'}
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-1 z-20 w-48 bg-white border border-stone-200 rounded-lg shadow-lg py-1">
                <MenuItem onClick={() => runExport('composite')}>Composite PDF</MenuItem>
                <MenuItem
                  onClick={() => runExport('separations')}
                  disabled={!hasRiso}
                  title={
                    hasRiso
                      ? 'One grayscale PDF per ink, plus a key layer'
                      : 'Add a riso effect to a block first'
                  }
                >
                  Riso separations
                </MenuItem>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function MenuItem({
  onClick,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="w-full text-left px-3 py-1.5 text-sm text-stone-800 hover:bg-stone-100 disabled:opacity-40 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 3: Manual browser check**

With `npm run dev`:
1. No riso blocks → Export ▾ → "Riso separations" is grayed out with the tooltip.
2. Apply riso (two different inks on two blocks) + keep one untreated image + one text block.
3. Export ▾ → Riso separations → downloads `<title>_<INK1>.pdf`, `<title>_<INK2>.pdf`, `<title>_KEY.pdf` (browser may ask to allow multiple downloads — allow).
4. Ink PDFs: black dots on white, only that ink's blocks, positions identical to the canvas. KEY PDF: grayscale untreated image + black text, riso blocks absent.
5. Export ▾ → Composite PDF still works.

- [ ] **Step 4: Commit**

```bash
git add src/components/toolbar/Toolbar.tsx
git commit -m "feat: export menu with composite and riso separations" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Full manual verification + docs

**Files:**
- Modify: `CLAUDE.md` (PDF rendering + architecture notes)

**Interfaces:**
- Consumes: everything above.
- Produces: verified feature + updated docs.

- [ ] **Step 1: Run the full manual checklist** (`npm run dev`)

1. Apply riso to an image block; swatch + slider work; original shows while processing.
2. Slider drag is smooth; releasing and pressing Cmd+Z restores the pre-drag value; more Cmd+Z steps back through ink changes and the enable toggle.
3. Delete/re-add, resize, rotate, pan a riso block — effect follows; rotation still canvas-only in PDF (pre-existing limitation).
4. Reload → effect persists and re-processes; localStorage `arena-zine-document` contains only `riso: { ink, intensity }`, no data URLs.
5. Composite export matches canvas (dots, ink colors, transparency).
6. Separations export: per-ink PDFs + KEY, registration correct, disabled state when zero riso blocks.
7. Non-image blocks (text/link/media) show no Riso section and behave unchanged.

Record any failures, fix, and re-verify before proceeding.

- [ ] **Step 2: Update `CLAUDE.md`**

In the **PDF rendering** section, update the style-subset sentence to mention riso, and document the new export + module. Replace:

```
Only a subset of block styles is applied in the PDF (position/size, z-order, opacity, backgroundColor, fontSize, color); **rotation, borderRadius, circle crop, and image pan are currently canvas-only** and silently dropped on export. The `pdf()` call is in `src/lib/exportPDF.ts`.
```

with:

```
Only a subset of block styles is applied in the PDF (position/size, z-order, opacity, backgroundColor, fontSize, color, riso halftone); **rotation, borderRadius, circle crop, and image pan are currently canvas-only** and silently dropped on export. The `pdf()` call is in `src/lib/exportPDF.ts`.

### Riso effect

`src/lib/riso.ts` is a p5-free canvas port of p5.riso's circle-halftone pipeline. Image blocks may carry `riso: { ink, intensity }` (ink names from `src/lib/risoColors.ts`, the authentic 80-color RISO palette); only these params persist — processed images are in-memory data URLs cached by `url|ink|intensity|mode`. Canvas display goes through `useRisoImage` (150 ms debounce, 'ink' mode: ink-colored dots, transparent paper). Export offers **Composite PDF** (riso baked in from `imageUrlLarge`) and **Riso separations** (`exportRisoSeparations()`): one black-coverage PDF per distinct ink plus a `_KEY.pdf` of untreated content (images grayscaled), for actual riso print masters. `ZinePDF`/`PDFPage`/`PDFBlock` accept `risoImages` (instanceId → data URL) and a `separation` render mode.
```

- [ ] **Step 3: Verify build + lint**

Run: `npm run build && npm run lint`
Expected: build exits 0; lint reports no new errors (pre-existing warnings, if any, are acceptable).

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document riso effect and separations export" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Post-plan

After all tasks pass, use superpowers:finishing-a-development-branch to decide merge/PR for `feature/riso-filter`.
