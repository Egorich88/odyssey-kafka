import { useCluster } from '../contexts/ClusterContext';
import { ownerFetch } from '../security/ownerSession';

export function useKafkaFetch() {
  const { currentCluster } = useCluster();

  const kafkaFetch = async (url, options = {}) => {
    if (!currentCluster) {
      throw new Error('No cluster selected');
    }
    const headers = {
      'Content-Type': 'application/json',
      'X-Kafka-Profile-ID': currentCluster.id,
          'X-Kafka-Profile-Revision': String(currentCluster.revision),
      ...options.headers,
    };
    const response = await ownerFetch(url, {
      ...options,
      headers,
    });
    if (!response.ok) {
      let errorMsg = `Request failed with status ${response.status}`;
      try {
        const errorData = await response.json();
        errorMsg = errorData.error || errorMsg;
      } catch (e) {}
      throw new Error(errorMsg);
    }
    return response.json();
  };

  return kafkaFetch;
}
