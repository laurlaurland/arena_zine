import type { ZineBlock } from '../../types/zine';
import { useRisoImage } from '../../hooks/useRisoImage';

interface Props {
  block: ZineBlock;
  onNaturalSize?: (width: number, height: number) => void;
}

export default function ImageBlock({ block, onNaturalSize }: Props) {
  const risoUrl = useRisoImage(block);

  if (!block.imageUrl) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#e7e5e4', color: '#a8a29e', fontSize: 12 }}>
        Image
      </div>
    );
  }

  return (
    <img
      src={risoUrl ?? block.imageUrl}
      alt={block.title ?? ''}
      referrerPolicy="no-referrer"
      draggable={false}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        objectPosition: `${block.imageOffsetX ?? 50}% ${block.imageOffsetY ?? 50}%`,
        pointerEvents: 'none',
      }}
      onLoad={(e) => {
        const img = e.currentTarget;
        if (img.naturalWidth && img.naturalHeight) {
          onNaturalSize?.(img.naturalWidth, img.naturalHeight);
        }
      }}
      onError={(e) => {
        const img = e.currentTarget;
        if (!risoUrl && block.imageUrlLarge && img.src !== block.imageUrlLarge) {
          img.src = block.imageUrlLarge;
        }
      }}
    />
  );
}
