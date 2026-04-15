import { pdf } from '@react-pdf/renderer';
import { createElement } from 'react';
import ZinePDF from '../components/pdf/ZinePDF';
import type { ZineDocument } from '../types/zine';

export async function exportPDF(document: ZineDocument): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const element = createElement(ZinePDF, { document }) as any;
  const blob = await pdf(element).toBlob();
  const url = URL.createObjectURL(blob);
  const a = window.document.createElement('a');
  a.href = url;
  a.download = `${document.title.replace(/\s+/g, '_')}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
