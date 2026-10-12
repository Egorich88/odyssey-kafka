/*
 * Copyright 2026 Egor Khomenko (Egorich88)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 */

/**
 * @file Overview.tsx
 * Главная мониторинговая страница Odyssey.
 *
 * Важно: доступность Kafka контролируется ClusterContext/Layout.
 * Автообновление данных страницы не меняет статус подключения кластера и
 * поэтому никогда не должно выбрасывать пользователя на экран ошибки.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { FiCode, FiInfo, FiPlus, FiStar } from 'react-icons/fi';
import './overview/styles/overview.css';
import { useCluster } from '../contexts/ClusterContext';
import { useDashboardControls } from '../contexts/DashboardControlsContext';
import ThroughputPanel from './overview/components/ThroughputPanel';
import TopicsPanel from './overview/components/TopicsPanel';
import ConsumerLagPanel from './overview/components/ConsumerLagPanel';
import EventsPanel from './overview/components/EventsPanel';
import ClusterHealthPanel from './overview/components/ClusterHealthPanel';
import CertificatesPanel from './overview/components/CertificatesPanel';

interface OverviewData {
  topics?: number;
  topicCount?: number;
  partitions?: number;
  partitionCount?: number;
  consumerGroups?: number;
  underReplicated?: number;
  [key: string]: unknown;
}

export default function Overview(): JSX.Element {
  const { currentCluster } = useCluster();
  const { timeRange, registerRefreshHandler, setPageLoading } = useDashboardControls();

  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [consumerGroups, setConsumerGroups] = useState<unknown[]>([]);
  const [throughputData, setThroughputData] = useState<any[]>([]);
  const [messagesIn, setMessagesIn] = useState(0);
  const [messagesOut, setMessagesOut] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const requestIdRef = useRef(0);
  const previousClusterIdRef = useRef<string | null>(null);

  const apiRange = timeRange.type === 'relative' ? timeRange.id : '24h';
  const panelTimeRange = timeRange.type === 'relative'
    ? timeRange.id
    : `absolute&from=${encodeURIComponent(timeRange.from)}&to=${encodeURIComponent(timeRange.to)}`;
  const currentClusterId = currentCluster?.id ?? null;
  const bootstrap = currentCluster?.brokers || currentCluster?.bootstrapServers || '';

  const clearForClusterSwitch = useCallback(() => {
    setOverview(null);
    setConsumerGroups([]);
    setThroughputData([]);
    setMessagesIn(0);
    setMessagesOut(0);
    setRefreshKey(0);
  }, []);

  const loadDashboard = useCallback(async () => {
    if (!currentCluster) return;

    if (!bootstrap || !currentClusterId) return;

    const requestId = ++requestIdRef.current;
    setPageLoading(true);

    // Очищаем данные только при фактическом переключении кластера.
    // Обычный refresh сохраняет текущий график до прихода новых данных.
    if (previousClusterIdRef.current !== currentClusterId) {
      previousClusterIdRef.current = currentClusterId;
      clearForClusterSwitch();
    }

    const headers = { 'X-Kafka-Bootstrap': bootstrap };
    const throughputQuery = timeRange.type === 'relative'
      ? `range=${timeRange.id}`
      : `range=${apiRange}&from=${encodeURIComponent(timeRange.from)}&to=${encodeURIComponent(timeRange.to)}`;

    try {
      const [overviewResponse, groupsResponse, throughputResponse] = await Promise.all([
        axios.get<OverviewData>('/api/overview', { headers }),
        axios.get<{ groups?: unknown[] }>('/api/overview/consumer-groups', { headers }),
        axios.get<{ points?: any[] }>(`/api/overview/throughput?${throughputQuery}`, { headers }),
      ]);

      if (requestId !== requestIdRef.current) return;

      setOverview(overviewResponse.data);
      setConsumerGroups(groupsResponse.data.groups || []);

      const points = throughputResponse.data.points || [];
      setThroughputData(points);
      const latest = points[points.length - 1];
      setMessagesIn(Number(latest?.incoming || 0));
      setMessagesOut(Number(latest?.outgoing || 0));
      setRefreshKey((value) => value + 1);
    } catch (error) {
      // Ошибка обновления данных не равна потере Kafka-соединения.
      // ClusterContext отдельно контролирует доступность выбранного кластера.
      console.error('Ошибка обновления данных Overview:', error);
    } finally {
      if (requestId === requestIdRef.current) setPageLoading(false);
    }
  }, [apiRange, bootstrap, clearForClusterSwitch, currentClusterId, setPageLoading, timeRange]);

  useEffect(() => {
    if (!currentClusterId) return;
    void loadDashboard();
  }, [currentClusterId, loadDashboard]);

  useEffect(() => {
    registerRefreshHandler(loadDashboard);
    return () => registerRefreshHandler(null);
  }, [loadDashboard, registerRefreshHandler]);

  if (!currentCluster) {
    return (
      <div className="welcome-page">
        <div className="welcome-card">
          <div className="welcome-logo-wrap">
            <img src="/logo.svg" alt="ODYSSEY" className="welcome-logo" />
          </div>

          <div className="welcome-branding">
            <div className="welcome-subtitle">ODYSSEY</div>
            <div className="welcome-tagline">KAFKA MONITORING &amp; MANAGEMENT</div>
          </div>

          <div className="welcome-feature">
            <div className="welcome-icon-box"><FiInfo /></div>
            <div className="welcome-feature-text">
              Современный интерфейс для работы с <a href="https://kafka.apache.org/" target="_blank" rel="noreferrer">Apache Kafka</a>
            </div>
          </div>
          <div className="welcome-feature">
            <div className="welcome-icon-box"><FiPlus /></div>
            <div className="welcome-feature-text">
              Чтобы начать работу — нажмите <span className="welcome-highlight">+ Добавить кластер</span>
            </div>
          </div>
          <div className="welcome-feature">
            <div className="welcome-icon-box"><FiCode /></div>
            <div className="welcome-feature-text">
              Проект распространяется по лицензии <a href="https://www.apache.org/licenses/LICENSE-2.0" target="_blank" rel="noreferrer">Apache License 2.0</a>
            </div>
          </div>
          <a href="https://github.com/Egorich88/kafka-system-control-4" target="_blank" rel="noreferrer" className="welcome-github">
            <FiStar className="welcome-github-icon" />
            <span>Поддержите проект на GitHub</span>
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <div className="dashboard-row dashboard-row-status">
        <ClusterHealthPanel
          refreshKey={refreshKey}
          overview={overview}
          consumerGroups={consumerGroups}
          messagesIn={messagesIn}
          messagesOut={messagesOut}
        />
        <CertificatesPanel refreshKey={refreshKey} />
      </div>

      <div className="dashboard-row dashboard-row-top">
        <div className="panel-throughput">
          <ThroughputPanel data={throughputData} />
        </div>
        <div className="panel-topics">
          <TopicsPanel timeRange={panelTimeRange} refreshKey={refreshKey} />
        </div>
      </div>

      <div className="dashboard-row dashboard-row-main">
        <div className="panel-lag">
          <ConsumerLagPanel timeRange={panelTimeRange} refreshKey={refreshKey} />
        </div>
        <div className="panel-events">
          <EventsPanel refreshKey={refreshKey} />
        </div>
      </div>
    </div>
  );
}
