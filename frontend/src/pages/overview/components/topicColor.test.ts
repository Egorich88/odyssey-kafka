import { describe, expect, it } from 'vitest';
import { getStableTopicColor, TOPIC_COLORS } from './topicColor';

describe('Цвет топика', () => {
  it('сохраняет соответствие имени при повторном расчёте и перестановке топиков', () => {
    const topics = ['orders', 'payments', 'notifications'];
    const original = topics.map((topic) => [topic, getStableTopicColor(topic)] as const);
    const reordered = Object.fromEntries(
      [...topics].reverse().map((topic) => [topic, getStableTopicColor(topic)]),
    );

    for (const [topic, color] of original) {
      expect(TOPIC_COLORS).toContain(color);
      expect(reordered[topic]).toBe(color);
    }
    expect(new Set(original.map(([, color]) => color)).size).toBeGreaterThan(1);
  });
});
