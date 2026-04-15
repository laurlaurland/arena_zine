// Direct fetch client for the Are.na v3 API
// https://www.are.na/developers

const BASE = 'https://api.are.na/v3';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ArenaUser {
  id: number;
  slug: string;
  name: string;
  avatar: string | null;
  initials: string;
  type: 'User';
}

export interface ArenaMe extends ArenaUser {
  badge: 'staff' | 'investor' | 'supporter' | 'premium' | null;
  tier: 'guest' | 'free' | 'premium' | 'supporter';
  counts: { channels: number; followers: number; following: number };
}

export interface ArenaImageSize {
  src: string;
  src_2x?: string;
  width?: number;
  height?: number;
}

export interface ArenaImageData {
  // Top-level original src
  src?: string;
  width?: number;
  height?: number;
  aspect_ratio?: number;
  alt_text?: string | null;
  blurhash?: string;
  content_type?: string;
  filename?: string;
  file_size?: number;
  updated_at?: string;
  // Sized variants
  small?: ArenaImageSize;
  medium?: ArenaImageSize;
  large?: ArenaImageSize;
  square?: ArenaImageSize;
}

/** Pick the best image URL from a v3 image object. */
export function pickImageUrl(
  image: ArenaImageData | null | undefined,
  ...preferred: string[]
): string | undefined {
  if (!image) return undefined;
  const order = [...preferred, 'medium', 'small', 'large', 'square'];
  for (const key of order) {
    const val = (image as Record<string, unknown>)[key] as ArenaImageSize | undefined;
    if (val?.src) return val.src;
  }
  // Fall back to top-level original src
  if (image.src) return image.src;
  return undefined;
}

export interface ArenaAttachmentData {
  file_name: string;
  file_size?: number;
  content_type?: string;
  extension?: string;
  url: string;
}

export interface ArenaEmbedData {
  type?: string;
  title?: string | null;
  thumbnail_url?: string | null;
  html?: string | null;
  url?: string | null;
  width?: number;
  height?: number;
}

export interface ArenaSource {
  url: string;
  title?: string;
  provider?: { name: string; url: string } | null;
}

// v3 API may return either casing — keep both in the union
export type ArenaBlockType =
  | 'Image' | 'Text' | 'Link' | 'Media' | 'Attachment'
  | 'image' | 'text' | 'link' | 'media' | 'attachment';

export interface ArenaContentV3 {
  markdown?: string;
  html?: string;
  plain?: string;
}

export interface ArenaBlock {
  id: number;
  type: ArenaBlockType;
  title: string | null;
  generated_title: string;
  content: ArenaContentV3 | string | null;
  content_html: string | null;
  description: string | null;
  state: string;
  created_at: string;
  updated_at: string;
  image: ArenaImageData | null;
  attachment: ArenaAttachmentData | null;
  embed: ArenaEmbedData | null;
  source: ArenaSource | null;
  user: ArenaUser;
}

export interface ArenaChannel {
  id: number;
  type: 'Channel';
  title: string;
  slug: string;
  visibility: 'public' | 'private' | 'closed';
  counts: { blocks: number; channels: number; contents: number };
  created_at: string;
  updated_at: string;
}

interface PaginationMeta {
  current_page: number;
  per_page: number;
  total_pages: number;
  total_count: number;
  has_more_pages: boolean;
}

interface PagedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

// ─── Client ───────────────────────────────────────────────────────────────────

let _token: string | null = null;

export function initClient(token: string): void {
  _token = token;
}

export function clearClient(): void {
  _token = null;
}

function getToken(): string {
  const t = _token ?? localStorage.getItem('arena_token');
  if (!t) throw new Error('No Arena token set');
  return t;
}

async function get<T>(path: string, token?: string): Promise<T> {
  const t = token ?? getToken();
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${t}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Are.na API ${res.status}: ${text}`);
  }
  return res.json();
}

// ─── API calls ────────────────────────────────────────────────────────────────

export async function validateToken(token: string): Promise<ArenaMe> {
  return get<ArenaMe>('/me', token);
}

export async function fetchUserChannels(userSlug: string): Promise<ArenaChannel[]> {
  // /v3/users/{slug}/channels returns all channels including private ones for the authed user
  const allChannels: ArenaChannel[] = [];
  let page = 1;

  while (true) {
    const res = await get<PagedResponse<ArenaChannel>>(
      `/users/${userSlug}/channels?per=100&page=${page}`
    );
    const items = res.data ?? [];
    allChannels.push(...items);
    if (!res.meta?.has_more_pages) break;
    page++;
  }

  return allChannels;
}

export async function fetchChannelBlocks(slug: string): Promise<ArenaBlock[]> {
  const blocks: ArenaBlock[] = [];
  let page = 1;
  const per = 100;

  while (true) {
    const res = await get<PagedResponse<ArenaBlock | ArenaChannel>>(
      `/channels/${slug}/contents?per=${per}&page=${page}`
    );
    const items = res.data ?? [];
    const blockItems = items.filter((item): item is ArenaBlock => item.type !== 'Channel');
    blocks.push(...blockItems);
    if (!res.meta?.has_more_pages) break;
    page++;
  }

  return blocks;
}
