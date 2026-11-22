// @vitest-environment jsdom
import axios from 'axios';
import { afterEach, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/dom';
import { ownerExpiredEvent, ownerFetch, setOwnerCSRF } from './ownerSession';

afterEach(() => { setOwnerCSRF(''); vi.unstubAllGlobals(); localStorage.clear(); });

it('добавляет CSRF только к изменяющим запросам собственного REST API', async () => {
  setOwnerCSRF('synthetic-csrf');
  const adapter = vi.fn(async config => ({ data: {}, status: 200, statusText: 'OK', headers: {}, config }));
  await axios.post('/api/topics', {}, { adapter });
  expect(adapter.mock.calls[0][0].headers.get('X-CSRF-Token')).toBe('synthetic-csrf');
  await axios.get('/api/topics', { adapter });
  expect(adapter.mock.calls[1][0].headers.get('X-CSRF-Token')).toBeUndefined();
  await axios.post('https://external.test/', {}, { adapter });
  expect(adapter.mock.calls[2][0].headers.get('X-CSRF-Token')).toBeUndefined();
  expect(localStorage.length).toBe(0);
});

it('fetch передаёт cookie только своему origin и CSRF для изменений', async () => {
  const fetch = vi.fn().mockResolvedValue({ status: 204 }); vi.stubGlobal('fetch', fetch);
  setOwnerCSRF('synthetic-csrf');
  await ownerFetch('/api/topics', { method: 'DELETE' });
  expect(fetch.mock.calls[0][1].credentials).toBe('same-origin');
  expect(fetch.mock.calls[0][1].headers.get('X-CSRF-Token')).toBe('synthetic-csrf');
});

it('отзыв сессии очищает CSRF в памяти и уведомляет интерфейс', async () => {
  const expired = vi.fn(); window.addEventListener(ownerExpiredEvent, expired);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 401 }));
  setOwnerCSRF('synthetic-csrf');
  try {
    await ownerFetch('/api/topics');
    expect(expired).toHaveBeenCalledOnce();
    const adapter = vi.fn(async config => ({ data: {}, status: 200, statusText: 'OK', headers: {}, config }));
    await axios.post('/api/topics', {}, { adapter });
    expect(adapter.mock.calls[0][0].headers.get('X-CSRF-Token')).toBeUndefined();
  } finally { window.removeEventListener(ownerExpiredEvent, expired); }
});

it('поздний 401 старого сеанса не отзывает новый вход владельца', async () => {
  const expired=vi.fn();window.addEventListener(ownerExpiredEvent,expired);
  let reject!: (error:unknown)=>void;
  let captured:any;
  setOwnerCSRF('synthetic-old');
  const pending=axios.get('/api/topics',{adapter:config=>{captured=config;return new Promise((_resolve,fail)=>{reject=fail;});}});
  try {
    await waitFor(()=>expect(captured).toBeTruthy());
    setOwnerCSRF('synthetic-new');
    reject({response:{status:401},config:captured});
    await expect(pending).rejects.toBeTruthy();
    expect(expired).not.toHaveBeenCalled();
    const adapter=vi.fn(async config=>({data:{},status:200,statusText:'OK',headers:{},config}));
    await axios.post('/api/topics',{}, {adapter});
    expect(adapter.mock.calls[0][0].headers.get('X-CSRF-Token')).toBe('synthetic-new');
  } finally {window.removeEventListener(ownerExpiredEvent,expired);}
});
