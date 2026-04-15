import type { ZineBlock } from '../../types/zine';

export default function TextBlock({ block }: { block: ZineBlock }) {
  const style: React.CSSProperties = {
    fontSize: block.fontSize ?? 13,
    fontFamily: block.fontFamily ?? 'inherit',
    color: block.color ?? '#1c1917',
    backgroundColor: block.backgroundColor ?? 'transparent',
  };

  return (
    <div
      className="w-full h-full overflow-hidden p-2 text-stone-800 leading-snug"
      style={style}
    >
      {block.contentHtml ? (
        <div
          className="prose prose-sm max-w-none"
          dangerouslySetInnerHTML={{ __html: block.contentHtml }}
        />
      ) : (
        <span className="whitespace-pre-wrap">{block.content ?? block.title ?? 'Text block'}</span>
      )}
    </div>
  );
}
