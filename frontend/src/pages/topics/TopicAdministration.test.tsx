// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import axios from 'axios';
import TopicToolbar from './components/TopicToolbar';
import TopicDetailsPanel from './components/TopicDetailsPanel';
import { useTopics } from './hooks/useTopics';
import { useTopicPermissions } from './hooks/useTopicPermissions';
import ru from '../../locales/ru/common.json';

const source = vi.hoisted(() => ({ cluster: { id: 'a', brokers: 'test.invalid:9092' } }));
vi.mock('../../contexts/ClusterContext', () => ({ useCluster: () => ({ currentCluster: source.cluster }) }));
vi.mock('axios', () => ({ default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } }));
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({
  t: (key: string) => key.split('.').reduce((value: any, part) => value?.[part], ru) ?? key,
}) }));
afterEach(() => { cleanup(); vi.resetAllMocks(); vi.restoreAllMocks(); });

const toolbarProps = {
  filter: '', setFilter: vi.fn(), showExportMenu: false, setShowExportMenu: vi.fn(),
  selectedTopics: [], exportMenuRef: { current: null }, exportTopicsList: vi.fn(), exportTopicsConfig: vi.fn(),
  setShowCreateModal: vi.fn(), selectedTopic: { name: 'test' }, handleDeleteTopic: vi.fn(),
};

it('показывает создание и удаление недоступными, сохраняя поиск и экспорт', () => {
  render(<TopicToolbar {...toolbarProps} />);
  const create = screen.getByRole('button', { name: 'Создать' }) as HTMLButtonElement;
  const remove = screen.getByRole('button', { name: 'Удалить' }) as HTMLButtonElement;
  expect(create.disabled).toBe(true);
  expect(remove.disabled).toBe(true);
  expect(create.title).toBe(ru.adminPermissions.readOnly);
  fireEvent.click(create); fireEvent.click(remove);
  expect(toolbarProps.setShowCreateModal).not.toHaveBeenCalled();
  expect(toolbarProps.handleDeleteTopic).not.toHaveBeenCalled();
  expect((screen.getByRole('button', { name: /Экспорт/ }) as HTMLButtonElement).disabled).toBe(false);
  expect(screen.getByPlaceholderText('Поиск топика...')).toBeTruthy();
});

it('сохраняет чтение конфигурации, но не предлагает редактирование без разрешения', () => {
  const edit = vi.fn();
  render(<TopicDetailsPanel detailTopic={{ name: 'test', configs: { 'retention.ms': '60000' } }}
    closePanel={vi.fn()} setSelectedConfigParam={vi.fn()} editingParam="retention.ms"
    handleConfigDoubleClick={edit} handleSaveEdit={vi.fn()} handleCancelEdit={vi.fn()} />);
  fireEvent.doubleClick(screen.getByText('60000'));
  expect(edit).not.toHaveBeenCalled();
  expect(screen.getByText(ru.adminPermissions.readOnly)).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Сохранить' })).toBeNull();
  expect(screen.getByText('test')).toBeTruthy();
});

it('по умолчанию блокирует прямой вызов обработчиков без запросов записи и подтверждений', async () => {
  vi.mocked(axios.get).mockResolvedValue({ data: { topics: [], kafkaAdmin: {} } });
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
  const { result } = renderHook(() => useTopics());
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => {
    await result.current.handleCreateTopic({ preventDefault: vi.fn() });
    await result.current.handleDeleteTopic();
    result.current.handleConfigDoubleClick('retention.ms', '1');
    await result.current.handleSaveEdit();
  });
  expect(result.current.editingParam).toBeNull();
  expect(axios.post).not.toHaveBeenCalled();
  expect(axios.patch).not.toHaveBeenCalled();
  expect(axios.delete).not.toHaveBeenCalled();
  expect(confirm).not.toHaveBeenCalled();
});

it('ошибка capabilities и некорректные значения разрешений оставляют UI закрытым', async () => {
  vi.mocked(axios.get).mockRejectedValueOnce(new Error('test unavailable'));
  const { result, unmount } = renderHook(() => useTopicPermissions(source.cluster));
  await act(async () => {});
  expect(Object.values(result.current.permissions)).toEqual([false, false, false]);
  unmount();
  vi.mocked(axios.get).mockResolvedValue({ data: { kafkaAdmin: { createTopic: 'true', deleteTopic: 1, alterTopicConfig: null } } });
  const next = renderHook(() => useTopicPermissions(source.cluster));
  await act(async () => {});
  expect(Object.values(next.result.current.permissions)).toEqual([false, false, false]);
});

it('игнорирует запоздавшие разрешения предыдущего профиля', async () => {
  let finishA!: (value: any) => void;
  let finishB!: (value: any) => void;
  vi.mocked(axios.get).mockReturnValueOnce(new Promise(resolve => { finishA = resolve; }))
    .mockReturnValueOnce(new Promise(resolve => { finishB = resolve; }));
  const { result, rerender } = renderHook(({ profile }) => useTopicPermissions(profile), { initialProps: { profile: source.cluster } });
  rerender({ profile: { id: 'b', brokers: 'other.invalid:9092' } });
  expect(vi.mocked(axios.get).mock.calls[0][1]?.signal?.aborted).toBe(true);
  await act(async () => { finishA({ data: { kafkaAdmin: { createTopic: true, deleteTopic: true, alterTopicConfig: true } } }); });
  expect(Object.values(result.current.permissions)).toEqual([false, false, false]);
  await act(async () => { finishB({ data: { kafkaAdmin: {} } }); });
  expect(Object.values(result.current.permissions)).toEqual([false, false, false]);
});

it('после 403 отзывает устаревшее разрешение и прекращает повторные попытки записи', async () => {
  vi.mocked(axios.get).mockImplementation(async (url) => ({ data: url === '/api/capabilities'
    ? { kafkaAdmin: { createTopic: true, deleteTopic: true, alterTopicConfig: true } } : { topics: [] } }));
  vi.mocked(axios.post).mockRejectedValue({ response: { status: 403 } });
  const { result } = renderHook(() => useTopics());
  await waitFor(() => expect(result.current.permissions.createTopic).toBe(true));
  act(() => result.current.setNewTopic({ ...result.current.newTopic, topic: 'test-topic' }));
  await act(async () => { await result.current.handleCreateTopic({ preventDefault: vi.fn() }); });
  expect(Object.values(result.current.permissions)).toEqual([false, false, false]);
  await act(async () => { await result.current.handleCreateTopic({ preventDefault: vi.fn() }); });
  expect(axios.post).toHaveBeenCalledTimes(1);
});

it('не выводит AxiosError с CSRF или телом запроса в консоль', async () => {
  vi.mocked(axios.get).mockImplementation(async url => ({ data: url === '/api/capabilities'
    ? { kafkaAdmin: { createTopic: true } } : { topics: [] } }));
  vi.mocked(axios.post).mockRejectedValue({ response: { status: 400 }, config: {
    headers: { 'X-CSRF-Token': 'synthetic-private-csrf' }, data: 'synthetic-private-payload',
  } });
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const { result } = renderHook(() => useTopics());
  await waitFor(() => expect(result.current.permissions.createTopic).toBe(true));
  act(() => result.current.setNewTopic({ ...result.current.newTopic, topic: 'test-topic' }));
  await act(async () => { await result.current.handleCreateTopic({ preventDefault: vi.fn() }); });
  expect(log).toHaveBeenCalled();
  expect(JSON.stringify(log.mock.calls)).not.toContain('synthetic-private');
});

it('изолирует выбор и запоздавшие ответы профилей с одинаковым bootstrap', async () => {
  const previous=source.cluster;
  let listA!: (value:any)=>void, listB!: (value:any)=>void, detailsA!: (value:any)=>void;
  source.cluster={id:'profile-a',brokers:'shared.test:9092'};
  vi.mocked(axios.get).mockImplementation((url,options) => {
    if(url==='/api/capabilities') return Promise.resolve({data:{kafkaAdmin:{deleteTopic:true,alterTopicConfig:true}}});
    const id=(options?.headers as Record<string,string>)?.['X-Kafka-Profile-ID'];
    if(url==='/api/topics/') return new Promise(resolve=>{if(id==='profile-a') listA=resolve;else listB=resolve;});
    return new Promise(resolve=>{detailsA=resolve;});
  });
  const confirm=vi.spyOn(window,'confirm').mockReturnValue(true);
  try {
    const {result,rerender}=renderHook(()=>useTopics());
    await waitFor(()=>expect(result.current.permissions.deleteTopic).toBe(true));
    act(()=>result.current.handleRowClick({name:'only-a'}));
    const oldDelete=result.current.handleDeleteTopic;
    source.cluster={id:'profile-b',brokers:'shared.test:9092'};
    rerender();
    await waitFor(()=>expect(result.current.permissions.deleteTopic).toBe(true));
    expect(result.current.selectedTopic).toBeNull();
    await act(async()=>{listB({data:{topics:[{name:'only-b'}]}});});
    await act(async()=>{listA({data:{topics:[{name:'only-a'}]}});detailsA({data:{name:'only-a',configs:{}}});});
    expect(result.current.topics.map(p=>p.name)).toEqual(['only-b']);
    expect(result.current.detailTopic).toBeNull();
    await act(async()=>{await oldDelete();});
    expect(confirm).not.toHaveBeenCalled();expect(axios.delete).not.toHaveBeenCalled();
  } finally {source.cluster=previous;}
});

it('передаёт ожидаемую ревизию при записи и отзывает права после конфликта профиля', async () => {
  const previous=source.cluster;
  source.cluster=Object.assign({...previous},{revision:7});
  vi.mocked(axios.get).mockImplementation(async url=>({data:url==='/api/capabilities'?{kafkaAdmin:{createTopic:true}}:{topics:[]}}));
  vi.mocked(axios.post).mockRejectedValue({response:{status:409}});
  try {
    const {result}=renderHook(()=>useTopics());
    await waitFor(()=>expect(result.current.permissions.createTopic).toBe(true));
    act(()=>result.current.setNewTopic({...result.current.newTopic,topic:'test-topic'}));
    await act(async()=>{await result.current.handleCreateTopic({preventDefault:vi.fn()});});
    expect(axios.post).toHaveBeenCalledWith('/api/topics',expect.anything(),expect.objectContaining({headers:expect.objectContaining({
      'X-Kafka-Profile-ID':source.cluster.id,'X-Kafka-Profile-Revision':'7',
    })}));
    expect(result.current.permissions.createTopic).toBe(false);
  } finally {source.cluster=previous;}
});

it('не открывает закрытые детали после завершения сохранения конфигурации', async () => {
  vi.mocked(axios.get).mockImplementation(async url=>({data:url==='/api/capabilities'
    ? {kafkaAdmin:{alterTopicConfig:true}} : url==='/api/topics/' ? {topics:[]} : {name:'test-topic',configs:{'retention.ms':'1'}}}));
  let finish!: (value:unknown)=>void;
  vi.mocked(axios.patch).mockReturnValue(new Promise(resolve=>{finish=resolve;}));
  const {result}=renderHook(()=>useTopics());
  await waitFor(()=>expect(result.current.permissions.alterTopicConfig).toBe(true));
  act(()=>result.current.handleRowClick({name:'test-topic'}));
  await waitFor(()=>expect(result.current.detailTopic?.name).toBe('test-topic'));
  act(()=>result.current.handleConfigDoubleClick('retention.ms','1'));
  act(()=>result.current.setEditValue('2'));
  let saving!: Promise<void>;
  act(()=>{saving=result.current.handleSaveEdit();});
  act(()=>result.current.closePanel());
  await act(async()=>{finish({});await saving;});
  expect(result.current.detailTopic).toBeNull();
});
