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
 * @file DashboardControlsContext.tsx
 * =============================================================================
 * Глобальное состояние периода и автообновления страниц мониторинга Odyssey.
 * =============================================================================
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import {
  DEFAULT_REFRESH_INTERVAL,
  DEFAULT_TIME_RANGE,
  STORAGE_KEYS,
} from '../components/page-header/constants';

import type {
  RefreshHandler,
  TimeRange,
} from '../components/page-header/types';

interface DashboardControlsContextValue {
  timeRange: TimeRange;
  refreshInterval: number;
  refreshPulse: number;
  isRefreshing: boolean;
  pageLoading: boolean;
  setTimeRange: (range: TimeRange) => void;
  setRefreshInterval: (seconds: number) => void;
  setPageLoading: (loading: boolean) => void;
  refreshNow: () => Promise<void>;
  registerRefreshHandler: (handler: RefreshHandler | null) => void;
}

const DashboardControlsContext = createContext<DashboardControlsContextValue | null>(null);

function loadInitialTimeRange(): TimeRange {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.timeRange);
    if (!stored) return DEFAULT_TIME_RANGE;

    const parsed = JSON.parse(stored) as TimeRange;
    if (parsed?.type === 'relative' && typeof parsed.id === 'string' && typeof parsed.label === 'string') {
      return parsed;
    }
    if (parsed?.type === 'absolute' && typeof parsed.from === 'string' && typeof parsed.to === 'string') {
      return parsed;
    }
  } catch {
    // Повреждённое значение localStorage безопасно заменяем значением по умолчанию.
  }

  return DEFAULT_TIME_RANGE;
}

function loadInitialRefreshInterval(): number {
  const stored = Number(localStorage.getItem(STORAGE_KEYS.refreshInterval));
  return Number.isFinite(stored) && stored >= 0 ? stored : DEFAULT_REFRESH_INTERVAL;
}

export function DashboardControlsProvider({ children }: { children: ReactNode }) {
  const [timeRange, setTimeRangeState] = useState<TimeRange>(loadInitialTimeRange);
  const [refreshInterval, setRefreshIntervalState] = useState<number>(loadInitialRefreshInterval);
  const [refreshPulse, setRefreshPulse] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pageLoading, setPageLoading] = useState(false);

  const refreshHandlerRef = useRef<RefreshHandler | null>(null);
  const runningRef = useRef(false);

  const registerRefreshHandler = useCallback((handler: RefreshHandler | null) => {
    refreshHandlerRef.current = handler;
  }, []);

  const refreshNow = useCallback(async () => {
    if (runningRef.current) return;

    const handler = refreshHandlerRef.current;

    runningRef.current = true;
    setIsRefreshing(true);
    setRefreshPulse((value) => value + 1);

    try {
      if (handler) {
        await handler();
      }
    } finally {
      // Небольшая задержка позволяет увидеть вращение иконки даже
      // если API ответил практически мгновенно.
      window.setTimeout(() => {
        setIsRefreshing(false);
        runningRef.current = false;
      }, 650);
    }
  }, []);

  const setTimeRange = useCallback((range: TimeRange) => {
    setTimeRangeState(range);
    localStorage.setItem(STORAGE_KEYS.timeRange, JSON.stringify(range));
  }, []);

  const setRefreshInterval = useCallback((seconds: number) => {
    setRefreshIntervalState(seconds);
    localStorage.setItem(STORAGE_KEYS.refreshInterval, String(seconds));
  }, []);

  useEffect(() => {
    if (refreshInterval <= 0) return undefined;

    const timer = window.setInterval(() => {
      void refreshNow();
    }, refreshInterval * 1000);

    return () => window.clearInterval(timer);
  }, [refreshInterval, refreshNow]);

  const value = useMemo<DashboardControlsContextValue>(() => ({
    timeRange,
    refreshInterval,
    refreshPulse,
    isRefreshing,
    pageLoading,
    setTimeRange,
    setRefreshInterval,
    setPageLoading,
    refreshNow,
    registerRefreshHandler,
  }), [
    timeRange,
    refreshInterval,
    refreshPulse,
    isRefreshing,
    pageLoading,
    setTimeRange,
    setRefreshInterval,
    setPageLoading,
    refreshNow,
    registerRefreshHandler,
  ]);

  return (
    <DashboardControlsContext.Provider value={value}>
      {children}
    </DashboardControlsContext.Provider>
  );
}

export function useDashboardControls(): DashboardControlsContextValue {
  const context = useContext(DashboardControlsContext);

  if (!context) {
    throw new Error('useDashboardControls должен использоваться внутри DashboardControlsProvider.');
  }

  return context;
}
