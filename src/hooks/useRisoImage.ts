import { useEffect, useState } from 'react';
import type { ZineBlock } from '../types/zine';
import { processRisoImage } from '../lib/riso';

// Returns the riso-processed data URL for a block's display image, or
// undefined while processing / when the effect is off / if processing fails
// (callers fall back to the original image). Param changes are debounced so
// slider drags don't process every intermediate value; results are matched
// back to the current params by key, so a stale result is never shown.
export function useRisoImage(block: ZineBlock): string | undefined {
  const [result, setResult] = useState<{ key: string; dataUrl: string } | undefined>(undefined);
  const url = block.imageUrl;
  const ink = block.riso?.ink;
  const intensity = block.riso?.intensity;
  const enabled = block.riso !== undefined && url !== undefined;
  const key = `${url}|${ink}|${intensity}`;

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const t = setTimeout(() => {
      processRisoImage(url!, { ink: ink!, intensity: intensity!, mode: 'ink' })
        .then((dataUrl) => {
          if (!cancelled) setResult({ key, dataUrl });
        })
        .catch((e) => {
          console.warn(e);
        });
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [enabled, key, url, ink, intensity]);

  return enabled && result?.key === key ? result.dataUrl : undefined;
}
