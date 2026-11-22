// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import ru from '../../../locales/ru/common.json';
import BrokersPanel from './BrokersPanel';
import PanelFullscreenButton from './PanelFullscreenButton';
import { BrokerIcon } from '../../../components/common/BrokerIcon';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'ru' },
    t: (key: string, values?: Record<string, string | number>) => {
      const [section, name] = key.split('.');
      const dictionary = ru[section as keyof typeof ru];
      const message = typeof dictionary === 'string' ? dictionary
        : (dictionary as Record<string, string>)?.[name] ?? key;
      return message.replace(/\{\{(\w+)\}\}/g, (_, token) => String(values?.[token] ?? ''));
    },
  }),
}));

afterEach(cleanup);

it('использует общую иконку брокеров в обычном и полноэкранном заголовке, сохраняя i', () => {
  const reference=render(<BrokerIcon aria-hidden="true" />);
  const shape=reference.container.querySelector('svg')?.innerHTML;
  reference.unmount();
  const {container}=render(<BrokersPanel data={{brokers:[{id:1}]}} />);
  expect(container.querySelector('.panel-title-with-info > svg')?.innerHTML).toBe(shape);
  expect(container.querySelector('.panel-info-trigger')).not.toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Развернуть панель брокеров'}));
  expect(container.querySelector('.broker-details-heading > svg')?.innerHTML).toBe(shape);
  fireEvent.keyDown(document,{key:'Escape'});
  expect(screen.getByRole('button',{name:'Развернуть панель брокеров'})).toBe(document.activeElement);
});

it('отображает явные статусы и не использует устаревшее online', () => {
  render(<BrokersPanel data={{ brokers: [
    { id: 1, address: 'kafka-long-hostname.example:9094', brokerStatus: 'online', online: false, controller: true },
    { id: 2, brokerStatus: 'offline', online: true },
    { id: 3, brokerStatus: 'unknown', online: false },
    { id: 4, online: false },
    { id: 5, brokerStatus: 'future', online: true },
  ] }} />);
  expect(screen.getByText('Онлайн').className).toBe('broker-online');
  expect(screen.getByText('Офлайн').className).toBe('broker-offline');
  expect(screen.getAllByText('Неизвестно')).toHaveLength(3);
  expect(screen.getByText('Контроллер')).toBeTruthy();
  expect(screen.getByTitle('kafka-long-hostname.example:9094').textContent).toBe('kafka-long-hostname.example:9094');
  expect(screen.getByTitle('Онлайн').classList.contains('broker-online')).toBe(false);
  expect(screen.getByTitle('Онлайн').parentElement?.classList.contains('broker-online')).toBe(true);
  expect(screen.getByText('Координаторы').nextElementSibling?.textContent).toBe('Н/Д');
});

it('различает свободный том и отсутствие данных о ресурсах брокера', () => {
  render(<BrokersPanel data={{ brokers: [
    { id: 1, diskUsage: 0, diskTotal: 100, cpu: null, memory: null },
    { id: 2, diskUsage: 0, diskTotal: 0, cpu: null, memory: null },
  ] }} />);
  expect(screen.getByTitle('0 / 100 GiB').textContent?.trim()).toBe('0%');
  expect(screen.getByTitle(ru.brokerResources.diskUnavailable).textContent?.trim()).toBe('Н/Д');
  expect(screen.getAllByTitle(ru.brokerResources.cpuUnavailable)).toHaveLength(2);
  expect(screen.getByText('1 из 2')).toBeTruthy();
});

it('взвешивает ёмкость диска и выбирает пиковый брокер по CPU', () => {
  render(<BrokersPanel data={{ brokers: [
    { id: 1, cpu: 5, diskUsage: 40, diskTotal: 40 },
    { id: 2, cpu: 25, diskUsage: 0, diskTotal: 160 },
    { id: 3, diskUsage: 11, diskTotal: 10 },
  ] }} />);
  expect(screen.getByText('20%')).toBeTruthy();
  expect(screen.getByText('2 из 3')).toBeTruthy();
  expect(screen.getByText('Брокер 2')).toBeTruthy();
  const peak = screen.getByText('Брокер 2').parentElement;
  expect(peak?.textContent).toContain('CPU: 25%');
  expect(peak?.textContent).toMatch(/Диск:\s*0%/);
});

it('разворачивает существующую панель и закрывает её по Escape', () => {
  render(<BrokersPanel data={{ brokers: [{ id: 1 }] }} />);
  const panel = screen.getByRole('region', { name: 'Брокеры' });
  const button = within(panel).getByRole('button', { name: 'Развернуть панель брокеров' });
  expect(within(panel).queryByRole('button', { name: 'Все брокеры' })).toBeNull();
  button.focus();
  fireEvent.click(button);
  expect(panel.classList.contains('is-panel-fullscreen')).toBe(true);
  const dialog = screen.getByRole('dialog', { name: 'Брокеры кластера' });
  const close = within(dialog).getByRole('button', { name: 'Свернуть панель' });
  const search = within(dialog).getByRole('searchbox');
  expect(document.activeElement).toBe(close);
  fireEvent.keyDown(close, { key: 'Tab' });
  expect(document.activeElement).toBe(search);
  fireEvent.keyDown(search, { key: 'Tab', shiftKey: true });
  expect(document.activeElement).toBe(close);
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(panel.classList.contains('is-panel-fullscreen')).toBe(false);
  expect(document.activeElement).toBe(button);
});

it('локально ищет, фильтрует, сортирует и переключает представление семи брокеров', () => {
  const brokers = Array.from({ length: 7 }, (_, index) => ({
    id: index + 1, name: 'kafka-' + (index + 1), address: 'host-' + (index + 1),
    brokerStatus: index ? 'online' : 'offline', rack: index < 2 ? 'r1' : 'r2',
    diskUsage: index * 10, diskTotal: 100,
  }));
  render(<BrokersPanel data={{ brokers }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Развернуть панель брокеров' }));
  expect(screen.getAllByRole('article')).toHaveLength(7);
  const search = screen.getByRole('searchbox');
  for (const query of ['kafka-7', 'host-7', '7']) {
    fireEvent.change(search, { target: { value: query } });
    expect(screen.getAllByRole('article').map(card => card.getAttribute('aria-label'))).toEqual(['kafka-7']);
  }
  fireEvent.change(search, { target: { value: '' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Rack' }), { target: { value: 'r1' } });
  expect(screen.getAllByRole('article')).toHaveLength(2);
  fireEvent.change(screen.getByRole('combobox', { name: 'Статус' }), { target: { value: 'offline' } });
  expect(screen.getAllByRole('article')).toHaveLength(1);
  fireEvent.change(screen.getByRole('combobox', { name: 'Rack' }), { target: { value: '' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Статус' }), { target: { value: '' } });
  const sort = screen.getByRole('combobox', { name: 'Сортировка' });
  expect(within(sort).getByRole<HTMLOptionElement>('option', { name: 'Память ↓' }).disabled).toBe(true);
  fireEvent.change(sort, { target: { value: 'disk' } });
  expect(screen.getAllByRole('article')[0].getAttribute('aria-label')).toBe('kafka-7');
  fireEvent.click(screen.getByRole('button', { name: 'Список' }));
  expect(screen.getAllByRole('row')).toHaveLength(8);
  fireEvent.click(screen.getByRole('button', { name: 'Карточки' }));
  expect(screen.getAllByRole('article')).toHaveLength(7);
});

it('показывает Н/Д и сохраняет закрытие кнопкой при сбое карточек', () => {
  const { rerender } = render(<BrokersPanel data={{ brokers: [{ id: 1 }] }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Развернуть панель брокеров' }));
  expect(screen.queryByRole('combobox', { name: 'Rack' })).toBeNull();
  expect(within(screen.getByRole('article')).getAllByText('Н/Д').length).toBeGreaterThan(3);
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    rerender(<BrokersPanel data={{ version: 1 as unknown as string, brokers: [{ id: 1 }] }} />);
    expect(screen.getByRole('alert').textContent).toContain('Не удалось');
    fireEvent.click(screen.getByRole('button', { name: 'Свернуть панель' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Развернуть панель брокеров' }));
  } finally {
    log.mockRestore();
  }
});

it('уведомляет только при смене fullscreen и поддерживает кнопку без callback', () => {
  const notify = vi.fn();
  const { unmount } = render(<>
    <section className="dashboard-panel"><PanelFullscreenButton expandLabel="Открыть детали" onFullscreenChange={notify} /></section>
    <section className="dashboard-panel"><PanelFullscreenButton /></section>
  </>);
  fireEvent.keyDown(document, { key: 'Escape' });
  fireEvent.click(screen.getByRole('button', { name: 'Открыть детали' }));
  fireEvent.click(screen.getByRole('button', { name: 'Свернуть панель' }));
  fireEvent.click(screen.getByRole('button', { name: 'Открыть детали' }));
  fireEvent.keyDown(document, { key: 'Escape' });
  fireEvent.keyDown(document, { key: 'Escape' });
  fireEvent.click(screen.getByRole('button', { name: 'Увеличить панель' }));
  expect(document.body.classList.contains('panel-modal-open')).toBe(true);
  expect(notify.mock.calls).toEqual([[true], [false], [true], [false]]);
  unmount();
  expect(document.body.classList.contains('panel-modal-open')).toBe(false);
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(notify).toHaveBeenCalledTimes(4);
});

it('сохраняет SVG-дуги и идентификаторы градиентов при обновлении значений', () => {
  const { container, rerender } = render(<BrokersPanel data={{ brokers: [
    { id: 1, cpu: 50, diskUsage: 25, diskTotal: 100, brokerStatus: 'online' },
  ] }} />);
  const cpuArc = container.querySelector('.broker-overview-gauge .broker-metric-cpu .broker-overview-arc');
  const diskArc = container.querySelector('.broker-overview-gauge .broker-metric-disk .broker-overview-arc');
  const gradient = cpuArc?.getAttribute('stroke');
  expect(cpuArc?.getAttribute('stroke-dashoffset')).toBe('50');
  expect(diskArc?.getAttribute('stroke-dashoffset')).toBe('75');
  rerender(<BrokersPanel data={{ brokers: [
    { id: 1, cpu: 75, diskUsage: 60, diskTotal: 100, brokerStatus: 'online' },
  ] }} />);
  expect(container.querySelector('.broker-overview-gauge .broker-metric-cpu .broker-overview-arc')).toBe(cpuArc);
  expect(cpuArc?.getAttribute('stroke')).toBe(gradient);
  expect(cpuArc?.getAttribute('stroke-dashoffset')).toBe('25');
  expect(container.querySelector('.broker-overview-gauge .broker-metric-disk .broker-overview-arc')).toBe(diskArc);
  expect(diskArc?.getAttribute('stroke-dashoffset')).toBe('40');
});

it('отличает неизвестный ресурс от нулевого и не смешивает градиенты двух панелей', () => {
  const { container } = render(<>
    <BrokersPanel data={{ brokers: [{ id: 1, cpu: 0, diskUsage: 0, diskTotal: 100 }] }} />
    <BrokersPanel data={{ brokers: [{ id: 2, cpu: null, diskUsage: 10, diskTotal: 100 }] }} />
  </>);
  const gauges = container.querySelectorAll('.broker-overview-gauge');
  expect(gauges[0].querySelector('.broker-metric-cpu')?.getAttribute('data-available')).toBe('true');
  expect(gauges[0].querySelector('.broker-metric-cpu .broker-overview-progress')?.getAttribute('opacity')).toBe('0');
  expect(gauges[1].querySelector('.broker-metric-cpu')?.getAttribute('data-available')).toBe('false');
  expect(gauges[1].querySelector('.broker-metric-cpu .broker-overview-arc')).toBeNull();
  expect(gauges[0].querySelector('.broker-metric-memory .broker-overview-arc')).toBeNull();
  const ids = Array.from(container.querySelectorAll('linearGradient')).map(gradient => gradient.id);
  expect(new Set(ids).size).toBe(ids.length);
});

it('сохраняет 21 отдельное кольцо семи карточек и обновляет существующие дуги', () => {
  const brokers = Array.from({ length: 7 }, (_, index) => ({
    id: index + 1, address: `broker-${index + 1}:9092`, brokerStatus: 'online',
    cpu: index ? null : 0, memory: index ? null : 50, memoryTotal: index ? undefined : 100,
    diskUsage: 25, diskTotal: 100, leaderCount: 3, replicaCount: 9, isrCount: 9, underReplicated: 0,
  }));
  const { rerender } = render(<BrokersPanel data={{ brokers }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Развернуть панель брокеров' }));
  const cards = screen.getAllByRole('article');
  expect(cards).toHaveLength(7);
  expect(cards.flatMap(card => [...card.querySelectorAll('.broker-detail-gauge svg')])).toHaveLength(21);
  const first = cards[0];
  const memoryArc = first.querySelector('.broker-metric-memory .broker-overview-arc');
  const diskArc = first.querySelector('.broker-metric-disk .broker-overview-arc');
  const gradient = memoryArc?.getAttribute('stroke');
  expect(memoryArc?.getAttribute('stroke-dashoffset')).toBe('50');
  expect(first.querySelector('.broker-metric-cpu .broker-overview-progress')?.getAttribute('opacity')).toBe('0');
  expect(cards[1].querySelector('.broker-metric-cpu .broker-overview-arc')).toBeNull();
  expect(cards[1].querySelector('.broker-metric-memory .broker-overview-arc')).toBeNull();
  const ids = cards.flatMap(card => [...card.querySelectorAll('linearGradient')].map(node => node.id));
  expect(new Set(ids).size).toBe(ids.length);
  rerender(<BrokersPanel data={{ brokers: brokers.map((broker, index) => index ? broker : {
    ...broker, memory: 75, diskUsage: 50,
  }) }} />);
  const updated = screen.getAllByRole('article')[0];
  expect(updated).toBe(first);
  expect(updated.querySelector('.broker-metric-memory .broker-overview-arc')).toBe(memoryArc);
  expect(memoryArc?.getAttribute('stroke')).toBe(gradient);
  expect(memoryArc?.getAttribute('stroke-dashoffset')).toBe('25');
  expect(updated.querySelector('.broker-metric-disk .broker-overview-arc')).toBe(diskArc);
  expect(diskArc?.getAttribute('stroke-dashoffset')).toBe('50');
  expect(within(updated).getByText('broker-1:9092')).toBeTruthy();
  expect(within(updated).getByText('75 / 100 MiB')).toBeTruthy();
  expect(within(updated).getByText('50 / 100 GiB')).toBeTruthy();
});

it('показывает бейджи и индикаторы объёма только по достоверным данным карточки', () => {
  render(<BrokersPanel data={{ brokers: [
    { id: 2, address: '192.0.2.2:9095', brokerStatus: 'online', controller: true,
      memory: null, diskUsage: 5, diskTotal: 20, leaderCount: 8, replicaCount: 24, isrCount: 24 },
    { id: 3, brokerStatus: 'unknown', memory: 0, memoryTotal: 100, diskUsage: 30, diskTotal: 20 },
  ] }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Развернуть панель брокеров' }));
  const close = screen.getByRole('button', { name: 'Свернуть панель' });
  expect(close.title).toBe('Свернуть панель');
  const [first, second] = screen.getAllByRole('article');
  expect(first.querySelector('header .broker-detail-controller')?.textContent).toBe('Контроллер');
  expect(first.querySelector('header .broker-detail-status')?.textContent).toBe('Онлайн');
  expect(within(first).getByText('192.0.2.2:9095')).toBeTruthy();
  const memory = first.querySelector('.broker-detail-volume.broker-metric-memory .broker-detail-volume-track');
  const disk = first.querySelector('.broker-detail-volume.broker-metric-disk .broker-detail-volume-track');
  expect(memory?.getAttribute('data-available')).toBe('false');
  expect(memory?.childElementCount).toBe(0);
  expect((disk?.firstElementChild as HTMLElement).style.width).toBe('25%');
  expect(within(first).getByText('5 / 20 GiB')).toBeTruthy();
  const zeroMemory = second.querySelector('.broker-detail-volume.broker-metric-memory .broker-detail-volume-track');
  expect(zeroMemory?.getAttribute('data-available')).toBe('true');
  expect((zeroMemory?.firstElementChild as HTMLElement).style.width).toBe('0%');
  expect(second.querySelector('.broker-detail-volume.broker-metric-disk .broker-detail-volume-track')?.childElementCount).toBe(0);
  expect(first.querySelector('.broker-detail-gauge .broker-overview-track')?.getAttribute('stroke-width')).toBe('7.25');
  fireEvent.click(close);
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Развернуть панель брокеров' }));
});
