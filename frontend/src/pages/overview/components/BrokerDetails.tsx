import { Component, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { FiGrid, FiHardDrive, FiList, FiServer } from 'react-icons/fi';
import { BrokerIcon } from '../../../components/common/BrokerIcon';
import { LuCrown } from 'react-icons/lu';
import type { Broker, BrokersPanelProps } from './BrokersPanel';
import BrokerResourceRing from './BrokerResourceRing';
import { controllerRole } from '../controllerRole';
import '../styles/broker-details.css';

export class BrokerDetailsBoundary extends Component<{ children: ReactNode; message: string }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? <p role="alert">{this.props.message}</p> : this.props.children;
  }
}

const valid = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const ratio = (used?: number | null, total?: number) =>
  valid(used) && valid(total) && total > 0 && used <= total ? used / total * 100 : null;
const statusOf = (broker: Broker) => ['online', 'offline'].includes(broker.brokerStatus ?? '') ? broker.brokerStatus! : 'unknown';

const resourceKeys = ['cpu', 'memory', 'disk'] as const;
const partitionKeys = ['leaders', 'replicas', 'isr', 'urp'] as const;
type SortKey = 'id' | typeof resourceKeys[number];

function resource(broker: Broker, key: typeof resourceKeys[number]) {
  if (key === 'cpu') return valid(broker.cpu) ? broker.cpu : null;
  return key === 'memory' ? ratio(broker.memory, broker.memoryTotal) : ratio(broker.diskUsage, broker.diskTotal);
}

function Gauge({ metric, value }: { metric: typeof resourceKeys[number]; value: number | null }) {
  return <div className={'broker-detail-gauge broker-metric-' + metric}>
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <BrokerResourceRing metric={metric} value={value} center={32} radius={26.5} strokeWidth={7.25} />
    </svg>
  </div>;
}

export default function BrokerDetails({ data, loading }: BrokersPanelProps) {
  const { t, i18n } = useTranslation();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [rack, setRack] = useState('');
  const [sort, setSort] = useState<SortKey>('id');
  const [list, setList] = useState(false);
  const brokers = loading ? [] : data?.brokers ?? [];
  const racks = Array.from(new Set(brokers.flatMap(broker => broker.rack ? [broker.rack] : []))).sort();
  const available = (key: SortKey) => key === 'id' || brokers.some(broker => resource(broker, key) !== null);
  const sorting = available(sort) ? sort : 'id';
  const activeRack = racks.includes(rack) ? rack : '';
  const query = search.trim().toLowerCase();
  const visible = brokers.filter(broker =>
    [String(broker.id), 'b' + broker.id, broker.address, broker.name].some(value => value?.toLowerCase().includes(query)) &&
    (!status || statusOf(broker) === status) && (!activeRack || broker.rack === activeRack)
  ).sort((a, b) => {
    if (sorting === 'id') return a.id - b.id;
    return (resource(b, sorting) ?? -1) - (resource(a, sorting) ?? -1) || a.id - b.id;
  });
  const label = (key: string) => t('brokerOverview.' + key);
  const detail = (key: string) => t('brokerDetails.' + key);
  const unavailable = label('unavailable');
  const format = new Intl.NumberFormat(i18n?.language, { maximumFractionDigits: 1 });
  const number = (value?: number | null) => valid(value) ? format.format(value) : unavailable;
  const percent = (value: number | null) => value === null ? unavailable : number(value) + '%';

  const version = data?.version || (() => {
    const first = brokers[0]?.version;
    return first && brokers.every(broker => broker.version === first) ? first : undefined;
  })();
  const summary = [
    [detail('state'), ['healthy', 'warning', 'critical'].includes(data?.status ?? '') ? detail(data!.status!) : unavailable],
    [detail('version'), version && version.toLowerCase() !== 'unknown' ? version : unavailable],
    ...(data?.uptime ? [[detail('uptime'), data.uptime]] : []),
    [label('leaders'), number(data?.leaders)],
    [label('replicas'), number(data?.replicasTotal)],
    [label('isr'), data?.isr ? number(data.isr.inSync) + ' / ' + number(data.isr.total) : unavailable],
    [label('urp'), number(data?.underReplicated)],
    ...(valid(data?.coordinators) ? [[detail('coordinators'), number(data.coordinators)]] : []),
  ];
  const partitions = (broker: Broker) => [broker.leaderCount, broker.replicaCount, broker.isrCount, broker.underReplicated];
  const name = (broker: Broker) => broker.name || 'b' + broker.id;
  const brokerStatus = (broker: Broker) => <span className={'broker-detail-status broker-' + statusOf(broker)}>
    <i aria-hidden="true" />{t('brokerStatus.' + statusOf(broker))}
  </span>;
  const volumes = (broker: Broker, key: 'memory' | 'disk') => {
    const used = key === 'memory' ? broker.memory : broker.diskUsage;
    const total = key === 'memory' ? broker.memoryTotal : broker.diskTotal;
    const unit = key === 'memory' ? ' MiB' : ' GiB';
    if (ratio(used, total) !== null) return number(used) + ' / ' + number(total) + unit;
    return key === 'memory' && valid(used) ? number(used) + unit : unavailable;
  };

  return <div className="broker-details">
    <header className="broker-details-heading">
      <BrokerIcon aria-hidden="true" />
      <div><h2>{detail('title')}</h2><p>{t('brokerDetails.count', { count: brokers.length })}</p></div>
    </header>
    {loading ? <p role="status">{label('loading')}</p> : <>
      <dl className="broker-details-summary">
        {summary.map(([title, value], index) => <div key={title}>
          <dt>{title}</dt><dd>{value}</dd>
          {index === 0 && <dd className="broker-details-online">{t('brokerOverview.onlineCount', {
            count: brokers.filter(broker => statusOf(broker) === 'online').length,
          })}</dd>}
        </div>)}
      </dl>
      <div className="broker-details-toolbar">
        <input type="search" aria-label={detail('search')} placeholder={detail('search')} value={search}
          onChange={event => setSearch(event.target.value)} />
        <select aria-label={detail('status')} value={status} onChange={event => setStatus(event.target.value)}>
          <option value="">{detail('allStatuses')}</option>
          {['online', 'offline', 'unknown'].map(key => <option key={key} value={key}>{t('brokerStatus.' + key)}</option>)}
        </select>
        {racks.length > 0 && <select aria-label={detail('rack')} value={activeRack} onChange={event => setRack(event.target.value)}>
          <option value="">{detail('allRacks')}</option>
          {racks.map(value => <option key={value}>{value}</option>)}
        </select>}
        <select aria-label={detail('sort')} value={sorting} onChange={event => setSort(event.target.value as SortKey)}>
          <option value="id">{detail('sortId')}</option>
          {resourceKeys.map(key => <option key={key} value={key} disabled={!available(key)}>{label(key)} ↓</option>)}
        </select>
        <button type="button" aria-pressed={!list} onClick={() => setList(false)}><FiGrid aria-hidden="true" />{detail('cards')}</button>
        <button type="button" aria-pressed={list} onClick={() => setList(true)}><FiList aria-hidden="true" />{detail('list')}</button>
      </div>
      {!visible.length ? <p role="status">{brokers.length ? detail('noMatches') : label('empty')}</p> : list ? (
        <div className="broker-details-list" tabIndex={0}>
          <table className="broker-overview-table">
            <thead><tr>{[label('broker'), detail('address'), detail('status'), ...resourceKeys.map(label),
              ...partitionKeys.map(label), detail('rack'), detail('uptime')].map(title => <th key={title} scope="col">{title}</th>)}</tr></thead>
            <tbody>{visible.map(broker => <tr key={broker.id}>
              <th scope="row">{name(broker)}{controllerRole(broker.id, data) && <small>{label(controllerRole(broker.id, data) === 'active' ? 'controller' : 'standbyController')}</small>}</th>
              <td>{broker.address || unavailable}</td><td>{brokerStatus(broker)}</td>
              {resourceKeys.map(key => <td key={key}>{percent(resource(broker, key))}
                {key !== 'cpu' && <small>{volumes(broker, key)}</small>}</td>)}
              {partitions(broker).map((value, index) => <td key={partitionKeys[index]}>{number(value)}</td>)}
              <td>{broker.rack || unavailable}</td><td>{broker.uptime || unavailable}</td>
            </tr>)}</tbody>
          </table>
        </div>
      ) : (
        <div className="broker-details-grid">
          {visible.map(broker => <article key={broker.id} className="broker-detail-card" aria-label={name(broker)}>
            <header><div className="broker-detail-identity">
              <h3>{name(broker)}{broker.name && <small> · ID {broker.id}</small>}</h3>
              {controllerRole(broker.id, data) && <span className="broker-detail-controller"><LuCrown aria-hidden="true" />{label(controllerRole(broker.id, data) === 'active' ? 'controller' : 'standbyController')}</span>}
            </div>{brokerStatus(broker)}</header>
            <div className="broker-detail-address">{broker.address || unavailable}
              {broker.rack && <span> · {detail('rack')} {broker.rack}</span>}
              {broker.uptime && <small>{detail('uptime')} · {broker.uptime}</small>}
            </div>
            <div className="broker-detail-metrics">
              <div className="broker-detail-gauges">{resourceKeys.map(key => <div key={key} className="broker-detail-resource">
                <Gauge metric={key} value={resource(broker, key)} />
                <div><strong>{percent(resource(broker, key))}</strong><small>{label(key)}</small></div>
              </div>)}</div>
              <dl>{partitions(broker).map((value, index) => <div key={partitionKeys[index]}>
                <dt>{label(partitionKeys[index])}</dt><dd>{number(value)}</dd>
              </div>)}</dl>
            </div>
            <dl className="broker-detail-volumes">
              {(['memory', 'disk'] as const).map(key => {
                const value = resource(broker, key);
                return <div key={key} className={'broker-detail-volume broker-metric-' + key}>
                  <dt>{key === 'memory' ? <FiServer aria-hidden="true" /> : <FiHardDrive aria-hidden="true" />}{label(key)}</dt>
                  <dd>
                    <span className="broker-detail-volume-track" aria-hidden="true" data-available={value !== null}>
                      {value !== null && <span style={{ width: `${value}%` }} />}
                    </span>
                    <span>{volumes(broker, key)}</span>
                  </dd>
                </div>;
              })}
            </dl>
          </article>)}
        </div>
      )}
    </>}
  </div>;
}
