import { formatTimestamp } from './overviewTime';
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
 * @fileoverview Панель последних событий Kafka-кластера.
 *
 * События Consumer Groups уже содержат группу, топик и состояние внутри
 * текстового сообщения. Поэтому таблица остаётся компактной: Время,
 * Сообщение, Источник.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import '../styles/events-panel.css';
import PanelInfo from '../../../components/common/PanelInfo';
import PanelFullscreenButton from './PanelFullscreenButton';
import { useCluster } from '../../../contexts/ClusterContext';
import { FiCheck, FiChevronDown } from 'react-icons/fi';

export default function EventsPanel({ refreshKey, timeRange = "range=24h", hoverTime = null }) {
  const { currentCluster } = useCluster();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [levelFilter, setLevelFilter] = useState<'ALL' | 'INFO' | 'WARN' | 'ERROR'>('ALL');
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement | null>(null);

  const loadEvents = async () => {
    if (!currentCluster) return;

    setLoading(true);

    try {
      const bootstrap =
        currentCluster.brokers || currentCluster.bootstrapServers;

      const response = await axios.get(`/api/overview/events?${timeRange}`, {
        headers: { 'X-Kafka-Bootstrap': bootstrap }
      });

      setEvents(response.data.events || []);
    } catch (error) {
      console.error('Ошибка загрузки событий:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEvents();
  }, [currentCluster, refreshKey, timeRange]);

  useEffect(() => {
    if (!filterOpen) return;
    const close = (event: MouseEvent) => {
      if (!filterRef.current?.contains(event.target as Node)) setFilterOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [filterOpen]);

  const getLevelClass = (level) => {
    switch (level) {
      case 'INFO':
        return 'event-level-info';
      case 'WARN':
        return 'event-level-warn';
      case 'ERROR':
        return 'event-level-error';
      default:
        return '';
    }
  };

  const filteredEvents = useMemo(
    () => levelFilter === 'ALL' ? events : events.filter((event) => event.level === levelFilter),
    [events, levelFilter]
  );

  return (
    <div className="events-panel">
      <div className="events-panel-header">
        <div className="events-title">
          <PanelInfo
            title="События"
            description="Показывает последние изменения и проблемы кластера. Для событий Consumer Groups дополнительно отображаются группа, топик и актуальное состояние: Stable, Rebalancing, Empty или Dead."
          />
          <span>События</span>
        </div>
        <div className="events-panel-actions">
          <div className="events-filter" ref={filterRef}>
            <span>Уровень:</span>
            <button
              type="button"
              className={`events-filter-button ${filterOpen ? 'is-open' : ''}`}
              onClick={() => setFilterOpen((value) => !value)}
              aria-haspopup="listbox"
              aria-expanded={filterOpen}
            >
              <span>{levelFilter === 'ALL' ? 'Все' : levelFilter}</span>
              <FiChevronDown />
            </button>
            {filterOpen && (
              <div className="events-filter-menu" role="listbox">
                {(['ALL', 'INFO', 'WARN', 'ERROR'] as const).map((value) => (
                  <button
                    type="button"
                    role="option"
                    aria-selected={levelFilter === value}
                    className={levelFilter === value ? 'selected' : ''}
                    key={value}
                    onClick={() => { setLevelFilter(value); setFilterOpen(false); }}
                  >
                    <span>{value === 'ALL' ? 'Все' : value}</span>
                    {levelFilter === value && <FiCheck />}
                  </button>
                ))}
              </div>
            )}
          </div>
          <PanelFullscreenButton />
        </div>
      </div>

      <div className="events-table">
        <div className="events-table-header">
          <div>Время</div>
          <div>Уровень</div>
          <div>Сообщение</div>
          <div>Источник</div>
        </div>

        {filteredEvents.map((event, index) => (
          <div className="events-row" style={hoverTime != null && event.timestamp && Math.abs(Number(event.timestamp) - hoverTime) < 5000 ? { background: "rgba(96,165,250,0.12)" } : undefined} key={`${event.time}-${index}`}>
            <div className="events-cell event-time">{event.timestamp ? formatTimestamp(event.timestamp) : event.time}</div>

            <div className="events-cell event-level-cell">
              <span className={`event-level-badge ${getLevelClass(event.level)}`}>{event.level || 'INFO'}</span>
            </div>
            <div className="events-cell event-message">
              <span className="event-message-text">{event.message}</span>
            </div>

            <div className="events-cell source">
              {event.source}
            </div>
          </div>
        ))}

        {!loading && events.length === 0 && (
          <div className="events-loading">Событий пока нет</div>
        )}

        {loading && <div className="events-loading">Загрузка...</div>}
      </div>
    </div>
  );
}
