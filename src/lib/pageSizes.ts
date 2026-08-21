import type { PageSize, PageSizeKey } from '../types/zine';

// 1pt = 1/72 inch; 1 inch = 25.4mm
const mmToPt = (mm: number) => (mm / 25.4) * 72;

// Render width of a page on the canvas in pixels, before zoom. Lives here
// rather than in a canvas component because the PDF tree needs it too, to
// convert canvas-pixel font sizes into points.
export const CANVAS_PAGE_WIDTH = 560;

export const PAGE_SIZES: Record<PageSizeKey, PageSize> = {
  A4: {
    key: 'A4',
    label: 'A4 (210 × 297mm)',
    widthMm: 210,
    heightMm: 297,
    widthPt: mmToPt(210),
    heightPt: mmToPt(297),
  },
  LETTER: {
    key: 'LETTER',
    label: 'Letter (8.5 × 11")',
    widthMm: 215.9,
    heightMm: 279.4,
    widthPt: 612,
    heightPt: 792,
  },
  A5: {
    key: 'A5',
    label: 'A5 (148 × 210mm)',
    widthMm: 148,
    heightMm: 210,
    widthPt: mmToPt(148),
    heightPt: mmToPt(210),
  },
  HALF_LETTER: {
    key: 'HALF_LETTER',
    label: 'Half Letter (5.5 × 8.5")',
    widthMm: 139.7,
    heightMm: 215.9,
    widthPt: 396,
    heightPt: 612,
  },
};
