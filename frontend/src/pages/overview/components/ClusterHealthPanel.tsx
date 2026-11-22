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
 * @project Odyssey new 4.2.36
 * @description Сводная панель состояния Kafka-кластера.
 * @changes Компактная сводка, тематические подсказки и единая строка показателей.
 */

/**
 * @file ClusterHealthPanel.tsx
 * Сводная панель состояния Kafka-кластера.
 *
 * Содержит семь KPI. Статус и версия Kafka отображаются в глобальном Header.
 * Все показатели относятся только к текущему выбранному кластеру.
 */

import { FiServer, FiGrid, FiLayers, FiUsers, FiArrowDown, FiArrowUp, FiAlertTriangle } from 'react-icons/fi';
import { useEffect } from 'react';
import { useClusterHealth } from '../../../contexts/ClusterHealthContext';

interface Props {
  refreshKey: number;
  overview: any;
  consumerGroups?: unknown[];
  consumerGroupsPartial?: boolean;
  messagesIn: number;
  messagesOut: number;
  onData?: (data: any) => void;
}


const formatNumber = (value: unknown) => new Intl.NumberFormat('ru-RU').format(Number(value || 0));

export default function ClusterHealthPanel({ overview, consumerGroups, consumerGroupsPartial, messagesIn, messagesOut, onData }: Props): JSX.Element {
  const { data, loading } = useClusterHealth();
  useEffect(() => {
    if (!loading) onData?.(data);
  }, [data, loading, onData]);
  const partitionCount = data?.partitionsTotal ?? overview?.partitions ?? overview?.partitionCount ?? 0;
  const topicCount = overview?.topics ?? overview?.topicCount ?? 0;
  const listedCount = consumerGroups?.length;
  const overviewCount = overview?.consumerGroups;
  const exactGroupCount = (!consumerGroupsPartial ? listedCount : undefined)
    ?? (!overview?.consumerGroupsPartial ? overviewCount : undefined);
  const knownGroupCount = Math.max(listedCount ?? 0, overviewCount ?? 0);
  const groupCount = exactGroupCount != null ? formatNumber(exactGroupCount)
    : knownGroupCount > 0 ? `≥ ${formatNumber(knownGroupCount)}` : '—';
  const underReplicated = data?.underReplicated ?? overview?.underReplicated ?? 0;

  return (
    <div className="dashboard-panel cluster-health-panel">
      <div className="cluster-health-body cluster-health-summary">
        <div className="cluster-kpi-grid">
          <Kpi icon={<FiServer />} label="Брокеры" value={loading ? '—' : formatNumber(data?.brokerCount)} />
          <Kpi icon={<FiGrid />} label="Топики" value={loading ? '—' : formatNumber(topicCount)} />
          <Kpi icon={<FiLayers />} label="Партиции" value={loading ? '—' : formatNumber(partitionCount)} />
          <Kpi icon={<FiUsers />} label="Группы потребителей" value={loading ? '—' : groupCount} />
          <Kpi icon={<FiArrowDown />} label="Входящие сообщения" value={loading ? '—' : `${Number(messagesIn || 0).toFixed(1)} msg/s`} />
          <Kpi icon={<FiArrowUp />} label="Исходящие сообщения" value={loading ? '—' : `${Number(messagesOut || 0).toFixed(1)} msg/s`} />
          <Kpi icon={<FiAlertTriangle />} label="Недореплицированные" value={loading ? '—' : formatNumber(underReplicated)} danger={Number(underReplicated) > 0} />
        </div>
      </div>
    </div>
  );
}

function Kpi({ icon, label, value, danger = false }: { icon: JSX.Element; label: string; value: string; danger?: boolean }): JSX.Element {
  return (
    <div className={`cluster-kpi ${danger ? 'is-danger' : ''}`}>
      <span className="cluster-kpi-icon">{icon}</span>
      <div className="cluster-kpi-copy">
        <span title={label}>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}
