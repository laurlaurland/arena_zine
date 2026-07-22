import { useZineStore } from '../../store/useZineStore';
import { CURATED_RISO_INKS, risoInkCss } from '../../lib/risoColors';

export default function BlockInspector() {
  const {
    selectedInstanceId,
    document: doc,
    updateBlockStyle,
    updateBlockRotation,
    captureHistory,
    bringToFront,
    sendToBack,
    bringForward,
    sendBackward,
  } = useZineStore();

  if (!selectedInstanceId) return null;

  const block = doc.pages.flatMap((p) => p.blocks).find((b) => b.instanceId === selectedInstanceId);
  if (!block) return null;

  const isImage = block.type === 'image' || block.type === 'link' || block.type === 'attachment';

  return (
    <div
      className="w-52 shrink-0 bg-white border-l border-stone-200 overflow-y-auto flex flex-col"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="px-3 py-2 border-b border-stone-100">
        <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide">Block</p>
      </div>

      <div className="flex flex-col gap-4 p-3">

        {/* Opacity */}
        <Section label="Opacity">
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={block.opacity ?? 1}
              onPointerDown={captureHistory}
              onChange={(e) => updateBlockStyle(selectedInstanceId, { opacity: parseFloat(e.target.value) })}
              className="flex-1 h-1 accent-stone-800"
            />
            <span className="text-xs text-stone-500 w-8 text-right">
              {Math.round((block.opacity ?? 1) * 100)}%
            </span>
          </div>
        </Section>

        {/* Rotation */}
        <Section label="Rotation">
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={-180}
              max={180}
              step={1}
              value={block.rotation ?? 0}
              onPointerDown={captureHistory}
              onChange={(e) => updateBlockRotation(selectedInstanceId, parseFloat(e.target.value))}
              className="flex-1 h-1 accent-stone-800"
            />
            <span className="text-xs text-stone-500 w-8 text-right">
              {Math.round(block.rotation ?? 0)}°
            </span>
          </div>
        </Section>

        {/* Z-order */}
        <Section label="Layer order">
          <div className="grid grid-cols-2 gap-1">
            <ZBtn onClick={() => bringToFront(selectedInstanceId)} title="Bring to Front">↑↑ Front</ZBtn>
            <ZBtn onClick={() => sendToBack(selectedInstanceId)} title="Send to Back">↓↓ Back</ZBtn>
            <ZBtn onClick={() => bringForward(selectedInstanceId)} title="Bring Forward">↑ Forward</ZBtn>
            <ZBtn onClick={() => sendBackward(selectedInstanceId)} title="Send Backward">↓ Backward</ZBtn>
          </div>
        </Section>

        {/* Image-specific tools */}
        {isImage && (
          <>
            {/* Corner radius */}
            <Section label="Corner radius">
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={0}
                  max={50}
                  step={1}
                  value={block.cropShape === 'circle' ? 50 : (block.borderRadius ?? 0)}
                  disabled={block.cropShape === 'circle'}
                  onPointerDown={captureHistory}
                  onChange={(e) =>
                    updateBlockStyle(selectedInstanceId, {
                      borderRadius: parseFloat(e.target.value),
                      cropShape: undefined,
                    })
                  }
                  className="flex-1 h-1 accent-stone-800 disabled:opacity-30"
                />
                <span className="text-xs text-stone-500 w-8 text-right">
                  {block.cropShape === 'circle' ? '50%' : `${block.borderRadius ?? 0}%`}
                </span>
              </div>
            </Section>

            {/* Crop shape */}
            <Section label="Crop shape">
              <div className="flex gap-1">
                <ShapeBtn
                  active={!block.cropShape}
                  onClick={() => updateBlockStyle(selectedInstanceId, { cropShape: undefined })}
                >
                  <RectIcon />
                </ShapeBtn>
                <ShapeBtn
                  active={block.cropShape === 'circle'}
                  onClick={() =>
                    updateBlockStyle(selectedInstanceId, {
                      cropShape: block.cropShape === 'circle' ? undefined : 'circle',
                      borderRadius: undefined,
                    })
                  }
                >
                  <CircleIcon />
                </ShapeBtn>
              </div>
            </Section>

            {/* Image pan (crop position) */}
            <Section label="Crop position">
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-stone-400 w-3">X</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={block.imageOffsetX ?? 50}
                    onPointerDown={captureHistory}
                    onChange={(e) => updateBlockStyle(selectedInstanceId, { imageOffsetX: parseFloat(e.target.value) })}
                    className="flex-1 h-1 accent-stone-800"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-stone-400 w-3">Y</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={block.imageOffsetY ?? 50}
                    onPointerDown={captureHistory}
                    onChange={(e) => updateBlockStyle(selectedInstanceId, { imageOffsetY: parseFloat(e.target.value) })}
                    className="flex-1 h-1 accent-stone-800"
                  />
                </div>
                <button
                  className="text-xs text-stone-400 hover:text-stone-600 text-left mt-0.5"
                  onClick={() => updateBlockStyle(selectedInstanceId, { imageOffsetX: 50, imageOffsetY: 50 })}
                >
                  Reset center
                </button>
              </div>
            </Section>

            {/* Riso halftone effect */}
            {block.type === 'image' && block.imageUrl && (
              <Section label="Riso">
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => {
                      captureHistory();
                      updateBlockStyle(selectedInstanceId, {
                        riso: block.riso ? undefined : { ink: 'FLUORESCENTPINK', intensity: 50 },
                      });
                    }}
                    className={`text-xs rounded px-2 py-1.5 transition-colors ${
                      block.riso
                        ? 'bg-stone-800 text-white hover:bg-stone-700'
                        : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                    }`}
                  >
                    {block.riso ? 'Riso on' : 'Riso off'}
                  </button>

                  {block.riso && (
                    <>
                      <div className="grid grid-cols-8 gap-1">
                        {CURATED_RISO_INKS.map((name) => (
                          <button
                            key={name}
                            title={name}
                            onClick={() => {
                              captureHistory();
                              updateBlockStyle(selectedInstanceId, { riso: { ...block.riso!, ink: name } });
                            }}
                            className={`w-4 h-4 rounded-sm border ${
                              block.riso!.ink === name
                                ? 'border-stone-900 ring-1 ring-stone-900'
                                : 'border-stone-200'
                            }`}
                            style={{ backgroundColor: risoInkCss(name) }}
                          />
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={1}
                          value={block.riso!.intensity}
                          onPointerDown={captureHistory}
                          onChange={(e) =>
                            updateBlockStyle(selectedInstanceId, {
                              riso: { ...block.riso!, intensity: parseFloat(e.target.value) },
                            })
                          }
                          className="flex-1 h-1 accent-stone-800"
                        />
                        <span className="text-xs text-stone-500 w-8 text-right">{block.riso!.intensity}</span>
                      </div>
                    </>
                  )}
                </div>
              </Section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-medium text-stone-400 uppercase tracking-wide">{label}</p>
      {children}
    </div>
  );
}

function ZBtn({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="text-xs text-stone-700 bg-stone-100 hover:bg-stone-200 rounded px-2 py-1.5 text-center transition-colors"
    >
      {children}
    </button>
  );
}

function ShapeBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-center w-9 h-9 rounded border transition-colors ${
        active ? 'border-stone-800 bg-stone-100' : 'border-stone-200 hover:border-stone-400'
      }`}
    >
      {children}
    </button>
  );
}

function RectIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="2" y="2" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function CircleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
