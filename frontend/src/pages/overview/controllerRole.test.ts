import { expect, it } from 'vitest';
import { controllerRole } from './controllerRole';
import { retainBrokerList } from './clusterHealthProfile';
import en from '../../locales/en/common.json';

const quorum = { clusterId: 'A', source: 'describe_quorum', leaderId: 2, epoch: 4, voterIds: [1,2,3] };
it('определяет три роли по ID, независимо от порядка списка', () => {
  expect([3,2,1,7].map(id => controllerRole(id, { clusterId: 'A', controllerQuorum: quorum }))).toEqual(['standby','active','standby',null]);
  expect(en.brokerOverview.controller).toBe('Active Controller');
  expect(en.brokerOverview.standbyController).toBe('Standby Controller');
});
it('не доверяет чужому Cluster ID, ошибке, неизвестному лидеру и дубликатам', () => {
  expect(controllerRole(2, null)).toBeNull();
  expect(controllerRole(2, { clusterId: 'B', controllerQuorum: quorum })).toBeNull();
  for (const change of [{ leaderId: -1 }, { leaderId: 9 }, { epoch: -1 }, { voterIds: [1,2,2] }, { source: 'metadata' }]) {
    expect(controllerRole(2, { clusterId: 'A', controllerQuorum: { ...quorum, ...change } })).toBeNull();
  }
});
it('не переносит известные broker.id между разными Kafka Cluster ID', () => {
  const previous = { clusterId: 'A', brokers: [{ id: 1, address: 'a:9092' }] };
  const incoming = { clusterId: 'B', status: 'unknown', brokers: [{ id: 2, address: 'b:9092' }] };
  expect(retainBrokerList(incoming, previous)).toBe(incoming);
});
