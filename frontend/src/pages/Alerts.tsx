import odysseyI18n from '../i18n';
import { useTranslation as useInterfaceLanguage } from 'react-i18next';
import { FiBell, FiAlertTriangle, FiCheckCircle } from 'react-icons/fi';
import '../styles/management-pages.css';

export default function Alerts() {
  useInterfaceLanguage();
  return (
    <div className="management-page">
      <div className="management-grid">
        <div className="management-card"><div className="management-card-label">{odysseyI18n.t('interface.active')}</div><div className="management-card-value">0</div></div>
        <div className="management-card"><div className="management-card-label">{odysseyI18n.t('interface.critical')}</div><div className="management-card-value">0</div></div>
        <div className="management-card"><div className="management-card-label">{odysseyI18n.t('interface.warnings')}</div><div className="management-card-value">0</div></div>
        <div className="management-card"><div className="management-card-label">{odysseyI18n.t('interface.last24Hours')}</div><div className="management-card-value">0</div></div>
      </div>
      <section className="management-panel">
        <div className="management-panel-head"><h2><FiBell /> {odysseyI18n.t('interface.activeAlerts')}</h2></div>
        <table className="management-table">
          <thead><tr><th>{odysseyI18n.t('interface.time')}</th><th>{odysseyI18n.t('interface.severity')}</th><th>{odysseyI18n.t('interface.event')}</th><th>{odysseyI18n.t('interface.source')}</th></tr></thead>
          <tbody><tr><td colSpan="4" className="muted"><FiCheckCircle /> {odysseyI18n.t('interface.noActiveAlerts')}</td></tr></tbody>
        </table>
      </section>
    </div>
  );
}
