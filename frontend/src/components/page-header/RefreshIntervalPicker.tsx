/*
 * Copyright 2026 Egor Khomenko (Egorich88)
 *
 * Licensed under the Apache License, Version 2.0.
 */

/**
 * @file RefreshIntervalPicker.tsx
 * Современный компактный выбор интервала автообновления.
 * Выпадающее меню не использует нативный select, чтобы одинаково
 * выглядеть во всех темах и браузерах.
 */

import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import OdysseyTooltip from '../common/OdysseyTooltip';
import { FiChevronDown } from 'react-icons/fi';
import { REFRESH_INTERVALS } from './constants';
import type { RefreshInterval } from './types';

interface Props {
  value: number;
  onChange: (seconds: number) => void;
}

export default function RefreshIntervalPicker({ value, onChange }: Props): JSX.Element {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();
  const tooltipId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selected = REFRESH_INTERVALS.find((item) => item.value === value) ?? REFRESH_INTERVALS[0];

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div className="page-header-refresh-picker" ref={rootRef}>
      <button
        type="button"
        className={`page-header-flat-control ${open ? 'is-open' : ''}`}
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('headerControls.interval')}
        data-tooltip-id={open ? undefined : tooltipId}
        data-tooltip-content={t('headerControls.interval')}
      >
        <strong>{selected.label}</strong>
        <FiChevronDown />
      </button>

      <OdysseyTooltip id={tooltipId} place="bottom" hidden={open} />

      {open && (
        <div className="page-header-refresh-menu" role="listbox" aria-label="Интервал обновления">
          {REFRESH_INTERVALS.map((item: RefreshInterval) => (
            <button
              type="button"
              role="option"
              aria-selected={item.value === value}
              className={item.value === value ? 'selected' : ''}
              key={item.value}
              onClick={() => {
                onChange(item.value);
                setOpen(false);
              }}
            >
              <span>{item.label}</span>
              {item.value === value && <span className="page-header-check">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
