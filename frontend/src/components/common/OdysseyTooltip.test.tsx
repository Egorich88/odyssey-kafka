// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import OdysseyTooltip from './OdysseyTooltip';
import PanelInfo from './PanelInfo';

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('показывает компактную подсказку Sidebar вне обрезающего контейнера и закрывает по Escape', async () => {
  const { container } = render(<div style={{ overflow: 'hidden', height: 10 }}>
    <a href="/overview" data-tooltip-id="sidebar-tooltip" data-tooltip-content="Обзор">Обзор</a>
    <OdysseyTooltip id="sidebar-tooltip" place="right" />
  </div>);
  fireEvent.mouseOver(screen.getByRole('link'));
  const tooltip = await screen.findByRole('tooltip');
  expect(tooltip.textContent).toBe('Обзор');
  expect(container.contains(tooltip)).toBe(false);
  expect(tooltip.classList.contains('odyssey-tooltip')).toBe(true);
  fireEvent.keyDown(window, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
});

it('открывает подсказку с клавиатуры и закрывает при уходе фокуса', async () => {
  render(<>
    <button data-tooltip-id="keyboard-tooltip" data-tooltip-content="Настройки">Настройки</button>
    <OdysseyTooltip id="keyboard-tooltip" place="right" />
  </>);
  const button = screen.getByRole('button');
  fireEvent.focus(button);
  expect((await screen.findByRole('tooltip')).textContent).toBe('Настройки');
  fireEvent.blur(button);
  await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
});

it('использует общий стиль для подсказки панели и сохраняет её содержимое', async () => {
  render(<PanelInfo title="Брокеры" description="Информация о брокерах кластера" />);
  fireEvent.mouseOver(screen.getByRole('button', { name: 'Информация о панели: Брокеры' }));
  const tooltip = await screen.findByRole('tooltip');
  expect(tooltip.classList.contains('odyssey-tooltip')).toBe(true);
  expect(tooltip.textContent).toBe('БрокерыИнформация о брокерах кластера');
});
