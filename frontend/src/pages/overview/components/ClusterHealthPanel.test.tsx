// @vitest-environment jsdom

import { act, cleanup, render as rtlRender, screen, within } from '@testing-library/react';
import axios from 'axios';
import { afterEach, expect, it, vi } from 'vitest';
import { isSameHealthProfile, retainBrokerList } from '../clusterHealthProfile';
import ClusterHealthPanel from './ClusterHealthPanel';
import { ClusterHealthProvider } from '../../../contexts/ClusterHealthContext';
import type { ReactNode } from 'react';
import ru from '../../../locales/ru/common.json';
import en from '../../../locales/en/common.json';

const { profile } = vi.hoisted(() => ({
  profile: { current: { id: 'a', brokers: 'a.test:9092', connectionStatus: 'connected' } },
}));
const language = vi.hoisted(() => ({ current: 'ru' }));
vi.mock('react-i18next', async (original) => ({ ...await original<typeof import('react-i18next')>(),
  useTranslation: () => ({
    i18n: { language: language.current },
    t: (key: string) => key.split('.').reduce((value: any, part) => value?.[part], language.current === 'ru' ? ru : en) ?? key,
  }),
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
  language.current = 'ru';
  profile.current = { id: 'a', brokers: 'a.test:9092', connectionStatus: 'connected' };
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
  expect(get.mock.calls[1][1]?.headers).toEqual({ 'X-Kafka-Profile-ID': 'b' });
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

it.each(['ru', 'en'])('сохраняет порядок семи KPI, шесть разделителей и подписи %s', async (locale) => {
  language.current = locale;
  vi.mocked(axios.get).mockResolvedValue({ data: { brokerCount: 7, partitionsTotal: 42, underReplicated: 2 } });
  const props = { refreshKey: 0, overview: { topics: 12 }, consumerGroups: [{}], messagesIn: 1234.5, messagesOut: 12.5 };
  const { container, rerender } = render(<ClusterHealthPanel {...props} />);
  await screen.findByText('7');
  const dictionary = locale === 'ru' ? ru : en;
  const keys = ['brokers', 'topics', 'partitions', 'groups', 'incoming', 'outgoing', 'urp'] as const;
  const items = screen.getAllByRole('listitem');
  expect(items).toHaveLength(7);
  expect(container.querySelectorAll('.cluster-kpi-divider')).toHaveLength(6);
  items.forEach((item, index) => {
    expect(within(item).getByTitle(dictionary.clusterKpi[keys[index]]).textContent).toBe(dictionary.clusterKpi[keys[index]]);
    expect(item.querySelectorAll('.cluster-kpi-divider')).toHaveLength(index === 0 ? 0 : 1);
  });
  expect(items[6].classList.contains('is-danger')).toBe(true);
  expect(container.querySelector('svg')).toBeNull();
  expect(items[4].textContent).toContain(`${new Intl.NumberFormat(locale, { minimumFractionDigits: 1 }).format(1234.5)} msg/s`);
  rerender(<ClusterHealthPanel {...props} messagesIn={2} />);
  expect(items[4].textContent).toContain(locale === 'ru' ? '2,0 msg/s' : '2.0 msg/s');
  expect(axios.get).toHaveBeenCalledTimes(1);
});

it('показывает Н/Д вместо отсутствующих или недостоверных значений', async () => {
  vi.mocked(axios.get).mockResolvedValue({ data: { status: 'unknown' } });
  render(<ClusterHealthPanel refreshKey={0} overview={null} messagesIn={null} messagesOut={Number.NaN} />);
  expect(await screen.findAllByText('Н/Д')).toHaveLength(7);
  expect(screen.queryByText('0')).toBeNull();
});

it('сохраняет настоящие нулевые значения и нейтральный URP', async () => {
  vi.mocked(axios.get).mockResolvedValue({ data: { brokerCount: 0, partitionsTotal: 0, underReplicated: 0 } });
  render(<ClusterHealthPanel refreshKey={0} overview={{ topics: 0 }} consumerGroups={[]} messagesIn={0} messagesOut={0} />);
  expect(await screen.findAllByText('0')).toHaveLength(5);
  expect(screen.getAllByText('0,0 msg/s')).toHaveLength(2);
  expect(screen.getAllByRole('listitem')[6].classList.contains('is-danger')).toBe(false);
});
