import { useEffect, useState } from 'react';
import type { ZineBlock } from '../types/zine';
import { processRisoImage } from '../lib/riso';

// Returns the riso-processed data URL for a block's display image, or
// undefined while processing / when the effect is off / if processing fails
// (callers fall back to the original image). Param changes are debounced so
// slider drags don't process every intermediate value.
export function useRisoImage(block: ZineBlock): string | undefined {
  const [processed, setProcessed] = useState<string | undefined>(undefined);
  const url = block.imageUrl;
  const ink = block.riso?.ink;
  const intensity = block.riso?.intensity;
  const enabled = block.riso !== undefined && url !== undefined;

  useEffect(() => {
    if (!enabled) {
      setProcessed(undefined);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      processRisoImage(url!, { ink: ink!, intensity: intensity!, mode: 'ink' })
        .then((dataUrl) => {
          if (!cancelled) setProcessed(dataUrl);
        })
        .catch((e) => {
          console.warn(e);
          if (!cancelled) setProcessed(undefined);
        });
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [enabled, url, ink, intensity]);

  return enabled ? processed : undefined;
}
