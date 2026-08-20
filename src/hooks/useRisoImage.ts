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
  const fallbackUrl = block.imageUrlLarge;
  const ink = block.riso?.ink;
  const intensity = block.riso?.intensity;
  const enabled = block.riso !== undefined && url !== undefined;
  const key = `${url}|${ink}|${intensity}`;

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const t = setTimeout(() => {
      const params = { ink: ink!, intensity: intensity!, mode: 'ink' as const };
      processRisoImage(url!, params)
        .then((dataUrl) => {
          if (!cancelled) setResult({ key, dataUrl });
        })
        .catch((e) => {
          console.warn(e);
          // The display-size image can 404/CORS-fail independently of the
          // large one that PDF export uses — retry with it so the canvas
          // preview doesn't silently diverge from what gets exported.
          if (!fallbackUrl || fallbackUrl === url) return;
          processRisoImage(fallbackUrl, params)
            .then((dataUrl) => {
              if (!cancelled) setResult({ key, dataUrl });
            })
            .catch((e2) => console.warn(e2));
        });
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [enabled, key, url, fallbackUrl, ink, intensity]);

  return enabled && result?.key === key ? result.dataUrl : undefined;
}
