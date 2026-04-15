import { useArenaStore } from '../../store/useArenaStore';
import BlockThumbnail from './BlockThumbnail';

export default function BlockList() {
  const { blocks, isLoadingBlocks, selectedChannelSlug } = useArenaStore();

  if (!selectedChannelSlug) {
    return (
      <div className="flex-1 flex items-center justify-center text-stone-400 text-xs p-4 text-center">
        Select a channel above to load its blocks
      </div>
    );
  }

  if (isLoadingBlocks) {
    return (
      <div className="flex-1 flex items-center justify-center text-stone-400 text-xs">
        Loading blocks…
      </div>
    );
  }

  if (blocks.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-stone-400 text-xs p-4 text-center">
        This channel has no blocks yet
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
      <p className="text-xs text-stone-400 mb-2">{blocks.length} blocks — drag onto a page</p>
      {blocks.map((block) => (
        <BlockThumbnail key={block.id} block={block} />
      ))}
    </div>
  );
}
