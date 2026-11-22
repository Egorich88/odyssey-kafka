// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import LoadingBootstrap from './LoadingBootstrap';
import ru from '../../locales/ru/common.json';

vi.mock('../../i18n', () => ({ default: { t: (key: string) => ru.startup[key.split('.')[1] as keyof typeof ru.startup] } }));
vi.mock('../../App', () => { throw new Error('INTERNAL_CHUNK_ERROR'); });
afterEach(() => { cleanup(); document.body.innerHTML = ''; });

it('при ошибке загрузки модуля показывает безопасное сообщение и повторную попытку', async () => {
  document.body.innerHTML = '<div id="initial-splash"><div id="initial-splash-status"></div><button id="initial-splash-retry" hidden></button></div>';
  render(<LoadingBootstrap />);
  await waitFor(() => expect(document.getElementById('initial-splash-status')?.textContent).toBe(ru.startup.failed));
  expect(screen.getByRole('button', { name: ru.startup.retry })).toBeTruthy();
  expect(document.body.textContent).not.toContain('INTERNAL_CHUNK_ERROR');
});
