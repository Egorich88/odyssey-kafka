import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import type { KafkaCluster } from '../../../contexts/ClusterContext';
import { isSameHealthProfile } from '../../overview/clusterHealthProfile';

export interface TopicPermissions {
  createTopic: boolean;
  deleteTopic: boolean;
  alterTopicConfig: boolean;
}
const denied: TopicPermissions = Object.freeze({ createTopic: false, deleteTopic: false, alterTopicConfig: false });

export function useTopicPermissions(cluster: KafkaCluster | null) {
  const [snapshot, setSnapshot] = useState<{ profile: KafkaCluster; value: TopicPermissions } | null>(null);
  const revision = useRef(0);
  const revoke = useCallback(() => { revision.current++; setSnapshot(null); }, []);

  useEffect(() => {
    if (!cluster) { setSnapshot(null); return; }
    const request = new AbortController();
    const currentRevision = ++revision.current;
    void axios.get('/api/capabilities', {
      signal: request.signal,
      headers: { 'X-Kafka-Profile-ID': cluster.id, 'X-Kafka-Profile-Revision': String(cluster.revision) },
    }).then(response => {
      if (request.signal.aborted || revision.current !== currentRevision) return;
      const flags = response.data?.kafkaAdmin;
      setSnapshot({ profile: cluster, value: {
        createTopic: flags?.createTopic === true,
        deleteTopic: flags?.deleteTopic === true,
        alterTopicConfig: flags?.alterTopicConfig === true,
      } });
    }).catch(() => {
      if (!request.signal.aborted && revision.current === currentRevision) setSnapshot(null);
    });
    return () => request.abort();
  }, [cluster]);

  // Неизвестные права, ошибка и переключение профиля означают запрет.
  const permissions = snapshot && isSameHealthProfile(snapshot.profile, cluster) ? snapshot.value : denied;
  return { permissions, revoke };
}
