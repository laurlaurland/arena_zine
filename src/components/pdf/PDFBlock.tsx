import { View, Text, Image } from '@react-pdf/renderer';
import type { ZineBlock } from '../../types/zine';
import type { PageSize } from '../../types/zine';

interface Props {
  block: ZineBlock;
  pageSize: PageSize;
}

export default function PDFBlock({ block, pageSize }: Props) {
  const left = (block.x / 100) * pageSize.widthPt;
  const top = (block.y / 100) * pageSize.heightPt;
  const width = (block.width / 100) * pageSize.widthPt;
  const height = (block.height / 100) * pageSize.heightPt;

  const containerStyle = {
    position: 'absolute' as const,
    left,
    top,
    width,
    height,
    overflow: 'hidden' as const,
    opacity: block.opacity ?? 1,
    backgroundColor: block.backgroundColor ?? 'transparent',
  };

  if (block.type === 'image' && (block.imageUrlLarge || block.imageUrl)) {
    return (
      <View style={containerStyle}>
        <Image
          src={block.imageUrlLarge ?? block.imageUrl!}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </View>
    );
  }

  if (block.type === 'text') {
    return (
      <View style={containerStyle}>
        <Text
          style={{
            fontSize: block.fontSize ?? 10,
            fontFamily: undefined,
            color: block.color ?? '#000000',
            padding: 4,
          }}
        >
          {block.content ?? block.title ?? ''}
        </Text>
      </View>
    );
  }

  if (block.type === 'link') {
    return (
      <View style={{ ...containerStyle, border: '1pt solid #e7e5e4' }}>
        {(block.imageUrlLarge || block.imageUrl) && (
          <Image
            src={block.imageUrlLarge ?? block.imageUrl!}
            style={{ width: '100%', height: '70%', objectFit: 'cover' }}
          />
        )}
        <Text style={{ fontSize: 8, padding: 4, color: '#1c1917' }}>
          {block.linkTitle ?? block.linkUrl ?? ''}
        </Text>
      </View>
    );
  }

  if ((block.type === 'media' || block.type === 'attachment') && (block.imageUrlLarge || block.imageUrl)) {
    return (
      <View style={containerStyle}>
        <Image
          src={block.imageUrlLarge ?? block.imageUrl!}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </View>
    );
  }

  // Fallback: title text
  return (
    <View style={{ ...containerStyle, backgroundColor: '#f5f5f4', border: '1pt solid #e7e5e4' }}>
      <Text style={{ fontSize: 8, padding: 4, color: '#78716c' }}>
        {block.title ?? block.type}
      </Text>
    </View>
  );
}
