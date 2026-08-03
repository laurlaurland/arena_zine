import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ZineDocument, ZinePage, ZineBlock, PageSizeKey } from '../types/zine';
import type { ArenaBlock } from '../api/arena';
import { pickImageUrl } from '../api/arena';
import { generateId, clamp, now } from '../lib/utils';
import { PAGE_SIZES } from '../lib/pageSizes';

interface ZineStore {
  document: ZineDocument;
  history: ZineDocument[];    // undo stack (not persisted)
  selectedInstanceId: string | null;
  zoom: number;
  viewMode: 'single' | 'spread';   // canvas layout (not persisted)

  // Document
  setDocumentTitle: (title: string) => void;
  setPageSize: (size: PageSizeKey) => void;

  // Pages
  addPage: () => void;
  removePage: (pageId: string) => void;
  reorderPages: (fromIndex: number, toIndex: number) => void;

  // Blocks
  addBlock: (pageId: string, arenaBlock: ArenaBlock, x: number, y: number) => void;
  removeBlock: (instanceId: string) => void;
  updateBlockPosition: (instanceId: string, x: number, y: number) => void;
  updateBlockSize: (instanceId: string, width: number, height: number) => void;
  updateBlockStyle: (instanceId: string, style: Partial<Pick<ZineBlock, 'fontSize' | 'fontFamily' | 'backgroundColor' | 'color' | 'opacity' | 'borderRadius' | 'cropShape' | 'imageOffsetX' | 'imageOffsetY' | 'riso'>>) => void;

  // Z-order
  bringToFront: (instanceId: string) => void;
  sendToBack: (instanceId: string) => void;
  bringForward: (instanceId: string) => void;
  sendBackward: (instanceId: string) => void;

  // Aspect ratio (set after image loads naturally)
  updateAspectRatio: (instanceId: string, ratio: number) => void;

  // Rotation
  updateBlockRotation: (instanceId: string, degrees: number) => void;

  // History
  captureHistory: () => void;
  undo: () => void;

  // Selection
  selectBlock: (instanceId: string | null) => void;

  // Zoom
  setZoom: (zoom: number) => void;
  setViewMode: (mode: 'single' | 'spread') => void;
}

function arenaBlockToZineBlock(arenaBlock: ArenaBlock, x: number, y: number, pageAR = 1): ZineBlock {
  const base = {
    instanceId: generateId(),
    arenaBlockId: arenaBlock.id,
    x: clamp(x, 0, 90),
    y: clamp(y, 0, 90),
    width: 40,
    height: 30,
    zIndex: 1,
    title: arenaBlock.title ?? undefined,
  };


  // Normalise to lowercase — the v3 API may return 'image' or 'Image'
  const t = (arenaBlock.type ?? '').toLowerCase();

  if (t === 'image') {
    const ratio = arenaBlock.image?.aspect_ratio
      ?? (arenaBlock.image?.width && arenaBlock.image?.height
        ? arenaBlock.image.width / arenaBlock.image.height
        : undefined);
    const w = 40;
    // height% must account for page AR so the block has correct pixel proportions:
    // w_px / h_px = ratio  =>  h% = w% / (ratio * pageAR)
    const h = ratio ? clamp(w / (ratio * pageAR), 5, 100) : 30;
    return {
      ...base,
      type: 'image',
      width: w,
      height: h,
      naturalAspectRatio: ratio,
      imageUrl: pickImageUrl(arenaBlock.image, 'medium', 'small'),
      imageUrlLarge: pickImageUrl(arenaBlock.image, 'large', 'medium'),
    };
  }
  if (t === 'text') {
    // v3 returns content as {markdown, html, plain}; v2 returns a plain string
    const rawContent = arenaBlock.content;
    const isV3Content = rawContent !== null && typeof rawContent === 'object';
    return {
      ...base,
      type: 'text',
      content: isV3Content ? (rawContent.plain ?? rawContent.markdown ?? undefined) : (rawContent ?? undefined),
      contentHtml: isV3Content ? (rawContent.html ?? undefined) : (arenaBlock.content_html ?? undefined),
      width: 45,
      height: 35,
    };
  }
  if (t === 'link') {
    return {
      ...base,
      type: 'link',
      linkUrl: arenaBlock.source?.url,
      linkTitle: arenaBlock.source?.title ?? arenaBlock.title ?? arenaBlock.source?.url,
      imageUrl: pickImageUrl(arenaBlock.image, 'medium', 'small'),
      imageUrlLarge: pickImageUrl(arenaBlock.image, 'large', 'medium'),
    };
  }
  if (t === 'media') {
    return {
      ...base,
      type: 'media',
      embedHtml: arenaBlock.embed?.html ?? undefined,
      imageUrl: arenaBlock.embed?.thumbnail_url ?? undefined,
    };
  }
  if (t === 'attachment') {
    return {
      ...base,
      type: 'attachment',
      attachmentUrl: arenaBlock.attachment?.url,
      attachmentName: arenaBlock.attachment?.file_name,
      imageUrl: pickImageUrl(arenaBlock.image, 'medium', 'small'),
      imageUrlLarge: pickImageUrl(arenaBlock.image, 'large', 'medium'),
    };
  }

  // Unknown type — still try to extract any image URL present
  return {
    ...base,
    type: 'image',
    imageUrl: pickImageUrl(arenaBlock.image, 'medium', 'small'),
    imageUrlLarge: pickImageUrl(arenaBlock.image, 'large', 'medium'),
  };
}

function makeInitialDocument(): ZineDocument {
  return {
    id: generateId(),
    title: 'My Zine',
    pageSize: 'A5',
    pages: [{ id: generateId(), order: 0, blocks: [] }],
    createdAt: now(),
    updatedAt: now(),
  };
}

function touchDoc(doc: ZineDocument): ZineDocument {
  return { ...doc, updatedAt: now() };
}

export const useZineStore = create<ZineStore>()(
  persist(
    (set) => ({
      document: makeInitialDocument(),
      history: [],
      selectedInstanceId: null,
      zoom: 0.8,
      viewMode: 'single',

      // ── History helpers ────────────────────────────────────────────────────
      captureHistory: () =>
        set((s) => ({ history: [...s.history.slice(-9), s.document] })),

      undo: () =>
        set((s) => {
          if (s.history.length === 0) return s;
          const prev = s.history[s.history.length - 1];
          return { document: prev, history: s.history.slice(0, -1) };
        }),

      // ── Inline helper used by every one-shot mutation ──────────────────────
      setDocumentTitle: (title) =>
        set((s) => ({
          history: [...s.history.slice(-9), s.document],
          document: touchDoc({ ...s.document, title }),
        })),

      setPageSize: (pageSize) =>
        set((s) => ({
          history: [...s.history.slice(-9), s.document],
          document: touchDoc({ ...s.document, pageSize }),
        })),

      addPage: () =>
        set((s) => {
          const newPage: ZinePage = { id: generateId(), order: s.document.pages.length, blocks: [] };
          return {
            history: [...s.history.slice(-9), s.document],
            document: touchDoc({ ...s.document, pages: [...s.document.pages, newPage] }),
          };
        }),

      removePage: (pageId) =>
        set((s) => {
          if (s.document.pages.length <= 1) return s;
          const pages = s.document.pages
            .filter((p) => p.id !== pageId)
            .map((p, i) => ({ ...p, order: i }));
          return {
            history: [...s.history.slice(-9), s.document],
            document: touchDoc({ ...s.document, pages }),
          };
        }),

      reorderPages: (fromIndex, toIndex) =>
        set((s) => {
          const pages = [...s.document.pages];
          const [moved] = pages.splice(fromIndex, 1);
          pages.splice(toIndex, 0, moved);
          return {
            history: [...s.history.slice(-9), s.document],
            document: touchDoc({ ...s.document, pages: pages.map((p, i) => ({ ...p, order: i })) }),
          };
        }),

      addBlock: (pageId, arenaBlock, x, y) =>
        set((s) => {
          const pageSize = PAGE_SIZES[s.document.pageSize];
          const pageAR = pageSize.heightMm / pageSize.widthMm;
          const block = arenaBlockToZineBlock(arenaBlock, x, y, pageAR);
          const page = s.document.pages.find((p) => p.id === pageId);
          if (!page) return s;
          const maxZ = page.blocks.reduce((max, b) => Math.max(max, b.zIndex), 0);
          block.zIndex = maxZ + 1;
          const pages = s.document.pages.map((p) =>
            p.id === pageId ? { ...p, blocks: [...p.blocks, block] } : p
          );
          return {
            history: [...s.history.slice(-9), s.document],
            document: touchDoc({ ...s.document, pages }),
            selectedInstanceId: block.instanceId,
          };
        }),

      removeBlock: (instanceId) =>
        set((s) => {
          const pages = s.document.pages.map((p) => ({
            ...p,
            blocks: p.blocks.filter((b) => b.instanceId !== instanceId),
          }));
          return {
            history: [...s.history.slice(-9), s.document],
            document: touchDoc({ ...s.document, pages }),
            selectedInstanceId: null,
          };
        }),

      // Drag end — one call per gesture, save history
      updateBlockPosition: (instanceId, x, y) =>
        set((s) => {
          const pages = s.document.pages.map((p) => ({
            ...p,
            blocks: p.blocks.map((b) =>
              b.instanceId === instanceId
                ? { ...b, x: clamp(x, 0, 100 - b.width), y: clamp(y, 0, 100 - b.height) }
                : b
            ),
          }));
          return {
            history: [...s.history.slice(-9), s.document],
            document: { ...s.document, pages },
          };
        }),

      // Called on every pointermove during resize — history captured on pointerdown via captureHistory()
      updateBlockSize: (instanceId, width, height) =>
        set((s) => {
          const pages = s.document.pages.map((p) => ({
            ...p,
            blocks: p.blocks.map((b) =>
              b.instanceId === instanceId
                ? { ...b, width: clamp(width, 5, 100), height: clamp(height, 5, 100) }
                : b
            ),
          }));
          return { document: touchDoc({ ...s.document, pages }) };
        }),

      // Called on every pointermove during rotate / slider drag — history captured on pointerdown
      updateBlockStyle: (instanceId, style) =>
        set((s) => {
          const pages = s.document.pages.map((p) => ({
            ...p,
            blocks: p.blocks.map((b) =>
              b.instanceId === instanceId ? { ...b, ...style } : b
            ),
          }));
          return { document: touchDoc({ ...s.document, pages }) };
        }),

      updateAspectRatio: (instanceId, ratio) =>
        set((s) => {
          const pageSize = PAGE_SIZES[s.document.pageSize];
          const pageAR = pageSize.heightMm / pageSize.widthMm;
          const pages = s.document.pages.map((p) => ({
            ...p,
            blocks: p.blocks.map((b) => {
              if (b.instanceId !== instanceId || b.naturalAspectRatio) return b;
              const newHeight = clamp(b.width / (ratio * pageAR), 5, 100);
              return { ...b, naturalAspectRatio: ratio, height: newHeight };
            }),
          }));
          return { document: { ...s.document, pages } };
        }),

      bringToFront: (instanceId) =>
        set((s) => {
          const pages = s.document.pages.map((p) => {
            const maxZ = p.blocks.reduce((m, b) => Math.max(m, b.zIndex), 0);
            return { ...p, blocks: p.blocks.map((b) => b.instanceId === instanceId ? { ...b, zIndex: maxZ + 1 } : b) };
          });
          return { history: [...s.history.slice(-9), s.document], document: touchDoc({ ...s.document, pages }) };
        }),

      sendToBack: (instanceId) =>
        set((s) => {
          const pages = s.document.pages.map((p) => {
            const minZ = p.blocks.reduce((m, b) => Math.min(m, b.zIndex), Infinity);
            return { ...p, blocks: p.blocks.map((b) => b.instanceId === instanceId ? { ...b, zIndex: minZ - 1 } : b) };
          });
          return { history: [...s.history.slice(-9), s.document], document: touchDoc({ ...s.document, pages }) };
        }),

      bringForward: (instanceId) =>
        set((s) => {
          const pages = s.document.pages.map((p) => {
            const sorted = [...p.blocks].sort((a, b) => a.zIndex - b.zIndex);
            const idx = sorted.findIndex((b) => b.instanceId === instanceId);
            if (idx < sorted.length - 1) {
              const above = sorted[idx + 1];
              const curr = sorted[idx];
              const newZ = above.zIndex;
              const aboveZ = curr.zIndex;
              return { ...p, blocks: p.blocks.map((b) => {
                if (b.instanceId === instanceId) return { ...b, zIndex: newZ };
                if (b.instanceId === above.instanceId) return { ...b, zIndex: aboveZ };
                return b;
              })};
            }
            return p;
          });
          return { history: [...s.history.slice(-9), s.document], document: touchDoc({ ...s.document, pages }) };
        }),

      sendBackward: (instanceId) =>
        set((s) => {
          const pages = s.document.pages.map((p) => {
            const sorted = [...p.blocks].sort((a, b) => a.zIndex - b.zIndex);
            const idx = sorted.findIndex((b) => b.instanceId === instanceId);
            if (idx > 0) {
              const below = sorted[idx - 1];
              const curr = sorted[idx];
              const newZ = below.zIndex;
              const belowZ = curr.zIndex;
              return { ...p, blocks: p.blocks.map((b) => {
                if (b.instanceId === instanceId) return { ...b, zIndex: newZ };
                if (b.instanceId === below.instanceId) return { ...b, zIndex: belowZ };
                return b;
              })};
            }
            return p;
          });
          return { history: [...s.history.slice(-9), s.document], document: touchDoc({ ...s.document, pages }) };
        }),

      // Called on every pointermove during rotate — history captured on pointerdown
      updateBlockRotation: (instanceId, degrees) =>
        set((s) => {
          const pages = s.document.pages.map((p) => ({
            ...p,
            blocks: p.blocks.map((b) =>
              b.instanceId === instanceId ? { ...b, rotation: degrees } : b
            ),
          }));
          return { document: touchDoc({ ...s.document, pages }) };
        }),

      selectBlock: (instanceId) => set({ selectedInstanceId: instanceId }),

      setZoom: (zoom) => set({ zoom: clamp(zoom, 0.25, 2) }),

      setViewMode: (mode) => set({ viewMode: mode }),
    }),
    {
      name: 'arena-zine-document',
      partialize: (s) => ({ document: s.document }),
    }
  )
);
