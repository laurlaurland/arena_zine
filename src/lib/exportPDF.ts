import { pdf } from '@react-pdf/renderer';
import { createElement } from 'react';
import ZinePDF from '../components/pdf/ZinePDF';
import type { Separation } from '../components/pdf/ZinePDF';
import type { ZineBlock, ZineDocument } from '../types/zine';
import { grayscaleImage, processRisoImage } from './riso';

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
