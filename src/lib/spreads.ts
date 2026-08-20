// Pairing for the facing-pages ("spread") canvas view.

export type Spread<T> = [T | null, T | null];

/**
 * Group ordered pages into reader spreads. The cover stands alone in the
 * right-hand slot, so every later pair falls on the same rows it would in a
 * bound zine:
 *
 *   [cover, 1, 2, 3, 4] -> [[null, cover], [1, 2], [3, 4]]
 *
 * A trailing odd page gets an empty right slot.
 */
export function toSpreads<T>(pages: T[]): Spread<T>[] {
  if (pages.length === 0) return [];

  const rows: Spread<T>[] = [[null, pages[0]]];
  for (let i = 1; i < pages.length; i += 2) {
    rows.push([pages[i], pages[i + 1] ?? null]);
  }
  return rows;
}
