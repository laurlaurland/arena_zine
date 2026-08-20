import { useEffect } from 'react';
import { useArenaStore } from '../../store/useArenaStore';

export default function ChannelPicker() {
  const {
    channels,
    selectedChannelSlug,
    isLoadingChannels,
    error,
    fetchChannels,
    setSelectedChannel,
  } = useArenaStore();

  useEffect(() => {
    if (channels.length === 0) fetchChannels();
  }, []);

  if (isLoadingChannels) {
    return <div className="px-3 py-2 text-xs text-stone-400">Loading channels…</div>;
  }

  if (error && channels.length === 0) {
    return (
      <div className="px-3 py-2">
        <p className="text-xs text-red-600 mb-1.5 break-words">Couldn’t load channels: {error}</p>
        <button
          onClick={fetchChannels}
          className="text-xs text-stone-600 underline hover:text-stone-900"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="px-3 py-2">
      <label className="block text-xs font-medium text-stone-500 mb-1 uppercase tracking-wide">
        Channel
      </label>
      <select
        value={selectedChannelSlug ?? ''}
        onChange={(e) => e.target.value && setSelectedChannel(e.target.value)}
        className="w-full border border-stone-300 rounded-md px-2 py-1.5 text-sm bg-white outline-none focus:border-stone-500"
      >
        <option value="">Select a channel…</option>
        {channels.map((ch) => (
          <option key={ch.id} value={ch.slug}>
            {ch.title}
          </option>
        ))}
      </select>
    </div>
  );
}
