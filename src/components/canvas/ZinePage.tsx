import { useRef } from 'react';
import { useDroppable, useDraggable } from '@dnd-kit/core';
import { useZineStore } from '../../store/useZineStore';
import { PAGE_SIZES } from '../../lib/pageSizes';
import PlacedBlock from './PlacedBlock';
import ImageBlock from '../blocks/ImageBlock';
import type { ZinePage as ZinePageType } from '../../types/zine';

interface Props {
  page: ZinePageType;
  pageNumber: number;
  /** In spread mode the SpreadRow owns the shadow and spacing, so drop ours. */
  inSpread?: boolean;
}

// Render width of a page on the canvas in pixels (before zoom)
export const CANVAS_PAGE_WIDTH = 560;

export default function ZinePage({ page, pageNumber, inSpread }: Props) {
  const { document: doc, selectBlock, spanPreview, viewMode } = useZineStore();
  const pageSize = PAGE_SIZES[doc.pageSize];
  const aspectRatio = pageSize.heightMm / pageSize.widthMm;
  const pageHeight = CANVAS_PAGE_WIDTH * aspectRatio;

  const pageRef = useRef<HTMLDivElement>(null);

  const { setNodeRef, isOver } = useDroppable({
    id: `page-${page.id}`,
    data: { pageId: page.id },
  });

  // The caption is the reorder handle — the page surface can't be, since it is
  // already a drop target and contains draggable blocks.
  const {
    setNodeRef: setHandleRef,
    listeners: handleListeners,
    attributes: handleAttributes,
    isDragging: isReordering,
  } = useDraggable({
    id: `pagehandle-${page.id}`,
    data: { source: 'page', pageId: page.id },
  });

  return (
    <div className={`flex flex-col items-center ${inSpread ? '' : 'mb-12'}`}>
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
          boxShadow: inSpread ? undefined : '0 4px 24px rgba(0,0,0,0.12)',
          outline: isOver ? '3px solid #3b82f6' : undefined,
          outlineOffset: '2px',
          opacity: isReordering ? 0.4 : undefined,
        }}
        onClick={() => selectBlock(null)}
      >
        {page.blocks
          .slice()
          .filter((b) => !(viewMode === 'spread' && b.instanceId === spanPreview?.hideInstanceId))
          .sort((a, b) => a.zIndex - b.zIndex)
          .map((block) => (
            <PlacedBlock
              key={block.instanceId}
              block={block}
              pageId={page.id}
              pageRef={pageRef}
            />
          ))}

        {/* Ghost half of an image being dragged across the gutter. Clipped by
            this page just like a real half, so the seam reads correctly for
            the whole gesture. */}
        {viewMode === 'spread' && spanPreview?.ghostPageId === page.id && (() => {
          const source = doc.pages
            .flatMap((p) => p.blocks)
            .find((b) => b.instanceId === spanPreview.instanceId);
          if (!source) return null;
          return (
            <div
              aria-hidden
              style={{
                position: 'absolute',
                left: `${spanPreview.x}%`,
                top: `${spanPreview.y}%`,
                width: `${source.width}%`,
                height: `${source.height}%`,
                zIndex: source.zIndex,
                opacity: source.opacity ?? 1,
                transform: source.rotation ? `rotate(${source.rotation}deg)` : undefined,
                borderRadius: source.cropShape === 'circle' ? '50%' : source.borderRadius ? `${source.borderRadius}%` : undefined,
                overflow: 'hidden',
                pointerEvents: 'none',
              }}
            >
              <ImageBlock block={source} />
            </div>
          );
        })()}
      </div>
      <p
        ref={setHandleRef}
        {...handleListeners}
        {...handleAttributes}
        title="Drag to reorder"
        className="text-xs text-stone-400 mt-2 px-2 py-0.5 rounded select-none cursor-grab active:cursor-grabbing hover:bg-stone-300/60 hover:text-stone-600 transition-colors"
      >
        Page {pageNumber}
      </p>
    </div>
  );
}
