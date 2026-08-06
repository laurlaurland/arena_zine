# Gutter-Spanning Images Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user drag an image across the seam in spread view so it runs across a two-page spread, and drag it back off to undo that.

**Architecture:** A spanning image is two ordinary blocks on facing pages sharing a `spanId`, offset by exactly one page width, each clipped by its own page's existing `overflow: hidden`. All geometry decisions live in one pure module (`src/lib/spanGeometry.ts`) that the store calls; page-order bookkeeping lives in a second pure module (`src/lib/pageUnits.ts`). No renderer changes are needed for the feature itself — only for the live drag preview.

**Tech Stack:** React 19 + TypeScript, Zustand 5, @dnd-kit/core, Vite 8.

**Spec:** `docs/superpowers/specs/2026-08-03-gutter-spanning-images-design.md`

## Global Constraints

- All block coordinates are **percentages of page dimensions**. `width`/`height` are percentages of *different* page dimensions, so pixel aspect ratio conversions need `pageAR = heightMm / widthMm`. Never mix the two spaces.
- **There is no test suite in this repo.** `npm run build` (which runs `tsc -b`) and `npm run lint` are the correctness checks. Pure modules are verified with throwaway scripts run via `npx tsx`, matching how `src/lib/spreads.ts` was verified.
- Throwaway verification scripts go in the scratchpad, **never** committed:
  `/private/tmp/claude-501/-Users-nope-Documents-GitHub-arena-zine/b2afdf10-4525-4340-bea8-6ba46c4ccf7e/scratchpad/` — referred to below as `$SCRATCH`.
- `npm run lint` has **one pre-existing warning** in `src/components/sidebar/ChannelPicker.tsx` (react-hooks/exhaustive-deps). That warning is expected. Do not fix it; do not add new ones.
- Straddle tolerance is **5%** of a page on each side. The constant is `STRADDLE_MIN = 5`; derived bounds are `xLeft ≤ 95` and `xLeft + W ≥ 105`.
- Only **image** blocks may span. Only **spread** view may create a span.
- Clamps relax **only** for blocks carrying a `spanId`. Ordinary blocks keep `x ∈ [0, 100 - width]` and `width ∈ [5, 100]`.
- Commit after every task. Use `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` as the final line of each commit message.

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/spanGeometry.ts` (create) | Pure straddle math and the create/move/dissolve decision. No React, no store. |
| `src/lib/pageUnits.ts` (create) | Pure page-unit grouping, unit-aware reorder, and the parity pass. |
| `src/types/zine.ts` (modify) | `spanId`/`spanSide` on `ZineBlock`, `autoPad` on `ZinePage`. |
| `src/store/useZineStore.ts` (modify) | Wires both modules in; mirroring; `fillSpread`/`unlinkSpan`; `spanPreview` transient state. |
| `src/App.tsx` (modify) | `onDragMove` handler that publishes `spanPreview`. |
| `src/components/canvas/ZinePage.tsx` (modify) | Renders the preview ghost; suppresses the stale partner during a drag. |
| `src/components/inspector/BlockInspector.tsx` (modify) | **Fill spread** and **Unlink halves** buttons. |
| `CLAUDE.md` (modify) | Documents the feature. |

`src/components/canvas/SpreadRow.tsx` and every PDF file are deliberately untouched.

---

### Task 1: Span geometry module

The pure core. Everything else depends on the names defined here.

**Files:**
- Create: `src/lib/spanGeometry.ts`
- Modify: `src/types/zine.ts`
- Verify: `$SCRATCH/check-span-geometry.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `SpanSide`, `SpanDropInput`, `SpanDropResult`, `STRADDLE_MIN`, `straddles(xLeft, width)`, `clampSpanX(xLeft, width)`, `toXLeft(x, side)`, `resolveSpanDrop(input)`.

- [ ] **Step 1: Add the data model fields**

In `src/types/zine.ts`, add to the `ZineBlock` interface, after the `riso?: RisoEffect;` line:

```ts
  // Gutter spanning: two blocks on facing pages sharing one spanId
  spanId?: string;
  spanSide?: 'left' | 'right';
```

and add to the `ZinePage` interface, after `backgroundColor?: string;`:

```ts
  /** Blank page inserted by the parity rule; removed again once unneeded. */
  autoPad?: true;
```

- [ ] **Step 2: Write the failing verification script**

Create `$SCRATCH/check-span-geometry.ts`:

```ts
import { straddles, clampSpanX, toXLeft, resolveSpanDrop, STRADDLE_MIN } from '/Users/nope/Documents/GitHub/arena_zine/src/lib/spanGeometry.ts';

let failures = 0;
function eq(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) { failures++; console.error(`FAIL ${label}\n  expected ${e}\n  actual   ${a}`); }
  else console.log(`ok   ${label}`);
}

eq('STRADDLE_MIN', STRADDLE_MIN, 5);

// straddles: needs >=5% on each page
eq('straddles centred', straddles(80, 40), true);
eq('straddles exact left edge', straddles(95, 40), true);
eq('straddles just past left tolerance', straddles(95.1, 40), false);
eq('straddles exact right edge', straddles(65, 40), true);
// xLeft + W >= 105 is a LOWER bound on xLeft, so the failing case is below 65.
eq('straddles short of right tolerance', straddles(64, 40), false);
eq('straddles full bleed', straddles(0, 200), true);

// clampSpanX pins into [105 - W, 95]
eq('clampSpanX in range', clampSpanX(80, 40), 80);
eq('clampSpanX above', clampSpanX(200, 40), 95);
eq('clampSpanX below', clampSpanX(0, 40), 65);
eq('clampSpanX full bleed low', clampSpanX(-500, 200), -95);

// toXLeft normalises a dragged half's x into left-page space
eq('toXLeft left', toXLeft(80, 'left'), 80);
eq('toXLeft right', toXLeft(-20, 'right'), 80);

// --- resolveSpanDrop ---
const base = { pageCount: 5, width: 40, isImage: true, viewMode: 'spread' as const };

// case 1: crossing from a left slot (odd index)
eq('create from left slot',
  resolveSpanDrop({ ...base, pageIndex: 1, x: 80 }),
  { action: 'create', xLeft: 80, leftIndex: 1 });

// case 1: crossing from a right slot (even index >= 2), x < 0
eq('create from right slot',
  resolveSpanDrop({ ...base, pageIndex: 2, x: -20 }),
  { action: 'create', xLeft: 80, leftIndex: 1 });

// case 1 refused: cover
eq('cover never spans',
  resolveSpanDrop({ ...base, pageIndex: 0, x: 80 }), { action: 'none' });

// case 1 refused: no facing partner (last page, odd index, pageCount 4 => index 3 is last)
eq('no partner page',
  resolveSpanDrop({ ...base, pageCount: 4, pageIndex: 3, x: 80 }), { action: 'none' });

// case 1 refused: not crossing
eq('not crossing stays put',
  resolveSpanDrop({ ...base, pageIndex: 1, x: 10 }), { action: 'none' });

// case 1 refused: not an image / not spread view / too narrow to straddle
eq('text never spans',
  resolveSpanDrop({ ...base, pageIndex: 1, x: 80, isImage: false }), { action: 'none' });
eq('single view never spans',
  resolveSpanDrop({ ...base, pageIndex: 1, x: 80, viewMode: 'single' }), { action: 'none' });
eq('too narrow to straddle',
  resolveSpanDrop({ ...base, pageIndex: 1, x: 99, width: 8 }), { action: 'none' });

// case 2: already spanned and still straddling
eq('move spanned pair',
  resolveSpanDrop({ ...base, pageIndex: 1, x: 70, side: 'left' }),
  { action: 'move', xLeft: 70 });
eq('move clamps into straddle range',
  resolveSpanDrop({ ...base, pageIndex: 1, x: 94, side: 'left' }),
  { action: 'move', xLeft: 94 });
eq('move from the right half',
  resolveSpanDrop({ ...base, pageIndex: 2, x: -30, side: 'right' }),
  { action: 'move', xLeft: 70 });

// case 3: dragged fully onto one page => dissolve, keeping the covered side
eq('dissolve onto left page',
  resolveSpanDrop({ ...base, pageIndex: 1, x: 55, side: 'left' }),
  { action: 'dissolve', keep: 'left', x: 55, width: 40, scale: 1 });
eq('dissolve onto right page',
  resolveSpanDrop({ ...base, pageIndex: 1, x: 101, side: 'left' }),
  { action: 'dissolve', keep: 'right', x: 1, width: 40, scale: 1 });
// a full-bleed pair barely off the left page keeps the right half and shrinks to fit
eq('dissolve shrinks an oversized image',
  resolveSpanDrop({ ...base, pageIndex: 1, x: 97, width: 200, side: 'left' }),
  { action: 'dissolve', keep: 'right', x: -3, width: 100, scale: 0.5 });

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
```

- [ ] **Step 3: Run it to confirm it fails**

```bash
npx tsx "$SCRATCH/check-span-geometry.ts"
```

Expected: FAIL — `Cannot find module '.../src/lib/spanGeometry.ts'`.

- [ ] **Step 4: Implement the module**

Create `src/lib/spanGeometry.ts`:

```ts
// Pure geometry for images that run across the gutter of a two-page spread.
//
// A spanning image is two blocks on facing pages sharing a spanId. One value
// drives the pair: xLeft, the left half's x in its own page's percentage
// space. The right half is always xLeft - 100. Width W is the total image
// width in single-page percent, so a full-bleed spread is W = 200, xLeft = 0.

import { clamp } from './utils';

export type SpanSide = 'left' | 'right';

/** Minimum percent of each page the image must cover to count as spanning. */
export const STRADDLE_MIN = 5;

export interface SpanDropInput {
  /** Index of the page the dragged half currently sits on. */
  pageIndex: number;
  /** Total pages in the document. */
  pageCount: number;
  /** Proposed x, unclamped, in the dragged half's own page space. */
  x: number;
  /** Total image width, single-page percent. */
  width: number;
  isImage: boolean;
  /** Set when the block already belongs to a span. */
  side?: SpanSide;
  viewMode: 'single' | 'spread';
}

export type SpanDropResult =
  | { action: 'none' }
  | { action: 'create'; xLeft: number; leftIndex: number }
  | { action: 'move'; xLeft: number }
  | { action: 'dissolve'; keep: SpanSide; x: number; width: number; scale: number };

/** True while the image covers at least STRADDLE_MIN% of both pages. */
export function straddles(xLeft: number, width: number): boolean {
  return xLeft <= 100 - STRADDLE_MIN && xLeft + width >= 100 + STRADDLE_MIN;
}

/** Pin xLeft into the range where the pair still straddles the seam. */
export function clampSpanX(xLeft: number, width: number): number {
  const min = 100 + STRADDLE_MIN - width;
  const max = 100 - STRADDLE_MIN;
  return clamp(xLeft, Math.min(min, max), max);
}

/** Normalise a dragged half's own-page x into left-page space. */
export function toXLeft(x: number, side: SpanSide): number {
  return side === 'left' ? x : x + 100;
}

/** How much of one page an image covers, given its x in that page's space. */
function coverage(x: number, width: number): number {
  return Math.max(0, Math.min(100, x + width) - Math.max(0, x));
}

/**
 * Decide what a drag-end position means for spanning. The caller passes the
 * raw, unclamped proposal; this returns which of the four cases applies.
 * Ordinary clamping is the caller's job for 'none' and 'dissolve'.
 */
export function resolveSpanDrop(input: SpanDropInput): SpanDropResult {
  const { pageIndex, pageCount, x, width, isImage, side, viewMode } = input;

  // Already spanned: move while it still straddles, otherwise dissolve.
  if (side) {
    const xLeft = toXLeft(x, side);
    if (straddles(xLeft, width)) {
      return { action: 'move', xLeft: clampSpanX(xLeft, width) };
    }
    // Keep the half the image actually sits on; shrink an oversized image so
    // the survivor is a legal single-page block.
    const keep: SpanSide =
      coverage(xLeft - 100, width) > coverage(xLeft, width) ? 'right' : 'left';
    const newWidth = Math.min(width, 100);
    return {
      action: 'dissolve',
      keep,
      x: keep === 'left' ? xLeft : xLeft - 100,
      width: newWidth,
      scale: newWidth / width,
    };
  }

  // Not spanned: only an image, only in spread view, only wide enough.
  if (!isImage || viewMode !== 'spread') return { action: 'none' };
  if (width < 2 * STRADDLE_MIN) return { action: 'none' };

  // Left slots are odd indices; page 0 is the cover and never spans.
  if (pageIndex === 0) return { action: 'none' };
  const inLeftSlot = pageIndex % 2 === 1;
  const partner = inLeftSlot ? pageIndex + 1 : pageIndex - 1;
  if (partner < 0 || partner >= pageCount) return { action: 'none' };

  const crosses = inLeftSlot ? x + width > 100 : x < 0;
  if (!crosses) return { action: 'none' };

  return {
    action: 'create',
    xLeft: clampSpanX(toXLeft(x, inLeftSlot ? 'left' : 'right'), width),
    leftIndex: Math.min(pageIndex, partner),
  };
}
```

- [ ] **Step 5: Run it to confirm it passes**

```bash
npx tsx "$SCRATCH/check-span-geometry.ts"
```

Expected: every line `ok`, then `ALL PASS`, exit 0.

- [ ] **Step 6: Build and lint**

```bash
npm run build && npm run lint
```

Expected: build succeeds; lint shows only the pre-existing `ChannelPicker.tsx` warning.

- [ ] **Step 7: Commit**

```bash
git add src/lib/spanGeometry.ts src/types/zine.ts
git commit -m "feat: pure geometry for gutter-spanning images

One canonical value drives a spanning pair: xLeft, the left half's x in
its own page space, with the right half always at xLeft - 100.
resolveSpanDrop folds create, move, and dissolve into one decision so a
single drag gesture produces a single outcome.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Page units and parity module

Keeps a bound pair on a facing spread when pages are reordered or deleted.

**Files:**
- Create: `src/lib/pageUnits.ts`
- Verify: `$SCRATCH/check-page-units.ts`

**Interfaces:**
- Consumes: `ZinePage` from `src/types/zine.ts`.
- Produces: `buildUnits(pages)`, `reorderWithUnits(pages, from, to)`, `applyParity(pages, makeBlank)`.

- [ ] **Step 1: Write the failing verification script**

Create `$SCRATCH/check-page-units.ts`:

```ts
import { buildUnits, reorderWithUnits, applyParity } from '/Users/nope/Documents/GitHub/arena_zine/src/lib/pageUnits.ts';
import type { ZinePage, ZineBlock } from '/Users/nope/Documents/GitHub/arena_zine/src/types/zine.ts';

let failures = 0;
function eq(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) { failures++; console.error(`FAIL ${label}\n  expected ${e}\n  actual   ${a}`); }
  else console.log(`ok   ${label}`);
}

function block(id: string, spanId?: string, side?: 'left' | 'right'): ZineBlock {
  return { instanceId: id, arenaBlockId: 1, type: 'image', x: 0, y: 0, width: 40, height: 30, zIndex: 1, spanId, spanSide: side };
}
/** `p0 p1* p2* p3` — a star marks a page carrying half of span "s". */
function pages(spec: string): ZinePage[] {
  return spec.split(' ').map((tok, i) => {
    const id = `p${i}`;
    const spanned = tok.endsWith('*');
    return { id, order: i, blocks: spanned ? [block(`b${i}`, 's', i % 2 === 1 ? 'left' : 'right')] : [] };
  });
}
const ids = (ps: ZinePage[]) => ps.map((p) => p.id);
let padCount = 0;
const makeBlank = (): ZinePage => ({ id: `pad${padCount++}`, order: 0, blocks: [], autoPad: true });

// buildUnits groups a facing pair into one unit
eq('units, no spans', buildUnits(pages('a b c')), [[0], [1], [2]]);
eq('units, one pair at 1-2', buildUnits(pages('a b* c* d')), [[0], [1, 2], [3]]);
eq('units, two pairs', buildUnits(pages('a b* c* d* e*')), [[0], [1, 2], [3, 4]]);

// reorderWithUnits moves the whole unit
eq('reorder moves a bound pair together',
  ids(reorderWithUnits(pages('a b* c* d'), 1, 3)), ['p0', 'p3', 'p1', 'p2']);
eq('reorder an unrelated page past a pair',
  ids(reorderWithUnits(pages('a b* c* d'), 3, 1)), ['p0', 'p3', 'p1', 'p2']);
eq('reorder within a pair is a no-op',
  ids(reorderWithUnits(pages('a b* c* d'), 1, 2)), ['p0', 'p1', 'p2', 'p3']);

// applyParity inserts a blank so a pair starts on an odd index
padCount = 0;
eq('parity: already aligned, no padding',
  ids(applyParity(pages('a b* c* d'), makeBlank)), ['p0', 'p1', 'p2', 'p3']);
padCount = 0;
eq('parity: pair at 2-3 gets a pad before it',
  ids(applyParity(pages('a b c* d*'), makeBlank)), ['p0', 'p1', 'pad0', 'p2', 'p3']);

// applyParity strips empty auto-pads that are no longer needed
padCount = 0;
const stale: ZinePage[] = [
  { id: 'p0', order: 0, blocks: [] },
  { id: 'stale', order: 1, blocks: [], autoPad: true },
  { id: 'p1', order: 2, blocks: [] },
];
eq('parity: drops an unneeded empty auto-pad',
  ids(applyParity(stale, makeBlank)), ['p0', 'p1']);

// an auto-pad the user has drawn on is kept
padCount = 0;
const used: ZinePage[] = [
  { id: 'p0', order: 0, blocks: [] },
  { id: 'used', order: 1, blocks: [block('x')], autoPad: true },
  { id: 'p1', order: 2, blocks: [] },
];
eq('parity: keeps an auto-pad with content',
  ids(applyParity(used, makeBlank)), ['p0', 'used', 'p1']);

// order is renumbered contiguously
padCount = 0;
eq('parity renumbers order',
  applyParity(pages('a b c* d*'), makeBlank).map((p) => p.order), [0, 1, 2, 3, 4]);

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
npx tsx "$SCRATCH/check-page-units.ts"
```

Expected: FAIL — `Cannot find module '.../src/lib/pageUnits.ts'`.

- [ ] **Step 3: Implement the module**

Create `src/lib/pageUnits.ts`:

```ts
// Page-order bookkeeping for gutter-spanning images.
//
// A spanning pair occupies two facing pages that must move together and must
// stay on a facing spread. toSpreads() lays pages out as [null, p0], [p1, p2],
// [p3, p4]... so a pair must always start at an ODD index.

import type { ZinePage } from '../types/zine';

/** True when a block on `pages[i]` has its span partner on `pages[i + 1]`. */
function pairsForward(pages: ZinePage[], i: number): boolean {
  const next = pages[i + 1];
  if (!next) return false;
  return pages[i].blocks.some(
    (b) => b.spanId && next.blocks.some((o) => o.spanId === b.spanId)
  );
}

/** Group page indices into movable units: a bound pair, or a lone page. */
export function buildUnits(pages: ZinePage[]): number[][] {
  const units: number[][] = [];
  for (let i = 0; i < pages.length; ) {
    if (pairsForward(pages, i)) {
      units.push([i, i + 1]);
      i += 2;
    } else {
      units.push([i]);
      i += 1;
    }
  }
  return units;
}

/**
 * Reorder by whole units, so a bound pair can never be split. Mirrors the
 * splice-out-then-splice-in semantics of the original page reorder.
 */
export function reorderWithUnits(
  pages: ZinePage[],
  fromIndex: number,
  toIndex: number
): ZinePage[] {
  const units = buildUnits(pages);
  const uFrom = units.findIndex((u) => u.includes(fromIndex));
  const uTo = units.findIndex((u) => u.includes(toIndex));
  if (uFrom === -1 || uTo === -1 || uFrom === uTo) return pages;

  const [moved] = units.splice(uFrom, 1);
  units.splice(uTo, 0, moved);
  return units.flat().map((i, order) => ({ ...pages[i], order }));
}

/**
 * Enforce the parity rule: every bound pair starts at an odd index.
 *
 * Strips empty auto-pads first, then re-inserts them where needed, so the
 * pass is idempotent and self-healing — a pad that stopped being necessary
 * disappears, and one the user has drawn on is left alone.
 */
export function applyParity(
  pages: ZinePage[],
  makeBlank: () => ZinePage
): ZinePage[] {
  let result = pages.filter((p) => !(p.autoPad && p.blocks.length === 0));

  // Each insert fixes the earliest misaligned pair, so this terminates in at
  // most one pass per pair.
  for (let guard = 0; guard <= result.length + 2; guard++) {
    const units = buildUnits(result);
    let index = 0;
    let inserted = false;
    for (const unit of units) {
      if (unit.length === 2 && index % 2 === 0) {
        result = [...result.slice(0, index), makeBlank(), ...result.slice(index)];
        inserted = true;
        break;
      }
      index += unit.length;
    }
    if (!inserted) break;
  }

  return result.map((p, order) => ({ ...p, order }));
}
```

- [ ] **Step 4: Run it to confirm it passes**

```bash
npx tsx "$SCRATCH/check-page-units.ts"
```

Expected: every line `ok`, then `ALL PASS`, exit 0.

- [ ] **Step 5: Build and lint**

```bash
npm run build && npm run lint
```

Expected: build succeeds; lint shows only the pre-existing `ChannelPicker.tsx` warning.

- [ ] **Step 6: Commit**

```bash
git add src/lib/pageUnits.ts
git commit -m "feat: unit-aware page reordering and spread parity

A bound pair moves as one unit and must start at an odd index, since
toSpreads() puts the cover alone in the right slot. applyParity strips
empty auto-pads before re-inserting them, so the pass is idempotent and
a pad the user has drawn on is never removed.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Store — drag creates, moves, and dissolves spans

**Files:**
- Modify: `src/store/useZineStore.ts:255-269` (`updateBlockPosition`)

**Interfaces:**
- Consumes: `resolveSpanDrop`, `clampSpanX` from Task 1.
- Produces: an `updateBlockPosition` that handles all four cases. Signature is unchanged: `(instanceId: string, x: number, y: number) => void`.

- [ ] **Step 1: Add imports and a partner helper**

At the top of `src/store/useZineStore.ts`, after the existing `import { PAGE_SIZES } from '../lib/pageSizes';` line:

```ts
import { resolveSpanDrop } from '../lib/spanGeometry';
```

`clampSpanX` stays internal to `spanGeometry.ts` — `resolveSpanDrop` already applies it, so the store never calls it directly.

Then, immediately after the `touchDoc` function (around line 155), add:

```ts
interface Located {
  block: ZineBlock;
  pageIndex: number;
}

function locate(pages: ZinePage[], instanceId: string): Located | null {
  for (let i = 0; i < pages.length; i++) {
    const block = pages[i].blocks.find((b) => b.instanceId === instanceId);
    if (block) return { block, pageIndex: i };
  }
  return null;
}

/** The other half of a span, if this block has one. */
function findPartner(pages: ZinePage[], block: ZineBlock): ZineBlock | null {
  if (!block.spanId) return null;
  for (const page of pages) {
    const found = page.blocks.find(
      (b) => b.spanId === block.spanId && b.instanceId !== block.instanceId
    );
    if (found) return found;
  }
  return null;
}

/** Apply the same patch to a block and, when it is spanned, to its partner. */
function patchPair(
  pages: ZinePage[],
  instanceId: string,
  patch: Partial<ZineBlock>
): ZinePage[] {
  const located = locate(pages, instanceId);
  if (!located) return pages;
  const partner = findPartner(pages, located.block);
  const ids = new Set([instanceId, ...(partner ? [partner.instanceId] : [])]);
  return pages.map((p) => ({
    ...p,
    blocks: p.blocks.map((b) => (ids.has(b.instanceId) ? { ...b, ...patch } : b)),
  }));
}
```

- [ ] **Step 2: Replace `updateBlockPosition`**

Replace the whole existing `updateBlockPosition` implementation (from `// Drag end — one call per gesture, save history` through its closing `}),`) with:

```ts
      // Drag end — one call per gesture, save history. This is the only place
      // a span is created or dissolved, so one gesture is always one undo.
      updateBlockPosition: (instanceId, x, y) =>
        set((s) => {
          const located = locate(s.document.pages, instanceId);
          if (!located) return s;
          const { block, pageIndex } = located;

          const decision = resolveSpanDrop({
            pageIndex,
            pageCount: s.document.pages.length,
            x,
            width: block.width,
            isImage: block.type === 'image',
            side: block.spanSide,
            viewMode: s.viewMode,
          });

          const clampedY = clamp(y, 0, 100 - block.height);
          let pages = s.document.pages;

          if (decision.action === 'create') {
            const spanId = generateId();
            const rightIndex = decision.leftIndex + 1;
            // The dragged block keeps its instanceId and becomes whichever half
            // sits on the page it is already on; the other half is the clone.
            const draggedIsLeft = pageIndex === decision.leftIndex;
            const cloneId = generateId();
            const common = { ...block, y: clampedY, spanId };

            const leftHalf: ZineBlock = {
              ...common,
              instanceId: draggedIsLeft ? block.instanceId : cloneId,
              x: decision.xLeft,
              spanSide: 'left',
            };
            const rightHalf: ZineBlock = {
              ...common,
              instanceId: draggedIsLeft ? cloneId : block.instanceId,
              x: decision.xLeft - 100,
              spanSide: 'right',
            };

            pages = s.document.pages.map((p, i) => {
              if (i === decision.leftIndex) {
                return draggedIsLeft
                  ? { ...p, blocks: p.blocks.map((b) => (b.instanceId === instanceId ? leftHalf : b)) }
                  : { ...p, blocks: [...p.blocks, leftHalf] };
              }
              if (i === rightIndex) {
                return draggedIsLeft
                  ? { ...p, blocks: [...p.blocks, rightHalf] }
                  : { ...p, blocks: p.blocks.map((b) => (b.instanceId === instanceId ? rightHalf : b)) };
              }
              return p;
            });
          } else if (decision.action === 'move') {
            pages = patchPair(s.document.pages, instanceId, { y: clampedY });
            pages = pages.map((p) => ({
              ...p,
              blocks: p.blocks.map((b) =>
                b.spanId && b.spanId === block.spanId
                  ? { ...b, x: b.spanSide === 'left' ? decision.xLeft : decision.xLeft - 100 }
                  : b
              ),
            }));
          } else if (decision.action === 'dissolve') {
            const partner = findPartner(s.document.pages, block);
            const survivorId =
              block.spanSide === decision.keep ? instanceId : partner?.instanceId;
            const doomedId =
              block.spanSide === decision.keep ? partner?.instanceId : instanceId;
            const height = clamp(block.height * decision.scale, 5, 100);
            pages = s.document.pages.map((p) => ({
              ...p,
              blocks: p.blocks
                .filter((b) => b.instanceId !== doomedId)
                .map((b) =>
                  b.instanceId === survivorId
                    ? {
                        ...b,
                        spanId: undefined,
                        spanSide: undefined,
                        width: decision.width,
                        height,
                        x: clamp(decision.x, 0, 100 - decision.width),
                        y: clamp(clampedY, 0, 100 - height),
                      }
                    : b
                ),
            }));
          } else {
            pages = s.document.pages.map((p) => ({
              ...p,
              blocks: p.blocks.map((b) =>
                b.instanceId === instanceId
                  ? { ...b, x: clamp(x, 0, 100 - b.width), y: clampedY }
                  : b
              ),
            }));
          }

          return {
            history: [...s.history.slice(-9), s.document],
            document: { ...s.document, pages },
            selectedInstanceId:
              decision.action === 'dissolve' && block.spanSide !== decision.keep
                ? findPartner(s.document.pages, block)?.instanceId ?? null
                : s.selectedInstanceId,
          };
        }),
```

- [ ] **Step 3: Build and lint**

```bash
npm run build && npm run lint
```

Expected: build succeeds; lint shows only the pre-existing `ChannelPicker.tsx` warning.

- [ ] **Step 4: Verify in the browser**

Start the dev server (`npm run dev`), open http://localhost:5173/, switch to **Spread** view, and make sure the document has at least 3 pages.

1. Drag an image on page 1 (a left slot) rightward until it crosses the seam. Expected: a matching half appears on page 2 and the seam is continuous.
2. Drag either half a short distance. Expected: both move; the seam holds.
3. Drag the image fully back onto one page. Expected: it becomes a single block and the other half is gone.
4. Drag a **text** block toward the seam. Expected: it stops at the page edge as before.
5. Switch to **Single** view and drag an image toward the right edge. Expected: it stops at the edge; no span is created.
6. Press Cmd+Z after each of the above. Expected: exactly one undo reverses each gesture.

- [ ] **Step 5: Commit**

```bash
git add src/store/useZineStore.ts
git commit -m "feat: create and dissolve gutter spans by dragging

updateBlockPosition already ran once per drag and pushed history, so it
is the natural single home for create, move, and dissolve — one gesture,
one undo. Ordinary blocks keep the existing clamp untouched.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Store — mirroring, fillSpread, unlinkSpan, and paired deletion

**Files:**
- Modify: `src/store/useZineStore.ts` — the `ZineStore` interface, `updateBlockSize`, `updateBlockStyle`, `updateBlockRotation`, `removeBlock`

**Interfaces:**
- Consumes: `patchPair`, `locate`, `findPartner` from Task 3; `clampSpanX`, `toXLeft`, `STRADDLE_MIN` from Task 1.
- Produces: `fillSpread(instanceId: string): void`, `unlinkSpan(instanceId: string): void`.

- [ ] **Step 1: Declare the two new actions**

In the `ZineStore` interface, after the `updateBlockStyle` line, add:

```ts
  fillSpread: (instanceId: string) => void;
  unlinkSpan: (instanceId: string) => void;
```

Widen the import from `../lib/spanGeometry` to:

```ts
import { resolveSpanDrop, toXLeft, STRADDLE_MIN } from '../lib/spanGeometry';
```

- [ ] **Step 2: Mirror size, style, and rotation to the partner**

Replace `updateBlockSize` with:

```ts
      // Called on every pointermove during resize — history captured on pointerdown via captureHistory()
      updateBlockSize: (instanceId, width, height) =>
        set((s) => {
          const located = locate(s.document.pages, instanceId);
          if (!located) return s;
          const { block } = located;

          if (block.spanSide) {
            // A resize must never break the straddle, so the width floor is
            // whatever still reaches STRADDLE_MIN past the seam.
            const xLeft = toXLeft(block.x, block.spanSide);
            const floor = Math.max(2 * STRADDLE_MIN, 100 + STRADDLE_MIN - xLeft);
            const w = clamp(width, floor, 200);
            const h = clamp(height, 5, 100);
            const pages = patchPair(s.document.pages, instanceId, { width: w, height: h });
            return { document: touchDoc({ ...s.document, pages }) };
          }

          const pages = s.document.pages.map((p) => ({
            ...p,
            blocks: p.blocks.map((b) =>
              b.instanceId === instanceId
                ? { ...b, width: clamp(width, 5, 100), height: clamp(height, 5, 100) }
                : b
            ),
          }));
          return { document: touchDoc({ ...s.document, pages }) };
        }),
```

Replace `updateBlockStyle` with:

```ts
      // Called on every pointermove during rotate / slider drag — history captured on pointerdown
      updateBlockStyle: (instanceId, style) =>
        set((s) => ({
          document: touchDoc({
            ...s.document,
            pages: patchPair(s.document.pages, instanceId, style),
          }),
        })),
```

Replace `updateBlockRotation` with:

```ts
      // Called on every pointermove during rotate — history captured on pointerdown
      updateBlockRotation: (instanceId, degrees) =>
        set((s) => ({
          document: touchDoc({
            ...s.document,
            pages: patchPair(s.document.pages, instanceId, { rotation: degrees }),
          }),
        })),
```

`imageOffsetX`/`imageOffsetY` travel through `updateBlockStyle`, so image pan mirrors automatically — which it must, or the halves stop lining up.

- [ ] **Step 3: Delete both halves together**

Replace `removeBlock` with:

```ts
      removeBlock: (instanceId) =>
        set((s) => {
          const located = locate(s.document.pages, instanceId);
          // A span is one image; deleting half of it would strand an orphan.
          const partner = located ? findPartner(s.document.pages, located.block) : null;
          const doomed = new Set([instanceId, ...(partner ? [partner.instanceId] : [])]);
          const pages = s.document.pages.map((p) => ({
            ...p,
            blocks: p.blocks.filter((b) => !doomed.has(b.instanceId)),
          }));
          return {
            history: [...s.history.slice(-9), s.document],
            document: touchDoc({ ...s.document, pages }),
            selectedInstanceId: null,
          };
        }),
```

- [ ] **Step 4: Add `fillSpread` and `unlinkSpan`**

Insert both after `updateBlockStyle`:

```ts
      // Full bleed across both pages. A button because hitting exactly this by
      // dragging is fiddly.
      fillSpread: (instanceId) =>
        set((s) => {
          const located = locate(s.document.pages, instanceId);
          if (!located?.block.spanId) return s;
          const spanId = located.block.spanId;
          const pages = s.document.pages.map((p) => ({
            ...p,
            blocks: p.blocks.map((b) =>
              b.spanId === spanId
                ? { ...b, x: b.spanSide === 'left' ? 0 : -100, y: 0, width: 200, height: 100 }
                : b
            ),
          }));
          return {
            history: [...s.history.slice(-9), s.document],
            document: touchDoc({ ...s.document, pages }),
          };
        }),

      // Break the link so each half can be nudged independently, e.g. to
      // compensate for the few mm a binding eats at the gutter.
      unlinkSpan: (instanceId) =>
        set((s) => {
          const located = locate(s.document.pages, instanceId);
          if (!located?.block.spanId) return s;
          const spanId = located.block.spanId;
          const pages = s.document.pages.map((p) => ({
            ...p,
            blocks: p.blocks.map((b) =>
              b.spanId === spanId ? { ...b, spanId: undefined, spanSide: undefined } : b
            ),
          }));
          return {
            history: [...s.history.slice(-9), s.document],
            document: touchDoc({ ...s.document, pages }),
          };
        }),
```

Note: an unlinked half may still sit at a negative `x` or be wider than 100. That is intentional — it stays where the user put it, and the ordinary clamp only re-applies the next time it is dragged.

- [ ] **Step 5: Build and lint**

```bash
npm run build && npm run lint
```

Expected: build succeeds; lint shows only the pre-existing `ChannelPicker.tsx` warning.

- [ ] **Step 6: Verify in the browser**

With a spanned image on screen:

1. Resize from a corner handle. Expected: both halves resize together; the seam holds; the span never dissolves.
2. Rotate it. Expected: both halves rotate identically.
3. Change opacity and the image-pan sliders in the inspector. Expected: both halves track.
4. Select one half and press Delete. Expected: both halves disappear; one Cmd+Z restores both.

- [ ] **Step 7: Commit**

```bash
git add src/store/useZineStore.ts
git commit -m "feat: mirror edits across a spanned pair

Size, style, rotation, and image pan all propagate to the partner half —
pan especially, since mismatched object-position is exactly what makes a
seam stop lining up. Deleting either half deletes both, since a span is
conceptually one image and an orphan half is not a state worth having.

Adds fillSpread (exact full bleed, fiddly to drag) and unlinkSpan (nudge
one half to compensate for gutter creep).

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Store — unit-aware reorder and parity

**Files:**
- Modify: `src/store/useZineStore.ts` — `reorderPages`, `removePage`

**Interfaces:**
- Consumes: `reorderWithUnits`, `applyParity` from Task 2.
- Produces: no new signatures.

- [ ] **Step 1: Import the module and add a blank-page factory**

Add to the imports:

```ts
import { reorderWithUnits, applyParity } from '../lib/pageUnits';
```

And after `touchDoc`, add:

```ts
function makeAutoPad(): ZinePage {
  return { id: generateId(), order: 0, blocks: [], autoPad: true };
}
```

- [ ] **Step 2: Replace `reorderPages` and `removePage`**

```ts
      removePage: (pageId) =>
        set((s) => {
          if (s.document.pages.length <= 1) return s;
          const pages = applyParity(
            s.document.pages.filter((p) => p.id !== pageId),
            makeAutoPad
          );
          return {
            history: [...s.history.slice(-9), s.document],
            document: touchDoc({ ...s.document, pages }),
          };
        }),

      reorderPages: (fromIndex, toIndex) =>
        set((s) => {
          const moved = reorderWithUnits(s.document.pages, fromIndex, toIndex);
          if (moved === s.document.pages) return s;
          return {
            history: [...s.history.slice(-9), s.document],
            document: touchDoc({ ...s.document, pages: applyParity(moved, makeAutoPad) }),
          };
        }),
```

- [ ] **Step 3: Build and lint**

```bash
npm run build && npm run lint
```

Expected: build succeeds; lint shows only the pre-existing `ChannelPicker.tsx` warning.

- [ ] **Step 4: Verify in the browser**

With a document of at least 5 pages and a spanned pair on pages 1–2:

1. Drag the caption of page 1 to a later position. Expected: pages 1 and 2 move together and still land on a facing spread.
2. Drag an unrelated page so it would land inside the pair. Expected: a blank page appears so the pair stays on a facing spread.
3. Delete a page before the pair. Expected: the pair stays on a facing spread; any blank page that is no longer needed disappears.
4. Cmd+Z after each. Expected: one undo per gesture.

- [ ] **Step 5: Commit**

```bash
git add src/store/useZineStore.ts
git commit -m "feat: keep spanned pairs on a facing spread through reorders

reorderPages moves whole units so a bound pair can never be split, and
both reorder and page deletion re-run the parity pass, which strips
unneeded empty auto-pads before re-inserting them.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Live preview while dragging across the seam

Without this the image is clipped at the page edge mid-drag and you are dropping blind.

**Files:**
- Modify: `src/store/useZineStore.ts` — `spanPreview` state
- Modify: `src/App.tsx` — `onDragMove`
- Modify: `src/components/canvas/ZinePage.tsx` — render the ghost

**Interfaces:**
- Consumes: `resolveSpanDrop` from Task 1; `locate`, `findPartner` from Task 3.
- Produces: `spanPreview` state and `setSpanPreview(preview: SpanPreview | null): void`.

- [ ] **Step 1: Add the transient state**

In `src/store/useZineStore.ts`, above the `ZineStore` interface:

```ts
/**
 * Transient preview of where a spanning half will land, published while a
 * canvas drag is in flight. Never persisted, never pushed to history.
 */
export interface SpanPreview {
  /** The half being dragged. */
  instanceId: string;
  /** Page the ghost half renders on. */
  ghostPageId: string;
  /** Ghost position, in the ghost page's own percentage space. */
  x: number;
  y: number;
  /** Existing partner to suppress, so it does not double up with the ghost. */
  hideInstanceId?: string;
}
```

Add to the `ZineStore` interface, next to `zoom` and `viewMode`:

```ts
  spanPreview: SpanPreview | null;   // live drag preview (not persisted)
  setSpanPreview: (preview: SpanPreview | null) => void;
```

Add to the store body, next to `viewMode: 'single'`:

```ts
      spanPreview: null,
```

and next to `setViewMode`:

```ts
      setSpanPreview: (spanPreview) => set({ spanPreview }),
```

`partialize` already persists only `document`, so no change is needed there.

- [ ] **Step 2: Publish the preview from `onDragMove`**

In `src/App.tsx`, extend the dnd-kit import to include `type DragMoveEvent`, and pull the new pieces out of the store:

```ts
  const { document: doc, addBlock, updateBlockPosition, reorderPages, selectedInstanceId, removeBlock, selectBlock, undo, viewMode, setSpanPreview } = useZineStore();
```

Add these imports:

```ts
import { resolveSpanDrop } from './lib/spanGeometry';
```

Add the handler above `handleDragEnd`:

```ts
  // Publishes where the spanning half will land, so the image stays visible
  // while it crosses the gutter instead of being clipped at the page edge.
  function handleDragMove(event: DragMoveEvent) {
    const { active, delta } = event;
    const data = active.data.current;
    if (data?.source !== 'canvas' || !data?.instanceId) return;
    if (viewMode !== 'spread') return;

    const pageIndex = doc.pages.findIndex((p) => p.id === data.pageId);
    if (pageIndex === -1) return;
    const block = doc.pages[pageIndex].blocks.find((b) => b.instanceId === data.instanceId);
    if (!block) return;

    const pageEl = document.getElementById(`page-${data.pageId}`);
    if (!pageEl) return;
    const pageRect = pageEl.getBoundingClientRect();
    const x = block.x + (delta.x / pageRect.width) * 100;
    const y = block.y + (delta.y / pageRect.height) * 100;

    const decision = resolveSpanDrop({
      pageIndex,
      pageCount: doc.pages.length,
      x,
      width: block.width,
      isImage: block.type === 'image',
      side: block.spanSide,
      viewMode,
    });

    if (decision.action !== 'create' && decision.action !== 'move') {
      setSpanPreview(null);
      return;
    }

    // Which page is the dragged half on, and which gets the ghost?
    const isLeftHalf = block.spanSide ? block.spanSide === 'left' : pageIndex % 2 === 1;
    const leftIndex = isLeftHalf ? pageIndex : pageIndex - 1;
    const ghostIndex = isLeftHalf ? leftIndex + 1 : leftIndex;
    const ghostPage = doc.pages[ghostIndex];
    if (!ghostPage) return;

    const partner = block.spanId
      ? doc.pages.flatMap((p) => p.blocks).find(
          (b) => b.spanId === block.spanId && b.instanceId !== block.instanceId
        )
      : undefined;

    setSpanPreview({
      instanceId: block.instanceId,
      ghostPageId: ghostPage.id,
      x: isLeftHalf ? decision.xLeft - 100 : decision.xLeft,
      y,
      hideInstanceId: partner?.instanceId,
    });
  }
```

Clear the preview at the top of `handleDragEnd`, alongside the existing resets:

```ts
    setSpanPreview(null);
```

And wire the handler onto the context:

```tsx
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragMove={handleDragMove} onDragEnd={handleDragEnd}>
```

- [ ] **Step 3: Render the ghost**

In `src/components/canvas/ZinePage.tsx`, extend the store destructure:

```ts
  const { document: doc, selectBlock, spanPreview } = useZineStore();
```

Add these imports:

```ts
import ImageBlock from '../blocks/ImageBlock';
```

Then find the block that is being previewed and render a ghost. Replace the `{page.blocks...map(...)}` JSX block with:

```tsx
        {page.blocks
          .slice()
          .filter((b) => b.instanceId !== spanPreview?.hideInstanceId)
          .sort((a, b) => a.zIndex - b.zIndex)
          .map((block) => (
            <PlacedBlock
              key={block.instanceId}
              block={block}
              pageId={page.id}
              pageRef={pageRef}
            />
          ))}

        {/* Ghost half of an image being dragged across the gutter. Clipped by
            this page just like a real half, so the seam reads correctly for
            the whole gesture. */}
        {spanPreview?.ghostPageId === page.id && (() => {
          const source = doc.pages
            .flatMap((p) => p.blocks)
            .find((b) => b.instanceId === spanPreview.instanceId);
          if (!source) return null;
          return (
            <div
              aria-hidden
              style={{
                position: 'absolute',
                left: `${spanPreview.x}%`,
                top: `${spanPreview.y}%`,
                width: `${source.width}%`,
                height: `${source.height}%`,
                zIndex: source.zIndex,
                opacity: source.opacity ?? 1,
                transform: source.rotation ? `rotate(${source.rotation}deg)` : undefined,
                borderRadius: source.cropShape === 'circle' ? '50%' : source.borderRadius ? `${source.borderRadius}%` : undefined,
                overflow: 'hidden',
                pointerEvents: 'none',
              }}
            >
              <ImageBlock block={source} />
            </div>
          );
        })()}
```

- [ ] **Step 4: Build and lint**

```bash
npm run build && npm run lint
```

Expected: build succeeds; lint shows only the pre-existing `ChannelPicker.tsx` warning.

- [ ] **Step 5: Verify in the browser**

1. Slowly drag an image on a left-slot page toward the seam. Expected: as soon as it crosses, the overflow appears on the facing page, and the seam is continuous throughout the drag.
2. Release. Expected: the ghost is replaced by the real half in exactly the same place — no jump.
3. Drag an existing spanned half around. Expected: exactly one image is visible on the facing page at all times (the ghost, not a stale partner).
4. Drag a text block, and drag anything in single view. Expected: no ghost ever appears.

- [ ] **Step 6: Commit**

```bash
git add src/store/useZineStore.ts src/App.tsx src/components/canvas/ZinePage.tsx
git commit -m "feat: live preview while dragging an image across the gutter

The dragged block lives inside its page's overflow:hidden, so without a
preview it is clipped at the page edge and you drop blind. onDragMove
publishes transient spanPreview state and the facing page renders a ghost
half, clipped by its own page — so the seam reads correctly from first
movement to drop, with no snap at the end.

The existing partner is suppressed while the ghost is up, so a spanned
pair never shows two right halves mid-drag.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Inspector controls and documentation

**Files:**
- Modify: `src/components/inspector/BlockInspector.tsx`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: `fillSpread`, `unlinkSpan` from Task 4.
- Produces: nothing.

- [ ] **Step 1: Add the two buttons**

In `src/components/inspector/BlockInspector.tsx`, pull the actions from the store alongside the existing ones:

```ts
  const { fillSpread, unlinkSpan } = useZineStore();
```

(Merge into the existing `useZineStore()` destructure rather than adding a second call.)

Then, inside the image-only area of the inspector — next to the existing **Fit to image** button — add:

```tsx
        {block.spanId && (
          <Section label="Spread">
            <div className="flex flex-col gap-1.5">
              <button
                type="button"
                onClick={() => fillSpread(block.instanceId)}
                className="text-xs rounded px-2 py-1.5 bg-stone-100 hover:bg-stone-200 transition-colors"
              >
                Fill spread
              </button>
              <button
                type="button"
                onClick={() => unlinkSpan(block.instanceId)}
                className="text-xs rounded px-2 py-1.5 bg-stone-100 hover:bg-stone-200 transition-colors"
              >
                Unlink halves
              </button>
            </div>
          </Section>
        )}
```

Match the surrounding `Section` and button styling if it differs from the above — the existing riso and **Fit to image** controls are the reference.

- [ ] **Step 2: Document the feature**

In `CLAUDE.md`, add a section after the **Drag-and-drop** section:

```markdown
### Gutter-spanning images

An image can run across a two-page spread. It is modelled as **two blocks on
facing pages sharing a `spanId`**, offset by exactly one page width, each
clipped by its own page's `overflow: hidden` — so no renderer needed changing,
and export still emits one PDF page per zine page.

One value drives the pair: `xLeft`, the left half's x in its own page space;
the right half is always at `xLeft - 100`. All of the arithmetic lives in
`src/lib/spanGeometry.ts`, whose `resolveSpanDrop()` folds create / move /
dissolve into one decision.

**Dragging is the whole interaction.** Drag an image across the seam in spread
view and it spans; drag it fully back onto one page and the span dissolves.
Both run through `updateBlockPosition`, which already fired once per drag and
pushed history, so one gesture is always one undo. Spanning requires an image,
spread view, and a facing partner page — the cover (index 0) and a trailing
odd page have no seam and refuse.

Clamps relax **only** for blocks carrying a `spanId` (`xLeft` into the straddle
range, width up to 200); ordinary blocks keep `x ∈ [0, 100 - width]`, which is
what stops a block being lost off-canvas. `updateBlockSize`, `updateBlockStyle`,
and `updateBlockRotation` mirror to the partner — `imageOffsetX/Y` especially,
since mismatched pan is what makes a seam stop lining up. Deleting either half
deletes both.

`src/lib/pageUnits.ts` keeps a pair on a facing spread: `reorderPages` moves
whole units, and `applyParity()` inserts a blank `autoPad` page when a pair
would otherwise start at an even index, stripping unneeded empty pads first so
the pass is idempotent.

While a drag is in flight the store holds transient `spanPreview` state (not
persisted, not in history) and `ZinePage` renders a ghost half on the facing
page, so the image stays visible while crossing the gutter.
```

- [ ] **Step 3: Build and lint**

```bash
npm run build && npm run lint
```

Expected: build succeeds; lint shows only the pre-existing `ChannelPicker.tsx` warning.

- [ ] **Step 4: Full manual pass against the spec**

Work through the spec's verification list end to end:

1. Drag an image across the seam; the seam is continuous.
2. Drag one half; the other tracks it.
3. Drag fully back onto one page; it dissolves to a single block.
4. The preview tracks the seam continuously, with no snap on drop.
5. Corner-resize; the seam holds and the span never dissolves.
6. Unlink, nudge one half, the other stays put.
7. An ordinary block still cannot be dragged off its page.
8. The cover and a trailing odd page refuse to span.
9. Reorder a bound page; its partner follows.
10. Reorder an unrelated page across a pair; a blank page is inserted.
11. Cmd+Z after each of span, move, and dissolve; one undo per gesture.
12. Export a composite PDF; the two pages carry matching halves.

Item 12 is the one that must not be skipped — it is the only check that the
feature survives the whole render path into the actual deliverable.

- [ ] **Step 5: Commit**

```bash
git add src/components/inspector/BlockInspector.tsx CLAUDE.md
git commit -m "feat: spread controls in the inspector, and document spanning

Fill spread and Unlink halves appear only for an image that is already
spanned; there is no span button, because the drag is the gesture.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Notes for the implementer

- **Do not touch `src/components/pdf/`.** Spanning works in the PDF for free, because both halves are ordinary blocks and `PDFBlock` already clips at the page edge. If a span looks wrong in an exported PDF, the bug is in the geometry, not the renderer.
- **`spanPreview` must never enter `history` or `partialize`.** It changes on every pointermove; persisting it would write to `localStorage` continuously and undo would replay drag frames.
- **Percentages are relative to different page dimensions.** When Task 3 shrinks a dissolved block, it scales `width` and `height` by the same factor — that preserves pixel aspect ratio precisely because both are percentages of their own dimension.
- The existing `updateAspectRatio` bails out when `naturalAspectRatio` is already set. That is deliberate and unrelated to spanning; leave it alone.
