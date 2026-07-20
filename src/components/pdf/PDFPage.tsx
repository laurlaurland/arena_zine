import { Page, View } from '@react-pdf/renderer';
import type { ZineBlock, ZinePage } from '../../types/zine';
import type { PageSize } from '../../types/zine';
import { hexToGray } from '../../lib/riso';
import type { Separation } from './ZinePDF';
import PDFBlock from './PDFBlock';

interface Props {
  page: ZinePage;
  pageSize: PageSize;
  risoImages?: Record<string, string>;
  separation?: Separation;
}

function isVisible(block: ZineBlock, separation: Separation | undefined, risoImages: Record<string, string>): boolean {
  if (!separation) return true;
  if (separation.kind === 'ink') {
    // only this ink's blocks, and only when coverage processing succeeded
    return block.riso?.ink === separation.ink && risoImages[block.instanceId] !== undefined;
  }
  return !block.riso || (separation.includeInstanceIds?.includes(block.instanceId) ?? false);
}

export default function PDFPage({ page, pageSize, risoImages = {}, separation }: Props) {
  const background = !separation
    ? (page.backgroundColor ?? '#ffffff')
    : separation.kind === 'ink'
      ? '#ffffff'
      : hexToGray(page.backgroundColor ?? '#ffffff');

  return (
    <Page
      size={[pageSize.widthPt, pageSize.heightPt]}
      style={{ backgroundColor: background, position: 'relative' }}
    >
      <View style={{ position: 'relative', width: '100%', height: '100%' }}>
        {page.blocks
          .slice()
          .sort((a, b) => a.zIndex - b.zIndex)
          .filter((block) => isVisible(block, separation, risoImages))
          .map((block) => (
            <PDFBlock
              key={block.instanceId}
              block={block}
              pageSize={pageSize}
              risoImage={risoImages[block.instanceId]}
              separation={separation}
            />
          ))}
      </View>
    </Page>
  );
}
