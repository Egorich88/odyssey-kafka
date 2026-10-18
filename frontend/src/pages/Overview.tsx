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
 *    названием, подсказкой, как добавить кластер, и ссылкой на документацию.
 * 2. Кластер выбран — дашборд из панелей: состояние кластера, сертификаты,
 *    пропускная способность, топики, отставание потребителей, события.
 *
 * Доступность Kafka контролируется ClusterContext/Layout.
 * Ошибка обновления данных не означает потерю соединения с Kafka
 * и не должна выбрасывать пользователя на экран ошибки.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { FiBookOpen } from 'react-icons/fi';
import './overview/styles/overview.css';
import { useCluster } from '../contexts/ClusterContext';
import { useDashboardControls } from '../contexts/DashboardControlsContext';
import ThroughputPanel from './overview/components/ThroughputPanel';
import TopicsPanel from './overview/components/TopicsPanel';
import ConsumerLagPanel from './overview/components/ConsumerLagPanel';
import EventsPanel from './overview/components/EventsPanel';
import ClusterHealthPanel from './overview/components/ClusterHealthPanel';
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
  underReplicated?: number;
  [key: string]: unknown;
}

export default function Overview(): JSX.Element {
  // Текущий выбранный кластер и элементы управления дашбордом (диапазон времени,
  // регистрация обработчика обновления, индикатор загрузки страницы).
  const { currentCluster } = useCluster();
  const { timeRange, registerRefreshHandler, setPageLoading } = useDashboardControls();

  // Данные для панелей дашборда.
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [consumerGroups, setConsumerGroups] = useState<unknown[]>([]);
  const [throughputData, setThroughputData] = useState<any[]>([]);
  const [messagesIn, setMessagesIn] = useState(0);
  const [messagesOut, setMessagesOut] = useState(0);
  // Ключ обновления: меняется после каждой успешной загрузки,
  // заставляя дочерние панели перезапросить свои данные.
  const [refreshKey, setRefreshKey] = useState(0);

  // Идентификатор последнего запроса — защита от гонок:
  // устаревший ответ не должен перезаписать более свежие данные.
  const requestIdRef = useRef(0);
  // Идентификатор кластера на прошлом рендере — чтобы отличать
  // переключение кластера от обычного обновления.
  const previousClusterIdRef = useRef<string | null>(null);

  // Диапазон времени для API и для панелей (относительный или абсолютный).
  const apiRange = timeRange.type === 'relative' ? timeRange.id : '24h';
  const panelTimeRange = timeRange.type === 'relative'
    ? timeRange.id
    : `absolute&from=${encodeURIComponent(timeRange.from)}&to=${encodeURIComponent(timeRange.to)}`;

  const currentClusterId = currentCluster?.id ?? null;
  // Адрес брокеров: используется как заголовок X-Kafka-Bootstrap.
  const bootstrap = currentCluster?.brokers || currentCluster?.bootstrapServers || '';

  /**
   * Сбрасывает данные дашборда при переключении кластера,
   * чтобы не показывать показатели предыдущего кластера.
   */
  const clearForClusterSwitch = useCallback(() => {
    setOverview(null);
    setConsumerGroups([]);
    setThroughputData([]);
    setMessagesIn(0);
    setMessagesOut(0);
    setRefreshKey(0);
  }, []);

  /**
   * Загружает данные дашборда: сводку, группы потребителей и пропускную способность.
   * Параллельные запросы, защита от гонок по requestId, индикатор загрузки.
   * Ошибки логируются, но не меняют статус подключения к Kafka.
   */
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

      // Если за это время стартовал более новый запрос — игнорируем ответ.
      if (requestId !== requestIdRef.current) return;

      setOverview(overviewResponse.data);
      setConsumerGroups(groupsResponse.data.groups || []);

      // Последняя точка графика даёт текущие входящий/исходящий потоки.
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
          >
            <FiBookOpen className="welcome-docs-icon" />
            <span>Документация</span>
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
        </div>
      </div>
    );
  }

  // Основной дашборд: три ряда панелей.
  return (
    <div className="dashboard-container">
      {/* Ряд 1: состояние кластера и сертификаты */}
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

      {/* Ряд 2: пропускная способность и топики */}
      <div className="dashboard-row dashboard-row-top">
        <div className="panel-throughput">
          <ThroughputPanel data={throughputData} />
        </div>
        <div className="panel-topics">
          <TopicsPanel timeRange={panelTimeRange} refreshKey={refreshKey} />
        </div>
      </div>

      {/* Ряд 3: отставание потребителей и последние события */}
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