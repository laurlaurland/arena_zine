import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ZineDocument, ZinePage, ZineBlock, PageSizeKey } from '../types/zine';
import type { ArenaBlock } from '../api/arena';
import { pickImageUrl } from '../api/arena';
import { generateId, clamp, now } from '../lib/utils';
import { PAGE_SIZES } from '../lib/pageSizes';
import { resolveSpanDrop, toXLeft, STRADDLE_MIN } from '../lib/spanGeometry';
import { reorderWithUnits, applyParity } from '../lib/pageUnits';

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
  fillSpread: (instanceId: string) => void;
  unlinkSpan: (instanceId: string) => void;

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

function makeAutoPad(): ZinePage {
  return { id: generateId(), order: 0, blocks: [], autoPad: true };
}

interface Located {
  block: ZineBlock;
  pageIndex: number;
}

function locate(pages: ZinePage[], instanceId: string): Located | null {
  for (let i = 0; i < pages.length; i++) {
    const block = pages[i].blocks.find((b) => b.instanceId === instanceId);
    if (block) return { block, pageIndex: i };
  }
  return null;
}

/** The other half of a span, if this block has one. */
function findPartner(pages: ZinePage[], block: ZineBlock): ZineBlock | null {
  if (!block.spanId) return null;
  for (const page of pages) {
    const found = page.blocks.find(
      (b) => b.spanId === block.spanId && b.instanceId !== block.instanceId
    );
    if (found) return found;
  }
  return null;
}

/** Apply the same patch to a block and, when it is spanned, to its partner. */
function patchPair(
  pages: ZinePage[],
  instanceId: string,
  patch: Partial<ZineBlock>
): ZinePage[] {
  const located = locate(pages, instanceId);
  if (!located) return pages;
  const partner = findPartner(pages, located.block);
  const ids = new Set([instanceId, ...(partner ? [partner.instanceId] : [])]);
  return pages.map((p) => ({
    ...p,
    blocks: p.blocks.map((b) => (ids.has(b.instanceId) ? { ...b, ...patch } : b)),
  }));
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

          // The page being deleted may hold half of a span. Leaving the other
          // half with a spanId whose partner no longer exists is the orphan
          // state paired deletion exists to prevent — but destroying content on
          // a page the user did not delete would be worse, so the survivor is
          // unlinked into an ordinary block rather than removed.
          const orphanedSpanIds = new Set(
            (s.document.pages.find((p) => p.id === pageId)?.blocks ?? [])
              .map((b) => b.spanId)
              .filter((id): id is string => !!id)
          );

          const kept = s.document.pages
            .filter((p) => p.id !== pageId)
            .map((p) =>
              orphanedSpanIds.size === 0
                ? p
                : {
                    ...p,
                    blocks: p.blocks.map((b) =>
                      b.spanId && orphanedSpanIds.has(b.spanId)
                        ? { ...b, spanId: undefined, spanSide: undefined }
                        : b
                    ),
                  }
            );

          const pages = applyParity(kept, makeAutoPad);
          return {
            history: [...s.history.slice(-9), s.document],
            document: touchDoc({ ...s.document, pages }),
          };
        }),

      reorderPages: (fromIndex, toIndex) =>
        set((s) => {
          const moved = reorderWithUnits(s.document.pages, fromIndex, toIndex);
          if (moved === s.document.pages) return s;
          return {
            history: [...s.history.slice(-9), s.document],
            document: touchDoc({ ...s.document, pages: applyParity(moved, makeAutoPad) }),
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
          const located = locate(s.document.pages, instanceId);
          // A span is one image; deleting half of it would strand an orphan.
          const partner = located ? findPartner(s.document.pages, located.block) : null;
          const doomed = new Set([instanceId, ...(partner ? [partner.instanceId] : [])]);
          const pages = s.document.pages.map((p) => ({
            ...p,
            blocks: p.blocks.filter((b) => !doomed.has(b.instanceId)),
          }));
          return {
            history: [...s.history.slice(-9), s.document],
            document: touchDoc({ ...s.document, pages }),
            selectedInstanceId: null,
          };
        }),

      // Drag end — one call per gesture, save history. This is the only place
      // a span is created or dissolved, so one gesture is always one undo.
      updateBlockPosition: (instanceId, x, y) =>
        set((s) => {
          const located = locate(s.document.pages, instanceId);
          if (!located) return s;
          const { block, pageIndex } = located;

          const decision = resolveSpanDrop({
            pageIndex,
            pageCount: s.document.pages.length,
            x,
            width: block.width,
            isImage: block.type === 'image',
            side: block.spanSide,
            viewMode: s.viewMode,
          });

          const clampedY = clamp(y, 0, 100 - block.height);
          let pages = s.document.pages;
          // Selection is set only by clicking a block, and dnd-kit's 8px
          // activation constraint swallows the click once a drag starts — so
          // the selected block and the dragged block can be different halves.
          let nextSelectedId = s.selectedInstanceId;

          if (decision.action === 'create') {
            const spanId = generateId();
            const rightIndex = decision.leftIndex + 1;
            // The dragged block keeps its instanceId and becomes whichever half
            // sits on the page it is already on; the other half is the clone.
            const draggedIsLeft = pageIndex === decision.leftIndex;
            const cloneId = generateId();
            const common = { ...block, y: clampedY, spanId };

            const leftHalf: ZineBlock = {
              ...common,
              instanceId: draggedIsLeft ? block.instanceId : cloneId,
              x: decision.xLeft,
              spanSide: 'left',
            };
            const rightHalf: ZineBlock = {
              ...common,
              instanceId: draggedIsLeft ? cloneId : block.instanceId,
              x: decision.xLeft - 100,
              spanSide: 'right',
            };

            pages = s.document.pages.map((p, i) => {
              if (i === decision.leftIndex) {
                return draggedIsLeft
                  ? { ...p, blocks: p.blocks.map((b) => (b.instanceId === instanceId ? leftHalf : b)) }
                  : { ...p, blocks: [...p.blocks, leftHalf] };
              }
              if (i === rightIndex) {
                return draggedIsLeft
                  ? { ...p, blocks: [...p.blocks, rightHalf] }
                  : { ...p, blocks: p.blocks.map((b) => (b.instanceId === instanceId ? rightHalf : b)) };
              }
              return p;
            });
          } else if (decision.action === 'move') {
            pages = patchPair(s.document.pages, instanceId, { y: clampedY });
            pages = pages.map((p) => ({
              ...p,
              blocks: p.blocks.map((b) =>
                b.spanId && b.spanId === block.spanId
                  ? { ...b, x: b.spanSide === 'left' ? decision.xLeft : decision.xLeft - 100 }
                  : b
              ),
            }));
          } else if (decision.action === 'dissolve') {
            const partner = findPartner(s.document.pages, block);
            const survivorId =
              block.spanSide === decision.keep ? instanceId : partner?.instanceId;
            const doomedId =
              block.spanSide === decision.keep ? partner?.instanceId : instanceId;
            const height = clamp(block.height * decision.scale, 5, 100);
            // Never leave selection pointing at the half we just removed —
            // whether or not that half is the one being dragged.
            if (s.selectedInstanceId === doomedId) nextSelectedId = survivorId ?? null;
            pages = s.document.pages.map((p) => ({
              ...p,
              blocks: p.blocks
                .filter((b) => b.instanceId !== doomedId)
                .map((b) =>
                  b.instanceId === survivorId
                    ? {
                        ...b,
                        spanId: undefined,
                        spanSide: undefined,
                        width: decision.width,
                        height,
                        x: clamp(decision.x, 0, 100 - decision.width),
                        y: clamp(clampedY, 0, 100 - height),
                      }
                    : b
                ),
            }));
          } else {
            pages = s.document.pages.map((p) => ({
              ...p,
              blocks: p.blocks.map((b) =>
                b.instanceId === instanceId
                  ? { ...b, x: clamp(x, 0, 100 - b.width), y: clampedY }
                  : b
              ),
            }));
          }

          return {
            history: [...s.history.slice(-9), s.document],
            document: { ...s.document, pages },
            selectedInstanceId: nextSelectedId,
          };
        }),

      // Called on every pointermove during resize — history captured on pointerdown via captureHistory()
      updateBlockSize: (instanceId, width, height) =>
        set((s) => {
          const located = locate(s.document.pages, instanceId);
          if (!located) return s;
          const { block } = located;

          if (block.spanSide) {
            // A resize must never break the straddle, so the width floor is
            // whatever still reaches STRADDLE_MIN past the seam.
            const xLeft = toXLeft(block.x, block.spanSide);
            const floor = Math.max(2 * STRADDLE_MIN, 100 + STRADDLE_MIN - xLeft);
            const w = clamp(width, floor, 200);
            const h = clamp(height, 5, 100);
            const pages = patchPair(s.document.pages, instanceId, { width: w, height: h });
            return { document: touchDoc({ ...s.document, pages }) };
          }

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
        set((s) => ({
          document: touchDoc({
            ...s.document,
            pages: patchPair(s.document.pages, instanceId, style),
          }),
        })),

      // Full bleed across both pages. A button because hitting exactly this by
      // dragging is fiddly.
      fillSpread: (instanceId) =>
        set((s) => {
          const located = locate(s.document.pages, instanceId);
          if (!located?.block.spanId) return s;
          const spanId = located.block.spanId;
          const pages = s.document.pages.map((p) => ({
            ...p,
            blocks: p.blocks.map((b) =>
              b.spanId === spanId
                ? { ...b, x: b.spanSide === 'left' ? 0 : -100, y: 0, width: 200, height: 100 }
                : b
            ),
          }));
          return {
            history: [...s.history.slice(-9), s.document],
            document: touchDoc({ ...s.document, pages }),
          };
        }),

      // Break the link so each half can be nudged independently, e.g. to
      // compensate for the few mm a binding eats at the gutter.
      unlinkSpan: (instanceId) =>
        set((s) => {
          const located = locate(s.document.pages, instanceId);
          if (!located?.block.spanId) return s;
          const spanId = located.block.spanId;
          const pages = s.document.pages.map((p) => ({
            ...p,
            blocks: p.blocks.map((b) =>
              b.spanId === spanId ? { ...b, spanId: undefined, spanSide: undefined } : b
            ),
          }));
          return {
            history: [...s.history.slice(-9), s.document],
            document: touchDoc({ ...s.document, pages }),
          };
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
        set((s) => ({
          document: touchDoc({
            ...s.document,
            pages: patchPair(s.document.pages, instanceId, { rotation: degrees }),
          }),
        })),

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
