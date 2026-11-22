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
 * =============================================================================
 * @file PageHeader.tsx
 * =============================================================================
 * Единая горизонтальная шапка страниц Odyssey.
 *
 * Показывает состояние Kafka и, только для мониторинговых страниц,
 * выбор периода и интервала обновления.
 * =============================================================================
 */

import { FiRefreshCw } from 'react-icons/fi';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import OdysseyTooltip from '../common/OdysseyTooltip';
import { useDashboardControls } from '../../contexts/DashboardControlsContext';
import TimeRangePicker from './TimeRangePicker';
import RefreshIntervalPicker from './RefreshIntervalPicker';
import type { PageHeaderMode } from './types';
import './page-header.css';
import HeaderClusterStatus from './HeaderClusterStatus';

interface Props {
  title: string;
  description: string;
  mode: PageHeaderMode;
  /** Подсвечивает верхнюю линию красным, если выбранный кластер недоступен. */
  clusterUnavailable?: boolean;
}

export default function PageHeader({ mode, clusterUnavailable = false }: Props) {
  const { t } = useTranslation();
  const refreshTooltipId = useId();
  const {
    timeRange,
    refreshInterval,
    isRefreshing,
    pageLoading,
    setTimeRange,
    setRefreshInterval,
    refreshNow,
  } = useDashboardControls();

  const loading = mode === 'monitoring' && (pageLoading || isRefreshing);

  return (
    <header className={`page-header-bar page-header-${mode} ${loading ? 'is-loading' : ''} ${clusterUnavailable ? 'is-cluster-unavailable' : ''}`}>
      <div className="page-header-loading-line" aria-hidden="true" />

      <HeaderClusterStatus />

      {mode === 'monitoring' && (
        <div className="page-header-controls">
          <TimeRangePicker value={timeRange} onChange={setTimeRange} />
          <RefreshIntervalPicker
            value={refreshInterval}
            onChange={setRefreshInterval}
          />
          <button
            type="button"
            className="page-header-refresh-button"
            onClick={() => void refreshNow()}
            disabled={isRefreshing}
            data-tooltip-id={refreshTooltipId}
            data-tooltip-content={t('headerControls.refresh')}
            aria-label={t('headerControls.refresh')}
          >
            <FiRefreshCw className={loading ? 'is-spinning' : ''} />
          </button>
          <OdysseyTooltip id={refreshTooltipId} place="bottom" />
        </div>
      )}
    </header>
  );
}
