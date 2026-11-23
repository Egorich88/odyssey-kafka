import odysseyI18n from '../../../i18n';
import { useTranslation as useInterfaceLanguage } from 'react-i18next';
import { nearestTime, cursorTime, formatTimestamp } from './overviewTime';
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
 * @fileoverview Панель пропускной способности Kafka-кластера.
 * Отображает график входящих и исходящих сообщений.
 * Управление линиями: клик по линии – оставить только её,
 * клик по фону графика – показать обе линии.
 */
import PanelInfo from '../../../components/common/PanelInfo';
import { FiActivity } from 'react-icons/fi';
import PanelFullscreenButton from './PanelFullscreenButton';
import { useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine
} from 'recharts';

function ThroughputTooltip({ active, payload, label }) {
  useInterfaceLanguage();
  if (!active || !payload || !payload.length) return null;

  const incomingItem = payload.find(p => p.dataKey === 'incoming');
  const outgoingItem = payload.find(p => p.dataKey === 'outgoing');

  return (
    <div className="throughput-tooltip">
      <div className="throughput-tooltip-title">{odysseyI18n.t('interface.time2')} {new Date(Number(label)).toLocaleTimeString(odysseyI18n.language)}</div>
      {incomingItem && (
        <div className="throughput-tooltip-row" style={{ color: '#3b82f6' }}> {odysseyI18n.t('interface.incomingMessages')} <strong>{incomingItem.value} msg/s</strong>
        </div>
      )}
      {outgoingItem && (
        <div className="throughput-tooltip-row" style={{ color: '#8b5cf6' }}> {odysseyI18n.t('interface.outgoingMessages')} <strong>{outgoingItem.value} msg/s</strong>
        </div>
      )}
    </div>
  );
}

export default function ThroughputPanel({ data, hoverTime, onHoverTime }) {
  useInterfaceLanguage();
  const [showIncoming, setShowIncoming] = useState(true);
  const [showOutgoing, setShowOutgoing] = useState(true);

  const latestPoint = data?.length ? data[data.length - 1] : null;

  const handleIncomingClick = () => {
    if (showIncoming && !showOutgoing) return;
    setShowIncoming(true);
    setShowOutgoing(false);
  };

  const handleOutgoingClick = () => {
    if (!showIncoming && showOutgoing) return;
    setShowIncoming(false);
    setShowOutgoing(true);
  };

  const handleChartClick = () => {
    if (showIncoming && showOutgoing) return;
    setShowIncoming(true);
    setShowOutgoing(true);
  };

  // Данные для отображения (если нет данных - подставляем заглушку с 0)
  const chartData = (!data || data.length === 0)
    ? [{ time: odysseyI18n.t('interface.noData'), timestamp: 0, incoming: 0, outgoing: 0 }]
    : data;

  const hasData = data && data.length > 0;

  return (
    <div className="dashboard-panel">
      <div className="panel-header throughput-header">
          <div className="throughput-title">
              <FiActivity aria-hidden="true" />
              <PanelInfo
                  title={odysseyI18n.t('interface.clusterThroughput')}
                  description={odysseyI18n.t('interface.messageRatesOverTimeIncomingAndOutgoingRates')}
              />

              <span> {odysseyI18n.t('interface.clusterThroughput')} </span>
          </div>

          <div className="throughput-current-values">
          <span className="incoming-value"> {odysseyI18n.t('interface.incoming')} {latestPoint?.incoming?.toFixed(1) ?? 0} msg/s
          </span>
          <span className="outgoing-value"> {odysseyI18n.t('interface.outgoing')} {latestPoint?.outgoing?.toFixed(1) ?? 0} msg/s
          </span>
        </div>

        <PanelFullscreenButton />
      </div>

      <div className="panel-body throughput-chart">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
                onMouseMove={(state) => cursorTime(state, onHoverTime)}
                onMouseLeave={() => onHoverTime(null)}
            data={chartData}
            margin={{
              top: 10,
              right: 10,
              left: 0,
              bottom: 6
            }}
            onClick={hasData ? handleChartClick : undefined}
          >
            <CartesianGrid stroke="var(--border-color)" strokeDasharray="4 4" />

                {/* Линия привязана к ближайшей временной точке, независимо от частоты сбора других графиков. */}
                {nearestTime(chartData, hoverTime ?? null) !== null && (
                  <ReferenceLine x={nearestTime(chartData, hoverTime ?? null)!} stroke="#60a5fa" strokeDasharray="4 4" strokeWidth={1.5} ifOverflow="hidden" />
                )}
            <XAxis
              dataKey="timestamp"
                  type="number"
                  scale="time"
                  domain={['dataMin', 'dataMax']}
                  tickFormatter={(value) => new Date(Number(value)).toLocaleTimeString(odysseyI18n.language)}
              height={22}
              tickMargin={3}
              tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
              tickLine={false}
              axisLine={false}
            />

            <YAxis
              domain={[0, 'auto']}
              padding={{ top: 0 }}
              tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
              tickLine={false}
              axisLine={false}
            />

            {hasData && (
              <Tooltip
                content={<ThroughputTooltip />}
                cursor={{ stroke: '#3b82f6', strokeWidth: 1, strokeDasharray: '4 4' }}
              />
            )}

            {showIncoming && (
              <Line
                type="monotone"
                dataKey="incoming"
                name={odysseyI18n.t('interface.incomingMessages2')}
                stroke="#3b82f6"
                strokeWidth={2}
                dot={false}
                activeDot={hasData ? { r: 5, stroke: '#ffffff', strokeWidth: 2, fill: '#3b82f6' } : false}
                onClick={hasData ? handleIncomingClick : undefined}
                style={{ cursor: hasData ? 'pointer' : 'default' }}
              />
            )}

            {showOutgoing && (
              <Line
                type="monotone"
                dataKey="outgoing"
                name={odysseyI18n.t('interface.outgoingMessages2')}
                stroke="#8b5cf6"
                strokeWidth={2}
                dot={false}
                activeDot={hasData ? { r: 5, stroke: '#ffffff', strokeWidth: 2, fill: '#8b5cf6' } : false}
                onClick={hasData ? handleOutgoingClick : undefined}
                style={{ cursor: hasData ? 'pointer' : 'default' }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
