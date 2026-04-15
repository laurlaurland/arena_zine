import { Page, View } from '@react-pdf/renderer';
import type { ZinePage } from '../../types/zine';
import type { PageSize } from '../../types/zine';
import PDFBlock from './PDFBlock';

interface Props {
  page: ZinePage;
  pageSize: PageSize;
}

export default function PDFPage({ page, pageSize }: Props) {
  return (
    <Page
      size={[pageSize.widthPt, pageSize.heightPt]}
      style={{ backgroundColor: page.backgroundColor ?? '#ffffff', position: 'relative' }}
    >
      <View style={{ position: 'relative', width: '100%', height: '100%' }}>
        {page.blocks
          .slice()
          .sort((a, b) => a.zIndex - b.zIndex)
          .map((block) => (
            <PDFBlock key={block.instanceId} block={block} pageSize={pageSize} />
          ))}
      </View>
    </Page>
  );
}
