import odysseyI18n from '../i18n';
import { useTranslation as useInterfaceLanguage } from 'react-i18next';
import { FiTerminal, FiPlay } from 'react-icons/fi';
import '../styles/management-pages.css';

export default function Console() {
  useInterfaceLanguage();
  return (
    <div className="management-page">
      <section className="management-panel">
        <div className="management-panel-head"><h2><FiTerminal /> Command Console</h2><FiPlay className="muted" /></div>
        <div style={{padding:'20px'}}>
          <textarea aria-label="Kafka command" placeholder={odysseyI18n.t('interface.enterAKafkaCommand')} style={{width:'100%',minHeight:220,resize:'vertical',padding:16,borderRadius:12,border:'1px solid var(--border-color)',background:'var(--input-bg)',color:'var(--text-primary)',fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace',outline:'none'}} />
        </div>
      </section>
    </div>
  );
}
