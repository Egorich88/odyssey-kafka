/**
 * Постоянное назначение цвета по имени топика.
 * Цвет не зависит от порядка ответа API, сортировки, периода или обновления.
 * Одинаковый топик получает одинаковый цвет на графиках Overview.
 */
export const TOPIC_COLORS = [
  '#3b82f6', '#8b5cf6', '#22c55e', '#f59e0b', '#ef4444',
  '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#a855f7',
  '#14b8a6', '#f472b6'
];

export function getStableTopicColor(topic: string): string {
  // FNV-1a: детерминированный хеш строки, без случайных значений.
  let hash = 2166136261;
  for (let i = 0; i < topic.length; i += 1) {
    hash ^= topic.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return TOPIC_COLORS[(hash >>> 0) % TOPIC_COLORS.length];
}
