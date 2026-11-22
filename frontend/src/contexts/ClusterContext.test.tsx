// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import { afterEach, expect, it, vi } from 'vitest';
import { ClusterProvider, useCluster } from './ClusterContext';

vi.mock('axios', () => ({ default: { post: vi.fn(), get: vi.fn() } }));

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.resetAllMocks();
});

function Controls() {
  const { currentCluster, addCluster, updateCluster } = useCluster();

  return <>
    <button onClick={() => addCluster({ brokers: 'broker-a.test:9092', authType: 'PLAINTEXT' })}>
      Создать профиль
    </button>
    <button onClick={() => {
      if (currentCluster) updateCluster({
        ...currentCluster,
        brokers: 'broker-b.test:9093,broker-c.test:9093',
        authType: 'SASL',
        saslMechanism: 'SCRAM-SHA-512',
      });
    }}>
      Сохранить профиль
    </button>
    <output>{currentCluster?.connectionStatus}</output>
  </>;
}

it('после сохранения активного профиля регистрирует новые настройки и проверяет новый bootstrap', async () => {
  const post = vi.mocked(axios.post).mockResolvedValue({});
  const get = vi.mocked(axios.get).mockResolvedValue({ data: { status: 'connected' } });
  render(<ClusterProvider><Controls /></ClusterProvider>);
  fireEvent.click(screen.getByText('Создать профиль'));
  await screen.findByText('connected');

  fireEvent.click(screen.getByText('Сохранить профиль'));

  await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
  expect(post.mock.calls[0][2]?.signal?.aborted).toBe(true);
  expect(post.mock.calls[1][1]).toMatchObject({
    brokers: 'broker-b.test:9093,broker-c.test:9093',
    authType: 'SASL',
    saslMechanism: 'SCRAM-SHA-512',
  });
  await waitFor(() => expect(get).toHaveBeenLastCalledWith('/api/clusters/health', expect.objectContaining({
    headers: { 'X-Kafka-Bootstrap': 'broker-b.test:9093,broker-c.test:9093' },
  })));
  await screen.findByText('connected');
});

it('загружает и сохраняет старый профиль с ZooKeeper, передавая backend только Kafka-настройки', async () => {
  const legacy = { id: 'legacy', name: 'Старый профиль', brokers: 'a.test:9092,b.test:9092',
    authType: 'PLAINTEXT', zookeeper: 'zk.test:2181' };
  localStorage.setItem('kafka_clusters', JSON.stringify([legacy]));
  const post = vi.mocked(axios.post).mockResolvedValue({});
  vi.mocked(axios.get).mockResolvedValue({ data: { status: 'connected' } });
  render(<ClusterProvider><Controls /></ClusterProvider>);
  await screen.findByText('connected');
  expect(post.mock.calls[0][1]).toMatchObject({ brokers: legacy.brokers, authType: legacy.authType });
  expect(post.mock.calls[0][1]).not.toHaveProperty('zookeeper');
  expect(JSON.parse(localStorage.getItem('kafka_clusters')!)[0]).toMatchObject(legacy);
});
