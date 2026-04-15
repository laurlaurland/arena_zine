import type { ZineBlock } from '../../types/zine';

export default function EmbedBlock({ block }: { block: ZineBlock }) {
  if (block.imageUrl) {
    return (
      <div className="w-full h-full relative overflow-hidden bg-stone-900">
        <img src={block.imageUrl} alt={block.title ?? ''} className="w-full h-full object-cover opacity-80" draggable={false} />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="bg-black/50 text-white text-xs px-2 py-1 rounded">Media</div>
        </div>
      </div>
    );
  }
  return (
    <div className="w-full h-full flex items-center justify-center bg-stone-100 text-stone-500 text-xs">
      {block.title ?? 'Media'}
    </div>
  );
}
