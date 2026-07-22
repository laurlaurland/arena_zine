import { Document } from '@react-pdf/renderer';
import type { ZineDocument } from '../../types/zine';
import { PAGE_SIZES } from '../../lib/pageSizes';
import PDFPage from './PDFPage';

// Separation render mode for riso printing: an ink layer shows only that
// ink's riso blocks as black coverage; the key layer shows untreated blocks
// (plus any riso blocks listed in includeInstanceIds — processing failures).
export type Separation =
  | { kind: 'ink'; ink: string }
  | { kind: 'key'; includeInstanceIds?: string[] };

interface Props {
  document: ZineDocument;
  risoImages?: Record<string, string>; // instanceId → processed data URL
  separation?: Separation;
}

export default function ZinePDF({ document: doc, risoImages = {}, separation }: Props) {
  const pageSize = PAGE_SIZES[doc.pageSize];

  return (
    <Document title={doc.title}>
      {doc.pages
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((page) => (
          <PDFPage
            key={page.id}
            page={page}
            pageSize={pageSize}
            risoImages={risoImages}
            separation={separation}
          />
        ))}
    </Document>
  );
}
