// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import CreateClusterPanel from './CreateClusterPanel';
import ClusterSettingsPanel from './ClusterSettingsPanel';

afterEach(cleanup);

it('создаёт профиль через bootstrap без поля ZooKeeper', () => {
  const save = vi.fn();
  const { container } = render(<CreateClusterPanel onSave={save} onCancel={vi.fn()} />);
  expect(screen.queryByText(/Zookeeper/i)).toBeNull();
  fireEvent.change(container.querySelector('input[name="name"]')!, { target: { value: 'Тестовый кластер' } });
  fireEvent.change(container.querySelector('input[name="brokers"]')!, { target: { value: 'a.test:9092,b.test:9092' } });
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
  expect(save.mock.calls[0][0]).toMatchObject({ brokers: 'a.test:9092,b.test:9092', authType: 'PLAINTEXT' });
  expect(save.mock.calls[0][0]).not.toHaveProperty('zookeeper');
});

it('сохраняет старый профиль без потери настроек и без редактирования ZooKeeper', () => {
  const save = vi.fn();
  const cluster = { id: 'old', name: 'Старый кластер', brokers: 'a.test:9093,b.test:9093',
    zookeeper: 'zk.test:2181', authType: 'SASL', saslMechanism: 'SCRAM-SHA-512',
    username: 'synthetic-user', password: 'synthetic-password' };
  const { container } = render(<ClusterSettingsPanel cluster={cluster} onSave={save}
    onCancel={vi.fn()} onDelete={vi.fn()} />);
  expect(container.querySelector('[name="zookeeper"]')).toBeNull();
  fireEvent.change(container.querySelector('input[name="name"]')!, { target: { value: 'Новое имя' } });
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить изменения' }));
  expect(save).toHaveBeenCalledWith({ ...cluster, name: 'Новое имя' });
});
