// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RELATIVE_TIME_RANGES } from '../components/page-header/constants';
import type { TimeRange } from '../components/page-header/types';
import Overview from './Overview';
import EventsPanel from './overview/components/EventsPanel';

const { cluster, dashboard } = vi.hoisted(() => ({
  cluster: { id: 'test-cluster', brokers: 'kafka.test:9092' },
  dashboard: {
    timeRange: { type: 'relative', id: '15m', label: '15 минут' } as TimeRange,
    registerRefreshHandler: vi.fn(),
    setPageLoading: vi.fn(),
  },
}));

vi.mock('axios', () => ({ default: { get: vi.fn() } }));
vi.mock('../contexts/ClusterContext', () => ({
  useCluster: () => ({ currentCluster: cluster }),
}));
vi.mock('../contexts/DashboardControlsContext', () => ({
  useDashboardControls: () => dashboard,
}));

vi.mock('./overview/components/ThroughputPanel', () => ({ default: () => null }));
vi.mock('./overview/components/TopicsPanel', () => ({ default: () => null }));
vi.mock('./overview/components/ConsumerLagPanel', () => ({ default: () => null }));
vi.mock('./overview/components/ClusterHealthPanel', () => ({ default: () => null }));
vi.mock('./overview/components/BrokersPanel', () => ({ default: () => null }));
vi.mock('./overview/components/CertificatesPanel', () => ({ default: () => null }));

const eventsPath = '/api/overview/events';
const request = vi.mocked(axios.get);
const unexpectedPaths: string[] = [];
const headers = { 'X-Kafka-Profile-ID': cluster.id };

function eventsResponse(message = 'Тестовое событие') {
  return { data: { events: [{ time: '12:00', level: 'INFO', message, source: 'Kafka' }] } };
}

beforeEach(() => {
  request.mockReset();
  request.mockImplementation(async (url) => {
    const { pathname } = new URL(url, 'http://odyssey.test');
    switch (pathname) {
      case eventsPath:
        return eventsResponse();
      case '/api/overview':
        return { data: {} };
      case '/api/overview/consumer-groups':
        return { data: { groups: [] } };
      case '/api/overview/throughput':
        return { data: { points: [] } };
      default:
        unexpectedPaths.push(pathname);
        throw new Error(`Неожиданный путь запроса: ${pathname}`);
    }
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  expect(unexpectedPaths.splice(0)).toEqual([]);
});

describe('Диапазон событий Overview', () => {
  it.each(RELATIVE_TIME_RANGES)('отправляет относительный диапазон $id', async (range) => {
    dashboard.timeRange = range;
    render(<Overview />);

    await screen.findByText('Тестовое событие');
    expect(request).toHaveBeenCalledWith(`${eventsPath}?range=${range.id}`, { headers });
  });

  it('передаёт обе абсолютные границы с часовым смещением', async () => {
    const from = '2026-11-14T23:30:00+10:00';
    const to = '2026-11-15T01:30:00+10:00';
    dashboard.timeRange = { type: 'absolute', from, to };
    render(<Overview />);

    await screen.findByText('Тестовое событие');
    const eventsCalls = request.mock.calls.filter(([url]) => url.startsWith(`${eventsPath}?`));
    expect(eventsCalls.length).toBeGreaterThan(0);
    for (const [requestUrl, options] of eventsCalls) {
      const url = new URL(requestUrl, 'http://odyssey.test');
      expect(url.pathname).toBe(eventsPath);
      expect(url.searchParams.getAll('from')).toEqual([from]);
      expect(url.searchParams.getAll('to')).toEqual([to]);
      expect(options?.headers).toEqual(headers);
    }
  });
});

it('перезапрашивает события при изменении refreshKey', async () => {
  request.mockResolvedValueOnce(eventsResponse('Первое событие'));
  request.mockResolvedValueOnce(eventsResponse('Обновлённое событие'));
  const { rerender } = render(<EventsPanel refreshKey={0} timeRange="range=15m" />);
  await screen.findByText('Первое событие');

  rerender(<EventsPanel refreshKey={1} timeRange="range=15m" />);

  await screen.findByText('Обновлённое событие');
  expect(screen.queryByText('Первое событие')).toBeNull();
  expect(request.mock.calls).toEqual([
    [`${eventsPath}?range=15m`, { headers }],
    [`${eventsPath}?range=15m`, { headers }],
  ]);
});

it('обновляет панели, даже если запрос списка групп завершился ошибкой', async () => {
  const fallback = request.getMockImplementation()!;
  request.mockImplementation((url, config) => url === '/api/overview/consumer-groups'
    ? Promise.reject(new Error('Группы недоступны'))
    : fallback(url, config));
  const event = vi.fn()
    .mockReturnValueOnce(eventsResponse('Событие до обновления'))
    .mockReturnValue(eventsResponse('Событие после обновления'));
  const existing = request.getMockImplementation()!;
  request.mockImplementation((url, config) => url.startsWith(eventsPath)
    ? Promise.resolve(event())
    : existing(url, config));
  dashboard.timeRange = { type: 'relative', id: '15m', label: '15 минут' };

  render(<Overview />);

  expect(await screen.findByText('Событие после обновления')).toBeTruthy();
});
