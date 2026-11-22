import { readFileSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';
import { expect, it, vi } from 'vitest';

const html = readFileSync(new URL('../../../index.html', import.meta.url), 'utf8');
const logo = readFileSync(new URL('../../../public/logo.svg', import.meta.url), 'utf8');

it('содержит исходный логотип до загрузки React и единственную мятную полоску', () => {
  const page = new JSDOM(html);
  const original = new JSDOM(logo, { contentType: 'image/svg+xml' });
  expect(page.window.document.querySelector('.initial-splash-logo path')?.getAttribute('d'))
    .toBe(original.window.document.querySelector('path')?.getAttribute('d'));
  expect(page.window.document.querySelectorAll('#initial-splash')).toHaveLength(1);
  expect(page.window.document.querySelectorAll('.initial-splash-pulse')).toHaveLength(1);
  expect(page.window.document.querySelector('#initial-splash img')).toBeNull();
  page.window.close(); original.window.close();
});

it('восстанавливает тему и язык до React при первом и повторном открытии', () => {
  for (const theme of ['dark', 'light']) {
    const page = new JSDOM(html, {
      runScripts: 'dangerously', url: 'http://localhost',
      beforeParse(window) {
        window.localStorage.setItem('ksc_theme', theme);
        window.localStorage.setItem('ksc_language', 'en');
      },
    });
    expect(page.window.document.documentElement.dataset.theme).toBe(theme);
    expect(page.window.document.getElementById('initial-splash-status')?.textContent).toBe('Loading interface…');
    page.window.close();
  }
});

it('при ранней ошибке JavaScript предлагает повторную загрузку без раскрытия ошибки', () => {
  const page = new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost' });
  page.window.dispatchEvent(new page.window.ErrorEvent('error', { message: 'PRIVATE_INTERNAL_ERROR' }));
  expect(page.window.document.getElementById('initial-splash-retry')?.hidden).toBe(false);
  expect(page.window.document.getElementById('initial-splash-status')?.textContent).toContain('Не удалось запустить');
  expect(page.window.document.body.textContent).not.toContain('PRIVATE_INTERNAL_ERROR');
  page.window.close();
});

function recoveryPage(fetch: ReturnType<typeof vi.fn>, reloads = 0, language = 'ru') {
  let sequence = 0;
  const jobs = new Map<number, () => unknown>();
  const navigation = vi.fn();
  const console = new VirtualConsole();
  console.on('jsdomError', error => { if (error.message.includes('navigation')) navigation(); });
  const page = new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost', virtualConsole: console,
    beforeParse(window) {
      window.fetch = fetch;
      window.localStorage.setItem('ksc_language', language);
      window.sessionStorage.setItem('odyssey_startup_auto_reload', JSON.stringify({ count: reloads, at: Date.now() }));
      window.setTimeout = ((callback: () => unknown) => { jobs.set(++sequence, callback); return sequence; }) as typeof window.setTimeout;
      window.clearTimeout = ((id: number) => { jobs.delete(id); }) as typeof window.clearTimeout;
    },
  });
  const fail = () => page.window.dispatchEvent(new page.window.ErrorEvent('error', { message: 'PRIVATE' }));
  const next = async () => { const [id, callback] = jobs.entries().next().value!; jobs.delete(id); await callback(); };
  return { page, jobs, navigation, fail, next };
}

it('сохраняет заставку и кнопку при недоступном frontend, ограничивает число проверок', async () => {
  const fetch = vi.fn().mockRejectedValue(new Error('unavailable'));
  const { page, jobs, fail, next, navigation } = recoveryPage(fetch);
  fail(); fail();
  expect(jobs.size).toBe(1);
  for (let i = 0; i < 6; i++) await next();
  expect(fetch).toHaveBeenCalledTimes(6);
  expect(jobs.size).toBe(0); expect(navigation).not.toHaveBeenCalled();
  expect(page.window.document.querySelectorAll('.initial-splash-pulse')).toHaveLength(1);
  expect(page.window.document.getElementById('initial-splash-retry')?.hidden).toBe(false);
  expect(page.window.document.getElementById('initial-splash-status')?.textContent).toBe('Не удалось запустить интерфейс Odyssey.\nПопробуйте перезагрузить страницу.');
  page.window.close();
});

it('перезагружает страницу только после доступности JS и прекращает автоматические перезагрузки после лимита', async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: true, headers: { get: () => 'text/javascript' } });
  const first = recoveryPage(fetch, 0, 'en');
  first.fail(); await first.next();
  expect(fetch).toHaveBeenCalledWith('http://localhost/src/main.tsx', expect.objectContaining({ method: 'HEAD', cache: 'no-store' }));
  expect(first.navigation).toHaveBeenCalledOnce();
  expect(JSON.parse(first.page.window.sessionStorage.getItem('odyssey_startup_auto_reload')!).count).toBe(1);
  expect(first.page.window.document.getElementById('initial-splash-status')?.textContent).toContain('\nTry reloading');
  first.page.window.close();
  const limited = recoveryPage(fetch, 2);
  limited.fail(); expect(limited.jobs.size).toBe(0);
  expect(limited.page.window.document.getElementById('initial-splash-retry')?.hidden).toBe(false);
  limited.page.window.close();
});

it('не принимает HTML вместо JS и останавливает восстановление после запуска интерфейса', async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: true, headers: { get: () => 'text/html' } });
  const { page, jobs, fail, next, navigation } = recoveryPage(fetch);
  fail(); await next(); expect(navigation).not.toHaveBeenCalled();
  page.window.dispatchEvent(new page.window.Event('odyssey-startup-ready'));
  expect(jobs.size).toBe(0);
  expect(page.window.sessionStorage.getItem('odyssey_startup_auto_reload')).toBeNull();
  page.window.close();
});
