// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import PageHeader from './PageHeader';
import ru from '../../locales/ru/common.json';

const controls = vi.hoisted(() => ({
  timeRange: { type: 'relative', id: '15m', label: '15 минут' }, refreshInterval: 0,
  isRefreshing: false, pageLoading: false, setTimeRange: vi.fn(), setRefreshInterval: vi.fn(), refreshNow: vi.fn(),
}));
vi.mock('../../contexts/DashboardControlsContext', () => ({ useDashboardControls: () => controls }));
vi.mock('./HeaderClusterStatus', () => ({ default: () => null }));
vi.mock('react-i18next', async (original) => ({ ...await original<typeof import('react-i18next')>(), useTranslation: () => ({
  t: (key: string) => key.split('.').reduce((value: any, part) => value?.[part], ru),
}) }));
beforeEach(() => vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

it('показывает общие подсказки всех трёх контролов и сохраняет ручное обновление', async () => {
  render(<PageHeader title="" description="" mode="monitoring" />);
  for (const name of Object.values(ru.headerControls)) {
    const button = screen.getByRole('button', { name });
    expect(button.getAttribute('title')).toBeNull();
    fireEvent.mouseOver(button);
    expect((await screen.findByRole('tooltip')).textContent).toBe(name);
    fireEvent.mouseOut(button);
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
  }
  fireEvent.click(screen.getByRole('button', { name: ru.headerControls.refresh }));
  expect(controls.refreshNow).toHaveBeenCalledOnce();
});

it('скрывает подсказку при открытии меню, сохраняя обработчики выбора', async () => {
  render(<PageHeader title="" description="" mode="monitoring" />);
  const button = screen.getByRole('button', { name: ru.headerControls.interval });
  fireEvent.focus(button);
  await screen.findByRole('tooltip');
  fireEvent.click(button);
  await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
  const options = screen.getAllByRole('option');
  fireEvent.click(options[1]);
  expect(controls.setRefreshInterval).toHaveBeenCalledOnce();
});
