import { View, Text, Image } from '@react-pdf/renderer';
import type { ReactNode } from 'react';
import type { ZineBlock } from '../../types/zine';
import type { PageSize } from '../../types/zine';
import { hexToGray } from '../../lib/riso';
import { pdfBlockStyles } from '../../lib/pdfBlockStyles';
import type { PDFBlockStyles } from '../../lib/pdfBlockStyles';
import type { Separation } from './ZinePDF';

interface Props {
  block: ZineBlock;
  pageSize: PageSize;
  risoImage?: string;   // pre-processed data URL (riso 'ink'/'coverage', or key-layer grayscale)
  separation?: Separation;
}

/**
 * Two nested Views, never one. `@react-pdf/renderer` runs `clipNode` BEFORE
 * `applyTransformations` (render/lib/index.js:2125), so a single View carrying
 * both `overflow: hidden` and `transform` would clip rotated content with an
 * unrotated rectangle. The outer node rotates; the inner node clips. The
 * canvas splits the same way in `PlacedBlock`.
 */
function Frame({
  outer,
  inner,
  children,
}: {
  outer: PDFBlockStyles['outer'];
  inner: PDFBlockStyles['inner'] & { backgroundColor: string; border?: string };
  children?: ReactNode;
}) {
  return (
    <View style={outer}>
      <View style={inner}>{children}</View>
    </View>
  );
}

export default function PDFBlock({ block, pageSize, risoImage, separation }: Props) {
  // Geometry and opacity come from the pure mapping. Colour is decided here,
  // because it is the only thing that may vary by separation.
  const styles = pdfBlockStyles(block, pageSize);

  const backgroundColor = !separation
    ? (block.backgroundColor ?? 'transparent')
    : separation.kind === 'key' && block.backgroundColor
      ? hexToGray(block.backgroundColor)
      : 'transparent';

  const inner = { ...styles.inner, backgroundColor };
  const imageSrc = risoImage ?? block.imageUrlLarge ?? block.imageUrl;
  const textColor = separation?.kind === 'key' ? '#000000' : (block.color ?? '#000000');

  if (block.type === 'image' && imageSrc) {
    return (
      <Frame outer={styles.outer} inner={inner}>
        <Image src={imageSrc} style={styles.image} />
      </Frame>
    );
  }

  if (block.type === 'text') {
    return (
      <Frame outer={styles.outer} inner={inner}>
        <Text
          style={{
            fontSize: block.fontSize ?? 10,
            fontFamily: undefined,
            color: textColor,
            padding: 4,
            opacity: styles.text.opacity,
          }}
        >
          {block.content ?? block.title ?? ''}
        </Text>
      </Frame>
    );
  }

  if (block.type === 'link') {
    return (
      <Frame outer={styles.outer} inner={{ ...inner, border: '1pt solid #e7e5e4' }}>
        {imageSrc && <Image src={imageSrc} style={{ ...styles.image, height: '70%' }} />}
        <Text style={{ fontSize: 8, padding: 4, color: '#1c1917', opacity: styles.text.opacity }}>
          {block.linkTitle ?? block.linkUrl ?? ''}
        </Text>
      </Frame>
    );
  }

  if ((block.type === 'media' || block.type === 'attachment') && imageSrc) {
    return (
      <Frame outer={styles.outer} inner={inner}>
        <Image src={imageSrc} style={styles.image} />
      </Frame>
    );
  }

  // Fallback: title text
  return (
    <Frame
      outer={styles.outer}
      inner={{ ...inner, backgroundColor: '#f5f5f4', border: '1pt solid #e7e5e4' }}
    >
      <Text style={{ fontSize: 8, padding: 4, color: '#78716c', opacity: styles.text.opacity }}>
        {block.title ?? block.type}
      </Text>
    </Frame>
  );
}
