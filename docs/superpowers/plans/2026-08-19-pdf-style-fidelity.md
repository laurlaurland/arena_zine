# PDF Style Fidelity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the exported PDF carry the five block styles the canvas applies and the PDF currently drops, and convert `fontSize` across the canvas/PDF unit boundary.

**Architecture:** A pure module, `src/lib/pdfBlockStyles.ts`, maps a `ZineBlock` + `PageSize` to the style objects `PDFBlock` needs. `PDFBlock` becomes a thin renderer built from two nested `View`s — outer carries rotation, inner carries the clip — because `@react-pdf/renderer` applies clipping *before* transforms and would otherwise clip rotated blocks with an unrotated rectangle.

**Tech Stack:** TypeScript, React 19, `@react-pdf/renderer` 4.4.0, `npx tsx` for headless verification. No test framework — `npm run build` and `npm run lint` are the project's only standing checks.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-19-pdf-style-fidelity-design.md`.
- Verification is `npm run build` plus `npm run lint`. There is no test suite.
- `npm run lint` has one **pre-existing** warning in `ChannelPicker.tsx` (`react-hooks/exhaustive-deps`). It is expected. Do not fix it. Any *other* warning or error is a failure.
- The canvas is the reference. No task changes canvas rendering behaviour.
- Geometry must never branch on `separation` — separations are physically overprinted and differing geometry is misregistration. Only colour may branch on it.
- `$SCRATCH` below means: `/private/tmp/claude-501/-Users-nope-Documents-GitHub-arena-zine/93a6b70e-2f90-4fdd-ba6e-e17882ebf6eb/scratchpad`
- Scratch scripts work only for dependency-free modules. Anything importing `@react-pdf/renderer` must live **inside the repo** to resolve `node_modules`.
- Run every command from the repo root: `/Users/nope/Documents/GitHub/arena_zine`.

## File Structure

| File | Responsibility |
| --- | --- |
| `src/lib/pageSizes.ts` | **Modify.** Gains `CANVAS_PAGE_WIDTH`, moved out of a canvas component so the PDF tree can read it without importing from `components/canvas/`. |
| `src/components/canvas/ZinePage.tsx` | **Modify.** Stops defining `CANVAS_PAGE_WIDTH`; imports it. |
| `src/components/canvas/SpreadRow.tsx` | **Modify.** Imports `CANVAS_PAGE_WIDTH` from its new home. |
| `src/lib/pdfBlockStyles.ts` | **Create.** Pure `(block, pageSize) -> styles`. Geometry and opacity only, never colour. The single place every judgement call lives. |
| `src/components/pdf/PDFBlock.tsx` | **Modify.** Two-`View` split; spreads what the module returns; keeps colour and separation logic. |
| `scripts/verify-pdf-output.tsx` | **Create.** Layer 2 guard: renders fixtures to a real PDF and asserts the operators each style must emit. |
| `eslint.config.js` | **Modify.** Ignore `scripts` — it is Node code, and the single lint block assumes browser globals. |
| `CLAUDE.md` | **Modify.** The "PDF rendering" section currently says these styles are canvas-only. |

---

### Task 1: Move `CANVAS_PAGE_WIDTH` into the page-geometry module

The constant is the px-per-page basis for the whole canvas, but it lives in a React component. Task 4 needs it from the PDF tree, and `src/components/pdf/` importing `src/components/canvas/` is the wrong direction. Move it first, alone, so the move is reviewable on its own.

**Files:**
- Modify: `src/lib/pageSizes.ts`
- Modify: `src/components/canvas/ZinePage.tsx:16-17`
- Modify: `src/components/canvas/SpreadRow.tsx:3`

**Interfaces:**
- Consumes: nothing.
- Produces: `CANVAS_PAGE_WIDTH: number` exported from `src/lib/pageSizes.ts`.

- [ ] **Step 1: Add the constant to `pageSizes.ts`**

In `src/lib/pageSizes.ts`, directly after the `mmToPt` helper on line 4 and before `export const PAGE_SIZES`, add:

```ts
// Render width of a page on the canvas in pixels, before zoom. Lives here
// rather than in a canvas component because the PDF tree needs it too, to
// convert canvas-pixel font sizes into points.
export const CANVAS_PAGE_WIDTH = 560;
```

- [ ] **Step 2: Re-export it from `ZinePage.tsx`**

In `src/components/canvas/ZinePage.tsx`, delete these two lines (16-17):

```ts
// Render width of a page on the canvas in pixels (before zoom)
export const CANVAS_PAGE_WIDTH = 560;
```

Then find the existing import of `PAGE_SIZES` in that file and add `CANVAS_PAGE_WIDTH` to it, so it reads:

```ts
import { PAGE_SIZES, CANVAS_PAGE_WIDTH } from '../../lib/pageSizes';
```

`ZinePage.tsx` uses `CANVAS_PAGE_WIDTH` at lines 23 and 53; those need no change.

- [ ] **Step 3: Point `SpreadRow.tsx` at the new home**

In `src/components/canvas/SpreadRow.tsx`, line 3 currently reads:

```ts
import ZinePage, { CANVAS_PAGE_WIDTH } from './ZinePage';
```

Replace it with two imports:

```ts
import ZinePage from './ZinePage';
import { CANVAS_PAGE_WIDTH } from '../../lib/pageSizes';
```

If `SpreadRow.tsx` already imports something from `../../lib/pageSizes`, merge into that import instead of adding a second one.

- [ ] **Step 4: Build and lint**

```bash
npm run build && npm run lint
```

Expected: build passes; lint shows only the `ChannelPicker.tsx` warning. A `noUnusedLocals` error means a leftover import — remove it.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pageSizes.ts src/components/canvas/ZinePage.tsx src/components/canvas/SpreadRow.tsx
git commit -m "refactor: move CANVAS_PAGE_WIDTH into pageSizes

The PDF tree needs the canvas page width to convert font sizes into
points, and must not import from components/canvas/."
```

---

### Task 2: The pure style-mapping module

Every judgement call from the spec — stadium radius, min-dimension basis, per-leaf opacity — becomes one expression here, verified against exact numbers before `PDFBlock` ever sees it.

**Files:**
- Create: `src/lib/pdfBlockStyles.ts`
- Test: `$SCRATCH/check-pdf-block-styles.ts` (scratch, not committed — matches how `spanGeometry` and `pageUnits` were built)

**Interfaces:**
- Consumes: `ZineBlock`, `PageSize` from `src/types/zine.ts`.
- Produces:
  ```ts
  export interface PDFBlockStyles {
    outer: { position: 'absolute'; left: number; top: number; width: number; height: number;
             transform?: string; transformOrigin?: string };
    inner: { position: 'absolute'; top: number; left: number; width: string; height: string;
             overflow: 'hidden'; borderRadius: number; opacity: number };
    image: { width: string; height: string; objectFit: 'cover'; objectPosition: string; opacity: number };
    text:  { opacity: number };
  }
  export function pdfBlockStyles(block: ZineBlock, pageSize: PageSize): PDFBlockStyles;
  ```
  Task 4 adds `fontSize: number` to `text`. Nothing else changes shape.

- [ ] **Step 1: Write the failing verification script**

Create `$SCRATCH/check-pdf-block-styles.ts`:

```ts
import { pdfBlockStyles } from '/Users/nope/Documents/GitHub/arena_zine/src/lib/pdfBlockStyles.ts';
import type { ZineBlock, PageSize } from '/Users/nope/Documents/GitHub/arena_zine/src/types/zine.ts';

let failures = 0;
function eq(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) { failures++; console.error(`FAIL ${label}\n  expected ${e}\n  actual   ${a}`); }
  else console.log(`ok   ${label}`);
}

// Deliberately round numbers so expectations are exact, not floating-point noise.
const PAGE: PageSize = {
  key: 'A4', label: 'test', widthMm: 100, heightMm: 200, widthPt: 400, heightPt: 800,
};

// x=10%,y=10%,w=25%,h=25% of 400x800pt => left 40, top 80, 100 wide, 200 tall.
// minSide is therefore 100, which makes every radius expectation below exact.
const base: ZineBlock = {
  instanceId: 'b1', arenaId: 1, type: 'image', x: 10, y: 10, width: 25, height: 25, zIndex: 0,
} as ZineBlock;

const b = (over: Partial<ZineBlock>) => pdfBlockStyles({ ...base, ...over }, PAGE);

// --- placement ---
eq('left', b({}).outer.left, 40);
eq('top', b({}).outer.top, 80);
eq('width', b({}).outer.width, 100);
eq('height', b({}).outer.height, 200);

// --- rotation ---
eq('no rotation emits no transform', b({}).outer.transform, undefined);
eq('no rotation emits no origin', b({}).outer.transformOrigin, undefined);
eq('rotation 0 is treated as none', b({ rotation: 0 }).outer.transform, undefined);
eq('rotation 30', b({ rotation: 30 }).outer.transform, 'rotate(30deg)');
eq('rotation origin', b({ rotation: 30 }).outer.transformOrigin, 'center center');
eq('negative rotation', b({ rotation: -12.5 }).outer.transform, 'rotate(-12.5deg)');

// --- radius: percentage of the SMALLER dimension ---
eq('no radius', b({}).inner.borderRadius, 0);
eq('radius 0 stays 0', b({ borderRadius: 0 }).inner.borderRadius, 0);
eq('radius 10% of minSide 100', b({ borderRadius: 10 }).inner.borderRadius, 10);
eq('radius 50% of minSide 100', b({ borderRadius: 50 }).inner.borderRadius, 50);

// The spec's boundary claim: at 50% on a square-in-minSide terms block, the
// two routes to a circle agree exactly.
eq('circle crop', b({ cropShape: 'circle' }).inner.borderRadius, 50);
eq('circle equals radius 50',
   b({ cropShape: 'circle' }).inner.borderRadius, b({ borderRadius: 50 }).inner.borderRadius);
eq('circle wins over a stale radius',
   b({ cropShape: 'circle', borderRadius: 10 }).inner.borderRadius, 50);

// --- pan ---
eq('default pan is centred', b({}).image.objectPosition, '50% 50%');
eq('pan x only', b({ imageOffsetX: 0 }).image.objectPosition, '0% 50%');
eq('pan both', b({ imageOffsetX: 25, imageOffsetY: 75 }).image.objectPosition, '25% 75%');

// --- opacity reaches every painting leaf, and never the outer node ---
eq('default opacity inner', b({}).inner.opacity, 1);
eq('default opacity image', b({}).image.opacity, 1);
eq('default opacity text', b({}).text.opacity, 1);
eq('opacity inner', b({ opacity: 0.4 }).inner.opacity, 0.4);
eq('opacity image', b({ opacity: 0.4 }).image.opacity, 0.4);
eq('opacity text', b({ opacity: 0.4 }).text.opacity, 0.4);
eq('outer never carries opacity',
   Object.prototype.hasOwnProperty.call(b({ opacity: 0.4 }).outer, 'opacity'), false);

// --- the inner node fills the outer, and clips ---
eq('inner overflow', b({}).inner.overflow, 'hidden');
eq('inner width', b({}).inner.width, '100%');
eq('inner height', b({}).inner.height, '100%');
eq('image objectFit', b({}).image.objectFit, 'cover');

// --- geometry must not depend on the block being an image ---
eq('text block gets the same frame', b({ type: 'text' }).outer.left, 40);

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
npx tsx "$SCRATCH/check-pdf-block-styles.ts"
```

Expected: FAIL — `Cannot find module '.../src/lib/pdfBlockStyles.ts'`. If it fails any other way, the script itself is wrong; fix it before writing the module.

- [ ] **Step 3: Implement the module**

Create `src/lib/pdfBlockStyles.ts`:

```ts
import type { ZineBlock, PageSize } from '../types/zine';

/**
 * Style objects for one block in the PDF tree.
 *
 * Split across two nested Views on purpose. `@react-pdf/renderer` runs
 * `clipNode` BEFORE `applyTransformations` (render/lib/index.js:2125), so a
 * View carrying both `overflow: hidden` and `transform` clips rotated content
 * with an unrotated rectangle. The canvas already avoids this the same way:
 * PlacedBlock's outer div rotates, its inner div clips.
 *
 * Geometry and opacity only — never colour. Colour is the one thing that
 * legitimately varies by riso separation, and it stays in PDFBlock. Geometry
 * that varied by separation would mean misregistered plates.
 */
export interface PDFBlockStyles {
  outer: {
    position: 'absolute';
    left: number;
    top: number;
    width: number;
    height: number;
    transform?: string;
    transformOrigin?: string;
  };
  inner: {
    position: 'absolute';
    top: number;
    left: number;
    width: string;
    height: string;
    overflow: 'hidden';
    borderRadius: number;
    opacity: number;
  };
  image: {
    width: string;
    height: string;
    objectFit: 'cover';
    objectPosition: string;
    opacity: number;
  };
  text: {
    opacity: number;
  };
}

export function pdfBlockStyles(block: ZineBlock, pageSize: PageSize): PDFBlockStyles {
  const left = (block.x / 100) * pageSize.widthPt;
  const top = (block.y / 100) * pageSize.heightPt;
  const width = (block.width / 100) * pageSize.widthPt;
  const height = (block.height / 100) * pageSize.heightPt;

  const opacity = block.opacity ?? 1;
  const rotation = block.rotation ?? 0;

  // Both radius routes resolve against the smaller dimension, so a block with
  // `borderRadius: 50` and one with `cropShape: 'circle'` agree exactly.
  // CSS would draw an ellipse here; a single-valued PDF radius draws a
  // stadium. Accepted, and identical on square blocks. clipNode re-clamps to
  // min(r, 0.5w, 0.5h) regardless.
  const minSide = Math.min(width, height);
  const borderRadius =
    block.cropShape === 'circle'
      ? minSide / 2
      : block.borderRadius
        ? (block.borderRadius / 100) * minSide
        : 0;

  return {
    outer: {
      position: 'absolute',
      left,
      top,
      width,
      height,
      // Omit entirely when unrotated rather than emitting an identity
      // transform, so unrotated blocks render byte-identically to before.
      ...(rotation
        ? { transform: `rotate(${rotation}deg)`, transformOrigin: 'center center' }
        : {}),
    },
    inner: {
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      overflow: 'hidden',
      borderRadius,
      opacity,
    },
    image: {
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      objectPosition: `${block.imageOffsetX ?? 50}% ${block.imageOffsetY ?? 50}%`,
      opacity,
    },
    text: {
      opacity,
    },
  };
}
```

- [ ] **Step 4: Run it to confirm it passes**

```bash
npx tsx "$SCRATCH/check-pdf-block-styles.ts"
```

Expected: every line `ok`, then `ALL PASS`, exit 0.

- [ ] **Step 5: Build and lint**

```bash
npm run build && npm run lint
```

Expected: build passes; only the `ChannelPicker.tsx` warning.

- [ ] **Step 6: Commit**

```bash
git add src/lib/pdfBlockStyles.ts
git commit -m "feat: pure style mapping for PDF blocks

Geometry and opacity only, never colour — colour is the one thing that
varies by riso separation, and geometry that varied per plate would be
misregistration."
```

---

### Task 3: Split `PDFBlock` into two Views and wire it up

Task 2 passes happily even if `PDFBlock` ignores the module. Only a rendered file proves the styles reached the page, so the guard script comes first.

**Files:**
- Create: `scripts/verify-pdf-output.tsx`
- Modify: `eslint.config.js:9`
- Modify: `src/components/pdf/PDFBlock.tsx` (whole file)

**Interfaces:**
- Consumes: `pdfBlockStyles` and `PDFBlockStyles` from Task 2.
- Produces: no new exports. `PDFBlock`'s props are unchanged.

- [ ] **Step 1: Let ESLint skip the scripts directory**

`eslint.config.js` has a single config block asserting browser globals for all `**/*.{ts,tsx}`. A Node script using `process` and `Buffer` would fail `no-undef` there. On line 9, change:

```js
  globalIgnores(['dist']),
```

to:

```js
  globalIgnores(['dist', 'scripts']),
```

- [ ] **Step 2: Write the failing guard script**

Create `scripts/verify-pdf-output.tsx`. It must live in the repo, not `$SCRATCH`, because it imports `@react-pdf/renderer` and needs `node_modules` resolution.

```tsx
/**
 * Layer 2 verification: render fixtures to a real PDF and assert the
 * operators each style must emit. Run: npx tsx scripts/verify-pdf-output.tsx
 *
 * Layer 1 ($SCRATCH/check-pdf-block-styles.ts) proves the mapping is right.
 * This proves the mapping reached the page. Each assertion is paired with a
 * negative control so a check that would pass on anything is caught.
 */
import React from 'react';
import zlib from 'node:zlib';
import { pdf } from '@react-pdf/renderer';
import ZinePDF from '../src/components/pdf/ZinePDF.tsx';
import type { ZineBlock, ZineDocument } from '../src/types/zine.ts';

// 4x2 PNG, red left half / blue right half. Deliberately not square, so
// object-fit cover has to crop and objectPosition has something to move.
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAACCAIAAADwyuo0AAAAE0lEQVR4nGP4z8AARGDiPwMyBwBnsgf5Q2OaZwAAAABJRU5ErkJggg==';

let failures = 0;
function check(label: string, condition: boolean) {
  if (condition) console.log(`ok   ${label}`);
  else { failures++; console.error(`FAIL ${label}`); }
}

function doc(block: Partial<ZineBlock>): ZineDocument {
  const full = {
    instanceId: 'b1', arenaId: 1, type: 'image', imageUrl: PNG,
    x: 10, y: 10, width: 50, height: 25, zIndex: 0, ...block,
  } as ZineBlock;
  return {
    id: 'd1', title: 'fixture', pageSize: 'A4',
    pages: [{ id: 'p1', order: 0, blocks: [full] }],
    createdAt: '', updatedAt: '',
  } as ZineDocument;
}

/** Render a document and return every inflated content stream, concatenated. */
async function streamOf(document: ZineDocument): Promise<string> {
  const result: unknown = await pdf(<ZinePDF document={document} />).toBuffer();
  const buf: Buffer = Buffer.isBuffer(result)
    ? result
    : await new Promise((res, rej) => {
        const chunks: Buffer[] = [];
        const s = result as NodeJS.ReadableStream;
        s.on('data', (d: Buffer) => chunks.push(d));
        s.on('end', () => res(Buffer.concat(chunks)));
        s.on('error', rej);
      });

  const latin = buf.toString('latin1');
  let out = '';
  const re = /stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(latin)) !== null) {
    const start = m.index + m[0].length;
    const end = latin.indexOf('endstream', start);
    if (end < 0) continue;
    try { out += zlib.inflateSync(buf.subarray(start, end)).toString('latin1'); } catch { /* not a flate stream */ }
  }
  return out;
}

/** Matrix ops that are neither identity nor a pure translate. */
function hasRotationMatrix(s: string): boolean {
  return /^-?[\d.]+ -?[\d.]+ -?[\d.]+ -?[\d.]+ -?[\d.]+ -?[\d.]+ cm$/m.test(s)
    && s.split('\n').some((line) => {
      const m2 = /^(-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) -?[\d.]+ -?[\d.]+ cm$/.exec(line.trim());
      if (!m2) return false;
      const [b, c] = [parseFloat(m2[2]), parseFloat(m2[3])];
      return b !== 0 || c !== 0;   // off-diagonal terms mean a rotation
    });
}

/** The image placement matrix, e.g. "200 0 0 -100 -50 100 cm" before "/I1 Do". */
function imagePlacement(s: string): string | null {
  const lines = s.split('\n').map((l) => l.trim());
  const i = lines.findIndex((l) => /^\/I\d+ Do$/.test(l));
  return i > 0 ? lines[i - 1] : null;
}

async function main() {
  // --- rotation ---
  const plain = await streamOf(doc({}));
  const rotated = await streamOf(doc({ rotation: 30 }));
  check('unrotated block emits no rotation matrix', !hasRotationMatrix(plain));
  check('rotated block emits a rotation matrix', hasRotationMatrix(rotated));

  // --- rounded clip ---
  const square = await streamOf(doc({}));
  const rounded = await streamOf(doc({ borderRadius: 40 }));
  const circle = await streamOf(doc({ cropShape: 'circle' }));
  const curveThenClip = /\bc\b[\s\S]{0,400}?\bW n\b/;
  check('square block clips without curves', !curveThenClip.test(square));
  check('rounded block clips with curves', curveThenClip.test(rounded));
  check('circle crop clips with curves', curveThenClip.test(circle));

  // --- pan ---
  const centred = await streamOf(doc({}));
  const panned = await streamOf(doc({ imageOffsetX: 0, imageOffsetY: 100 }));
  const pc = imagePlacement(centred);
  const pp = imagePlacement(panned);
  check('centred image has a placement matrix', pc !== null);
  check('panned image has a placement matrix', pp !== null);
  check('pan shifts the image placement', pc !== pp);

  // --- opacity ---
  const opaque = await streamOf(doc({}));
  const faded = await streamOf(doc({ opacity: 0.4 }));
  // pdfkit encodes fill alpha as an ExtGState (/ca) referenced by "/GsN gs".
  // There is no literal opacity operator.
  check('opaque block emits no alpha state', !/\/Gs\d+ gs/.test(opaque));
  check('translucent block emits an alpha state', /\/Gs\d+ gs/.test(faded));

  // --- a rotated, rounded block keeps BOTH, which is the ordering bug ---
  const both = await streamOf(doc({ rotation: 30, borderRadius: 40 }));
  check('rotation survives alongside a clip', hasRotationMatrix(both));
  check('clip survives alongside a rotation', curveThenClip.test(both));

  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
```

- [ ] **Step 3: Run it to confirm it fails**

```bash
npx tsx scripts/verify-pdf-output.tsx
```

Expected: FAILs on the rotation, curve-clip, pan, and opacity assertions — `PDFBlock` does not pass any of those styles yet. The negative controls (`unrotated…`, `square block…`, `opaque block…`) should already pass. If a negative control fails, the detector is wrong; fix the script before touching `PDFBlock`.

- [ ] **Step 4: Rewrite `PDFBlock`**

Replace the entire contents of `src/components/pdf/PDFBlock.tsx`:

```tsx
import { View, Text, Image } from '@react-pdf/renderer';
import type { ReactNode } from 'react';
import type { ZineBlock } from '../../types/zine';
import type { PageSize } from '../../types/zine';
import { hexToGray } from '../../lib/riso';
import { pdfBlockStyles } from '../../lib/pdfBlockStyles';
import type { PDFBlockStyles } from '../../lib/pdfBlockStyles';
import type { Separation } from './ZinePDF';

interface Props {
  block: ZineBlock;
  pageSize: PageSize;
  risoImage?: string;   // pre-processed data URL (riso 'ink'/'coverage', or key-layer grayscale)
  separation?: Separation;
}

/**
 * Two nested Views, never one. `@react-pdf/renderer` runs `clipNode` BEFORE
 * `applyTransformations` (render/lib/index.js:2125), so a single View carrying
 * both `overflow: hidden` and `transform` would clip rotated content with an
 * unrotated rectangle. The outer node rotates; the inner node clips. The
 * canvas splits the same way in `PlacedBlock`.
 */
function Frame({
  outer,
  inner,
  children,
}: {
  outer: PDFBlockStyles['outer'];
  inner: PDFBlockStyles['inner'] & { backgroundColor: string; border?: string };
  children?: ReactNode;
}) {
  return (
    <View style={outer}>
      <View style={inner}>{children}</View>
    </View>
  );
}

export default function PDFBlock({ block, pageSize, risoImage, separation }: Props) {
  // Geometry and opacity come from the pure mapping. Colour is decided here,
  // because it is the only thing that may vary by separation.
  const styles = pdfBlockStyles(block, pageSize);

  const backgroundColor = !separation
    ? (block.backgroundColor ?? 'transparent')
    : separation.kind === 'key' && block.backgroundColor
      ? hexToGray(block.backgroundColor)
      : 'transparent';

  const inner = { ...styles.inner, backgroundColor };
  const imageSrc = risoImage ?? block.imageUrlLarge ?? block.imageUrl;
  const textColor = separation?.kind === 'key' ? '#000000' : (block.color ?? '#000000');

  if (block.type === 'image' && imageSrc) {
    return (
      <Frame outer={styles.outer} inner={inner}>
        <Image src={imageSrc} style={styles.image} />
      </Frame>
    );
  }

  if (block.type === 'text') {
    return (
      <Frame outer={styles.outer} inner={inner}>
        <Text
          style={{
            fontSize: block.fontSize ?? 10,
            fontFamily: undefined,
            color: textColor,
            padding: 4,
            opacity: styles.text.opacity,
          }}
        >
          {block.content ?? block.title ?? ''}
        </Text>
      </Frame>
    );
  }

  if (block.type === 'link') {
    return (
      <Frame outer={styles.outer} inner={{ ...inner, border: '1pt solid #e7e5e4' }}>
        {imageSrc && <Image src={imageSrc} style={{ ...styles.image, height: '70%' }} />}
        <Text style={{ fontSize: 8, padding: 4, color: '#1c1917', opacity: styles.text.opacity }}>
          {block.linkTitle ?? block.linkUrl ?? ''}
        </Text>
      </Frame>
    );
  }

  if ((block.type === 'media' || block.type === 'attachment') && imageSrc) {
    return (
      <Frame outer={styles.outer} inner={inner}>
        <Image src={imageSrc} style={styles.image} />
      </Frame>
    );
  }

  // Fallback: title text
  return (
    <Frame
      outer={styles.outer}
      inner={{ ...inner, backgroundColor: '#f5f5f4', border: '1pt solid #e7e5e4' }}
    >
      <Text style={{ fontSize: 8, padding: 4, color: '#78716c', opacity: styles.text.opacity }}>
        {block.title ?? block.type}
      </Text>
    </Frame>
  );
}
```

Note the deliberate carry-overs: the link block's border and the fallback's grey background go on the **inner** node so they are clipped by the radius; `fontSize` stays at its current `?? 10` because Task 4 owns that change.

- [ ] **Step 5: Run the guard to confirm it passes**

```bash
npx tsx scripts/verify-pdf-output.tsx
```

Expected: every line `ok`, then `ALL PASS`, exit 0.

- [ ] **Step 6: Re-run the Layer 1 script**

```bash
npx tsx "$SCRATCH/check-pdf-block-styles.ts"
```

Expected: still `ALL PASS`. The module was not meant to change in this task.

- [ ] **Step 7: Build and lint**

```bash
npm run build && npm run lint
```

Expected: build passes; only the `ChannelPicker.tsx` warning. `scripts/` is now ignored by ESLint and was never in `tsconfig.app.json`'s `include`, so neither tool typechecks it.

- [ ] **Step 8: Commit**

```bash
git add scripts/verify-pdf-output.tsx eslint.config.js src/components/pdf/PDFBlock.tsx
git commit -m "fix: carry rotation, radius, crop, pan, and opacity into the PDF

react-pdf clips before it transforms, so rotation and the clip cannot
share a View — PDFBlock now mirrors the canvas's outer/inner split.
Opacity moves to the painting leaves: react-pdf has no group opacity,
so a container's opacity reached only its own background."
```

---

### Task 4: Convert `fontSize` across the unit boundary

Its own task and its own commit, because it is the only change that alters existing documents' output — every text block in every saved zine exports about 38 % larger. Keeping it isolated means it can be reverted without unpicking the rest.

**Files:**
- Modify: `src/lib/pdfBlockStyles.ts`
- Modify: `src/components/pdf/PDFBlock.tsx`
- Test: `$SCRATCH/check-pdf-block-styles.ts` (extend)

**Interfaces:**
- Consumes: `CANVAS_PAGE_WIDTH` from Task 1; `PDFBlockStyles` from Task 2.
- Produces: `PDFBlockStyles['text']` gains `fontSize: number`.

- [ ] **Step 1: Extend the verification script**

In `$SCRATCH/check-pdf-block-styles.ts`, add the import at the top:

```ts
import { CANVAS_PAGE_WIDTH } from '/Users/nope/Documents/GitHub/arena_zine/src/lib/pageSizes.ts';
```

and add these cases immediately before the final `console.log`:

```ts
// --- font size crosses a unit boundary: canvas px -> PDF pt ---
// PAGE.widthPt is 400 and CANVAS_PAGE_WIDTH is 560, so ptPerPx = 5/7.
eq('CANVAS_PAGE_WIDTH is the canvas basis', CANVAS_PAGE_WIDTH, 560);
eq('default font size is the canvas default, converted',
   b({}).text.fontSize, 13 * (400 / 560));
eq('explicit font size converts',
   b({ fontSize: 28 }).text.fontSize, 28 * (400 / 560));

// A narrower page scales text down with it, instead of pinning a point size.
const HALF: PageSize = { ...PAGE, widthPt: 200, heightPt: 400 };
eq('font size is page-relative',
   pdfBlockStyles({ ...base, fontSize: 28 }, HALF).text.fontSize, 28 * (200 / 560));
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
npx tsx "$SCRATCH/check-pdf-block-styles.ts"
```

Expected: the four new lines FAIL (`expected 9.28…, actual undefined`); every earlier line still `ok`.

- [ ] **Step 3: Add the conversion to the module**

In `src/lib/pdfBlockStyles.ts`, change the import line to pull in the constant:

```ts
import type { ZineBlock, PageSize } from '../types/zine';
import { CANVAS_PAGE_WIDTH } from './pageSizes';
```

Add `fontSize` to the `text` member of the `PDFBlockStyles` interface:

```ts
  text: {
    opacity: number;
    fontSize: number;
  };
```

Inside `pdfBlockStyles`, after the `borderRadius` calculation, add:

```ts
  // fontSize is the one style that is not a percentage, so it crosses the
  // canvas/PDF unit boundary unconverted. The canvas renders 13px on a
  // CANVAS_PAGE_WIDTH-px page; the PDF needs the same fraction of a page
  // measured in points. Scaling by the page keeps A5 text proportional
  // rather than pinning it to a fixed point size.
  const ptPerPx = pageSize.widthPt / CANVAS_PAGE_WIDTH;
```

and change the returned `text` member to:

```ts
    text: {
      opacity,
      fontSize: (block.fontSize ?? 13) * ptPerPx,
    },
```

The default becomes 13, matching `TextBlock.tsx:20`, in place of the PDF's previous unexplained 10.

- [ ] **Step 4: Run it to confirm it passes**

```bash
npx tsx "$SCRATCH/check-pdf-block-styles.ts"
```

Expected: `ALL PASS`.

- [ ] **Step 5: Use it in `PDFBlock`**

In `src/components/pdf/PDFBlock.tsx`, in the `block.type === 'text'` branch, replace:

```tsx
              fontSize: block.fontSize ?? 10,
```

with:

```tsx
              fontSize: styles.text.fontSize,
```

Leave the `link` and fallback branches at their hardcoded `fontSize: 8` — those are chrome for placeholder content, not user-authored text, and have no canvas counterpart to match.

- [ ] **Step 6: Build, lint, and re-run the guard**

```bash
npm run build && npm run lint && npx tsx scripts/verify-pdf-output.tsx
```

Expected: build passes; only the `ChannelPicker.tsx` warning; guard `ALL PASS`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/pdfBlockStyles.ts src/components/pdf/PDFBlock.tsx
git commit -m "fix: convert fontSize from canvas pixels to PDF points

Positions and sizes are percentages and survive the canvas/PDF gap.
fontSize did not: 13px on a 560px page was exported as 10pt on a
595pt page, about 28% too small. Existing documents' text now exports
roughly 38% larger, matching what the canvas always showed."
```

---

### Task 5: Verify spans and separations, then correct the docs

The spec asserts spanned pairs survive rotation and that separations share geometry. Both are load-bearing and neither is verified yet. `CLAUDE.md` currently documents the old, broken behaviour.

**Files:**
- Modify: `scripts/verify-pdf-output.tsx`
- Modify: `CLAUDE.md` (the "PDF rendering" section)

**Interfaces:**
- Consumes: everything from Tasks 2–4.
- Produces: nothing new.

- [ ] **Step 1: Add span and separation checks to the guard**

In `scripts/verify-pdf-output.tsx`, add this helper directly above `async function main()`:

```tsx
/** A two-page fixture holding one spanned pair, both halves styled identically. */
function spanDoc(over: Partial<ZineBlock>): ZineDocument {
  const half = (id: string, x: number, side: 'left' | 'right') => ({
    instanceId: id, arenaId: 1, type: 'image', imageUrl: PNG,
    x, y: 10, width: 100, height: 40, zIndex: 0,
    spanId: 's1', spanSide: side, ...over,
  } as ZineBlock);
  return {
    id: 'd1', title: 'span fixture', pageSize: 'A4',
    pages: [
      { id: 'p1', order: 0, blocks: [half('L', 60, 'left')] },
      { id: 'p2', order: 1, blocks: [half('R', -40, 'right')] },
    ],
    createdAt: '', updatedAt: '',
  } as ZineDocument;
}
```

Then add these checks inside `main()`, immediately before the final `console.log`:

```tsx
  // --- spanned pairs ---
  // Both halves are the same size and carry the same styles, so they must
  // emit the same radius and the same rotation. A pair that rotated by
  // different amounts, or rounded by different amounts, would break the seam.
  const spanPlain = await streamOf(spanDoc({}));
  const spanRotated = await streamOf(spanDoc({ rotation: 30 }));
  const rotationMatrices = (s: string) =>
    s.split('\n').map((l) => l.trim()).filter((l) => /cm$/.test(l))
     .filter((l) => { const m2 = /^(-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) /.exec(l);
                      return m2 ? parseFloat(m2[2]) !== 0 || parseFloat(m2[3]) !== 0 : false; });
  check('unrotated span emits no rotation', rotationMatrices(spanPlain).length === 0);
  check('both span halves rotate', rotationMatrices(spanRotated).length === 2);
  check('both span halves rotate identically',
        new Set(rotationMatrices(spanRotated).map((l) => l.split(' ').slice(0, 4).join(' '))).size === 1);

  // --- separations share geometry ---
  // Only colour may differ between plates. Identical geometry is what makes
  // overprinted plates register.
  const composite = await streamOf(doc({ rotation: 30, borderRadius: 40 }));
  const keyPlate = await streamOf(doc({ rotation: 30, borderRadius: 40 }), { kind: 'key' });
  check('key plate keeps the rotation', hasRotationMatrix(keyPlate));
  check('key plate keeps the clip', curveThenClip.test(keyPlate));
  check('key plate geometry matches the composite',
        rotationMatrices(keyPlate).join('|') === rotationMatrices(composite).join('|'));
```

For the separation call to work, widen `streamOf` to take an optional separation. Change its signature and its `pdf(...)` call to:

```tsx
async function streamOf(document: ZineDocument, separation?: { kind: 'key'; includeInstanceIds?: string[] } | { kind: 'ink'; ink: string }): Promise<string> {
  const result: unknown = await pdf(<ZinePDF document={document} separation={separation} />).toBuffer();
```

- [ ] **Step 2: Run the guard**

```bash
npx tsx scripts/verify-pdf-output.tsx
```

Expected: `ALL PASS`. If `both span halves rotate identically` fails, the store's mirroring is not keeping the pair in sync — stop and report it rather than weakening the check; that is a real bug in the spanning feature, not in this work.

- [ ] **Step 3: Verify once in the browser**

```bash
npm run dev
```

Place an image, rotate it, set a corner radius, pan it, and drop its opacity. Export a Composite PDF and open it. Confirm all four match the canvas. Then drag an image across the gutter to span it, rotate it, and export again — the seam must still line up.

Then check the riso path, which the guard's fixtures do not exercise: turn on a riso ink for a block that also has a corner radius and a pan, and export both a **Composite PDF** and **Riso separations**. The halftone must be clipped by the radius (not squared off at the block edge), the pan must move the halftoned image rather than the raw one, and every plate must show the block at the same position and rotation. Misregistration between plates is the failure mode to watch for.

This is the only step a script cannot do: the guard proves the operators are present, not that the result looks right.

- [ ] **Step 4: Correct `CLAUDE.md`**

In the "PDF rendering" section, replace this sentence:

> Only a subset of block styles is applied in the PDF (position/size, z-order, opacity, backgroundColor, fontSize, color, riso halftone); **rotation, borderRadius, circle crop, and image pan are currently canvas-only** and silently dropped on export.

with:

```markdown
Block styles are mapped by `src/lib/pdfBlockStyles.ts`, a pure
`(block, pageSize) → styles` function covering position/size, rotation,
border radius, circle crop, image pan, and opacity. `PDFBlock` renders it as
**two nested `View`s** — outer carries the rotation, inner carries
`overflow: hidden` and the radius — because `@react-pdf/renderer` clips
*before* it transforms, so a single View would clip rotated content with an
unrotated rectangle. The canvas splits the same way in `PlacedBlock`.

Two divergences are deliberate. CSS `border-radius: 50%` on a non-square
block draws an ellipse; a single-valued PDF radius draws a stadium (exact on
square blocks). And react-pdf has no group opacity, so `opacity` is applied
to each painting leaf rather than to the container — visibly different only
when a translucent image sits on a translucent background.

`fontSize` is converted from canvas pixels to points by
`pageSize.widthPt / CANVAS_PAGE_WIDTH`; it is the one style that is not a
percentage and so does not survive the canvas/PDF gap on its own.
`fontFamily` is **not** applied — nothing in the app sets it, and honouring
it would require `Font.register()` with real font files.

`scripts/verify-pdf-output.tsx` (`npx tsx scripts/verify-pdf-output.tsx`)
renders fixtures and asserts the PDF operators each style must emit, with a
negative control per assertion. A style react-pdf ignores is not a type
error, so `npm run build` cannot catch a regression here.
```

- [ ] **Step 5: Build, lint, and run the guard one last time**

```bash
npm run build && npm run lint && npx tsx scripts/verify-pdf-output.tsx
```

Expected: build passes; only the `ChannelPicker.tsx` warning; guard `ALL PASS`.

- [ ] **Step 6: Commit**

```bash
git add scripts/verify-pdf-output.tsx CLAUDE.md
git commit -m "test: verify span and separation geometry, and document the PDF mapping

Spanned halves must rotate identically or the seam breaks, and plates
must share geometry or they misregister. Both are now asserted rather
than assumed."
```

---

## Notes for the implementer

- **Do not put `overflow: hidden` and `transform` on the same `View`.** That is the entire reason `PDFBlock` has two nested nodes. `renderNode` calls `clipNode` before `applyTransformations` (`render/lib/index.js:2125`), so the clip would be laid down in unrotated space.
- **Do not move colour into `pdfBlockStyles.ts`.** Colour branches on `separation`; geometry must not. Keeping them in separate places is what makes misregistration structurally impossible rather than merely avoided.
- **Do not "fix" the `ChannelPicker.tsx` lint warning.** It is pre-existing and expected.
- **The canvas is the reference.** If canvas and PDF disagree, the PDF is wrong. No task here changes canvas rendering.
- `Math.min(width, height)` is in **points**, not percentages — `block.width` and `block.height` are percentages of *different* page dimensions, so comparing them directly would be meaningless.
- If `npx tsx` prompts to install, allow it; it is not added to `package.json`, matching how the spanning work was verified.
