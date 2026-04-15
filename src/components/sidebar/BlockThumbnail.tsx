import { useDraggable } from '@dnd-kit/core';
import type { ArenaBlock } from '../../api/arena';

interface Props {
  block: ArenaBlock;
}

import { pickImageUrl } from '../../api/arena';

function getThumbSrc(block: ArenaBlock): string | null {
  const fromImage = pickImageUrl(block.image, 'small', 'medium');
  if (fromImage) return fromImage;
  if (block.embed?.thumbnail_url) return block.embed.thumbnail_url;
  return null;
}

function getLabel(block: ArenaBlock): string {
  return block.generated_title ?? block.title ?? block.type;
}

export default function BlockThumbnail({ block }: Props) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `sidebar-${block.id}`,
    data: { source: 'sidebar', arenaBlock: block },
  });

  const thumb = getThumbSrc(block);
  const label = getLabel(block);

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`flex items-center gap-2 p-2 rounded-lg border border-stone-200 bg-white cursor-grab active:cursor-grabbing select-none transition-opacity ${isDragging ? 'opacity-40' : 'hover:border-stone-400'}`}
    >
      <div className="w-10 h-10 shrink-0 rounded overflow-hidden bg-stone-100 flex items-center justify-center">
        {thumb ? (
          <img src={thumb} alt="" className="w-full h-full object-cover" draggable={false} referrerPolicy="no-referrer" />
        ) : (
          <span className="text-xs text-stone-400 uppercase font-mono">{block.type[0]}</span>
        )}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-stone-800 truncate leading-tight">{label}</p>
        <p className="text-xs text-stone-400 capitalize">{block.type.toLowerCase()}</p>
      </div>
    </div>
  );
}
