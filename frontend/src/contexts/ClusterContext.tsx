/*
 * Copyright 2026 Egor Khomenko (Egorich88)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 */

/**
 * @file ClusterContext.tsx
 * Контекст выбранного Kafka-кластера.
 *
 * Важный принцип: изменение статуса подключения не должно само по себе
 * запускать новый health-check. Иначе при каждом ответе сервера создаётся
 * новый объект currentCluster и возникает цикл повторных проверок.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import axios from 'axios';

export type ClusterConnectionStatus = 'checking' | 'connected' | 'disconnected' | 'error' | 'unknown';

export interface KafkaCluster {
  id: string;
  name?: string;
  brokers?: string;
  bootstrapServers?: string;
  connectionStatus?: ClusterConnectionStatus;
  [key: string]: unknown;
}

interface ClusterContextValue {
  clusters: KafkaCluster[];
  currentCluster: KafkaCluster | null;
  addCluster: (cluster: Omit<KafkaCluster, 'id'>) => void;
  updateCluster: (cluster: KafkaCluster) => void;
  removeCluster: (clusterId: string) => void;
  changeCluster: (cluster: KafkaCluster) => void;
  updateClusterStatus: (clusterId: string, status: ClusterConnectionStatus) => void;
}

const ClusterContext = createContext<ClusterContextValue | undefined>(undefined);
const STORAGE_KEY = 'kafka_clusters';

// Проверяем синтаксис host:port до сетевого запроса, чтобы неверный ввод
// не оставлял интерфейс в промежуточном состоянии проверки. Имена хостов могут содержать буквы.
function hasValidBootstrap(value: string): boolean {
  const entries = value.split(',');
  if (!entries.length) return false;
  return entries.every((entry) => {
    const item = entry.trim();
    const match = item.match(/^(\[[0-9a-fA-F:]+\]|[^\s:,]+):(\d{1,5})$/);
    if (!match) return false;
    const port = Number(match[2]);
    return port >= 1 && port <= 65535;
  });
}
const CURRENT_CLUSTER_KEY = 'ksc_current_cluster_id';

export function ClusterProvider({ children }: { children: ReactNode }) {
  const [clusters, setClusters] = useState<KafkaCluster[]>([]);
  const [currentClusterId, setCurrentClusterId] = useState<string | null>(null);
  const currentCluster = clusters.find((cluster) => cluster.id === currentClusterId) ?? null;

  // Последний статус и число последовательных ошибок хранятся отдельно от
  // React state, чтобы health-check не зависел от смены объекта currentCluster.
  const statusRef = useRef(new Map<string, ClusterConnectionStatus>());
  const failuresRef = useRef(new Map<string, number>());

  const updateClusterStatus = useCallback((clusterId: string, status: ClusterConnectionStatus) => {
    statusRef.current.set(clusterId, status);
    if (status === 'connected') failuresRef.current.set(clusterId, 0);

    setClusters((previous) => previous.map((cluster) => (
      cluster.id === clusterId ? { ...cluster, connectionStatus: status } : cluster
    )));
  }, []);

  const checkClusterStatus = useCallback(async (cluster: KafkaCluster, initialCheck = false) => {
    const bootstrap = cluster.brokers || cluster.bootstrapServers;
    if (!bootstrap || !hasValidBootstrap(bootstrap)) {
      // Неверный формат сразу означает недоступность: никаких «загрузка/проверка».
      updateClusterStatus(cluster.id, 'disconnected');
      return;
    }

    // На старте и при переключении показываем явную проверку подключения.
    if (initialCheck) updateClusterStatus(cluster.id, 'checking');

    try {
      // Перед health-check регистрируем профиль в backend. Секреты не передаются
      // в каждом API-запросе: backend держит валидированную конфигурацию в памяти.
      // При перезапуске backend профиль автоматически регистрируется заново.
      const authType = String(cluster.authType || 'PLAINTEXT');
      const saslMechanism = String(cluster.saslMechanism || 'PLAIN');
      await axios.post('/api/clusters/config', {
        brokers: bootstrap,
        authType,
        username: String(cluster.username || ''),
        password: String(cluster.password || ''),
        cert: String(cluster.cert || ''),
        key: String(cluster.key || ''),
        ca: String(cluster.ca || ''),
        saslMechanism,
        kerberosUsername: String(cluster.kerberosUsername || ''),
        kerberosPassword: String(cluster.kerberosPassword || ''),
        kerberosRealm: String(cluster.kerberosRealm || ''),
        kerberosServiceName: String(cluster.kerberosServiceName || 'kafka'),
        kerberosConfigPath: String(cluster.kerberosConfigPath || '/etc/krb5.conf'),
        kerberosKeytabPath: String(cluster.kerberosKeytabPath || ''),
      }, { timeout: 7000 });

      const response = await axios.get<{ status?: string }>('/api/clusters/health', {
        headers: { 'X-Kafka-Bootstrap': bootstrap },
        // Backend выполняет быстрый health-check. 12 секунд оставляем как
        // защиту браузера от зависшего прокси/сети, но не проверяем каждые 5 с.
        timeout: 12000,
      });

      const connected = response.data?.status === 'connected';
      if (connected) {
        failuresRef.current.set(cluster.id, 0);
        updateClusterStatus(cluster.id, 'connected');
        return;
      }

      const failures = (failuresRef.current.get(cluster.id) ?? 0) + 1;
      failuresRef.current.set(cluster.id, failures);
      if (initialCheck || failures >= 2) updateClusterStatus(cluster.id, 'disconnected');
    } catch (error) {
      const failures = (failuresRef.current.get(cluster.id) ?? 0) + 1;
      failuresRef.current.set(cluster.id, failures);

      // Однократный сетевой timeout после уже успешного подключения не должен
      // выбрасывать пользователя с рабочей страницы. Для первого подключения
      // ошибка является достаточным основанием показать экран недоступности.
      if (initialCheck || failures >= 2) updateClusterStatus(cluster.id, 'error');
      console.warn('Проверка Kafka-кластера не завершилась успешно:', error);
    }
  }, [updateClusterStatus]);

  // Загружаем список и восстанавливаем ранее выбранный кластер.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return;

      const storedClusters = JSON.parse(stored) as KafkaCluster[];
      if (!Array.isArray(storedClusters) || storedClusters.length === 0) return;

      // Сохранённый статус connected устаревает после перезапуска приложения.
      // Каждый кластер должен заново пройти сетевую проверку перед показом страниц.
      const parsed = storedClusters.map((cluster) => ({
        ...cluster,
        connectionStatus: hasValidBootstrap(String(cluster.brokers || cluster.bootstrapServers || '')) ? 'checking' as ClusterConnectionStatus : 'disconnected' as ClusterConnectionStatus,
      }));
      setClusters(parsed);
      const savedId = localStorage.getItem(CURRENT_CLUSTER_KEY);
      const selected = parsed.find((cluster) => cluster.id === savedId) ?? parsed[0];
      setCurrentClusterId(selected.id);
    } catch (error) {
      console.error('Не удалось восстановить список Kafka-кластеров:', error);
    }
  }, []);

  // Проверяем только смену выбранного кластера. Изменение connectionStatus
  // больше не является зависимостью и поэтому не создаёт бесконечный цикл.
  useEffect(() => {
    if (!currentCluster) return;

    void checkClusterStatus(currentCluster, true);

    // Периодическая проверка нужна для уже открытой страницы, но она мягкая:
    // две последовательные ошибки необходимы, чтобы сменить статус на error.
    const timer = window.setInterval(() => {
      void checkClusterStatus(currentCluster, false);
    }, 30000);

    return () => window.clearInterval(timer);
  }, [currentClusterId, checkClusterStatus]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clusters));
  }, [clusters]);

  useEffect(() => {
    if (currentClusterId) localStorage.setItem(CURRENT_CLUSTER_KEY, currentClusterId);
    else localStorage.removeItem(CURRENT_CLUSTER_KEY);
  }, [currentClusterId]);

  const addCluster = useCallback((cluster: Omit<KafkaCluster, 'id'>) => {
    const newCluster: KafkaCluster = {
      ...cluster,
      id: Date.now().toString(),
      connectionStatus: hasValidBootstrap(String(cluster.brokers || cluster.bootstrapServers || '')) ? 'checking' : 'disconnected',
    };
    setClusters((previous) => [...previous, newCluster]);
    setCurrentClusterId(newCluster.id);
  }, []);

  const updateCluster = useCallback((updatedCluster: KafkaCluster) => {
    const nextCluster = { ...updatedCluster, connectionStatus: hasValidBootstrap(String(updatedCluster.brokers || updatedCluster.bootstrapServers || '')) ? 'checking' as ClusterConnectionStatus : 'disconnected' as ClusterConnectionStatus };
    setClusters((previous) => previous.map((cluster) => (
      cluster.id === updatedCluster.id ? nextCluster : cluster
    )));
  }, []);

  const removeCluster = useCallback((clusterId: string) => {
    const removed = clusters.find((cluster) => cluster.id === clusterId);
    const next = clusters.filter((cluster) => cluster.id !== clusterId);
    const removedBootstrap = removed?.brokers || removed?.bootstrapServers;
    const stillUsed = Boolean(removedBootstrap && next.some(
      (cluster) => (cluster.brokers || cluster.bootstrapServers) === removedBootstrap
    ));

    // Clear credentials from backend memory when no saved cluster uses this bootstrap.
    if (removedBootstrap && !stillUsed) {
      void axios.delete('/api/clusters/config', {
        headers: { 'X-Kafka-Bootstrap': removedBootstrap },
        timeout: 3000,
      }).catch(() => undefined);
    }

    setClusters(next);
    if (clusterId === currentClusterId) setCurrentClusterId(next[0]?.id ?? null);
  }, [clusters, currentClusterId]);

  const changeCluster = useCallback((cluster: KafkaCluster) => {
    // Сразу переводим новый кластер в checking: старые данные и старый статус
    // не должны визуально переходить на другой bootstrap.
    updateClusterStatus(cluster.id, 'checking');
    setCurrentClusterId(cluster.id);
  }, [updateClusterStatus]);

  return (
    <ClusterContext.Provider value={{
      clusters,
      currentCluster,
      addCluster,
      updateCluster,
      removeCluster,
      changeCluster,
      updateClusterStatus,
    }}>
      {children}
    </ClusterContext.Provider>
  );
}

export function useCluster(): ClusterContextValue {
  const context = useContext(ClusterContext);
  if (!context) throw new Error('useCluster должен использоваться внутри ClusterProvider');
  return context;
}
