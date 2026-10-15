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
 * @file TimeRangePicker.tsx
 * @project Odyssey new 4.2.36
 * @description Компонент выбора периода для панелей обзора.
 * @changes Исправлено размещение иконок и адаптивность кнопки выбора периода.
 */

/**
 * =============================================================================
 * @file TimeRangePicker.tsx
 * =============================================================================
 * Компактный выбор периода в стиле Grafana.
 * Поддерживает быстрые относительные интервалы и абсолютный диапазон дат.
 * =============================================================================
 */

import { useEffect, useRef, useState } from 'react';
import { FiCalendar, FiChevronDown } from 'react-icons/fi';
import { RELATIVE_TIME_RANGES } from './constants';
import type { TimeRange } from './types';
import './page-header.css';

interface Props {
  value: TimeRange;
  onChange: (range: TimeRange) => void;
}

function toInputValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromInputValue(value: string): string {
  return value ? new Date(value).toISOString() : new Date().toISOString();
}

function formatAbsolute(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Абсолютный диапазон';

  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export default function TimeRangePicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    if (value.type === 'absolute') {
      setFrom(toInputValue(new Date(value.from)));
      setTo(toInputValue(new Date(value.to)));
    } else {
      const now = new Date();
      setTo(toInputValue(now));
      setFrom('');
    }
  }, [open, value]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [open]);

  const label = value.type === 'relative'
    ? value.label
    : `${formatAbsolute(value.from)} — ${formatAbsolute(value.to)}`;

  const applyAbsolute = () => {
    if (!from || !to) return;

    const fromDate = new Date(from);
    const toDate = new Date(to);
    if (fromDate >= toDate) return;

    onChange({
      type: 'absolute',
      from: fromInputValue(from),
      to: fromInputValue(to),
    });
    setOpen(false);
  };

  return (
    <div className="page-header-time-picker" ref={rootRef}>
      <button
        type="button"
        className={`page-header-control page-header-time-button ${open ? 'is-open' : ''}`}
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <FiCalendar className="page-header-control-icon time-range-calendar" />
        <span>{label}</span>
        <FiChevronDown className="page-header-chevron time-range-chevron" />
      </button>

      {open && (
        <div className="page-header-time-menu" role="dialog" aria-label="Выбор периода">
          <div className="page-header-menu-title">
            <span>Период</span>
          </div>

          <div className="page-header-range-list">
            {RELATIVE_TIME_RANGES.map((range) => (
              <button
                type="button"
                key={range.id}
                className={value.type === 'relative' && value.id === range.id ? 'selected' : ''}
                onClick={() => {
                  onChange(range);
                  setOpen(false);
                }}
              >
                {range.label}
              </button>
            ))}
          </div>

          <div className="page-header-menu-divider" />

          <div className="page-header-absolute-title">Абсолютный диапазон</div>

          <div className="page-header-datetime-grid">
            <label>
              <span>От</span>
              <input
                type="datetime-local"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
              />
            </label>
            <label>
              <span>До</span>
              <input
                type="datetime-local"
                value={to}
                onChange={(event) => setTo(event.target.value)}
              />
            </label>
          </div>

          <button
            type="button"
            className="page-header-apply-button"
            onClick={applyAbsolute}
            disabled={!from || !to || new Date(from) >= new Date(to)}
          >
            Применить
          </button>
        </div>
      )}
    </div>
  );
}
