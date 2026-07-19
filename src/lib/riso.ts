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
