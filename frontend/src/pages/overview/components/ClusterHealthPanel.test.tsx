// @vitest-environment jsdom

import { act, cleanup, render as rtlRender, screen } from '@testing-library/react';
import axios from 'axios';
import { afterEach, expect, it, vi } from 'vitest';
import { isSameHealthProfile, retainBrokerList } from '../clusterHealthProfile';
import ClusterHealthPanel from './ClusterHealthPanel';
import { ClusterHealthProvider } from '../../../contexts/ClusterHealthContext';
import type { ReactNode } from 'react';

const { profile } = vi.hoisted(() => ({
  profile: { current: { id: 'a', brokers: 'a.test:9092', connectionStatus: 'connected' } },
}));

vi.mock('../../../contexts/ClusterContext', () => ({
  useCluster: () => ({ currentCluster: profile.current }),
}));
vi.mock('axios', () => ({ default: { get: vi.fn() } }));
vi.mock('../../../contexts/DashboardControlsContext', () => ({
  useDashboardControls: () => ({ refreshPulse: 0 }),
}));
const render = (ui: ReactNode) => rtlRender(ui, {
  wrapper: ({ children }) => <ClusterHealthProvider>{children}</ClusterHealthProvider>,
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it('игнорирует запоздавшее состояние предыдущего профиля', async () => {
  let finishA!: (response: { data: object }) => void;
  const pendingA = new Promise<{ data: object }>((resolve) => { finishA = resolve; });
  const dataB = { status: 'unknown', brokers: [{ id: 2, brokerStatus: 'unknown' }] };
  const get = vi.mocked(axios.get);
  get.mockReturnValueOnce(pendingA).mockResolvedValueOnce({ data: dataB });
  const onData = vi.fn();
  const panel = <ClusterHealthPanel
    refreshKey={0} overview={null} consumerGroups={[]} messagesIn={0} messagesOut={0} onData={onData}
  />;
  const { rerender } = render(panel);
  profile.current = { id: 'b', brokers: 'b.test:9092', connectionStatus: 'connected' };
  await act(async () => { rerender(<ClusterHealthPanel {...panel.props} />); });
  expect(get.mock.calls[0][1]?.signal?.aborted).toBe(true);
  expect(get.mock.calls[1][1]?.headers).toEqual({ 'X-Kafka-Bootstrap': 'b.test:9092' });
  await act(async () => { finishA({ data: { status: 'critical' } }); });
  expect(onData.mock.calls).toEqual([[dataB]]);
});

it('сохраняет снимок при обновлении статуса соединения и отличает новые настройки', () => {
  const saved = { id: 'a', brokers: 'a.test:9092', authType: 'PLAINTEXT' };
  expect(isSameHealthProfile(saved, { ...saved, connectionStatus: 'connected' })).toBe(true);
  expect(isSameHealthProfile(saved, { ...saved, authType: 'MTLS' })).toBe(false);
  expect(isSameHealthProfile(saved, { ...saved, id: 'b' })).toBe(false);
});

it('сохраняет семь известных брокеров при сбое без устаревших метрик и статусов', () => {
  const brokers = Array.from({ length: 7 }, (_, id) => ({
    id, address: `broker-${id}.test:9092`, brokerStatus: 'online', cpu: 42,
  }));
  const saved = { status: 'healthy', brokers };
  const partial = { status: 'unknown', brokers: null };
  const unknownBrokers = brokers.map(({ id, address }) => ({ id, address, brokerStatus: 'unknown' }));
  expect(retainBrokerList(null, saved)).toEqual({ status: 'unknown', brokers: unknownBrokers });
  expect(retainBrokerList(partial, saved)).toEqual({ status: 'unknown', brokers: unknownBrokers });
  const subset = { status: 'unknown', brokers: brokers.slice(0, 3) };
  expect(retainBrokerList(subset, saved)?.brokers).toEqual([...subset.brokers, ...unknownBrokers.slice(3)]);
  const current = { status: 'healthy', brokers: brokers.slice(0, 3) };
  expect(retainBrokerList(current, saved)).toBe(current);
  expect(retainBrokerList(partial, null)).toBe(partial);
});

it('показывает нижнюю границу числа групп при неполном ответе', async () => {
  vi.mocked(axios.get).mockResolvedValue({ data: { status: 'unknown' } });
  render(<ClusterHealthPanel
    refreshKey={0} overview={{ consumerGroups: 3, consumerGroupsPartial: true }}
    consumerGroups={[{}]} consumerGroupsPartial messagesIn={0} messagesOut={0}
  />);
  expect(await screen.findByText('≥ 3')).toBeTruthy();
});

it('делит один запрос состояния между несколькими потребителями', async () => {
  vi.mocked(axios.get).mockResolvedValue({ data: { status: 'healthy', brokerCount: 7 } });
  const props = { refreshKey: 0, overview: null, consumerGroups: [], messagesIn: 0, messagesOut: 0 };
  render(<><ClusterHealthPanel {...props} /><ClusterHealthPanel {...props} /></>);
  await screen.findAllByText('7');
  expect(axios.get).toHaveBeenCalledTimes(1);
});
