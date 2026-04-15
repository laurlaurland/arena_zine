import { useRef } from 'react';
import { useZineStore } from '../../store/useZineStore';
import ZinePage from './ZinePage';
import PageControls from './PageControls';

export default function Canvas() {
  const { document: doc, zoom, setZoom } = useZineStore();
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-stone-200">
      {/* Zoom controls */}
      <div className="flex items-center gap-2 px-4 py-2 bg-white border-b border-stone-200 shrink-0">
        <button
          className="text-xs text-stone-600 hover:text-stone-900 px-2 py-0.5 rounded border border-stone-200 hover:bg-stone-50"
          onClick={() => setZoom(zoom - 0.1)}
        >
          −
        </button>
        <span className="text-xs text-stone-500 w-12 text-center">{Math.round(zoom * 100)}%</span>
        <button
          className="text-xs text-stone-600 hover:text-stone-900 px-2 py-0.5 rounded border border-stone-200 hover:bg-stone-50"
          onClick={() => setZoom(zoom + 0.1)}
        >
          +
        </button>
        <button
          className="text-xs text-stone-400 hover:text-stone-600 ml-1"
          onClick={() => setZoom(0.8)}
        >
          Reset
        </button>
      </div>

      {/* Scrollable canvas area */}
      <div ref={containerRef} className="flex-1 overflow-auto">
        <div
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: 'top center',
            paddingTop: 48,
            paddingBottom: 48,
            minHeight: `${100 / zoom}%`,
          }}
        >
          <div className="flex flex-col items-center">
            <PageControls />
            {doc.pages
              .slice()
              .sort((a, b) => a.order - b.order)
              .map((page, i) => (
                <ZinePage key={page.id} page={page} pageNumber={i + 1} />
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
