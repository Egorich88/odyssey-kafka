// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import axios from 'axios';
import { ClusterHealthProvider, useClusterHealth } from './ClusterHealthContext';
import { controllerRole } from '../pages/overview/controllerRole';

const state = vi.hoisted(() => ({ cluster: { id: 'A', revision: 1, connectionStatus: 'connected' }, pulse: 0 }));
vi.mock('./ClusterContext', () => ({ useCluster: () => ({ currentCluster: state.cluster }) }));
vi.mock('./DashboardControlsContext', () => ({ useDashboardControls: () => ({ refreshPulse: state.pulse }) }));
vi.mock('axios', () => ({ default: { get: vi.fn() } }));
afterEach(() => { cleanup(); vi.resetAllMocks(); state.cluster = { id: 'A', revision: 1, connectionStatus: 'connected' }; state.pulse = 0; });
const data = (cluster: string, leader: number, epoch: number) => ({ clusterId: cluster,
  controllerQuorum: { clusterId: cluster, leaderId: leader, epoch, voterIds: [1,2,3], source: 'describe_quorum' } });
function View() {
  const { data, loading } = useClusterHealth();
  return <output>{loading ? 'loading' : [1,2,3].filter(id => controllerRole(id, data) === 'active').join(',') || 'unknown'}</output>;
}
const ui = <ClusterHealthProvider><View /></ClusterHealthProvider>;
it('отменяет старый запрос A при переходе к B с теми же node.id', async () => {
  let finish!: (value: any) => void;
  vi.mocked(axios.get).mockReturnValueOnce(new Promise(resolve => { finish = resolve; })).mockResolvedValueOnce({ data: data('B',3,2) });
  const { rerender } = render(ui);
  state.cluster = { id: 'B', revision: 1, connectionStatus: 'connected' };
  await act(async () => { rerender(<ClusterHealthProvider><View /></ClusterHealthProvider>); });
  expect(screen.getByText('3')).toBeTruthy();
  await act(async () => { finish({ data: data('A',1,8) }); });
  expect(screen.getByText('3')).toBeTruthy();
  expect(vi.mocked(axios.get).mock.calls[0][1]?.signal?.aborted).toBe(true);
});
it('не применяет запоздалое переизбрание и не назначает роль при ошибке обновления', async () => {
  let finish!: (value: any) => void;
  vi.mocked(axios.get).mockResolvedValueOnce({ data: data('A',1,1) })
    .mockReturnValueOnce(new Promise(resolve => { finish = resolve; }))
    .mockResolvedValueOnce({ data: data('A',3,3) }).mockRejectedValueOnce(new Error('offline'));
  const { rerender } = render(ui);
  await screen.findByText('1');
  state.pulse++;
  await act(async () => { rerender(<ClusterHealthProvider><View /></ClusterHealthProvider>); });
  state.pulse++;
  await act(async () => { rerender(<ClusterHealthProvider><View /></ClusterHealthProvider>); });
  expect(screen.getByText('3')).toBeTruthy();
  await act(async () => { finish({ data: data('A',2,2) }); });
  expect(screen.getByText('3')).toBeTruthy();
  state.pulse++;
  await act(async () => { rerender(<ClusterHealthProvider><View /></ClusterHealthProvider>); });
  expect(screen.getByText('unknown')).toBeTruthy();
});
