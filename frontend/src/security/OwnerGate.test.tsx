// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import axios from 'axios';
import OwnerGate from './OwnerGate';
vi.mock('axios', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('./ownerSession', () => ({ setOwnerCSRF: vi.fn(), ownerExpiredEvent:'odyssey-owner-session-expired' }));
vi.mock('react-i18next', async (original) => ({ ...await original<typeof import('react-i18next')>(), useTranslation: () => ({ t:(key:string)=>key }) }));
afterEach(() => { cleanup();vi.resetAllMocks();localStorage.clear(); });
it('не монтирует Kafka-интерфейс до входа, очищает пароль и позволяет выйти', async () => {
  vi.mocked(axios.get).mockRejectedValue(new Error('unauthorized'));
  vi.mocked(axios.post).mockResolvedValue({data:{csrfToken:'synthetic-csrf'}});
  render(<OwnerGate><p>Рабочая область</p></OwnerGate>);
  const input=await screen.findByLabelText('owner.password');
  expect(screen.queryByText('Рабочая область')).toBeNull();
  fireEvent.change(input,{target:{value:'synthetic-owner-password'}});
  fireEvent.click(screen.getByRole('button',{name:'owner.signIn'}));
  await screen.findByText('Рабочая область');
  expect(JSON.stringify(localStorage)).not.toContain('synthetic');
  fireEvent.click(screen.getByRole('button',{name:'owner.signOut'}));
  await screen.findByLabelText('owner.password');
  expect(screen.queryByText('Рабочая область')).toBeNull();
});
it('при ошибке входа показывает безопасное сообщение без серверных подробностей', async () => {
  vi.mocked(axios.get).mockRejectedValue(new Error('unavailable'));
  vi.mocked(axios.post).mockRejectedValue(new Error('synthetic-private-detail'));
  render(<OwnerGate>private</OwnerGate>);
  const input=await screen.findByLabelText<HTMLInputElement>('owner.password');
  fireEvent.change(input,{target:{value:'synthetic-owner-password'}});fireEvent.click(screen.getByRole('button',{name:'owner.signIn'}));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent','owner.error');
  await waitFor(()=>expect(input.value).toBe(''));
  expect(screen.queryByText('synthetic-private-detail')).toBeNull();
});
