import odysseyI18n from '../i18n';
import { useTranslation as useInterfaceLanguage } from 'react-i18next';
import { FiServer, FiActivity } from 'react-icons/fi';
import '../styles/management-pages.css';

export default function Brokers() {
  useInterfaceLanguage();
  return (
    <div className="management-page">
      <div className="management-grid">
        <div className="management-card"><div className="management-card-label">{odysseyI18n.t('interface.brokers')}</div><div className="management-card-value">0</div></div>
        <div className="management-card"><div className="management-card-label">Online</div><div className="management-card-value">0</div></div>
        <div className="management-card"><div className="management-card-label">Controller</div><div className="management-card-value">—</div></div>
        <div className="management-card"><div className="management-card-label">Partitions</div><div className="management-card-value">0</div></div>
      </div>
      <section className="management-panel">
        <div className="management-panel-head"><h2><FiServer /> {odysseyI18n.t('interface.brokerHealth')}</h2><FiActivity className="muted" /></div>
        <table className="management-table">
          <thead><tr><th>ID</th><th>Host</th><th>Port</th><th>Role</th><th>Status</th></tr></thead>
          <tbody><tr><td colSpan="5" className="muted">{odysseyI18n.t('interface.brokerDataWillLoadWhenAClusterIs')}</td></tr></tbody>
        </table>
      </section>
    </div>
  );
}
