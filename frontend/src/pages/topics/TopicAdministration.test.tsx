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
