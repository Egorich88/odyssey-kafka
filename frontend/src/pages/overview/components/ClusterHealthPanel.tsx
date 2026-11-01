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
 * @changes Добавлены подсказки к индикаторам статуса.
 */

/**
 * @file ClusterHealthPanel.tsx
 * Сводная панель состояния Kafka-кластера.
 *
 * В верхней части расположены KPI Overview, ниже — таблица брокеров.
 * Все показатели относятся только к текущему выбранному кластеру.
 */

import { FiServer, FiGrid, FiLayers, FiUsers, FiArrowDown, FiArrowUp, FiAlertTriangle, FiCheckCircle, FiAlertCircle, FiXCircle } from 'react-icons/fi';
import { useEffect, useState } from 'react';
import axios from 'axios';
import { useCluster } from '../../../contexts/ClusterContext';

interface Props {
  refreshKey: number;
  overview: any;
  consumerGroups: any[];
  messagesIn: number;
  messagesOut: number;
  onData?: (data: any) => void;
}

const STATUS_META: Record<string, { title: string; description: string; className: string; Icon: any }> = {
  healthy: { title: 'Кластер стабилен', description: 'Все контролируемые компоненты работают штатно', className: 'cluster-status-healthy', Icon: FiCheckCircle },
  warning: { title: 'Есть предупреждения', description: 'Кластер доступен, но обнаружены состояния, требующие внимания', className: 'cluster-status-warning', Icon: FiAlertCircle },
  critical: { title: 'Критическое состояние', description: 'Есть недоступные брокеры или партиции без лидера либо остановленные группы потребителей', className: 'cluster-status-critical', Icon: FiXCircle },
  unknown: { title: 'Состояние уточняется', description: 'Получение актуального состояния кластера', className: 'cluster-status-unknown', Icon: FiAlertTriangle },
};

const formatNumber = (value: unknown) => new Intl.NumberFormat('ru-RU').format(Number(value || 0));
const formatMemory = (value: unknown) => value == null ? '—' : `${Math.round(Number(value))} MB`;
const formatDisk = (broker: any) => broker.diskUsage != null && broker.diskTotal > 0
  ? `${Number(broker.diskUsage).toFixed(1)}/${Number(broker.diskTotal).toFixed(0)} GB`
  : '—';

export default function ClusterHealthPanel({ refreshKey, overview, consumerGroups, messagesIn, messagesOut, onData }: Props): JSX.Element {
  const { currentCluster } = useCluster();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!currentCluster) return;
      setLoading(true);
      try {
        const bootstrap = currentCluster.brokers || currentCluster.bootstrapServers;
        const response = await axios.get('/api/overview/health', { headers: { 'X-Kafka-Bootstrap': bootstrap } });
        setData(response.data);
        onData?.(response.data);
      } catch (error) {
        console.error('Ошибка получения состояния кластера:', error);
        setData(null);
        onData?.(null);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [currentCluster, refreshKey, onData]);

  const meta = STATUS_META[data?.status || 'unknown'];
  const StatusIcon = meta.Icon;
  const partitionCount = data?.partitionsTotal ?? overview?.partitions ?? overview?.partitionCount ?? 0;
  const topicCount = overview?.topics ?? overview?.topicCount ?? 0;
  const groupCount = consumerGroups?.length ?? overview?.consumerGroups ?? 0;
  const underReplicated = data?.underReplicated ?? overview?.underReplicated ?? 0;

  return (
    <div className="dashboard-panel cluster-health-panel">
      <div className="cluster-health-body cluster-health-summary">
        <div className={`cluster-health-status ${meta.className}`} title={meta.description}>
          <span className="cluster-health-status-icon"><StatusIcon /></span>
          <span className="cluster-health-status-copy">
            <strong>{meta.title}</strong>
            <small>{meta.description}</small>
          </span>
        </div>
        <div className="cluster-kpi-grid">
          <Kpi icon={<FiServer />} label="Брокеры" value={loading ? '—' : formatNumber(data?.brokerCount)} />
          <Kpi icon={<FiGrid />} label="Топики" value={loading ? '—' : formatNumber(topicCount)} />
          <Kpi icon={<FiLayers />} label="Партиции" value={loading ? '—' : formatNumber(partitionCount)} />
          <Kpi icon={<FiUsers />} label="Группы потребителей" value={loading ? '—' : formatNumber(groupCount)} />
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
      <div className="cluster-kpi-copy"><span>{label}</span><strong>{value}</strong></div>
    </div>
  );
}
