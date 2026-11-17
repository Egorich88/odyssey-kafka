// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import ru from '../../../locales/ru/common.json';
import BrokersPanel from './BrokersPanel';
import PanelFullscreenButton from './PanelFullscreenButton';

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
