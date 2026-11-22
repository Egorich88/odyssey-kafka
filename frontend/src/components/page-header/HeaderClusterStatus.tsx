import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import OdysseyTooltip from '../common/OdysseyTooltip';
import { FiCheckCircle, FiAlertCircle, FiXCircle, FiAlertTriangle } from 'react-icons/fi';
import { SiApachekafka } from 'react-icons/si';
import { useCluster } from '../../contexts/ClusterContext';
import { useClusterHealth } from '../../contexts/ClusterHealthContext';

const STATUS_ICONS = {
  healthy: FiCheckCircle, warning: FiAlertCircle, critical: FiXCircle,
  unknown: FiAlertTriangle, none: FiAlertTriangle, loading: FiAlertTriangle, unavailable: FiXCircle,
};

interface BrokerVersionEntry {
  id: number | string;
  address: string;
  version: string;
}

export default function HeaderClusterStatus() {
  const { t } = useTranslation();
  const { currentCluster } = useCluster();
  const { data, loading } = useClusterHealth();
  const versionTooltipId = useId();
  const statusTooltipId = useId();
  const uptimeTooltipId = useId();
  const label = (key: string) => t('headerCluster.' + key);
  let state: keyof typeof STATUS_ICONS = 'unknown';
  if (!currentCluster) state = 'none';
  else if (['disconnected', 'error'].includes(currentCluster.connectionStatus ?? '')) state = 'unavailable';
  else if (loading) state = 'loading';
  else if (data?.status === 'healthy' || data?.status === 'warning' || data?.status === 'critical') state = data.status;
  const StatusIcon = STATUS_ICONS[state];

  const brokers = Array.isArray(data?.brokers) ? data.brokers : [];
  const entries: BrokerVersionEntry[] = brokers.map((broker: any) => ({
    id: broker?.id ?? '—',
    address: broker?.address || label('addressUnknown'),
    version: typeof broker?.version === 'string' ? broker.version.trim() : '',
  }));
  entries.sort((a, b) => {
    const id = (value: number | string) => Number.isFinite(Number(value)) ? Number(value) : Number.MAX_SAFE_INTEGER;
    return id(a.id) - id(b.id);
  });
  const isKnown = (version: string) => !!version && version.toLowerCase() !== 'unknown';
  const versions = Array.from(new Set<string>(entries.map((broker: { version: string }) => broker.version).filter(isKnown))).sort();
  const versionState = versions.length > 1 ? 'different'
    : versions.length === 1 ? entries.some((broker: { version: string }) => !isKnown(broker.version)) ? 'partial' : 'single'
    : 'unknown';
  const version = versionState === 'single' ? versions[0]
    : label(versionState === 'unknown' ? 'versionUnknown' : versionState);
  const details = entries.length ? entries.map((broker: { id: number | string; address: string; version: string }) =>
    `${label('broker')} ${broker.id} (${broker.address}): ${isKnown(broker.version) ? broker.version : label('brokerVersionUnknown')}`
  ).join('\n') : label('versionsAbsent');
  const statusTooltip = label(state + 'Description');

  return <div className="header-cluster-status" aria-live="polite">
    <span className={'header-cluster-state is-' + state}>
      <span className="header-cluster-state-icon" tabIndex={0}
        data-tooltip-id={statusTooltipId} aria-label={statusTooltip}>
        <StatusIcon aria-hidden="true" />
      </span>
      <span className="header-cluster-state-copy">
        <strong>{label(state)}</strong>
        {/* Health API не подтверждает начало непрерывной работы всего кластера.
            Время брокера, подключения и запуска Odyssey не заменяет эту метрику. */}
        <small className="header-cluster-uptime" tabIndex={0} data-tooltip-id={uptimeTooltipId}>
          {label('uptimeLabel')}: {label('notAvailable')}
        </small>
      </span>
    </span>
    <OdysseyTooltip id={uptimeTooltipId} place="bottom" content={label('uptimeUnavailableDescription')} />
    <OdysseyTooltip id={statusTooltipId} place="bottom" clickable>
      <strong className="odyssey-tooltip-title">{label('statusTitle')}</strong>
      <div className="odyssey-tooltip-lines">
        <dl className="odyssey-tooltip-fields"><div><dt>{label('statusLabel')}</dt><dd>{label(state)}</dd></div></dl>
        <p>{statusTooltip}</p>
      </div>
    </OdysseyTooltip>
    {currentCluster && <><span className={'header-cluster-version is-' + versionState} tabIndex={0}
      data-tooltip-id={versionTooltipId}
      aria-label={`${label('versionTitle')}: ${version}. ${details}`}>
      <SiApachekafka className="header-cluster-version-logo" aria-hidden="true" />
      <span>{version}</span>
      {(versionState === 'different' || versionState === 'partial') &&
        <FiAlertTriangle className="header-cluster-version-warning" aria-hidden="true" />}
    </span>
      <OdysseyTooltip id={versionTooltipId} place="bottom" clickable>
        <strong className="odyssey-tooltip-title">{label('versionsTitle')}</strong>
        <div className="odyssey-tooltip-scroll header-kafka-tooltip-scroll" tabIndex={0} role="region" aria-label={label('versionsTitle')}>
          {entries.length ? <table aria-label={label('versionsTitle')}>
            <tbody>{entries.map((broker, index) => <tr key={`${broker.id}-${broker.address}-${index}`}>
              <th scope="row"><span>{label('broker')} {broker.id}</span><small>{broker.address}</small></th>
              <td>{isKnown(broker.version) ? broker.version : label('notAvailable')}</td>
            </tr>)}</tbody>
          </table> : <span>{label('versionsAbsent')}</span>}
        </div>
      </OdysseyTooltip>
    </>}
  </div>;
}
