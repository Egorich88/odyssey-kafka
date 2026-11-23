// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import HeaderClusterStatus from './HeaderClusterStatus';
import PageHeader from './PageHeader';
import ru from '../../locales/ru/common.json';
import en from '../../locales/en/common.json';

const { source, controls } = vi.hoisted(() => ({
  source: { cluster: null as any, data: null as any, loading: false, language: 'ru' },
  controls: { refreshNow: vi.fn(), timeRange: {}, refreshInterval: 0, isRefreshing: false, pageLoading: false },
}));
vi.mock('../../contexts/ClusterContext', () => ({ useCluster: () => ({ currentCluster: source.cluster }) }));
vi.mock('../../contexts/ClusterHealthContext', () => ({ useClusterHealth: () => source }));
vi.mock('../../contexts/DashboardControlsContext', () => ({ useDashboardControls: () => controls }));
vi.mock('./TimeRangePicker', () => ({ default: () => <span>Диапазон</span> }));
vi.mock('./RefreshIntervalPicker', () => ({ default: () => <span>Автообновление</span> }));
vi.mock('react-i18next', async (original) => ({ ...await original<typeof import('react-i18next')>(), useTranslation: () => ({
  t: (key: string) => key.split('.').reduce((value: any, part) => value?.[part], source.language === 'en' ? en : ru) ?? key,
}) }));
// jsdom не рассчитывает геометрию; наблюдатель нужен библиотеке позиционирования tooltip.
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); source.cluster = null; source.data = null; source.loading = false; source.language = 'ru'; });

it('показывает отсутствие выбора, загрузку, недоступность и неизвестные данные', () => {
  const { rerender } = render(<HeaderClusterStatus />);
  expect(screen.getByText('Не выбран')).toBeTruthy();
  source.cluster = { id: 'a', connectionStatus: 'connected' };
  source.loading = true;
  rerender(<HeaderClusterStatus />);
  expect(screen.getByText('Загрузка…')).toBeTruthy();
  source.cluster = { id: 'a', connectionStatus: 'error' };
  rerender(<HeaderClusterStatus />);
  expect(screen.getByText('Недоступен')).toBeTruthy();
  source.loading = false;
  source.cluster.connectionStatus = 'connected';
  rerender(<HeaderClusterStatus />);
  expect(screen.getByText('Состояние уточняется')).toBeTruthy();
  expect(screen.getByText('Версия неизвестна')).toBeTruthy();
  expect(screen.queryByText(/Брокеры:/)).toBeNull();
  expect(screen.getByLabelText(/Версия Apache Kafka/).getAttribute('aria-label'))
    .toContain('Данные о версиях брокеров отсутствуют');
});

it('различает версии брокеров и подтверждённые состояния', () => {
  source.cluster = { id: 'a', connectionStatus: 'connected' };
  source.data = { status: 'warning', onlineBrokers: 6, brokerCount: 7, brokers: [
    { id: 1, address: 'broker-a:9092', version: '4.3.2' }, { id: 2, version: ' unknown ' },
  ] };
  const { rerender } = render(<HeaderClusterStatus />);
  expect(screen.getByText('Есть предупреждения')).toBeTruthy();
  expect(screen.getByText('Не у всех брокеров')).toBeTruthy();
  expect(screen.queryByText(/6\/7/)).toBeNull();
  expect(screen.getByLabelText(/Версия Apache Kafka/).getAttribute('aria-label'))
    .toContain('Брокер 1 (broker-a:9092): 4.3.2\nБрокер 2 (адрес неизвестен): версия неизвестна');
  expect(screen.getByLabelText(ru.headerCluster.warningDescription).querySelector('svg')).toBeTruthy();
  expect(screen.getByLabelText(/Версия Apache Kafka/).querySelector('.header-cluster-version-logo')).toBeTruthy();
  source.data.brokers[1].version = '3.9.0';
  source.data.status = 'critical';
  rerender(<HeaderClusterStatus />);
  expect(screen.getByText('Разные версии')).toBeTruthy();
  expect(screen.getByText('Критическое состояние')).toBeTruthy();
  source.data.brokers[1].version = '4.3.2';
  source.data.status = 'healthy';
  rerender(<HeaderClusterStatus />);
  expect(screen.getByText('Кластер стабилен')).toBeTruthy();
  expect(screen.getByText('4.3.2')).toBeTruthy();
  expect(screen.getByLabelText(ru.headerCluster.healthyDescription).getAttribute('aria-label'))
    .toBe(ru.headerCluster.healthyDescription);
});

it('сохраняет контролы только в прежнем мониторинговом режиме', () => {
  const { rerender } = render(<PageHeader title="Старый заголовок" description="Описание" mode="monitoring" />);
  expect(screen.queryByText('Старый заголовок')).toBeNull();
  expect(screen.getByText('Диапазон')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Обновить' })).toBeTruthy();
  rerender(<PageHeader title="Настройки" description="" mode="default" />);
  expect(screen.queryByText('Диапазон')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Обновить' })).toBeNull();
});

it('сохраняет исходные пояснения всех состояний в структурированной подсказке', async () => {
  source.cluster = { id: 'a', connectionStatus: 'connected' };
  const { rerender, container } = render(<HeaderClusterStatus />);
  for (const state of ['healthy', 'warning', 'critical', 'unknown'] as const) {
    source.data = { status: state, brokers: [] };
    rerender(<HeaderClusterStatus />);
    const description = ru.headerCluster[`${state}Description`];
    const icon = screen.getByLabelText(description);
    fireEvent.mouseOver(icon);
    const tooltip = await screen.findByRole('tooltip');
    expect(within(tooltip).getByText('Состояние кластера')).toBeTruthy();
    expect(within(tooltip).getByText('Статус')).toBeTruthy();
    expect(within(tooltip).getByText(ru.headerCluster[state])).toBeTruthy();
    expect(within(tooltip).getByText(description)).toBeTruthy();
    expect(icon.tabIndex).toBe(0);
    expect(container.querySelector(`.header-cluster-state.is-${state} svg`)).toBeTruthy();
  }
});

it('переводит подписи и подробные сведения о версиях на английский', async () => {
  source.language = 'en';
  source.cluster = { id: 'a', connectionStatus: 'connected' };
  source.data = { status: 'healthy', brokers: [{ id: 0, address: 'broker-a:9092', version: '4.3.2' }] };
  render(<HeaderClusterStatus />);
  expect(screen.getByText('Cluster is healthy')).toBeTruthy();
  const version = screen.getByLabelText(/Apache Kafka version/);
  fireEvent.mouseOver(version);
  const table = await screen.findByRole('table', { name: 'Broker details' });
  expect(within(table).getByRole('rowheader').textContent).toBe('Broker 0broker-a:9092');
  expect(within(table).getByRole('cell').textContent).toBe('4.3.2');
  expect(version.tabIndex).toBe(0);
});

it('показывает таблицу по числовым ID, неизвестные версии и обновляет строки при смене кластера', async () => {
  source.cluster = { id: 'a', connectionStatus: 'connected' };
  source.data = { status: 'healthy', brokers: [
    { id: 10, address: 'broker-10:9092', version: 'unknown' },
    { id: 2, address: 'broker-2:9092', version: '4.3.2' },
    { id: 0, address: 'broker-0:9092', version: '' },
  ] };
  const { rerender } = render(<HeaderClusterStatus />);
  fireEvent.mouseOver(screen.getByLabelText(/Версия Apache Kafka/));
  const table = await screen.findByRole('table', { name: 'Сведения о брокерах' });
  expect(within(table).getAllByRole('rowheader').map(cell => cell.textContent))
    .toEqual(['Брокер 0broker-0:9092', 'Брокер 2broker-2:9092', 'Брокер 10broker-10:9092']);
  expect(within(table).getAllByRole('cell').map(cell => cell.textContent)).toEqual(['Н/Д', '4.3.2', 'Н/Д']);
  expect(screen.getByRole('region', { name: 'Сведения о брокерах' }).tabIndex).toBe(0);
  source.cluster = { id: 'b', connectionStatus: 'connected' };
  source.data = { status: 'healthy', brokers: [{ id: 3, address: 'b:9092', version: '3.9.0' }] };
  rerender(<HeaderClusterStatus />);
  expect(screen.queryByText('broker-10:9092')).toBeNull();
  expect(within(table).getByRole('rowheader').textContent).toBe('Брокер 3b:9092');
});

it('открывает подсказку без данных и сохраняет таблицу при разных и неизвестных версиях', async () => {
  source.cluster = { id: 'a', connectionStatus: 'connected' };
  const { rerender } = render(<HeaderClusterStatus />);
  fireEvent.mouseOver(screen.getByLabelText(/Версия Apache Kafka/));
  expect(await screen.findByText('Данные о версиях брокеров отсутствуют')).toBeTruthy();
  source.data = { brokers: [{ id: 1, version: '3.9.0' }, { id: 2, version: '4.3.2' }] };
  rerender(<HeaderClusterStatus />);
  expect(screen.getByText('Разные версии')).toBeTruthy();
  const table = screen.getByRole('table', { name: 'Сведения о брокерах' });
  expect(within(table).getAllByRole('cell').map(cell => cell.textContent)).toEqual(['3.9.0', '4.3.2']);
  source.data = { brokers: [{ id: 1, version: ' UNKNOWN ' }] };
  rerender(<HeaderClusterStatus />);
  expect(screen.getByText('Версия неизвестна')).toBeTruthy();
  expect(within(table).getByRole('cell').textContent).toBe('Н/Д');
});

it('показывает недоступный uptime под статусом и поясняет отсутствие времени начала работы', async () => {
  source.cluster = { id: 'a', connectionStatus: 'connected' };
  source.data = { status: 'healthy', uptime: '7 д. 12 ч. 26 мин.', brokers: [{ id: 1, uptime: '12 дней' }] };
  render(<HeaderClusterStatus />);
  const uptime = screen.getByText('Время работы: Н/Д');
  expect(uptime.closest('.header-cluster-state-copy')?.querySelector('strong')?.textContent).toBe('Кластер стабилен');
  expect(screen.queryByText('7 д. 12 ч. 26 мин.')).toBeNull();
  fireEvent.mouseOver(uptime);
  expect((await screen.findByRole('tooltip')).textContent).toBe(ru.headerCluster.uptimeUnavailableDescription);
});

it('не подставляет время подключения или брокера при переключении кластеров и отсутствии данных', () => {
  source.cluster = { id: 'a', connectionStatus: 'connected', connectedAt: '2026-11-01T00:00:00Z' };
  source.data = { status: 'healthy', brokers: [{ id: 1, uptime: '12 дней', startedAt: '2026-11-01T00:00:00Z' }] };
  const { rerender } = render(<HeaderClusterStatus />);
  expect(screen.getByText('Время работы: Н/Д')).toBeTruthy();
  source.cluster = { id: 'b', connectionStatus: 'error' };
  source.data = null;
  rerender(<HeaderClusterStatus />);
  expect(screen.getByText('Недоступен')).toBeTruthy();
  expect(screen.getByText('Время работы: Н/Д')).toBeTruthy();
  source.cluster = null;
  rerender(<HeaderClusterStatus />);
  expect(screen.getByText('Не выбран')).toBeTruthy();
  expect(screen.getByText('Время работы: Н/Д')).toBeTruthy();
  source.language = 'en';
  rerender(<HeaderClusterStatus />);
  expect(screen.getByText('Uptime: N/A')).toBeTruthy();
});
