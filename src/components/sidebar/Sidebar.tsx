import { useArenaStore } from '../../store/useArenaStore';
import ChannelPicker from './ChannelPicker';
import BlockList from './BlockList';

export default function Sidebar() {
  const { clearToken, userSlug } = useArenaStore();

  return (
    <aside className="w-64 shrink-0 flex flex-col bg-stone-50 border-r border-stone-200 h-full">
      <div className="px-3 pt-3 pb-2 border-b border-stone-200">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-stone-700 uppercase tracking-wide">
            Arena Zine
          </span>
          <button
            onClick={clearToken}
            className="text-xs text-stone-400 hover:text-stone-600 transition-colors"
            title="Disconnect"
          >
            {userSlug ?? 'Sign out'}
          </button>
        </div>
      </div>

      <ChannelPicker />
      <BlockList />
    </aside>
  );
}
