import { Document } from '@react-pdf/renderer';
import type { ZineDocument } from '../../types/zine';
import { PAGE_SIZES } from '../../lib/pageSizes';
import PDFPage from './PDFPage';

interface Props {
  document: ZineDocument;
}

export default function ZinePDF({ document: doc }: Props) {
  const pageSize = PAGE_SIZES[doc.pageSize];

  return (
    <Document title={doc.title}>
      {doc.pages
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((page) => (
          <PDFPage key={page.id} page={page} pageSize={pageSize} />
        ))}
    </Document>
  );
}
