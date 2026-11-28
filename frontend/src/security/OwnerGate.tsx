import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { ownerExpiredEvent, setOwnerCSRF } from './ownerSession';
import './owner.css';

export default function OwnerGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const request = new AbortController();
    void axios.get('/api/auth/session', { signal: request.signal, timeout: 7000 })
      .then(response => {
        if (!request.signal.aborted && typeof response.data.csrfToken === 'string') { setOwnerCSRF(response.data.csrfToken); setReady(true); }
      }).catch(async error => {
        if (![502, 503].includes(error.response?.status)) return;
        try {
          const opts = {signal: request.signal, cache: 'no-store' as const};
          const context = await fetch('/setup/context.json', opts);
          if (!context.ok || !(await context.json()).project) return;
          const receipt = await fetch('/setup/status.json', opts);
          if (receipt.status === 404) window.location.replace('/setup/');
        } catch { /* Вне Docker остаётся обычный экран входа. */ }
      }).finally(() => { if (!request.signal.aborted) setChecking(false); });
    const expired = () => { setReady(false); setPassword(''); };
    window.addEventListener(ownerExpiredEvent, expired);
    return () => { request.abort(); window.removeEventListener(ownerExpiredEvent, expired); setOwnerCSRF(''); };
  }, []);

  const login = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(false);
    try {
      const response = await axios.post('/api/auth/login', { password }, { timeout: 10000 });
      if (typeof response.data.csrfToken !== 'string') throw new Error('Invalid session');
      setOwnerCSRF(response.data.csrfToken); setPassword(''); setReady(true);
    } catch { setError(true); setPassword(''); }
    finally { setBusy(false); }
  };

  const logout = async () => {
    setBusy(true); setError(false);
    try { await axios.post('/api/auth/logout'); setOwnerCSRF(''); setReady(false); }
    catch { setError(true); }
    finally { setBusy(false); }
  };

  if (ready) return <div className="owner-authenticated"><div className="owner-session-bar">
    <button type="button" disabled={busy} onClick={() => void logout()}>{t('owner.signOut')}</button>
    {error && <span role="alert">{t('owner.error')}</span>}
  </div><div className="owner-workspace">{children}</div></div>;
  return <main className="owner-gate"><form className="owner-gate__form" onSubmit={login}>
    <h1>{t('owner.title')}</h1>
    {checking ? <p role="status">{t('owner.checking')}</p> : <>
      <p>{t('owner.localSetup')}</p>
      <label htmlFor="owner-password">{t('owner.password')}</label>
      <input id="owner-password" type="password" autoComplete="current-password" value={password}
        onChange={event => setPassword(event.target.value)} required maxLength={1024} disabled={busy} />
      <button className="primary-btn" type="submit" disabled={busy}>{t(busy ? 'owner.signingIn' : 'owner.signIn')}</button>
      {error && <p role="alert">{t('owner.error')}</p>}
    </>}
  </form></main>;
}
