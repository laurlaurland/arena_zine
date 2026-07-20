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
