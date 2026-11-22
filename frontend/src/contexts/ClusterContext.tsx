import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { migrateLegacyProfiles, profileConfig, validServerProfile } from '../security/profileMigration';

export type ClusterConnectionStatus = 'checking' | 'connected' | 'disconnected' | 'error' | 'unknown';
export interface KafkaCluster {
  id: string;
  name?: string;
  brokers?: string;
  bootstrapServers?: string;
  revision?: number;
  connectionStatus?: ClusterConnectionStatus;
  [key: string]: unknown;
}
interface ClusterContextValue {
  clusters: KafkaCluster[];
  currentCluster: KafkaCluster | null;
  addCluster: (cluster: Omit<KafkaCluster, 'id'>) => Promise<boolean>;
  updateCluster: (cluster: KafkaCluster) => Promise<boolean>;
  removeCluster: (id: string) => Promise<boolean>;
  changeCluster: (cluster: KafkaCluster) => void;
  updateClusterStatus: (id: string, status: ClusterConnectionStatus) => void;
}
const ClusterContext = createContext<ClusterContextValue | undefined>(undefined);
const CURRENT_CLUSTER_KEY = 'ksc_current_cluster_id';

export function ClusterProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [clusters, setClusters] = useState<KafkaCluster[]>([]);
  const [currentClusterId, setCurrentClusterId] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const mounted = useRef(false);
  const failures = useRef(new Map<string, number>());
  const currentCluster = clusters.find(cluster => cluster.id === currentClusterId) ?? null;

  useEffect(() => {
    mounted.current = true;
    const request = new AbortController();
    void (async () => {
      setError(false);
      try { await migrateLegacyProfiles(localStorage, request.signal); }
      catch { if (!request.signal.aborted) setError(true); }
      if (request.signal.aborted) return;
      try {
        const response = await axios.get('/api/kafka-profiles', { signal: request.signal, timeout: 7000 });
        if (request.signal.aborted) return;
        if (!Array.isArray(response.data) || !response.data.every(validServerProfile)) throw new Error('Invalid profiles');
        // Не копируем произвольные поля ответа в состояние и браузерное хранилище.
        const profiles = response.data.map(({ id, name, brokers, authType, saslMechanism, revision }) => ({
          id, name, brokers, authType, saslMechanism, revision, connectionStatus: 'checking' as ClusterConnectionStatus,
        }));
        setClusters(profiles);
        const saved = localStorage.getItem(CURRENT_CLUSTER_KEY);
        setCurrentClusterId(profiles.find(p => p.id === saved)?.id ?? profiles[0]?.id ?? null);
      } catch { if (!request.signal.aborted) setError(true); }
    })();
    return () => { mounted.current = false; request.abort(); };
  }, [retry]);

  const updateClusterStatus = useCallback((id: string, status: ClusterConnectionStatus) => {
    setClusters(previous => previous.map(p => p.id === id && p.connectionStatus !== status ? { ...p, connectionStatus: status } : p));
  }, []);

  useEffect(() => {
    if (!currentCluster) return;
    const profile = currentCluster;
    const request = new AbortController();
    let inFlight = false;
    const check = async (initial = false) => {
      if (inFlight) return;
      inFlight = true;
      if (initial) updateClusterStatus(profile.id, 'checking');
      try {
        const response = await axios.get('/api/clusters/health', {
          headers: { 'X-Kafka-Profile-ID': profile.id }, signal: request.signal, timeout: 12000,
        });
        if (request.signal.aborted) return;
        if (response.data?.status === 'connected') { failures.current.set(profile.id, 0); updateClusterStatus(profile.id, 'connected'); }
        else {
          const count = (failures.current.get(profile.id) || 0) + 1; failures.current.set(profile.id, count);
          if (initial || count >= 2) updateClusterStatus(profile.id, 'disconnected');
        }
      } catch {
        if (request.signal.aborted) return;
        const count = (failures.current.get(profile.id) || 0) + 1; failures.current.set(profile.id, count);
        if (initial || count >= 2) updateClusterStatus(profile.id, 'error');
      } finally { inFlight = false; }
    };
    void check(true);
    const timer = window.setInterval(() => void check(), 30000);
    return () => { request.abort(); window.clearInterval(timer); };
  }, [currentClusterId, currentCluster?.revision, updateClusterStatus]);

  useEffect(() => { if (currentClusterId && !localStorage.getItem('kafka_clusters')) localStorage.setItem(CURRENT_CLUSTER_KEY, currentClusterId); }, [currentClusterId]);

  const save = useCallback(async (input: Omit<KafkaCluster, 'id'> | KafkaCluster, update: boolean) => {
    // Не допускаем изменения уже перенесённой записи до завершения всего переноса.
    if (localStorage.getItem('kafka_clusters')) { setError(true); return false; }
    try {
      const previous = update ? clusters.find(p => p.id === input.id) : undefined;
      if (update && !previous) return false;
      const payload = { name: String(input.name || ''), config: profileConfig(input), revision: previous?.revision, preserveSecrets: update };
      const response = update
        ? await axios.put(`/api/kafka-profiles/${encodeURIComponent(previous!.id)}`, payload, { timeout: 10000 })
        : await axios.post('/api/kafka-profiles', payload, { timeout: 10000 });
      if (!validServerProfile(response.data)) throw new Error('Invalid profile');
      if (!mounted.current) return false;
      const { id, name, brokers, authType, saslMechanism, revision } = response.data;
      const profile: KafkaCluster = { id, name, brokers, authType, saslMechanism, revision, connectionStatus: 'checking' };
      failures.current.delete(id);
      setClusters(old => update ? old.map(p => p.id === id ? profile : p) : [...old, profile]);
      if (!update) setCurrentClusterId(id);
      setError(false); return true;
    } catch { if (mounted.current) setError(true); return false; }
  }, [clusters]);
  const addCluster = useCallback((p: Omit<KafkaCluster, 'id'>) => save(p, false), [save]);
  const updateCluster = useCallback((p: KafkaCluster) => save(p, true), [save]);
  const removeCluster = useCallback(async (id: string) => {
    if (localStorage.getItem('kafka_clusters')) { setError(true); return false; }
    const previous = clusters.find(p => p.id === id);
    if (!previous) return false;
    try {
      await axios.delete(`/api/kafka-profiles/${encodeURIComponent(id)}`, { headers: { 'If-Match': String(previous.revision) }, timeout: 7000 });
      if (!mounted.current) return false;
      setClusters(old => old.filter(p => p.id !== id)); failures.current.delete(id);
      if (currentClusterId === id) setCurrentClusterId(clusters.find(p => p.id !== id)?.id ?? null);
      setError(false); return true;
    } catch { if (mounted.current) setError(true); return false; }
  }, [clusters, currentClusterId]);
  const changeCluster = useCallback((p: KafkaCluster) => { updateClusterStatus(p.id, 'checking'); setCurrentClusterId(p.id); }, [updateClusterStatus]);

  return <ClusterContext.Provider value={{ clusters, currentCluster, addCluster, updateCluster, removeCluster, changeCluster, updateClusterStatus }}>
    {error && <div className="owner-profile-error" role="alert">{t('owner.profileError')} <button type="button" onClick={() => setRetry(value => value + 1)}>{t('owner.retry')}</button></div>}
    {children}
  </ClusterContext.Provider>;
}
export function useCluster(): ClusterContextValue {
  const context = useContext(ClusterContext);
  if (!context) throw new Error('useCluster должен использоваться внутри ClusterProvider');
  return context;
}
