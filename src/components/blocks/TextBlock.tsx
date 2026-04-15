import type { ZineBlock } from '../../types/zine';

// Stored blocks may have content as a v3 object {markdown,html,plain} — extract a safe string
function resolveContent(raw: unknown): { text: string | undefined; html: string | undefined } {
  if (!raw) return { text: undefined, html: undefined };
  if (typeof raw === 'string') return { text: raw, html: undefined };
  if (typeof raw === 'object') {
    const obj = raw as Record<string, string | undefined>;
    return { text: obj.plain ?? obj.markdown, html: obj.html };
  }
  return { text: undefined, html: undefined };
}

export default function TextBlock({ block }: { block: ZineBlock }) {
  const { text, html } = resolveContent(block.content ?? block.contentHtml);
  const displayHtml = block.contentHtml && typeof block.contentHtml === 'string' ? block.contentHtml : html;
  const displayText = text ?? block.title ?? 'Text block';

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
      {displayHtml ? (
        <div
          className="prose prose-sm max-w-none"
          dangerouslySetInnerHTML={{ __html: displayHtml }}
        />
      ) : (
        <span className="whitespace-pre-wrap">{displayText}</span>
      )}
    </div>
  );
}
