import { useRef } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { useZineStore } from '../../store/useZineStore';
import { PAGE_SIZES } from '../../lib/pageSizes';
import PlacedBlock from './PlacedBlock';
import type { ZinePage as ZinePageType } from '../../types/zine';

interface Props {
  page: ZinePageType;
  pageNumber: number;
}

// Render width of a page on the canvas in pixels (before zoom)
const CANVAS_PAGE_WIDTH = 560;

export default function ZinePage({ page, pageNumber }: Props) {
  const { document: doc, selectBlock } = useZineStore();
  const pageSize = PAGE_SIZES[doc.pageSize];
  const aspectRatio = pageSize.heightMm / pageSize.widthMm;
  const pageHeight = CANVAS_PAGE_WIDTH * aspectRatio;

  const pageRef = useRef<HTMLDivElement>(null);

  const { setNodeRef, isOver } = useDroppable({
    id: `page-${page.id}`,
    data: { pageId: page.id },
  });

  return (
    <div className="flex flex-col items-center mb-12">
      <div
        ref={(el) => {
          setNodeRef(el);
          (pageRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
        }}
        id={`page-${page.id}`}
        style={{
          width: CANVAS_PAGE_WIDTH,
          height: pageHeight,
          backgroundColor: page.backgroundColor ?? '#ffffff',
          position: 'relative',
          overflow: 'hidden',
          boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
          outline: isOver ? '3px solid #3b82f6' : undefined,
          outlineOffset: '2px',
        }}
        onClick={() => selectBlock(null)}
      >
        {page.blocks
          .slice()
          .sort((a, b) => a.zIndex - b.zIndex)
          .map((block) => (
            <PlacedBlock
              key={block.instanceId}
              block={block}
              pageId={page.id}
              pageRef={pageRef}
            />
          ))}
      </div>
      <p className="text-xs text-stone-400 mt-2">Page {pageNumber}</p>
    </div>
  );
}
