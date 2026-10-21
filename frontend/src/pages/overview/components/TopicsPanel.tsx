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
 * @fileoverview Панель пропускной способности по топикам Kafka.
 *
 * Отображает графики только активных топиков (с положительной скоростью)
 * за выбранный временной период (передаётся через prop timeRange).
 *
 * Управление видимостью линий:
 *   - Клик по строке легенды → оставить только этот топик.
 *   - Повторный клик на уже единственном топике → вернуть все активные топики.
 *   - Клик по пустому месту графика → вернуть все активные топики.
 *   - Ctrl + клик → добавить/удалить топик из текущего набора (мультивыбор).
 *
 * Данные защищены от отрицательных значений (обрезаются до нуля на всех этапах).
 */

import { useState, useEffect } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import axios from 'axios';
import '../styles/topics-panel.css';
import { useCluster } from '../../../contexts/ClusterContext';
import PanelInfo from '../../../components/common/PanelInfo';
import PanelFullscreenButton from './PanelFullscreenButton';
import { FiChevronDown, FiChevronUp } from 'react-icons/fi';

interface TopicPoint { time: string; timestamp?: number; topic: string; value: number; }

// =========================================================================
// Кастомный тултип – показывает только положительные значения
// =========================================================================
const TopicsTooltip = ({ active, payload, label }) => {
  if (!active || !payload || !payload.length) return null;

  // Отфильтровываем нулевые и отрицательные
  const filtered = payload.filter(entry => entry.value > 0);
  if (filtered.length === 0) return null;

  return (
    <div className="topics-tooltip">
      <div className="topics-tooltip-title">Время: {label}</div>
      {filtered.map((entry) => (
        <div
          key={entry.dataKey}
          className="topics-tooltip-row"
          style={{ color: entry.color || 'var(--text-primary)' }}
        >
          {entry.name}: <strong>{entry.value.toFixed(1)} сообщений/сек</strong>
        </div>
      ))}
    </div>
  );
};

// Генерация цвета для топика (циклически по 10 предустановленным)
const getTopicColor = (topic, index) => {
  const colors = [
    '#3b82f6', '#8b5cf6', '#22c55e', '#f59e0b', '#ef4444',
    '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#a855f7'
  ];
  return colors[index % colors.length];
};

interface TopicsPanelProps { timeRange?: string; refreshKey: number; }

export default function TopicsPanel({ timeRange = '15m', refreshKey }: TopicsPanelProps): JSX.Element {
  const { currentCluster } = useCluster();

  const [visibleTopics, setVisibleTopics] = useState([]);
  const [allTopics, setAllTopics] = useState([]);
  const [rawData, setRawData] = useState<TopicPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [legendSort, setLegendSort] = useState<{ key: 'topic' | 'current' | 'max'; asc: boolean } | null>(null);

  // -------------------------------------------------------------------------
  // Загрузка данных с бэкенда с учётом периода
  // -------------------------------------------------------------------------
  const loadTopicsData = async () => {
    if (!currentCluster) return;
    setLoading(true);
    try {
      const headers = { 'X-Kafka-Bootstrap': currentCluster.brokers || currentCluster.bootstrapServers };
      const response = await axios.get(`/api/overview/topics-throughput?${timeRange}`, { headers });
      const points = response.data.points || [];

      // Защита от отрицательных значений (обрезаем до нуля)
      const safePoints = points.map(p => ({
        ...p,
        value: Math.max(0, p.value || 0)
      }));
      setRawData(safePoints);

      // Все уникальные топики из полученных точек
      const unique = [...new Set(safePoints.map(p => p.topic))];
      setAllTopics(unique);

      // Определяем активные топики (значение > 0 хотя бы в одной точке)
      const activeSet = new Set();
      for (const point of safePoints) {
        if (point.value > 0) {
          activeSet.add(point.topic);
        }
      }
      const activeTopics = unique.filter(t => activeSet.has(t));

      // Если активные есть – показываем их, иначе – все топики (но легенда будет пуста)
      setVisibleTopics(activeTopics.length > 0 ? activeTopics : []);
    } catch (err) {
      console.error('Ошибка загрузки данных топиков:', err);
      setRawData([]);
      setAllTopics([]);
      setVisibleTopics([]);
    } finally {
      setLoading(false);
    }
  };

  // Перезагружаем при смене кластера или периода
  useEffect(() => {
    loadTopicsData();
  }, [currentCluster, timeRange, refreshKey]);

  // -------------------------------------------------------------------------
  // Преобразование данных для Recharts
  // -------------------------------------------------------------------------
  const prepareChartData = () => {
    const timeMap = new Map();
    for (const point of rawData) {
      const pointKey = point.timestamp || point.time;
      if (!timeMap.has(pointKey)) {
        timeMap.set(pointKey, { time: point.time, timestamp: point.timestamp || 0 });
      }
      const entry = timeMap.get(pointKey);
      // Второй уровень защиты: обрезаем отрицательные
      entry[point.topic] = Math.max(0, point.value || 0);
    }
    return Array.from(timeMap.values()).sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0));
  };

  const aggregatedData = prepareChartData();
  const lastPoint = aggregatedData.length > 0 ? aggregatedData[aggregatedData.length - 1] : {};

  const topicMax = (topic: string) => {
    return rawData.reduce((max, point) => Math.max(max, Number(point.topic === topic ? point.value || 0 : 0)), 0);
  };

  // Сортировка таблицы включается только нажатием на заголовок.
  const sortedVisibleTopics = [...visibleTopics].sort((a, b) => {
    if (!legendSort) return 0;
    const left = legendSort.key === 'topic' ? a.toLocaleLowerCase() : legendSort.key === 'current' ? Number(lastPoint[a] || 0) : topicMax(a);
    const right = legendSort.key === 'topic' ? b.toLocaleLowerCase() : legendSort.key === 'current' ? Number(lastPoint[b] || 0) : topicMax(b);
    const compare = typeof left === 'string' && typeof right === 'string' ? left.localeCompare(right) : Number(left) - Number(right);
    return legendSort.asc ? compare : -compare;
  });

  const toggleLegendSort = (key: 'topic' | 'current' | 'max') => {
    setLegendSort((previous) => previous?.key === key ? { key, asc: !previous.asc } : { key, asc: true });
  };
  const sortIcon = (key: 'topic' | 'current' | 'max') => legendSort?.key === key ? (legendSort.asc ? <FiChevronUp /> : <FiChevronDown />) : null;

  // -------------------------------------------------------------------------
  // Обработчики кликов по легенде и фону графика
  // -------------------------------------------------------------------------
  const handleTopicSelect = (topic, event) => {
    if (event && event.stopPropagation) event.stopPropagation();
    if (event && event.ctrlKey) {
      setVisibleTopics(prev =>
        prev.includes(topic)
          ? prev.filter(t => t !== topic)
          : [...prev, topic]
      );
      return;
    }
    if (visibleTopics.length === 1 && visibleTopics[0] === topic) {
      const activeSet = new Set();
      for (const point of rawData) {
        if (point.value > 0) activeSet.add(point.topic);
      }
      const active = allTopics.filter(t => activeSet.has(t));
      setVisibleTopics(active.length > 0 ? active : allTopics);
    } else {
      setVisibleTopics([topic]);
    }
  };

  const handleChartClick = () => {
    const activeSet = new Set();
    for (const point of rawData) {
      if (point.value > 0) activeSet.add(point.topic);
    }
    const active = allTopics.filter(t => activeSet.has(t));
    setVisibleTopics(active.length > 0 ? active : allTopics);
  };

  // -------------------------------------------------------------------------
  // Состояния загрузки и отсутствия данных
  // -------------------------------------------------------------------------
  if (!currentCluster) return null;

  if (loading && rawData.length === 0) {
      return (
          <div className="dashboard-panel">
              <div className="panel-header">
                  <div className="topics-panel-title">
                      <PanelInfo
                          title="Пропускная способность по топикам"
                          description="Показывает скорость обработки сообщений для отдельных Kafka-топиков за выбранный период. Позволяет определить наиболее активные топики, сравнить их нагрузку и быстро увидеть изменения интенсивности трафика."
                      />

                      <span>
                          Пропускная способность по топикам
                      </span>
                  </div>
              
        <PanelFullscreenButton />
      </div>
        <div className="panel-body topics-placeholder">Загрузка данных...</div>
      </div>
    );
  }

  if (allTopics.length === 0 && !loading) {
    return (
      <div className="dashboard-panel">
        <div className="panel-header">
          <div className="topics-panel-title">
            <PanelInfo
              title="Пропускная способность по топикам"
              description="Показывает скорость обработки сообщений для отдельных Kafka-топиков за выбранный период. Позволяет определить наиболее активные топики, сравнить их нагрузку и быстро увидеть изменения интенсивности трафика."
            />

            <span>
              Пропускная способность по топикам
            </span>
          </div>
        </div>

        <div className="panel-body topics-placeholder">
          Нет данных о топиках за выбранный период
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Рендер
  // -------------------------------------------------------------------------
  return (
    <div className="dashboard-panel">
      <div className="panel-header">
        <div className="topics-panel-title">
          <PanelInfo
            title="Пропускная способность по топикам"
            description="Показывает скорость обработки сообщений для отдельных Kafka-топиков за выбранный период. Позволяет определить наиболее активные топики, сравнить их нагрузку и быстро увидеть изменения интенсивности трафика."
          />

          <span>
            Пропускная способность по топикам
          </span>
        </div>
        <PanelFullscreenButton />
      </div>

      <div className="panel-body">
        <div className="topics-layout">
          {/* График */}
          <div className="topics-chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={aggregatedData}
                margin={{
                  top: 10,
                  right: 10,
                  left: 0,
                  bottom: 6
                }}
                onClick={handleChartClick}
                cursor={{ stroke: '#3b82f6', strokeWidth: 1, strokeDasharray: '4 4' }}
              >
                <CartesianGrid stroke="var(--border-color)" strokeDasharray="4 4" />
                <XAxis
                  dataKey="time"
                  height={22}
                  tickMargin={3}
                  tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  domain={[0, 'auto']}
                  padding={{ top: 0 }}
                />
                <Tooltip content={<TopicsTooltip />} />

                {allTopics
                  .filter(topic => visibleTopics.includes(topic))
                  .map((topic, idx) => (
                    <Line
                      key={topic}
                      type="monotone"
                      dataKey={topic}
                      stroke={getTopicColor(topic, allTopics.indexOf(topic))}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{
                        r: 5,
                        stroke: '#fff',
                        strokeWidth: 2,
                        fill: getTopicColor(topic, allTopics.indexOf(topic))
                      }}
                      onMouseDown={(e) => handleTopicSelect(topic, e)}
                      style={{ cursor: 'pointer' }}
                    />
                  ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Легенда – показывает только активные топики */}
          <div className="topics-legend">
            <div className="topics-legend-header" role="row">
              <button type="button" onClick={() => toggleLegendSort('topic')} aria-label="Сортировать по топику" aria-sort={legendSort?.key === 'topic' ? (legendSort.asc ? 'ascending' : 'descending') : 'none'}>Топик {sortIcon('topic')}</button>
              <button type="button" onClick={() => toggleLegendSort('current')} aria-label="Сортировать по текущему значению" aria-sort={legendSort?.key === 'current' ? (legendSort.asc ? 'ascending' : 'descending') : 'none'}>Текущее {sortIcon('current')}</button>
              <button type="button" onClick={() => toggleLegendSort('max')} aria-label="Сортировать по максимальному значению" aria-sort={legendSort?.key === 'max' ? (legendSort.asc ? 'ascending' : 'descending') : 'none'}>Макс. {sortIcon('max')}</button>
            </div>
            {visibleTopics.length === 0 ? (
              <div className="topics-legend-placeholder">Нет активных топиков за выбранный период</div>
            ) : (
              sortedVisibleTopics.map(topic => (
                <div
                  key={topic}
                  className={`topics-legend-row ${
                    visibleTopics.length === 1 && visibleTopics[0] === topic ? 'active' : ''
                  }`}
                  onClick={(e) => handleTopicSelect(topic, e)}
                >
                  <div className="topics-legend-left">
                    <span
                      className="topics-legend-color"
                      style={{ background: getTopicColor(topic, allTopics.indexOf(topic)) }}
                    />
                    <span>{topic}</span>
                  </div>
                  <span className="topics-legend-value">
                    {(Number(lastPoint[topic]) || 0).toFixed(1)}
                  </span>
                  <span className="topics-legend-value topics-legend-max">
                    {topicMax(topic).toFixed(1)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}