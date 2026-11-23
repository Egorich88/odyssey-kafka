import odysseyI18n from '../../../i18n';
import { useTranslation as useInterfaceLanguage } from 'react-i18next';
import { getStableTopicColor } from './topicColor';
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
 * @fileoverview Панель Consumer Lag на странице Overview.
 *
 * Содержит единый график lag и таблицу Group + Topic.
 * Статус Kafka Consumer Group показывается непосредственно рядом
 * с топиком, поэтому рост lag можно сразу сопоставить с состоянием
 * группы: Stable, Rebalancing, Empty или Dead.
 */

import PanelInfo from '../../../components/common/PanelInfo';
import PanelFullscreenButton from './PanelFullscreenButton';
import { useState, useEffect, useMemo, useRef } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
  ReferenceLine
} from 'recharts';
import axios from 'axios';
import { useCluster } from '../../../contexts/ClusterContext';
import { FiCheck, FiChevronDown, FiUsers } from 'react-icons/fi';

interface LagPoint { time: string; timestamp?: number; group: string; value: number; topics?: Record<string, number>; }
interface LagRow { group: string; topic: string; status: string; lag: number; change: number; lastActivity?: string; }

const STATUS_META = {
  Stable: {
    label: 'Stable',
    className: 'consumer-status-stable',
    get short() { return odysseyI18n.t('interface.groupIsRunning'); }
  },
  Rebalancing: {
    label: 'Rebalancing',
    className: 'consumer-status-rebalancing',
    get short() { return odysseyI18n.t('interface.rebalanceInProgress'); }
  },
  Empty: {
    label: 'Empty',
    className: 'consumer-status-empty',
    get short() { return odysseyI18n.t('interface.noActiveConsumers'); }
  },
  Dead: {
    label: 'Dead',
    className: 'consumer-status-dead',
    get short() { return odysseyI18n.t('interface.groupIsBeingDeleted'); }
  }
};

// Цвет не зависит от состава списка топиков и порядка строк после обновления.
const getTopicColor = (topic: string, _topics?: string[]) => getStableTopicColor(topic);

const formatLag = (value) =>
  new Intl.NumberFormat(odysseyI18n.language).format(Number(value || 0));

const formatChange = (value) => {
  const change = Number(value || 0);
  if (change > 0) return `↑ +${formatLag(change)}`;
  if (change < 0) return `↓ ${formatLag(change)}`;
  return '→ 0';
};

function LagTooltip({ active, payload, label }) {
  useInterfaceLanguage();
  label = new Date(Number(label)).toLocaleTimeString(odysseyI18n.language);
  if (!active || !payload?.length) return null;

  const filtered = payload.filter((entry) => Number(entry.value) > 0);
  if (!filtered.length) return null;

  return (
    <div className="topics-tooltip">
      <div className="topics-tooltip-title">{odysseyI18n.t('interface.time2')} {formatTimestamp(label)}</div>
      {filtered.map((entry) => (
        <div
          key={entry.dataKey}
          className="topics-tooltip-row"
          style={{ color: entry.color || 'var(--text-primary)' }}
        >
          {entry.name}: <strong>{formatLag(entry.value)} lag</strong>
        </div>
      ))}
    </div>
  );
}

interface ConsumerLagPanelProps { timeRange?: string; refreshKey: number; hoverTime?: number | null; onHoverTime?: (value: number | null) => void; }

export default function ConsumerLagPanel({ timeRange = '15m', refreshKey, hoverTime = null, onHoverTime = () => {} }: ConsumerLagPanelProps): JSX.Element {
  useInterfaceLanguage();
  const { currentCluster } = useCluster();

  const [visibleLines, setVisibleLines] = useState([]);
  const [allLines, setAllLines] = useState([]);
  const [rawData, setRawData] = useState<LagPoint[]>([]);
  const [rows, setRows] = useState<LagRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const statusMenuRef = useRef<HTMLDivElement | null>(null);

  const loadConsumerLagData = async () => {
    if (!currentCluster) return;

    setLoading(true);

    try {
      const headers = {
        'X-Kafka-Profile-ID':
          currentCluster.id
      };

      const response = await axios.get(
        `/api/overview/consumer-lag?range=${timeRange}`,
        { headers }
      );

      const points = (response.data.points || []).map((point) => ({
        ...point,
        value: Math.max(0, point.value || 0)
      }));

      const nextRows = response.data.rows || [];

      setRawData(points);
      setRows(nextRows);

      const lineSet = new Set();

      points.forEach((point) => {
        if (!point.topics || typeof point.topics !== 'object') return;

        Object.keys(point.topics).forEach((topic) => {
          lineSet.add(`${point.group} (${topic})`);
        });
      });

      const uniqueLines = Array.from(lineSet).sort();
      setAllLines(uniqueLines);

      const lastPoint = points[points.length - 1];
      const active = new Set();

      if (lastPoint?.topics) {
        Object.entries(lastPoint.topics).forEach(([topic, value]) => {
          if (Number(value) > 0) {
            active.add(`${lastPoint.group} (${topic})`);
          }
        });
      }

      setVisibleLines(active.size ? Array.from(active).sort() : uniqueLines);
    } catch (error) {
      console.error('Ошибка загрузки данных consumer lag:', error);
      setRawData([]);
      setRows([]);
      setAllLines([]);
      setVisibleLines([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConsumerLagData();
  }, [currentCluster, timeRange, refreshKey]);

  const chartData = useMemo(() => {
    const timeMap = new Map();

    rawData.forEach((point) => {
      if (!point.topics || typeof point.topics !== 'object') return;

      const pointKey = point.timestamp || point.time;
      if (!timeMap.has(pointKey)) {
        timeMap.set(pointKey, { time: point.time, timestamp: point.timestamp || 0 });
      }

      const entry = timeMap.get(pointKey);

      Object.entries(point.topics).forEach(([topic, value]) => {
        entry[`${point.group} (${topic})`] = Math.max(0, Number(value || 0));
      });
    });

    return Array.from(timeMap.values()).sort((a, b) =>
      Number(a.timestamp || 0) - Number(b.timestamp || 0)
    );
  }, [rawData]);

  const lastPoint = chartData.length
    ? chartData[chartData.length - 1]
    : {};

  const topicNames = useMemo(() => {
    const names = new Set();

    rows.forEach((row) => names.add(row.topic));
    allLines.forEach((line) => {
      const match = line.match(/\((.*)\)$/);
      if (match) names.add(match[1]);
    });

    return Array.from(names).sort();
  }, [rows, allLines]);

  const handleLineSelect = (lineKey, event) => {
    event?.stopPropagation();

    if (event?.ctrlKey) {
      setVisibleLines((current) =>
        current.includes(lineKey)
          ? current.filter((key) => key !== lineKey)
          : [...current, lineKey]
      );
      return;
    }

    if (visibleLines.length === 1 && visibleLines[0] === lineKey) {
      const active = allLines.filter((key) => Number(lastPoint[key] || 0) > 0);
      setVisibleLines(active.length ? active : allLines);
      return;
    }

    setVisibleLines([lineKey]);
  };

  const resetVisibleLines = () => {
    const active = allLines.filter((key) => Number(lastPoint[key] || 0) > 0);
    setVisibleLines(active.length ? active : allLines);
  };

  useEffect(() => {
    if (!statusMenuOpen) return;
    const close = (event: MouseEvent) => {
      if (!statusMenuRef.current?.contains(event.target as Node)) setStatusMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [statusMenuOpen]);

  const filteredRows = useMemo(
    () => statusFilter === 'ALL' ? rows : rows.filter((row) => row.status === statusFilter),
    [rows, statusFilter]
  );

  if (!currentCluster) return null;

  return (
    <div className="dashboard-panel consumer-lag-panel">
      <div className="panel-header consumer-lag-header">
        <div className="consumer-lag-heading">
          <div className="panel-title-with-info">
            <FiUsers aria-hidden="true" />
            <PanelInfo
              title={odysseyI18n.t('interface.consumerGroups')}
              description={odysseyI18n.t('interface.consumerLagHistoryByGroupAndTopicStable')}
            />
            <span>{odysseyI18n.t('interface.consumerGroups')}</span>
          </div>

          <div className="consumer-status-filter" ref={statusMenuRef}>
            <span>{odysseyI18n.t('interface.status')}</span>
            <button
              type="button"
              className={`consumer-status-filter-button ${statusMenuOpen ? 'is-open' : ''}`}
              onClick={() => setStatusMenuOpen((value) => !value)}
              aria-haspopup="listbox"
              aria-expanded={statusMenuOpen}
            >
              <span>{statusFilter === 'ALL' ? odysseyI18n.t('interface.all') : statusFilter}</span>
              <FiChevronDown />
            </button>
            {statusMenuOpen && (
              <div className="consumer-status-menu" role="listbox">
                {['ALL', ...Object.keys(STATUS_META)].map((value) => {
                  const label = value === 'ALL' ? odysseyI18n.t('interface.all') : value;
                  return (
                    <button
                      type="button"
                      role="option"
                      aria-selected={statusFilter === value}
                      className={statusFilter === value ? 'selected' : ''}
                      key={value}
                      onClick={() => { setStatusFilter(value); setStatusMenuOpen(false); }}
                    >
                      <span>{label}</span>
                      {statusFilter === value && <FiCheck />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <PanelFullscreenButton />
      </div>

      <div className="consumer-lag-content">
        <div className="consumer-lag-chart">
          {loading && chartData.length === 0 ? (
            <div className="consumer-lag-placeholder">{odysseyI18n.t('interface.loadingData')}</div>
          ) : allLines.length === 0 ? (
            <div className="consumer-lag-placeholder"> {odysseyI18n.t('interface.noGroupOrTopicDataForThisPeriod')} </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                onMouseMove={(state) => cursorTime(state, onHoverTime)}
                onMouseLeave={() => onHoverTime(null)}
                data={chartData}
                margin={{ top: 8, right: 10, left: 0, bottom: 26 }}
                onClick={resetVisibleLines}
              >
                <CartesianGrid
                  stroke="var(--border-color)"
                  strokeDasharray="4 4"
                />

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
                  height={35}
                  tickMargin={8}
                  tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                />

                <YAxis
                  domain={[0, 'auto']}
                  padding={{ top: 12 }}
                  tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                />

                <Tooltip content={<LagTooltip />} />

                {visibleLines.map((lineKey) => {
                  const match = lineKey.match(/\((.*)\)$/);
                  const topic = match ? match[1] : lineKey;
                  const color = getTopicColor(topic, topicNames);

                  return (
                    <Line
                      key={lineKey}
                      type="monotone"
                      dataKey={lineKey}
                      name={lineKey}
                      stroke={color}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4, stroke: '#fff', strokeWidth: 1, fill: color }}
                      onMouseDown={(event) => handleLineSelect(lineKey, event)}
                      style={{ cursor: 'pointer' }}
                    />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="consumer-lag-table-wrap">
          <div className="consumer-lag-table">
            <div className="consumer-lag-table-header">
              <span>{odysseyI18n.t('interface.consumerGroup')}</span>
              <span>{odysseyI18n.t('interface.topic')}</span>
              <span>{odysseyI18n.t('interface.status2')}</span>
              <span>{odysseyI18n.t('interface.lag2')}</span>
              <span>{odysseyI18n.t('interface.change')}</span>
              <span>{odysseyI18n.t('interface.lastActivity')}</span>
            </div>

            {rows.length ? (
              filteredRows.map((row) => {
                const status = STATUS_META[row.status] || {
                  label: row.status || 'Unknown',
                  className: 'consumer-status-unknown',
                  short: odysseyI18n.t('interface.stateUnknown')
                };

                const topicColor = getTopicColor(row.topic, topicNames);

                return (
                  <div
                    className="consumer-lag-table-row"
                    key={`${row.group}-${row.topic}`}
                  >
                    <span className="consumer-group-name">{row.group}</span>

                    <span
                      className="consumer-topic-name"
                      style={{ '--topic-color': topicColor }}
                    >
                      <i />
                      {row.topic}
                    </span>

                    <span className={`consumer-status-badge ${status.className}`}>
                      {status.label}
                    </span>

                    <span className="consumer-lag-value">
                      {formatLag(row.lag)}
                    </span>

                    <span
                      className={`consumer-lag-change ${
                        row.change > 0
                          ? 'lag-change-up'
                          : row.change < 0
                            ? 'lag-change-down'
                            : 'lag-change-flat'
                      }`}
                    >
                      {formatChange(row.change)}
                    </span>

                    <span className="consumer-last-activity">
                      {row.lastActivity || '—'}
                    </span>
                  </div>
                );
              })
            ) : (
              <div className="consumer-lag-table-empty"> {odysseyI18n.t('interface.noTableData')} </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
