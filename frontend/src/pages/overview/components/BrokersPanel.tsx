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
 * @file BrokersPanel.tsx
 * @description Отдельная панель брокеров на странице «Обзор».
 * Использует реальные сведения из ответа /api/overview/health.
 * Процент нагрузки отображает доступную метрику CPU брокера;
 * если backend не предоставил её, значение не подменяется фиктивным.
 */

import PanelInfo from '../../../components/common/PanelInfo';
import PanelFullscreenButton from './PanelFullscreenButton';

interface BrokersPanelProps {
  data: any;
  loading?: boolean;
}

const number = (value: unknown) => new Intl.NumberFormat('ru-RU').format(Number(value || 0));
const memory = (value: unknown) => value == null ? '—' : `${Math.round(Number(value))} MB`;
const disk = (broker: any) => broker.diskUsage != null && broker.diskTotal > 0
  ? `${Number(broker.diskUsage).toFixed(1)}/${Number(broker.diskTotal).toFixed(0)} GB`
  : '—';

function LoadCell({ value }: { value: unknown }): JSX.Element {
  const load = Number(value);
  const valid = value != null && Number.isFinite(load) && load >= 0;
  const percent = valid ? Math.max(0, Math.min(100, load)) : 0;
  const level = percent >= 80 ? 'high' : percent >= 60 ? 'medium' : 'normal';
  return (
    <span className="broker-load-cell" title={valid ? `Загрузка CPU контейнера Kafka: ${percent.toFixed(1)}%` : 'Метрика CPU недоступна'}>
      {valid ? <>
        <span className="broker-load-track"><span className={`broker-load-fill is-${level}`} style={{ width: `${percent}%` }} /></span>
        <strong>{percent.toFixed(1)}%</strong>
      </> : <em>—</em>}
    </span>
  );
}

export default function BrokersPanel({ data, loading = false }: BrokersPanelProps): JSX.Element {
  const brokers = data?.brokers || [];
  return (
    <div className="dashboard-panel brokers-overview-panel">
      <div className="panel-header">
        <div className="panel-title-with-info">
          <PanelInfo
            title="Брокеры"
            description="Состояние брокеров Kafka, распределение лидеров и реплик, доступная метрика загрузки CPU, память и диск. Нагрузка отображает фактический процент CPU, полученный backend."
          />
          <span>Брокеры</span>
        </div>
        <PanelFullscreenButton />
      </div>
      <div className="cluster-brokers-table-wrap">
        <div className="cluster-brokers-table-header">
          <span>ID</span><span>Адрес</span><span>Статус</span><span>ISR</span><span>Контроллер</span>
          <span>Лидеры</span><span>Реплики</span><span>Нагрузка</span><span>Память</span><span>Диск (Used/Total)</span>
        </div>
        {loading ? <div className="cluster-broker-empty">Загрузка данных брокеров...</div> :
          brokers.length ? brokers.map((broker: any) => (
            <div className="cluster-brokers-table-row" key={broker.id}>
              <span>{broker.id}</span>
              <span className="broker-address" title={broker.address}>{broker.address}</span>
              <span className={broker.online ? 'broker-online' : 'broker-offline'}><i />{broker.online ? 'Онлайн' : 'Офлайн'}</span>
              <span>{number(broker.isrCount)}/{number(broker.replicaCount)}</span>
              <span>{broker.controller ? <em className="broker-controller">Контроллер</em> : '—'}</span>
              <span>{number(broker.leaderCount)}</span><span>{number(broker.replicaCount)}</span>
              <LoadCell value={broker.cpu} />
              <span>{memory(broker.memory)}</span><span>{disk(broker)}</span>
            </div>
          )) : <div className="cluster-broker-empty">Нет доступных брокеров</div>}
      </div>
    </div>
  );
}
