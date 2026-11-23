import odysseyI18n from '../i18n';
import { useTranslation as useInterfaceLanguage } from 'react-i18next';
import { useState } from 'react';
import { FiUser, FiShield, FiClock, FiGlobe } from 'react-icons/fi';
import '../styles/management-pages.css';

const permissions = [() => odysseyI18n.t('interface.viewCluster'), () => odysseyI18n.t('interface.viewTopics'), () => odysseyI18n.t('interface.viewConsumerGroups'), () => odysseyI18n.t('interface.manageACLs'), () => odysseyI18n.t('interface.audit')];

export default function User() {
  useInterfaceLanguage();
  const [timezone, setTimezone] = useState(() => localStorage.getItem('ksc_timezone') || Intl.DateTimeFormat().resolvedOptions().timeZone);

  const changeTimezone = (event) => {
    const value = event.target.value;
    setTimezone(value);
    localStorage.setItem('ksc_timezone', value);
  };

  return (
    <div className="management-page">
      <div className="management-grid">
        <div className="management-card"><div className="management-card-label">{odysseyI18n.t('interface.user')}</div><div className="management-card-value">Egorich88</div></div>
        <div className="management-card"><div className="management-card-label">{odysseyI18n.t('interface.role')}</div><div className="management-card-value">Administrator</div></div>
        <div className="management-card"><div className="management-card-label">{odysseyI18n.t('interface.language')}</div><div className="management-card-value">{odysseyI18n.language.toUpperCase()}</div></div>
        <div className="management-card"><div className="management-card-label">{odysseyI18n.t('interface.timeZone')}</div><div className="management-card-value" style={{fontSize:15}}>{timezone}</div></div>
      </div>
      <section className="management-panel">
        <div className="management-panel-head"><h2><FiUser /> {odysseyI18n.t('interface.profile')}</h2></div>
        <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) minmax(280px,1fr)',gap:20,padding:20}}>
          <div>
            <div className="management-card-label"><FiGlobe /> {odysseyI18n.t('interface.timeZone')}</div>
            <select value={timezone} onChange={changeTimezone} style={{width:'100%',padding:'12px 14px',borderRadius:12,border:'1px solid var(--border-color)',background:'var(--input-bg)',color:'var(--text-primary)'}}>
              <option>{timezone}</option>
              <option>UTC</option><option>Europe/Amsterdam</option><option>Europe/Moscow</option><option>Asia/Almaty</option>
            </select>
          </div>
          <div>
            <div className="management-card-label"><FiShield /> {odysseyI18n.t('interface.permissions')}</div>
            <div style={{display:'grid',gap:8}}>
              {permissions.map(permission => <span key={permission()} className="status-pill">{permission()}</span>)}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
