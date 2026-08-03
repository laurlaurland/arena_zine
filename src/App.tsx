import { useState, useEffect } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { useArenaStore } from './store/useArenaStore';
import { useZineStore } from './store/useZineStore';
import TokenGate from './components/auth/TokenGate';
import Sidebar from './components/sidebar/Sidebar';
import Canvas from './components/canvas/Canvas';
import Toolbar from './components/toolbar/Toolbar';
import BlockInspector from './components/inspector/BlockInspector';
import { pickImageUrl } from './api/arena';
import type { ArenaBlock } from './api/arena';

function DragPreview({ arenaBlock }: { arenaBlock: ArenaBlock }) {
  const thumb = pickImageUrl(arenaBlock.image, 'thumb', 'thumbnail', 'display');
  return (
    <div className="bg-white border border-stone-300 rounded shadow-lg p-2 text-xs text-stone-700 max-w-[120px] opacity-90 pointer-events-none">
      {thumb && <img src={thumb} alt="" className="w-full h-16 object-cover mb-1 rounded" />}
      <span className="truncate block">{arenaBlock.generated_title ?? arenaBlock.type}</span>
    </div>
  );
}

function Editor() {
  const { document: doc, addBlock, updateBlockPosition, reorderPages, selectedInstanceId, removeBlock, selectBlock, undo } = useZineStore();
  const [draggingArenaBlock, setDraggingArenaBlock] = useState<ArenaBlock | null>(null);
  const [draggingPageNumber, setDraggingPageNumber] = useState<number | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  // Keyboard shortcuts
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      const isEditing = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable;

      // Cmd+Z / Ctrl+Z — undo
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        if (!isEditing) { e.preventDefault(); undo(); }
        return;
      }

      // Delete / Backspace — remove selected block
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!isEditing && selectedInstanceId) { e.preventDefault(); removeBlock(selectedInstanceId); }
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedInstanceId, removeBlock, undo]);

  function handleDragStart(event: DragStartEvent) {
    const data = event.active.data.current;
    if (data?.source === 'sidebar') setDraggingArenaBlock(data.arenaBlock);
    if (data?.source === 'page') {
      const i = doc.pages.findIndex((p) => p.id === data.pageId);
      setDraggingPageNumber(i === -1 ? null : i + 1);
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    setDraggingArenaBlock(null);
    setDraggingPageNumber(null);
    const { active, over, delta } = event;
    if (!over) return;

    const activeData = active.data.current;
    const overData = over.data.current;

    // Page reordered by dragging its caption onto another page
    if (activeData?.source === 'page' && overData?.pageId) {
      // Indices come from doc.pages, the array reorderPages splices.
      const from = doc.pages.findIndex((p) => p.id === activeData.pageId);
      const to = doc.pages.findIndex((p) => p.id === overData.pageId);
      if (from !== -1 && to !== -1 && from !== to) reorderPages(from, to);
      return;
    }

    // Sidebar block dropped onto a page
    if (activeData?.source === 'sidebar' && overData?.pageId) {
      const pageEl = document.getElementById(`page-${overData.pageId}`);
      if (!pageEl) return;
      const pageRect = pageEl.getBoundingClientRect();
      const droppedRect = active.rect.current.translated;
      if (!droppedRect) return;
      const dropCenterX = droppedRect.left + droppedRect.width / 2 - pageRect.left;
      const dropCenterY = droppedRect.top + droppedRect.height / 2 - pageRect.top;
      const xPct = (dropCenterX / pageRect.width) * 100 - 20;
      const yPct = (dropCenterY / pageRect.height) * 100 - 15;
      addBlock(overData.pageId, activeData.arenaBlock, xPct, yPct);
      return;
    }

    // Canvas block repositioned
    if (activeData?.source === 'canvas' && activeData?.instanceId) {
      const pageEl = document.getElementById(`page-${activeData.pageId}`);
      if (!pageEl) return;
      const pageRect = pageEl.getBoundingClientRect();
      const dxPct = (delta.x / pageRect.width) * 100;
      const dyPct = (delta.y / pageRect.height) * 100;

      const page = doc.pages.find((p) => p.id === activeData.pageId);
      const block = page?.blocks.find((b) => b.instanceId === activeData.instanceId);
      if (!block) return;
      updateBlockPosition(activeData.instanceId, block.x + dxPct, block.y + dyPct);
    }
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex flex-col h-screen" onClick={() => selectBlock(null)}>
        <Toolbar />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          <Canvas />
          <BlockInspector />
        </div>
      </div>
      <DragOverlay dropAnimation={null}>
        {draggingArenaBlock && <DragPreview arenaBlock={draggingArenaBlock} />}
        {draggingPageNumber !== null && (
          <div className="bg-stone-800 text-white text-xs rounded px-2 py-1 shadow-lg pointer-events-none">
            Page {draggingPageNumber}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

export default function App() {
  const { token } = useArenaStore();
  if (!token) return <TokenGate />;
  return <Editor />;
}
