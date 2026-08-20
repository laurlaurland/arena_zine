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

/** Render a document, return the raw PDF buffer. */
async function bufferOf(document: ZineDocument): Promise<Buffer> {
  const result: unknown = await pdf(<ZinePDF document={document} />).toBuffer();
  return Buffer.isBuffer(result)
    ? result
    : await new Promise((res, rej) => {
        const chunks: Buffer[] = [];
        const s = result as NodeJS.ReadableStream;
        s.on('data', (d: Buffer) => chunks.push(d));
        s.on('end', () => res(Buffer.concat(chunks)));
        s.on('error', rej);
      });
}

/** Every inflated content stream, concatenated: the actual drawing operators. */
async function streamOf(document: ZineDocument): Promise<string> {
  const buf = await bufferOf(document);
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

/**
 * The raw (uninflated) PDF text. `/ExtGState` dictionaries carrying the
 * `/ca` alpha value are plain PDF objects, not inside a Flate content
 * stream, so they never show up in `streamOf` — only the "/GsN gs" operator
 * that *references* one does.
 */
async function rawOf(document: ZineDocument): Promise<string> {
  return (await bufferOf(document)).toString('latin1');
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

/**
 * A bezier segment whose control points do NOT coincide with its own
 * endpoint — i.e. an actual arc.
 *
 * Verified against real output: `@react-pdf/render`'s `clipNode` (and its
 * border/rounded-rect painters) always draws a clip path corner-by-corner
 * with `bezierCurveTo`, even at borderRadius 0 — the KAPPA offset just
 * collapses to 0, so the emitted "x1 y1 x2 y2 x3 y3 c" has all three points
 * identical (a straight corner spelled as a zero-length curve). A plain
 * `/\bc\b/` test therefore fires on every clip, rounded or not; it has to
 * check that the control points actually move.
 */
function hasRealCurve(s: string): boolean {
  return s.split('\n').some((line) => {
    const m = /^(-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) c$/.exec(line.trim());
    if (!m) return false;
    const [x1, y1, x2, y2, x3, y3] = m.slice(1).map(Number);
    return !(x1 === x3 && y1 === y3 && x2 === x3 && y2 === y3);
  });
}

/** A real curve within reach of a clip operator (same 400-char window as before). */
function hasRoundedClip(s: string): boolean {
  const re = /\bW n\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    if (hasRealCurve(s.slice(Math.max(0, m.index - 400), m.index))) return true;
  }
  return false;
}

/**
 * Every `/ca` alpha value from `/ExtGState` dictionaries in the raw PDF.
 *
 * Verified against real output: an inner node with `backgroundColor:
 * 'transparent'` still paints a fill, gated by its own `/ca 0` ExtGState —
 * and the page itself carries a baseline `/ca 1` — so *every* render emits
 * "/GsN gs" references regardless of `block.opacity`. Only a value strictly
 * between 0 and 1 is evidence of the block's own opacity reaching the page.
 */
function alphaValues(raw: string): number[] {
  const re = /\/Type\s*\/ExtGState[^<>]*\/ca\s+([\d.]+)/g;
  const out: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) out.push(parseFloat(m[1]));
  return out;
}
function hasFractionalAlpha(raw: string): boolean {
  return alphaValues(raw).some((ca) => ca > 0 && ca < 1);
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
  check('square block clips without curves', !hasRoundedClip(square));
  check('rounded block clips with curves', hasRoundedClip(rounded));
  check('circle crop clips with curves', hasRoundedClip(circle));

  // --- pan ---
  const centred = await streamOf(doc({}));
  const panned = await streamOf(doc({ imageOffsetX: 0, imageOffsetY: 100 }));
  const pc = imagePlacement(centred);
  const pp = imagePlacement(panned);
  check('centred image has a placement matrix', pc !== null);
  check('panned image has a placement matrix', pp !== null);
  check('pan shifts the image placement', pc !== pp);

  // --- opacity ---
  const opaque = await rawOf(doc({}));
  const faded = await rawOf(doc({ opacity: 0.4 }));
  // pdfkit encodes fill alpha as an ExtGState (/ca) referenced by "/GsN gs".
  // There is no literal opacity operator. A fractional /ca is the signal —
  // baseline /ca 1 and /ca 0 states exist on every render regardless of
  // block.opacity (page background, transparent inner fill).
  check('opaque block emits no alpha state', !hasFractionalAlpha(opaque));
  check('translucent block emits an alpha state', hasFractionalAlpha(faded));

  // --- a rotated, rounded block keeps BOTH, which is the ordering bug ---
  const both = await streamOf(doc({ rotation: 30, borderRadius: 40 }));
  check('rotation survives alongside a clip', hasRotationMatrix(both));
  check('clip survives alongside a rotation', hasRoundedClip(both));

  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
