/*
 * Copyright 2026 Egor Khomenko (Egorich88)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 */

/**
 * @file Overview.tsx
 * Главная страница мониторинга Odyssey.
 *
 * Отображает два состояния:
 * 1. Кластер не выбран — приветственный экран (welcome) с логотипом,
 *    названием, подсказкой, ссылкой на документацию и подписанными
 *    ссылками GitHub / Apache License 2.0.
 * 2. Кластер выбран — дашборд из панелей: состояние кластера, сертификаты,
 *    пропускная способность, топики, отставание потребителей, события.
 *
 * Доступность Kafka контролируется ClusterContext/Layout.
 * Ошибка обновления данных не означает потерю соединения с Kafka
 * и не должна выбрасывать пользователя на экран ошибки.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Tooltip } from 'react-tooltip';
import { FiBookOpen, FiGithub } from 'react-icons/fi';
import { SiApache } from 'react-icons/si';
import './overview/styles/overview.css';
import { useCluster } from '../contexts/ClusterContext';
import { useDashboardControls } from '../contexts/DashboardControlsContext';
import ThroughputPanel from './overview/components/ThroughputPanel';
import TopicsPanel from './overview/components/TopicsPanel';
import ConsumerLagPanel from './overview/components/ConsumerLagPanel';
import EventsPanel from './overview/components/EventsPanel';
import ClusterHealthPanel from './overview/components/ClusterHealthPanel';
import BrokersPanel from './overview/components/BrokersPanel';
import CertificatesPanel from './overview/components/CertificatesPanel';

/**
 * Данные сводки по кластеру, приходящие с /api/overview.
 * Поля необязательные, потому что бэкенд может отдавать разные наборы.
 */
interface OverviewData {
  topics?: number;
  topicCount?: number;
  partitions?: number;
  partitionCount?: number;
  consumerGroups?: number;
  consumerGroupsPartial?: boolean;
  underReplicated?: number;
  [key: string]: unknown;
}

export default function Overview(): JSX.Element {
  // Текущий выбранный кластер и элементы управления дашбордом.
  const { currentCluster } = useCluster();
  const { timeRange, registerRefreshHandler, setPageLoading } = useDashboardControls();

  // Данные для панелей дашборда.
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [consumerGroups, setConsumerGroups] = useState<{ groups?: unknown[]; partial?: boolean } | null>(null);
  const [throughputData, setThroughputData] = useState<any[]>([]);
  // Общая временная отметка курсора для всех графиков Overview.
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [messagesIn, setMessagesIn] = useState(0);
  const [messagesOut, setMessagesOut] = useState(0);
  // Ключ обновления: меняется после каждой успешной загрузки,
  // заставляя дочерние панели перезапросить свои данные.
  const [refreshKey, setRefreshKey] = useState(0);
  const [clusterHealth, setClusterHealth] = useState<any>(null);
  const [clusterHealthLoaded, setClusterHealthLoaded] = useState(false);

  // Стабильный callback не даёт эффекту ClusterHealthPanel запускать
  // повторный запрос после каждого обновления родительского компонента.
  const handleClusterHealthData = useCallback((value: any) => {
    setClusterHealth(value);
    setClusterHealthLoaded(true);
  }, []);

  // Идентификатор последнего запроса — защита от гонок.
  const requestIdRef = useRef(0);
  // Идентификатор кластера на прошлом рендере.
  const previousClusterIdRef = useRef<string | null>(null);

  // Диапазон времени для API и для панелей.
  const apiRange = timeRange.type === 'relative' ? timeRange.id : '24h';
  const panelTimeRange = timeRange.type === 'relative'
    ? timeRange.id
    : `absolute&from=${encodeURIComponent(timeRange.from)}&to=${encodeURIComponent(timeRange.to)}`;

  const currentClusterId = currentCluster?.id ?? null;
  // Адрес брокеров: используется как заголовок X-Kafka-Bootstrap.
  const bootstrap = currentCluster?.brokers || currentCluster?.bootstrapServers || '';

  /**
   * Сбрасывает данные дашборда при переключении кластера.
   */
  const clearForClusterSwitch = useCallback(() => {
    setHoverTime(null);
    setOverview(null);
    setConsumerGroups(null);
    setThroughputData([]);
    setMessagesIn(0);
    setMessagesOut(0);
    setRefreshKey(0);
    setClusterHealth(null);
    setClusterHealthLoaded(false);
  }, []);

  /**
   * Загружает данные дашборда: сводку, группы потребителей и пропускную способность.
   */
  const loadDashboard = useCallback(async () => {
    if (!currentCluster) return;

    if (!bootstrap || !currentClusterId) return;

    const requestId = ++requestIdRef.current;
    setPageLoading(true);

    // Очищаем данные только при фактическом переключении кластера.
    if (previousClusterIdRef.current !== currentClusterId) {
      previousClusterIdRef.current = currentClusterId;
      clearForClusterSwitch();
    }

    const headers = { 'X-Kafka-Bootstrap': bootstrap };
    const throughputQuery = timeRange.type === 'relative'
      ? `range=${timeRange.id}`
      : `range=${apiRange}&from=${encodeURIComponent(timeRange.from)}&to=${encodeURIComponent(timeRange.to)}`;

    try {
      const [overviewResponse, groupsResponse, throughputResponse] = await Promise.allSettled([
        axios.get<OverviewData>('/api/overview', { headers }),
        axios.get<{ groups?: unknown[]; partial?: boolean }>('/api/overview/consumer-groups', { headers }),
        axios.get<{ points?: any[] }>(`/api/overview/throughput?${throughputQuery}`, { headers }),
      ]);

      // Если за это время стартовал более новый запрос — игнорируем ответ.
      if (requestId !== requestIdRef.current) return;

      if (overviewResponse.status === 'fulfilled') setOverview(overviewResponse.value.data);
      setConsumerGroups(groupsResponse.status === 'fulfilled' ? groupsResponse.value.data : null);
      if (throughputResponse.status === 'fulfilled') {
        const points = throughputResponse.value.data.points || [];
        setThroughputData(points);
        const latest = points[points.length - 1];
        setMessagesIn(Number(latest?.incoming || 0));
        setMessagesOut(Number(latest?.outgoing || 0));
      }
      setRefreshKey((value) => value + 1);
    } catch (error) {
      // Ошибка обновления данных не равна потере Kafka-соединения.
      console.error('Ошибка обновления данных Overview:', error);
    } finally {
      if (requestId === requestIdRef.current) setPageLoading(false);
    }
  }, [apiRange, bootstrap, clearForClusterSwitch, currentClusterId, setPageLoading, timeRange]);

  // Загружаем данные при смене кластера или параметров загрузки.
  useEffect(() => {
    if (!currentClusterId) return;
    void loadDashboard();
  }, [currentClusterId, loadDashboard]);

  // Регистрируем обработчик ручного обновления для кнопки Refresh в шапке.
  useEffect(() => {
    registerRefreshHandler(loadDashboard);
    return () => registerRefreshHandler(null);
  }, [loadDashboard, registerRefreshHandler]);

  // Приветственный экран: кластер ещё не выбран.
  if (!currentCluster) {
    return (
      <div className="welcome-page">
        <div className="welcome-card">
          <a
            href="https://egorich88.github.io/odyssey-kafka/"
            target="_blank"
            rel="noreferrer"
            className="welcome-docs-link"
            data-tooltip-id="welcome-tooltip"
            data-tooltip-content="Открыть документацию"
            aria-label="Открыть документацию"
          >
            <FiBookOpen className="welcome-docs-icon" />
          </a>

          <div className="welcome-logo-wrap">
            <img src="/logo.svg" alt="ODYSSEY" className="welcome-logo" />
          </div>

          <div className="welcome-branding">
            <div className="welcome-subtitle">ODYSSEY</div>
            <div className="welcome-tagline">KAFKA MONITORING &amp; MANAGEMENT</div>
          </div>

          <div className="welcome-description">
            Чтобы начать работу — нажмите{' '}
            <span className="welcome-highlight">+ Добавить кластер</span>
          </div>

          <div className="welcome-links">
            <a
              href="https://github.com/Egorich88/odyssey-kafka"
              target="_blank"
              rel="noopener noreferrer"
              className="welcome-link"
              data-tooltip-id="welcome-tooltip"
              data-tooltip-content="Открыть на GitHub"
              aria-label="Открыть на GitHub"
            >
              <FiGithub />
              <span>GitHub</span>
            </a>
            <a
              href="https://www.apache.org/licenses/LICENSE-2.0"
              target="_blank"
              rel="noopener noreferrer"
              className="welcome-link"
              data-tooltip-id="welcome-tooltip"
              data-tooltip-content="Apache License 2.0"
              aria-label="Apache License 2.0"
            >
              <SiApache />
              <span>Apache License 2.0</span>
            </a>
          </div>
        </div>

        <Tooltip id="welcome-tooltip" place="bottom" offset={10} />
      </div>
    );
  }

  // Основной дашборд: три ряда панелей.
  return (
    <div className="dashboard-container">
      {/* Верхняя строка: сводка состояния кластера на всю ширину. */}
      <div className="dashboard-row dashboard-row-summary">
        <ClusterHealthPanel
          refreshKey={refreshKey}
          overview={overview}
          consumerGroups={consumerGroups?.groups}
          consumerGroupsPartial={consumerGroups?.partial}
          messagesIn={messagesIn}
          messagesOut={messagesOut}
          onData={handleClusterHealthData}
        />
      </div>

      {/* Второй ряд: брокеры слева, сертификаты справа. */}
      <div className="dashboard-row dashboard-row-status">
        <BrokersPanel data={clusterHealth} loading={!clusterHealthLoaded} />
        <CertificatesPanel refreshKey={refreshKey} />
      </div>

      {/* Третий ряд: общая пропускная способность шире панели топиков. */}
      <div className="dashboard-row dashboard-row-top">
        <div className="panel-throughput">
          <ThroughputPanel data={throughputData} hoverTime={hoverTime} onHoverTime={setHoverTime} />
        </div>
        <div className="panel-topics">
          <TopicsPanel timeRange={panelTimeRange} refreshKey={refreshKey} hoverTime={hoverTime} onHoverTime={setHoverTime} />
        </div>
      </div>

      {/* Нижний ряд: отставание потребителей и события. */}
      <div className="dashboard-row dashboard-row-main">
        <div className="panel-lag">
          <ConsumerLagPanel timeRange={panelTimeRange} refreshKey={refreshKey} hoverTime={hoverTime} onHoverTime={setHoverTime} />
        </div>
        <div className="panel-events">
          <EventsPanel
            refreshKey={refreshKey}
            timeRange={timeRange.type === 'relative' ? `range=${panelTimeRange}` : panelTimeRange}
            hoverTime={hoverTime}
          />
        </div>
      </div>
    </div>
  );
}
