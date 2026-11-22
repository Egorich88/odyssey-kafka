import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import axios from 'axios';
import { useCluster } from './ClusterContext';
import { useDashboardControls } from './DashboardControlsContext';
import { isSameHealthProfile } from '../pages/overview/clusterHealthProfile';

const ClusterHealthContext = createContext<{ data: any; loading: boolean }>({ data: null, loading: true });

// Один запрос health обслуживает Header и Overview через общий цикл обновления.
export function ClusterHealthProvider({ children }: { children: ReactNode }) {
  const { currentCluster } = useCluster();
  const { refreshPulse } = useDashboardControls();
  const [snapshot, setSnapshot] = useState<{ profile: typeof currentCluster; data: any } | null>(null);
  const [loading, setLoading] = useState(true);
  const connected = currentCluster?.connectionStatus === 'connected';
  const matches = snapshot && isSameHealthProfile(snapshot.profile, currentCluster);

  useEffect(() => {
    if (!currentCluster || !connected) return;
    const request = new AbortController();
    setLoading(true);
    void axios.get('/api/overview/health', {
      headers: { 'X-Kafka-Profile-ID': currentCluster.id },
      signal: request.signal,
    }).then(response => {
      if (!request.signal.aborted) setSnapshot({ profile: currentCluster, data: response.data });
    }).catch(() => {
      if (!request.signal.aborted) setSnapshot({ profile: currentCluster, data: null });
    }).finally(() => {
      if (!request.signal.aborted) setLoading(false);
    });
    return () => request.abort();
  }, [currentCluster, connected, refreshPulse]);

  const value = useMemo(() => ({
    data: connected && matches ? snapshot.data : null,
    loading: Boolean(currentCluster && (!connected || !matches || loading)),
  }), [connected, matches, snapshot, loading, currentCluster]);
  return <ClusterHealthContext.Provider value={value}>{children}</ClusterHealthContext.Provider>;
}

export const useClusterHealth = () => useContext(ClusterHealthContext);
