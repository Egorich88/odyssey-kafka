// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Dropdown from './Dropdown';
import ThemeDropdown from './ThemeDropdown';
import ru from '../../locales/ru/common.json';

vi.mock('react-i18next', async (original) => ({ ...await original<typeof import('react-i18next')>(), useTranslation: () => ({
  t: (key: string) => key.split('.').reduce((value: any, part) => value?.[part], ru) ?? key,
}) }));

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    disconnect() {}
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    top: 100, bottom: 140, left: 100, right: 320, width: 220, height: 40,
    x: 100, y: 100, toJSON() {},
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const items = [{ id: 'a', name: 'Первый' }, { id: 'b', name: 'Второй' }];

it('сохраняет отступ, выбор кластера, добавление и закрытие меню', () => {
  const select = vi.fn();
  const add = vi.fn();
  const { container } = render(<Dropdown floating selectedItem={items[0]} items={[items[1]]}
    onSelect={select} onAdd={add} addLabel="+ Добавить кластер" />);
  const trigger = screen.getByRole('button', { name: 'Первый' });
  fireEvent.click(trigger);
  expect((container.querySelector('.dropdown-menu') as HTMLElement).style.top).toBe('148px');
  fireEvent.click(screen.getByText('Второй'));
  expect(select).toHaveBeenCalledWith(items[1]);
  fireEvent.click(trigger);
  fireEvent.keyDown(trigger, { key: 'Escape' });
  expect(screen.queryByText('Второй')).toBeNull();
  expect(document.activeElement).toBe(trigger);
  fireEvent.click(trigger);
  fireEvent.mouseDown(document.body);
  expect(screen.queryByText('Второй')).toBeNull();
  fireEvent.click(trigger);
  fireEvent.click(screen.getByText('+ Добавить кластер'));
  expect(add).toHaveBeenCalledTimes(1);
});

it('сохраняет разделители тем и ограничивает меню границами окна', () => {
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(500);
  vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockReturnValue({
    top: 700, bottom: 740, left: 1000, right: 1220, width: 220, height: 40,
    x: 1000, y: 700, toJSON() {},
  });
  const select = vi.fn();
  render(<ThemeDropdown selectedItem={items[0]} items={[items[0], { type: 'divider' }, items[1]]} onSelect={select} />);
  const trigger = screen.getByRole('button', { name: 'Первый' });
  fireEvent.click(trigger);
  const menu = screen.getByRole('listbox');
  expect(menu.style.top).toBe('auto');
  expect(menu.style.bottom).toBe('76px');
  expect(menu.style.left).toBe('796px');
  expect(screen.getByRole('separator')).toBeTruthy();
  fireEvent.click(screen.getByRole('option', { name: 'Второй' }));
  expect(select).toHaveBeenCalledWith(items[1]);
  fireEvent.click(trigger);
  fireEvent.keyDown(trigger, { key: 'Escape' });
  expect(screen.queryByRole('listbox')).toBeNull();
  fireEvent.click(trigger);
  fireEvent.mouseDown(document.body);
  expect(screen.queryByRole('listbox')).toBeNull();
});

it('показывает единственное активное подключение обычным пунктом без вложенности', () => {
  render(<Dropdown connections selectedItem={items[0]} items={[items[0]]} onSelect={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Первый' }));
  const option = screen.getByRole('menuitemradio');
  expect(option.getAttribute('aria-checked')).toBe('true');
  expect(option.textContent).toContain('Активно');
  expect(option.textContent).toContain('PLAINTEXT');
  expect(screen.queryByRole('button', { expanded: false })).toBeNull();
});

it('не объединяет одинаковые имена или bootstrap без достоверного Kafka Cluster ID', () => {
  const profiles = [
    { id: 'a', name: 'Production Kafka', brokers: 'test:9092', authType: 'MTLS', connectionStatus: 'connected' },
    { id: 'b', name: 'Production Kafka', brokers: 'test:9092', authType: 'SASL', connectionStatus: 'error' },
    { id: 'c', name: 'Production Kafka', brokers: 'test:9092', authType: 'PLAINTEXT', connectionStatus: 'unknown' },
  ];
  const select = vi.fn();
  render(<Dropdown connections selectedItem={profiles[0]} items={profiles} onSelect={select}
    statusResolver={(profile: any) => profile.connectionStatus} />);
  fireEvent.click(screen.getByRole('button', { name: 'Production Kafka' }));
  const options = screen.getAllByRole('menuitemradio');
  expect(options).toHaveLength(3);
  expect(options.map(option => option.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false']);
  expect(options[0].textContent).toContain('mTLS');
  expect(options[1].querySelector('.dropdown-status-dot.error')).toBeTruthy();
  fireEvent.click(options[1]);
  expect(select).toHaveBeenCalledWith(profiles[1]);
  expect(screen.queryByRole('menu')).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Production Kafka' }));
});

it('сохраняет отдельные профили при одинаковых названиях, изменении и удалении записи', () => {
  const profiles = [
    { id: 'a', name: 'Kafka', authType: 'SASL', password: 'synthetic-test-password' },
    { id: 'b', name: 'Kafka', authType: 'MTLS' },
    { id: 'c', name: 'Development Kafka', authType: 'PLAINTEXT' },
  ];
  const { rerender } = render(<Dropdown connections selectedItem={profiles[0]} items={profiles} onSelect={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Kafka' }));
  expect(screen.getAllByRole('menuitemradio')).toHaveLength(3);
  expect(document.body.textContent).not.toContain('synthetic-test-password');
  rerender(<Dropdown connections selectedItem={profiles[0]} items={[profiles[0], profiles[2]]} onSelect={vi.fn()} />);
  expect(screen.getAllByRole('menuitemradio')).toHaveLength(2);
  expect(screen.queryByText('mTLS')).toBeNull();
  expect(profiles).toHaveLength(3);
});

it('поддерживает стрелки, Escape и возврат фокуса в меню подключений', () => {
  const select = vi.fn();
  render(<Dropdown connections selectedItem={items[0]} items={items} onSelect={select} />);
  const trigger = screen.getByRole('button', { name: 'Первый' });
  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  const options = screen.getAllByRole('menuitemradio');
  expect(document.activeElement).toBe(options[0]);
  fireEvent.keyDown(options[0], { key: 'ArrowDown' });
  expect(document.activeElement).toBe(options[1]);
  fireEvent.keyDown(options[1], { key: 'Home' });
  expect(document.activeElement).toBe(options[0]);
  fireEvent.keyDown(options[0], { key: 'Escape' });
  expect(screen.queryByRole('menu')).toBeNull();
  expect(document.activeElement).toBe(trigger);
  fireEvent.keyDown(trigger, { key: 'ArrowUp' });
  expect(document.activeElement).toBe(screen.getAllByRole('menuitemradio')[1]);
});
