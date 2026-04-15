export function generateId(): string {
  return crypto.randomUUID();
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

// Convert pixel delta to percentage given a container size in pixels
export function deltaToPercent(deltaPx: number, containerPx: number): number {
  return (deltaPx / containerPx) * 100;
}

export function now(): string {
  return new Date().toISOString();
}
