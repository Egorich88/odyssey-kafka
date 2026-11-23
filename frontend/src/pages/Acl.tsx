import odysseyI18n from '../i18n';
import { useTranslation as useInterfaceLanguage } from 'react-i18next';
import { FiShield, FiCheckCircle, FiLock } from 'react-icons/fi';
import '../styles/management-pages.css';

export default function Acl() {
  useInterfaceLanguage();
  return (
    <div className="management-page">
      <div className="management-grid">
        <div className="management-card"><div className="management-card-label">{odysseyI18n.t('interface.rules')}</div><div className="management-card-value">0</div></div>
        <div className="management-card"><div className="management-card-label">{odysseyI18n.t('interface.users')}</div><div className="management-card-value">0</div></div>
        <div className="management-card"><div className="management-card-label">{odysseyI18n.t('interface.allowed')}</div><div className="management-card-value">0</div></div>
        <div className="management-card"><div className="management-card-label">{odysseyI18n.t('interface.restricted')}</div><div className="management-card-value">0</div></div>
      </div>
      <section className="management-panel">
        <div className="management-panel-head"><h2><FiShield /> {odysseyI18n.t('interface.accessPolicies')}</h2></div>
        <table className="management-table">
          <thead><tr><th>Principal</th><th>Resource</th><th>Operation</th><th>Permission</th></tr></thead>
          <tbody><tr><td colSpan="4" className="muted">{odysseyI18n.t('interface.aclRulesWillLoadWhenAClusterIs')}</td></tr></tbody>
        </table>
      </section>
    </div>
  );
}
