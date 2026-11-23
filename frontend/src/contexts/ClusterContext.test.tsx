// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import { afterEach, expect, it, vi } from 'vitest';
import { ClusterProvider, useCluster } from './ClusterContext';
vi.mock('axios', () => ({ default: { post: vi.fn(), get: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
vi.mock('react-i18next', async (original) => ({ ...await original<typeof import('react-i18next')>(), useTranslation: () => ({ t: (key: string) => key }) }));
afterEach(() => { cleanup(); localStorage.clear(); vi.resetAllMocks(); });
const first = { id: 'server-a', name: 'A', brokers: 'a.test:9092', authType: 'PLAINTEXT', revision: 1 };
function Controls() {
  const { currentCluster, clusters, addCluster, updateCluster, removeCluster, changeCluster } = useCluster();
  return <>
    <button onClick={() => void addCluster({ brokers: 'a.test:9092', password: 'synthetic-secret', authType: 'PLAINTEXT' })}>Создать</button>
    <button onClick={() => { if(currentCluster) void updateCluster({ ...currentCluster, brokers: 'b.test:9093,c.test:9093' }); }}>Сохранить</button>
    <button onClick={() => { if(currentCluster) void removeCluster(currentCluster.id); }}>Удалить</button>
    {clusters.map(p => <button key={p.id} onClick={() => changeCluster(p)}>{p.id}</button>)}
    <output>{currentCluster?.id}:{currentCluster?.connectionStatus}</output>
  </>;
}
it('сохраняет профиль на сервере и использует только profileID для health без повторной регистрации', async () => {
  const get = vi.mocked(axios.get).mockImplementation(async (url) => ({ data: url === '/api/kafka-profiles' ? [] : { status: 'connected' } }));
  vi.mocked(axios.post).mockResolvedValue({ data: first });
  vi.mocked(axios.put).mockResolvedValue({ data: { ...first, brokers: 'b.test:9093,c.test:9093', revision: 2 } });
  render(<ClusterProvider><Controls /></ClusterProvider>);
  await waitFor(() => expect(get).toHaveBeenCalledWith('/api/kafka-profiles', expect.anything()));
  fireEvent.click(screen.getByText('Создать'));
  await screen.findByText('server-a:connected');
  fireEvent.click(screen.getByText('Сохранить'));
  await waitFor(() => expect(axios.put).toHaveBeenCalledWith('/api/kafka-profiles/server-a', expect.objectContaining({ revision: 1, preserveSecrets: true }), expect.anything()));
  await waitFor(() => expect(get.mock.calls.filter(([url]) => url === '/api/clusters/health')).toHaveLength(2));
  expect(get).toHaveBeenLastCalledWith('/api/clusters/health', expect.objectContaining({ headers: { 'X-Kafka-Profile-ID': 'server-a' } }));
  expect(axios.post).toHaveBeenCalledTimes(1);
  expect(localStorage.getItem('kafka_clusters')).toBeNull();
  expect(JSON.stringify(localStorage)).not.toContain('synthetic-secret');
});
it('при ошибке удаления сохраняет профиль и показывает безопасную ошибку', async () => {
  vi.mocked(axios.get).mockImplementation(async url => ({ data: url === '/api/kafka-profiles' ? [first] : { status: 'connected' } }));
  vi.mocked(axios.delete).mockRejectedValue(new Error('synthetic internal detail'));
  render(<ClusterProvider><Controls /></ClusterProvider>);
  await screen.findByText('server-a:connected');
  fireEvent.click(screen.getByText('Удалить'));
  expect(await screen.findByRole('alert')).toBeTruthy();
  expect(screen.getByText('server-a:connected')).toBeTruthy();
  expect(screen.queryByText('synthetic internal detail')).toBeNull();
});
it('изолирует подключения с одинаковым bootstrap и отменяет прежнюю health-проверку', async () => {
  const second = { ...first, id: 'server-b', name: 'B' };
  let finish!: (value: {data: {status: string}}) => void;
  const get = vi.mocked(axios.get).mockImplementation(async (url, options) => {
    if (url === '/api/kafka-profiles') return { data: [first, second] };
    if ((options?.headers as Record<string,string>)?.['X-Kafka-Profile-ID'] === 'server-a') return new Promise(resolve => { finish = resolve; });
    return { data: { status: 'connected' } };
  });
  render(<ClusterProvider><Controls /></ClusterProvider>);
  await screen.findByText('server-a:checking');
  fireEvent.click(screen.getByText('server-b'));
  await screen.findByText('server-b:connected');
  expect(get.mock.calls.find(([url, options]) => url === '/api/clusters/health' && (options?.headers as Record<string,string>)?.['X-Kafka-Profile-ID'] === 'server-a')?.[1]?.signal?.aborted).toBe(true);
  finish({data:{status:'disconnected'}});
  await waitFor(() => expect(screen.getByText('server-b:connected')).toBeTruthy());
});

it('не редактирует частично перенесённый профиль до успешного повторного переноса', async () => {
  const legacy=JSON.stringify([{id:'old-a',brokers:'a.test:9092'},{id:'old-b',brokers:'b.test:9092'}]);
  localStorage.setItem('kafka_clusters',legacy);
  vi.mocked(axios.post).mockResolvedValueOnce({data:first}).mockRejectedValueOnce(new Error('partial'));
  vi.mocked(axios.get).mockImplementation(async url=>({data:url==='/api/kafka-profiles'?[first]:{status:'connected'}}));
  render(<ClusterProvider><Controls /></ClusterProvider>);
  await screen.findByText('server-a:connected');
  fireEvent.click(screen.getByText('Сохранить'));
  expect(axios.put).not.toHaveBeenCalled();expect(localStorage.getItem('kafka_clusters')).toBe(legacy);
  vi.mocked(axios.post).mockResolvedValue({data:first});
  fireEvent.click(screen.getByText('owner.retry'));
  await waitFor(()=>expect(localStorage.getItem('kafka_clusters')).toBeNull());
});

it('загружает и сохраняет старый профиль с ZooKeeper, передавая backend только Kafka-настройки', async () => {
  const legacy = { id: 'legacy', name: 'Старый профиль', brokers: 'a.test:9092,b.test:9092',
    authType: 'PLAINTEXT', zookeeper: 'zk.test:2181' };
  localStorage.setItem('kafka_clusters', JSON.stringify([legacy]));
  const migrated={...first,brokers:legacy.brokers};
  const post = vi.mocked(axios.post).mockResolvedValue({data:migrated});
  vi.mocked(axios.get).mockImplementation(async url=>({data:url==='/api/kafka-profiles'?[migrated]:{status:'connected'}}));
  render(<ClusterProvider><Controls /></ClusterProvider>);
  await screen.findByText('server-a:connected');
  expect(post.mock.calls[0][1]).toMatchObject({config:{brokers:legacy.brokers,authType:legacy.authType},migrationKey:'legacy:legacy'});
  expect(post.mock.calls[0][1].config).not.toHaveProperty('zookeeper');
  expect(localStorage.getItem('kafka_clusters')).toBeNull();
});

it('после отказа ошибочной записи показывает исправные профили и сохраняет выбор для использования', async () => {
  const second = { ...first, id: 'server-b' };
  const legacy = JSON.stringify([{ id: 'bad', brokers: 'rrr' }, { id: 'old-a', brokers: first.brokers }, { id: 'old-b', brokers: second.brokers }]);
  localStorage.setItem('kafka_clusters', legacy);
  localStorage.setItem('ksc_current_cluster_id', 'old-b');
  vi.mocked(axios.post).mockRejectedValueOnce({ response: { status: 403 } })
    .mockResolvedValueOnce({ data: first }).mockResolvedValueOnce({ data: second });
  vi.mocked(axios.get).mockImplementation(async url => ({ data: url === '/api/kafka-profiles' ? [first, second] : { status: 'connected' } }));
  render(<ClusterProvider><Controls /></ClusterProvider>);
  await screen.findByText('server-b:connected');
  expect(screen.getByRole('alert').textContent).toContain('owner.migrationPartial');
  expect(axios.post).toHaveBeenCalledTimes(3);
  expect(localStorage.getItem('kafka_clusters')).toBe(legacy);
  expect(localStorage.getItem('ksc_current_cluster_id')).toBe('old-b');
  fireEvent.click(screen.getByText('server-a'));
  await screen.findByText('server-a:connected');
  expect(localStorage.getItem('kafka_clusters')).toBe(legacy);
  expect(JSON.stringify(localStorage)).not.toContain('server-a');
});
