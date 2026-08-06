import { useRef, useCallback } from 'react';
import { useDraggable } from '@dnd-kit/core';
import type { ZineBlock } from '../../types/zine';
import { useZineStore } from '../../store/useZineStore';
import { PAGE_SIZES } from '../../lib/pageSizes';
import ImageBlock from '../blocks/ImageBlock';
import TextBlock from '../blocks/TextBlock';
import LinkBlock from '../blocks/LinkBlock';
import EmbedBlock from '../blocks/EmbedBlock';

interface Props {
  block: ZineBlock;
  pageId: string;
  pageRef: React.RefObject<HTMLDivElement | null>;
}

export default function PlacedBlock({ block, pageId, pageRef }: Props) {
  const {
    selectedInstanceId,
    selectBlock,
    updateBlockPosition,
    updateBlockSize,
    updateAspectRatio,
    updateBlockRotation,
    captureHistory,
    removeBlock,
    zoom,
    document: doc,
  } = useZineStore();
  const isSelected = selectedInstanceId === block.instanceId;
  const pageSize = PAGE_SIZES[doc.pageSize];
  const pageAR = pageSize.heightMm / pageSize.widthMm;

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: block.instanceId,
    data: { source: 'canvas', instanceId: block.instanceId, pageId },
  });

  // Called once when an image loads and its natural dimensions are known
  const handleNaturalSize = useCallback((w: number, h: number) => {
    updateAspectRatio(block.instanceId, w / h);
  }, [block.instanceId, updateAspectRatio]);

  // Block element ref (for computing center during rotation)
  const blockRef = useRef<HTMLDivElement>(null);

  // Rotate state
  const rotateStartRef = useRef<{ startAngle: number; startRotation: number } | null>(null);

  const getBlockCenter = () => {
    const el = blockRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  };

  const handleRotatePointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const center = getBlockCenter();
    if (!center) return;
    const angle = Math.atan2(e.clientY - center.y, e.clientX - center.x) * (180 / Math.PI);
    captureHistory();
    rotateStartRef.current = { startAngle: angle, startRotation: block.rotation ?? 0 };
  }, [block.rotation, captureHistory]);

  const handleRotatePointerMove = useCallback((e: React.PointerEvent) => {
    if (!rotateStartRef.current) return;
    const center = getBlockCenter();
    if (!center) return;
    const angle = Math.atan2(e.clientY - center.y, e.clientX - center.x) * (180 / Math.PI);
    const delta = angle - rotateStartRef.current.startAngle;
    let newRotation = rotateStartRef.current.startRotation + delta;
    // Snap to 15° increments when Shift is held
    if (e.shiftKey) newRotation = Math.round(newRotation / 15) * 15;
    updateBlockRotation(block.instanceId, newRotation);
  }, [block.instanceId, updateBlockRotation]);

  const handleRotatePointerUp = useCallback(() => {
    rotateStartRef.current = null;
  }, []);

  // Resize state
  const resizeStartRef = useRef<{
    corner: string;
    startX: number; startY: number;
    startW: number; startH: number;
    startBlockX: number; startBlockY: number;
  } | null>(null);

  const handleResizePointerDown = useCallback((e: React.PointerEvent, corner: string) => {
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    captureHistory();
    resizeStartRef.current = {
      corner,
      startX: e.clientX,
      startY: e.clientY,
      startW: block.width,
      startH: block.height,
      startBlockX: block.x,
      startBlockY: block.y,
    };
  }, [block, captureHistory]);

  const handleResizePointerMove = useCallback((e: React.PointerEvent) => {
    if (!resizeStartRef.current || !pageRef.current) return;
    const { corner, startX, startY, startW, startH, startBlockX, startBlockY } = resizeStartRef.current;
    const pageRect = pageRef.current.getBoundingClientRect();
    const dx = (e.clientX - startX) / pageRect.width * 100;
    const dy = (e.clientY - startY) / pageRect.height * 100;

    let newW = startW;
    let newH = startH;
    let newX = startBlockX;
    let newY = startBlockY;

    const isCorner = corner.length === 2;
    const ratio = block.naturalAspectRatio;

    if (corner.includes('e')) newW = Math.max(5, startW + dx);
    if (corner.includes('s')) newH = Math.max(5, startH + dy);
    if (corner.includes('w')) { newW = Math.max(5, startW - dx); newX = startBlockX + dx; }
    if (corner.includes('n')) { newH = Math.max(5, startH - dy); newY = startBlockY + dy; }

    // Lock aspect ratio for corner drags when a natural ratio is known.
    // naturalAspectRatio is a *pixel* ratio, but width%/height% are relative to
    // different page dimensions — convert it to percentage space via pageAR,
    // matching h% = w% / (ratio * pageAR) used on drop.
    if (isCorner && ratio) {
      const pctRatio = ratio * pageAR;
      // Use whichever dimension changed more as the driver
      const wDelta = Math.abs(newW - startW);
      const hDelta = Math.abs(newH - startH);
      if (wDelta >= hDelta) {
        newH = newW / pctRatio;
        if (corner.includes('n')) newY = startBlockY + (startH - newH);
      } else {
        newW = newH * pctRatio;
        if (corner.includes('w')) newX = startBlockX + (startW - newW);
      }
    }

    updateBlockSize(block.instanceId, newW, newH);
    if (corner.includes('w') || corner.includes('n')) {
      updateBlockPosition(block.instanceId, newX, newY, 'resize');
    }
  }, [block, pageRef, pageAR, updateBlockSize, updateBlockPosition]);

  const handleResizePointerUp = useCallback(() => {
    resizeStartRef.current = null;
  }, []);

  const rotation = block.rotation ?? 0;
  const dragTranslate = transform
    ? `translate(${transform.x / zoom}px, ${transform.y / zoom}px)`
    : '';
  const dragTransform = [dragTranslate, rotation ? `rotate(${rotation}deg)` : '']
    .filter(Boolean).join(' ') || undefined;

  function renderContent() {
    switch (block.type) {
      case 'image':
        return <ImageBlock block={block} onNaturalSize={handleNaturalSize} />;
      case 'text':
        return <TextBlock block={block} />;
      case 'link':
        return <LinkBlock block={block} />;
      case 'media':
      case 'attachment':
        return <EmbedBlock block={block} />;
      default:
        return null;
    }
  }

  return (
    <div
      ref={(el) => { setNodeRef(el); (blockRef as React.MutableRefObject<HTMLDivElement | null>).current = el; }}
      {...listeners}
      {...attributes}
      style={{
        position: 'absolute',
        left: `${block.x}%`,
        top: `${block.y}%`,
        width: `${block.width}%`,
        height: `${block.height}%`,
        zIndex: isDragging ? 9999 : block.zIndex,
        transform: dragTransform,
        transformOrigin: 'center center',
        opacity: block.opacity ?? 1,
        outline: isSelected ? '2px solid #3b82f6' : isDragging ? '2px dashed #94a3b8' : undefined,
        outlineOffset: '1px',
        cursor: isDragging ? 'grabbing' : 'grab',
      }}
      onClick={(e) => { e.stopPropagation(); selectBlock(block.instanceId); }}
    >
      {/* Inner wrapper clips content and applies crop shape */}
      <div style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        borderRadius: block.cropShape === 'circle'
          ? '50%'
          : block.borderRadius
          ? `${block.borderRadius}%`
          : undefined,
      }}>
        {renderContent()}
      </div>

      {isSelected && !isDragging && (
        <>
          {/* Delete button */}
          <button
            className="absolute -top-6 right-0 bg-red-500 text-white text-xs rounded px-1.5 py-0.5 z-50 pointer-events-auto"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); removeBlock(block.instanceId); }}
          >
            ✕
          </button>

          {/* Rotation handle — circle above top-center */}
          <div
            style={{
              position: 'absolute',
              top: -28,
              left: 'calc(50% - 7px)',
              width: 14,
              height: 14,
              borderRadius: '50%',
              background: 'white',
              border: '2px solid #3b82f6',
              zIndex: 50,
              cursor: 'grab',
              pointerEvents: 'auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title={`${Math.round(rotation)}°`}
            onPointerDown={handleRotatePointerDown}
            onPointerMove={handleRotatePointerMove}
            onPointerUp={handleRotatePointerUp}
          />
          {/* Degree readout */}
          {rotation !== 0 && (
            <div
              style={{
                position: 'absolute',
                top: -24,
                left: 'calc(50% + 12px)',
                fontSize: 10,
                color: '#3b82f6',
                background: 'white',
                padding: '0 3px',
                borderRadius: 3,
                zIndex: 50,
                pointerEvents: 'none',
                whiteSpace: 'nowrap',
              }}
            >
              {Math.round(rotation)}°
            </div>
          )}

          {(['se', 'sw', 'ne', 'nw', 'n', 's', 'e', 'w'] as const).map((corner) => (
            <div
              key={corner}
              style={{
                position: 'absolute',
                width: 10,
                height: 10,
                background: 'white',
                border: '2px solid #3b82f6',
                borderRadius: 2,
                zIndex: 50,
                cursor: `${corner}-resize`,
                pointerEvents: 'auto',
                ...cornerStyle(corner),
              }}
              onPointerDown={(e) => handleResizePointerDown(e, corner)}
              onPointerMove={handleResizePointerMove}
              onPointerUp={handleResizePointerUp}
            />
          ))}
        </>
      )}
    </div>
  );
}

function cornerStyle(corner: string): React.CSSProperties {
  const half = -5;
  const mid = 'calc(50% - 5px)';
  const map: Record<string, React.CSSProperties> = {
    nw: { top: half, left: half },
    n:  { top: half, left: mid },
    ne: { top: half, right: half },
    e:  { top: mid, right: half },
    se: { bottom: half, right: half },
    s:  { bottom: half, left: mid },
    sw: { bottom: half, left: half },
    w:  { top: mid, left: half },
  };
  return map[corner] ?? {};
}
