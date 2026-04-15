import { create } from 'zustand';
import {
  initClient,
  clearClient,
  fetchUserChannels,
  fetchChannelBlocks,
} from '../api/arena';
import type { ArenaBlock, ArenaChannel } from '../api/arena';

interface ArenaStore {
  token: string | null;
  userSlug: string | null;
  channels: ArenaChannel[];
  selectedChannelSlug: string | null;
  blocks: ArenaBlock[];
  isLoadingChannels: boolean;
  isLoadingBlocks: boolean;
  error: string | null;

  setToken: (token: string, userSlug: string) => void;
  clearToken: () => void;
  setSelectedChannel: (slug: string) => void;
  fetchChannels: () => Promise<void>;
  fetchBlocks: (slug: string) => Promise<void>;
  clearError: () => void;
}

const storedToken = localStorage.getItem('arena_token');
const storedSlug = localStorage.getItem('arena_user_slug');

export const useArenaStore = create<ArenaStore>((set, get) => ({
  token: storedToken,
  userSlug: storedSlug,
  channels: [],
  selectedChannelSlug: null,
  blocks: [],
  isLoadingChannels: false,
  isLoadingBlocks: false,
  error: null,

  setToken: (token, userSlug) => {
    localStorage.setItem('arena_token', token);
    localStorage.setItem('arena_user_slug', userSlug);
    initClient(token);
    set({ token, userSlug, error: null });
  },

  clearToken: () => {
    localStorage.removeItem('arena_token');
    localStorage.removeItem('arena_user_slug');
    clearClient();
    set({ token: null, userSlug: null, channels: [], blocks: [], selectedChannelSlug: null });
  },

  setSelectedChannel: (slug) => {
    set({ selectedChannelSlug: slug, blocks: [] });
    get().fetchBlocks(slug);
  },

  fetchChannels: async () => {
    const { userSlug } = get();
    if (!userSlug) return;
    set({ isLoadingChannels: true, error: null });
    try {
      const channels = await fetchUserChannels(userSlug);
      set({ channels, isLoadingChannels: false });
    } catch (e) {
      set({ isLoadingChannels: false, error: (e as Error).message });
    }
  },

  fetchBlocks: async (slug) => {
    set({ isLoadingBlocks: true, error: null });
    try {
      const blocks = await fetchChannelBlocks(slug);
      set({ blocks, isLoadingBlocks: false });
    } catch (e) {
      set({ isLoadingBlocks: false, error: (e as Error).message });
    }
  },

  clearError: () => set({ error: null }),
}));

// Auto-init client if token exists in storage
if (storedToken) {
  initClient(storedToken);
}
