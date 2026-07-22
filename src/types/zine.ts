export type PageSizeKey = 'A4' | 'LETTER' | 'A5' | 'HALF_LETTER';

export interface PageSize {
  key: PageSizeKey;
  label: string;
  widthMm: number;
  heightMm: number;
  widthPt: number;
  heightPt: number;
}

export type ZineBlockType = 'text' | 'image' | 'link' | 'media' | 'attachment';

export interface RisoEffect {
  ink: string;       // name from RISO_COLORS, e.g. "FLUORESCENTPINK"
  intensity: number; // 0–100 halftone threshold: low = airy dots, high = heavy coverage
}

export interface ZineBlock {
  instanceId: string;
  arenaBlockId: number;
  type: ZineBlockType;
  // Content snapshot (so we don't re-fetch)
  title?: string;
  content?: string;
  contentHtml?: string;
  imageUrl?: string;      // display-size for canvas
  imageUrlLarge?: string; // original for PDF
  linkUrl?: string;
  linkTitle?: string;
  embedHtml?: string;
  attachmentUrl?: string;
  attachmentName?: string;
  // Layout: percentage of page dimensions (0–100)
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  // Natural aspect ratio (width/height) — set after image loads
  naturalAspectRatio?: number;
  // Style overrides
  fontSize?: number;
  fontFamily?: string;
  backgroundColor?: string;
  color?: string;
  opacity?: number;
  rotation?: number;       // degrees
  borderRadius?: number;   // 0–50 (maps to border-radius %)
  cropShape?: 'circle';    // clips to circle when set
  imageOffsetX?: number;   // object-position X, 0–100 (default 50)
  imageOffsetY?: number;   // object-position Y, 0–100 (default 50)
  riso?: RisoEffect;       // riso halftone effect (image blocks only)
}

export interface ZinePage {
  id: string;
  order: number;
  blocks: ZineBlock[];
  backgroundColor?: string;
}

export interface ZineDocument {
  id: string;
  title: string;
  pageSize: PageSizeKey;
  pages: ZinePage[];
  createdAt: string;
  updatedAt: string;
}
