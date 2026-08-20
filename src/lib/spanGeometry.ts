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
  // Outside spread view the user can only see one half, so dissolving would
  // silently delete an invisible partner with no preview — the pair stays
  // coherent and just moves together instead. Creating a span in single
  // view is already impossible (see below), so the gesture and its inverse
  // now share the same spread-view precondition.
  if (side) {
    const xLeft = toXLeft(x, side);
    if (viewMode !== 'spread' || straddles(xLeft, width)) {
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
