// @vitest-environment jsdom
import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { StrictMode } from 'react';
import axios from 'axios';
import LoadingBootstrap, { StartupBoundary } from './LoadingBootstrap';
import { completeStartup, setStartupStatus, showStartupError } from './startup';
import { useLoading } from './hooks/useLoading';
import ru from '../../locales/ru/common.json';

const scenario = vi.hoisted(() => ({ crash: false, reduced: false }));
vi.mock('../../i18n', () => ({ default: { t: (key: string) => ru.startup[key.split('.')[1] as keyof typeof ru.startup] } }));
vi.mock('axios', () => ({ default: { get: vi.fn(() => new Promise(() => {})) } }));
vi.mock('../../App', () => ({ default: () => {
  if (scenario.crash) throw new Error('PRIVATE_INTERNAL_DETAIL');
  return <button>Настройки</button>;
} }));

beforeEach(() => {
  scenario.crash = false;
  scenario.reduced = false;
  vi.stubGlobal('matchMedia', () => ({ matches: scenario.reduced }));
  document.body.innerHTML = '<div id="initial-splash"><div id="initial-splash-status"></div><button id="initial-splash-retry" hidden></button></div><div id="root"></div>';
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); document.body.innerHTML = ''; });

it('не ждёт backend или Kafka при подготовке приложения', async () => {
  const { result } = renderHook(() => useLoading());
  expect(document.getElementById('initial-splash-status')?.textContent).toBe(ru.startup.workspace);
  await waitFor(() => expect(result.current.App).not.toBeNull());
  expect(result.current.failed).toBe(false);
  expect(axios.get).not.toHaveBeenCalled();
});

it('монтирует интерфейс под единственной заставкой и плавно открывает его в StrictMode', async () => {
  render(<StrictMode><StartupBoundary><LoadingBootstrap /></StartupBoundary></StrictMode>, { container: document.getElementById('root')! });
  expect(await screen.findByRole('button', { name: 'Настройки' })).toBeTruthy();
  await waitFor(() => expect(document.getElementById('root')?.classList.contains('is-ready')).toBe(true));
  const splash = document.getElementById('initial-splash')!;
  expect(document.querySelectorAll('#initial-splash')).toHaveLength(1);
  expect(splash.classList.contains('is-leaving')).toBe(true);
  expect(document.getElementById('initial-splash-status')?.textContent).toBe(ru.startup.ready);
  act(() => {
    const event = new Event('transitionend');
    Object.defineProperty(event, 'propertyName', { value: 'opacity' });
    splash.dispatchEvent(event);
  });
  expect(document.getElementById('initial-splash')).toBeNull();
});

it('при reduced motion открывает интерфейс без ожидания анимации', async () => {
  scenario.reduced = true;
  const dispose = completeStartup();
  await waitFor(() => expect(document.getElementById('initial-splash')).toBeNull());
  expect(document.getElementById('root')?.classList.contains('is-ready')).toBe(true);
  dispose();
});

it('показывает понятную ошибку и повторную загрузку без технических подробностей', async () => {
  scenario.crash = true;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  render(<StartupBoundary><LoadingBootstrap /></StartupBoundary>, { container: document.getElementById('root')! });
  await waitFor(() => expect(document.getElementById('initial-splash-status')?.textContent).toBe(ru.startup.failed));
  expect(screen.getByRole('button', { name: ru.startup.retry })).toBeTruthy();
  expect(document.body.textContent).not.toContain('PRIVATE_INTERNAL_DETAIL');
  expect(document.getElementById('initial-splash')).not.toBeNull();
});

it('обновляет реальные этапы без изменения структуры заставки', () => {
  const splash = document.getElementById('initial-splash');
  setStartupStatus('settings');
  expect(document.getElementById('initial-splash-status')?.textContent).toBe(ru.startup.settings);
  setStartupStatus('workspace');
  expect(document.getElementById('initial-splash-status')?.textContent).toBe(ru.startup.workspace);
  expect(document.getElementById('initial-splash')).toBe(splash);
  showStartupError();
  expect(document.getElementById('initial-splash-retry')?.hidden).toBe(false);
});
