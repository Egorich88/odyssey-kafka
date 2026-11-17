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

import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { FiAlertTriangle, FiGitBranch, FiLayers, FiUsers } from 'react-icons/fi';
import { LuChartNoAxesColumnIncreasing, LuCrown } from 'react-icons/lu';
import PanelInfo from '../../../components/common/PanelInfo';
import PanelFullscreenButton from './PanelFullscreenButton';
import BrokerDetails, { BrokerDetailsBoundary } from './BrokerDetails';
import '../styles/brokers-overview.css';

export interface Broker {
  id: number;
  address?: string;
  name?: string;
  rack?: string;
  version?: string;
  uptime?: string;
  brokerStatus?: string;
  controller?: boolean;
  cpu?: number | null;
  memory?: number | null;
  memoryTotal?: number;
  leaderCount?: number;
  replicaCount?: number;
  isrCount?: number;
  underReplicated?: number;
  diskUsage?: number;
  diskTotal?: number;
}

export interface BrokersPanelProps {
  data?: {
    brokers?: Broker[];
    status?: string;
    version?: string;
    uptime?: string;
    coordinators?: number;
    leaders?: number;
    replicasTotal?: number;
    isr?: { inSync: number; total: number };
    underReplicated?: number;
  } | null;
  loading?: boolean;
}

const hasValue = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

function readDisk(broker: Broker) {
  const { diskUsage: used, diskTotal: total } = broker;
  return hasValue(used) && hasValue(total) && total > 0 && used <= total ? { used, total } : null;
}

const statusOf = (broker: Broker) =>
  broker.brokerStatus === 'online' || broker.brokerStatus === 'offline' ? broker.brokerStatus : 'unknown';

export default function BrokersPanel({ data, loading = false }: BrokersPanelProps): JSX.Element {
  const { t, i18n } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const controlsRef = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef(false);
  useLayoutEffect(() => {
    const control = controlsRef.current?.querySelector('button');
    if (expanded || restoreFocus.current) control?.focus();
    restoreFocus.current = expanded;
  }, [expanded]);

  function trapFocus(event: KeyboardEvent<HTMLElement>) {
    if (!expanded || event.key !== 'Tab') return;
    const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]'
    ));
    const active = document.activeElement;
    if (!controls.length || !controls.includes(active as HTMLElement) ||
        active === (event.shiftKey ? controls[0] : controls.at(-1))) {
      event.preventDefault();
      (event.shiftKey ? controls.at(-1) : controls[0])?.focus();
    }
  }

  const label = (key: string) => t('brokerOverview.' + key);
  const unavailable = label('unavailable');
  const format = new Intl.NumberFormat(i18n?.language, { maximumFractionDigits: 1 });
  const number = (value?: number | null) => hasValue(value) ? format.format(value) : unavailable;
  const percent = (value: number | null) => value === null ? unavailable : number(Math.round(value)) + '%';
  const volume = (used: number, total: number) => number(used) + ' / ' + number(total) + ' GiB';
  const brokers = loading ? [] : data?.brokers ?? [];
  const rows = brokers.map(broker => ({ broker, disk: readDisk(broker) }));
  const totals = rows.reduce((sum, { disk }) => disk
    ? { used: sum.used + disk.used, total: sum.total + disk.total, count: sum.count + 1 }
    : sum, { used: 0, total: 0, count: 0 });
  const measured = brokers.flatMap(broker => hasValue(broker.cpu) ? [{ id: broker.id, cpu: broker.cpu }] : []);
  const peak = measured.reduce<typeof measured[number] | null>((max, entry) =>
    !max || entry.cpu > max.cpu ? entry : max, null);
  const peakBroker = peak ? rows.find(({ broker }) => broker.id === peak.id) : undefined;
  const metrics = [
    { key: 'cpu', value: measured.length ? measured.reduce((sum, entry) => sum + entry.cpu, 0) / measured.length : null,
      detail: peak ? t('brokerOverview.cpuPeak', { value: percent(peak.cpu), id: peak.id }) : null },
    { key: 'memory', value: null, detail: null },
    { key: 'disk', value: totals.total ? totals.used / totals.total * 100 : null,
      detail: totals.total ? volume(totals.used, totals.total) : null },
  ];
  const summary = [
    { key: 'leaders', icon: LuCrown, value: number(data?.leaders) },
    { key: 'replicas', icon: FiLayers, value: number(data?.replicasTotal) },
    { key: 'isr', icon: FiGitBranch, value: data?.isr ? number(data.isr.inSync) + ' / ' + number(data.isr.total) : unavailable },
    { key: 'urp', icon: FiAlertTriangle, value: number(data?.underReplicated) },
    { key: 'coordinators', icon: FiUsers, value: number(data?.coordinators) },
  ];

  return (
    <section className="dashboard-panel brokers-overview-panel"
      role={expanded ? 'dialog' : undefined} aria-modal={expanded || undefined}
      aria-label={expanded ? t('brokerDetails.title') : t('brokers')} onKeyDown={trapFocus}>
      {expanded ? (
        <BrokerDetailsBoundary message={t('brokerDetails.error')}>
          <BrokerDetails data={data} loading={loading} />
        </BrokerDetailsBoundary>
      ) : <>
      <div className="panel-header">
        <div className="panel-title-with-info">
          <FiLayers aria-hidden="true" />
          <span>{t('brokers')}</span>
          <PanelInfo title={t('brokers')} description={label('description')} />
        </div>
      </div>
      {loading || !brokers.length ? (
        <p className="cluster-broker-empty" role="status">{label(loading ? 'loading' : 'empty')}</p>
      ) : (
        <div className="broker-overview-content">
          <div className="broker-overview-resources">
            <div className="broker-overview-gauge">
              <svg viewBox="0 0 180 180" aria-hidden="true">
                <circle className="broker-overview-outline" cx="90" cy="90" r="89" />
                {metrics.map(({ key, value }, index) => (
                  <g key={key} className={'broker-metric-' + key}>
                    <circle className="broker-overview-track" cx="90" cy="90" r={81 - index * 14} />
                    {value !== null && value > 0 && (
                      <circle className="broker-overview-arc" cx="90" cy="90" r={81 - index * 14}
                        pathLength="100" strokeDasharray={Math.min(value, 100) + ' 100'} transform="rotate(-90 90 90)" />
                    )}
                  </g>
                ))}
              </svg>
              <div className="broker-overview-count">
                <strong>{number(brokers.length)}</strong>
                <span>{label('count')}</span>
                <small className="broker-overview-online">{t('brokerOverview.onlineCount', { count: brokers.filter(broker => statusOf(broker) === 'online').length })}</small>
              </div>
            </div>
            <dl className="broker-overview-legend">
              {metrics.map(({ key, value, detail }) => (
                <div key={key} className={'broker-metric-' + key}>
                  <dt>{label(key)}</dt>
                  <dd className="broker-overview-legend-value"><strong>{percent(value)}</strong></dd>
                  {detail && <dd className="broker-overview-legend-detail"><small>{detail}</small></dd>}
                  {key === 'disk' && totals.count < brokers.length && (
                    <dd className="broker-overview-legend-detail">
                      <small>{t('brokerOverview.coverage', { available: totals.count, total: brokers.length })}</small>
                    </dd>
                  )}
                </div>
              ))}
            </dl>
          </div>
          <div className="broker-overview-table-wrap" tabIndex={0} aria-label={t('brokers')}>
            <table className="broker-overview-table">
              <thead><tr>
                <th scope="col">{label('broker')}</th>
                {metrics.map(({ key }) => <th key={key} scope="col">{label(key)}</th>)}
              </tr></thead>
              <tbody>{rows.map(({ broker, disk }) => {
                const status = statusOf(broker);
                const statusLabel = t('brokerStatus.' + status);
                const address = broker.address?.trim() || String(broker.id);
                const values = [hasValue(broker.cpu) ? broker.cpu : null, null, disk ? disk.used / disk.total * 100 : null];
                return (
                  <tr key={broker.id}>
                    <th scope="row">
                      <span className={'broker-overview-identity broker-' + status}>
                        <i aria-hidden="true" title={statusLabel} />
                        <span title={address}>{address}</span>
                      </span>
                      <small className={'broker-' + status}>{statusLabel}</small>
                      {broker.controller && <small className="broker-controller">{label('controller')}</small>}
                    </th>
                    {metrics.map(({ key }, index) => {
                      const value = values[index];
                      return <td key={key} className={'broker-metric-' + key}
                        title={key === 'disk' ? (disk ? volume(disk.used, disk.total) : t('brokerResources.diskUnavailable'))
                          : value === null && key === 'cpu' ? t('brokerResources.cpuUnavailable') : undefined}>
                        <span className={value === null ? 'broker-overview-meter is-unavailable' : 'broker-overview-meter'}>
                          {value !== null && <span className="broker-overview-meter-track" aria-hidden="true">
                            <span style={{ width: Math.min(value, 100) + '%' }} />
                          </span>}
                          <b>{percent(value)}</b>
                        </span>
                      </td>;
                    })}
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
          <dl className="broker-overview-kpis">
            {summary.map(({ key, icon: Icon, value }) => (
              <div key={key}><dt><Icon aria-hidden="true" />{label(key)}</dt><dd>{value}</dd></div>
            ))}
          </dl>
        </div>
      )}
      </>}
      {!expanded && (
        <div className="broker-overview-footer">
          <span><LuChartNoAxesColumnIncreasing aria-hidden="true" />{label('peak')}</span>
          {peak && peakBroker ? (
            <span className="broker-overview-peak-values">
              <strong>{label('broker')} {peak.id}</strong>
              <span className="broker-metric-cpu">{label('cpu')}: <b>{percent(peak.cpu)}</b></span>
              <span className="broker-metric-memory">{label('memory')}: <b className="is-unavailable">{unavailable}</b></span>
              <span className="broker-metric-disk">{label('disk')}: <b className={peakBroker.disk ? undefined : 'is-unavailable'}>
                {percent(peakBroker.disk ? peakBroker.disk.used / peakBroker.disk.total * 100 : null)}
              </b></span>
            </span>
          ) : <strong>{unavailable}</strong>}
        </div>
      )}
      <div ref={controlsRef} className={expanded ? 'broker-details-controls' : 'broker-overview-expand'}>
        <PanelFullscreenButton expandLabel={label('expandPanel')} collapseLabel={label('collapse')}
          onFullscreenChange={setExpanded} />
      </div>
    </section>
  );
}
