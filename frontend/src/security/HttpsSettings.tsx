import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface Receipt { type: 'local' | 'custom' | 'letsencrypt'; expires: string }

export default function HttpsSettings() {
  const { t, i18n } = useTranslation();
  const [project, setProject] = useState('');
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [action, setAction] = useState<'renew' | 'replace' | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const options = { signal: controller.signal, cache: 'no-store' as const };
    async function load() {
      const context = await fetch('/setup/context.json', options);
      if (!context.ok) return;
      const { project: name } = await context.json();
      if (typeof name !== 'string' || !/^[a-z0-9][a-z0-9_-]*$/.test(name)) return;
      setProject(name);
      const response = await fetch('/setup/status.json', options);
      if (response.ok) setReceipt(await response.json());
    }
    void load().catch(() => {});
    return () => controller.abort();
  }, []);
  if (!project) return null;
  const date = receipt && new Date(receipt.expires);
  return <section className="settings-block"><div className="settings-block-info">
    <h3>{t('https.security')}</h3>
    <p>{receipt ? t('https.details', { type: t('https.' + receipt.type), expires: date && Number.isFinite(date.getTime()) ? date.toLocaleDateString(i18n.language) : '—' }) : t('https.legacy')}</p>
    <div className="version-update-actions">
      <button className="settings-action-button" type="button" onClick={() => setAction('replace')}>{t('https.replace')}</button>
      {receipt?.type !== 'custom' && <button className="settings-action-button" type="button" onClick={() => setAction('renew')}>{t('https.renew')}</button>}
    </div>
    {action && <div role="status"><p>{t('https.localAction')}</p><code style={{overflowWrap:'anywhere'}}>python3 docker/https_setup.py --project {project} {action === 'replace' ? '--mode custom --cert /path/to/fullchain.pem --key /path/to/key.pem' : '--renew'}</code></div>}
  </div></section>;
}
