/*
 * Copyright 2026 Egor Khomenko (Egorich88)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * @file ClusterHealthPanel.tsx
 * @description Единая строка семи показателей текущего Kafka-кластера.
 */

import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useClusterHealth } from '../../../contexts/ClusterHealthContext';

interface Props {
  refreshKey: number;
  overview: any;
  consumerGroups?: unknown[];
  consumerGroupsPartial?: boolean;
  messagesIn: number | null;
  messagesOut: number | null;
  onData?: (data: any) => void;
}

const valid = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;

export default function ClusterHealthPanel({ overview, consumerGroups, consumerGroupsPartial, messagesIn, messagesOut, onData }: Props): JSX.Element {
  const { data, loading } = useClusterHealth();
  const { t, i18n } = useTranslation();
  useEffect(() => { if (!loading) onData?.(data); }, [data, loading, onData]);
  const unavailable = t('brokerOverview.unavailable');
  const counts = new Intl.NumberFormat(i18n.language);
  const rates = new Intl.NumberFormat(i18n.language, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const number = (value: unknown) => valid(value) ? counts.format(value) : unavailable;
  const rate = (value: unknown) => valid(value) ? `${rates.format(value)} msg/s` : unavailable;
  const partitionCount = data?.partitionsTotal ?? overview?.partitions ?? overview?.partitionCount;
  const topicCount = overview?.topics ?? overview?.topicCount;
  const listedCount = consumerGroups?.length;
  const overviewCount = valid(overview?.consumerGroups) ? overview.consumerGroups : undefined;
  const exactGroupCount = (!consumerGroupsPartial ? listedCount : undefined)
    ?? (!overview?.consumerGroupsPartial ? overviewCount : undefined);
  const knownGroupCount = Math.max(listedCount ?? 0, overviewCount ?? 0);
  const groupCount = exactGroupCount != null ? number(exactGroupCount)
    : knownGroupCount > 0 ? `≥ ${number(knownGroupCount)}` : unavailable;
  const underReplicated = data?.underReplicated ?? overview?.underReplicated;
  const metrics = [
    ['brokers', number(data?.brokerCount)],
    ['topics', number(topicCount)],
    ['partitions', number(partitionCount)],
    ['groups', groupCount],
    ['incoming', rate(messagesIn)],
    ['outgoing', rate(messagesOut)],
    ['urp', number(underReplicated)],
  ];

  return <section className="dashboard-panel cluster-health-panel" aria-label={t('clusterKpi.title')}>
    <div className="cluster-health-summary" tabIndex={0} aria-label={t('clusterKpi.title')}>
      <div className="cluster-kpi-grid" role="list">
        {metrics.map(([key, value], index) => <div className={`cluster-kpi${key === 'urp' && valid(underReplicated) && underReplicated > 0 ? ' is-danger' : ''}`} role="listitem" key={key}>
          {index > 0 && <span className="cluster-kpi-divider" aria-hidden="true" />}
          <div className="cluster-kpi-copy">
            <span title={t(`clusterKpi.${key}`)}>{t(`clusterKpi.${key}`)}</span>
            <strong>{loading ? '—' : value}</strong>
          </div>
        </div>)}
      </div>
    </div>
  </section>;
}
