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
