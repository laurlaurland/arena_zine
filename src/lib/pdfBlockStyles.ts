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
