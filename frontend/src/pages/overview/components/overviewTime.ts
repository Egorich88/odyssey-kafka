import i18n from 'i18next';
/** Общие функции для синхронизации графиков по абсолютному времени. */
export function nearestTime(points: Array<{timestamp?: number}>, target: number | null): number | null {
  if (target === null || !Number.isFinite(target) || !points.length) return null;
  const stamps = points.map(p => Number(p.timestamp)).filter(n => Number.isFinite(n) && n > 0);
  if (!stamps.length || target < stamps[0] || target > stamps[stamps.length - 1]) return null;
  return stamps.reduce((best, n) => Math.abs(n - target) < Math.abs(best - target) ? n : best, stamps[0]);
}
export function cursorTime(state: {activeLabel?: unknown, activePayload?: Array<{payload?: {timestamp?: number}}>}, onHover: (value: number | null) => void) {
  const timestamp = Number(state?.activeLabel ?? state?.activePayload?.[0]?.payload?.timestamp);
  if (Number.isFinite(timestamp) && timestamp > 0) onHover(timestamp);
}
export function formatTimestamp(value: unknown): string {
  const date = new Date(Number(value));
  return Number.isFinite(date.getTime()) ? date.toLocaleString(i18n.language || 'ru') : '—';
}
