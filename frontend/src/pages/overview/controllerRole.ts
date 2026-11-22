export interface ControllerQuorum {
  clusterId: string;
  source: string;
  leaderId: number;
  epoch: number;
  voterIds: number[];
}

// Старый controller:boolean может быть получен из случайного Metadata.ControllerID.
// Роль показывается только по подтверждённому кворуму того же Kafka Cluster ID.
export function controllerRole(id: number, data?: { clusterId?: string; controllerQuorum?: ControllerQuorum } | null): 'active' | 'standby' | null {
  const q = data?.controllerQuorum;
  if (!data?.clusterId || q?.clusterId !== data.clusterId || q.source !== 'describe_quorum'
    || !Number.isInteger(q.epoch) || q.epoch < 0 || !Number.isInteger(q.leaderId) || q.leaderId < 0
    || !Array.isArray(q.voterIds) || q.voterIds.some(value => !Number.isInteger(value) || value < 0)
    || new Set(q.voterIds).size !== q.voterIds.length || !q.voterIds.includes(q.leaderId)) return null;
  return id === q.leaderId ? 'active' : q.voterIds.includes(id) ? 'standby' : null;
}
