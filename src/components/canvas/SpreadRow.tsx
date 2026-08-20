import { useZineStore } from '../../store/useZineStore';
import { PAGE_SIZES, CANVAS_PAGE_WIDTH } from '../../lib/pageSizes';
import ZinePage from './ZinePage';
import type { ZinePage as ZinePageType } from '../../types/zine';
import type { Spread } from '../../lib/spreads';

interface Props {
  spread: Spread<ZinePageType>;
  /** 1-based page number of the left slot (right slot is this + 1). */
  leftPageNumber: number;
}

/** Invisible stand-in that keeps the cover pushed into the right-hand slot. */
function EmptySlot({ height }: { height: number }) {
  return <div style={{ width: CANVAS_PAGE_WIDTH, height }} aria-hidden />;
}

export default function SpreadRow({ spread, leftPageNumber }: Props) {
  const { document: doc } = useZineStore();
  const pageSize = PAGE_SIZES[doc.pageSize];
  const pageHeight = CANVAS_PAGE_WIDTH * (pageSize.heightMm / pageSize.widthMm);

  const [left, right] = spread;
  // A lone cover (or a lone trailing page) has no spine to shade.
  const hasSpine = left !== null && right !== null;

  // The shadow sits behind the paper so it hugs the pages only, not the
  // captions that ZinePage renders underneath them.
  const paperLeft = left ? 0 : CANVAS_PAGE_WIDTH;
  const paperWidth = hasSpine ? CANVAS_PAGE_WIDTH * 2 : CANVAS_PAGE_WIDTH;

  return (
    <div className="relative mb-12" style={{ width: CANVAS_PAGE_WIDTH * 2 }}>
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: 0,
          left: paperLeft,
          width: paperWidth,
          height: pageHeight,
          boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
        }}
      />

      <div className="relative flex items-start">
        {left ? (
          <ZinePage page={left} pageNumber={leftPageNumber} inSpread />
        ) : (
          <EmptySlot height={pageHeight} />
        )}
        {right ? (
          <ZinePage page={right} pageNumber={leftPageNumber + 1} inSpread />
        ) : (
          <EmptySlot height={pageHeight} />
        )}
      </div>

      {/* Fold shading over the gutter. Never intercepts pointer events. */}
      {hasSpine && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: 0,
            left: CANVAS_PAGE_WIDTH - 32,
            width: 64,
            height: pageHeight,
            pointerEvents: 'none',
            background:
              'linear-gradient(to right,' +
              ' rgba(0,0,0,0) 0%,' +
              ' rgba(0,0,0,0.10) 42%,' +
              ' rgba(0,0,0,0.17) 50%,' +
              ' rgba(0,0,0,0.10) 58%,' +
              ' rgba(0,0,0,0) 100%)',
          }}
        />
      )}
    </div>
  );
}
