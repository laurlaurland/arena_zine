import type { ZineBlock } from '../../types/zine';

export default function LinkBlock({ block }: { block: ZineBlock }) {
  return (
    <div className="w-full h-full overflow-hidden flex flex-col bg-stone-50 border border-stone-200">
      {block.imageUrl && (
        <img
          src={block.imageUrl}
          alt=""
          className="w-full flex-1 object-cover min-h-0"
          draggable={false}
          referrerPolicy="no-referrer"
        />
      )}
      <div className="p-2 shrink-0">
        {block.linkTitle && (
          <p className="text-xs font-medium text-stone-800 leading-tight line-clamp-2">
            {block.linkTitle}
          </p>
        )}
        {block.linkUrl && (
          <p className="text-xs text-stone-400 truncate mt-0.5">{block.linkUrl}</p>
        )}
      </div>
    </div>
  );
}
