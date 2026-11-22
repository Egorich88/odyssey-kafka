import type { KafkaCluster } from '../../contexts/ClusterContext';

// Служебный статус соединения обновляется отдельно от настроек профиля.
export function isSameHealthProfile(left: KafkaCluster | null, right: KafkaCluster | null): boolean {
  if (left === right) return true;
  if (!left || !right) return false;

  const profileKeys = (profile: KafkaCluster) => Object.keys(profile)
    .filter((key) => key !== 'connectionStatus');
  const keys = profileKeys(left);
  return keys.length === profileKeys(right).length
    && keys.every((key) => Object.prototype.hasOwnProperty.call(right, key) && Object.is(left[key], right[key]));
}


interface BrokerIdentity {
  id: number;
  address: string;
}

interface BrokerHealthSnapshot {
  clusterId?: string;
  status?: string;
  brokers?: BrokerIdentity[] | null;
}

// При неполном ответе сохраняем только известные из Kafka ID и адреса.
export function retainBrokerList(snapshot: BrokerHealthSnapshot | null, previous: BrokerHealthSnapshot | null) {
  if (snapshot?.clusterId && previous?.clusterId && snapshot.clusterId !== previous.clusterId) return snapshot;
  if ((snapshot && snapshot.status !== 'unknown') || !previous?.brokers?.length) return snapshot;

  const current = snapshot?.brokers ?? [];
  const received = new Set(current.map(({ id }) => id));
  const missing = previous.brokers.filter(({ id }) => !received.has(id));
  if (missing.length === 0) return snapshot;

  return {
    ...snapshot,
    status: 'unknown',
    brokers: [
      ...current,
      ...missing.map(({ id, address }) => ({ id, address, brokerStatus: 'unknown' })),
    ],
  };
}
