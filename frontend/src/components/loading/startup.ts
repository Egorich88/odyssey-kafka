import i18n from '../../i18n';

export function setStartupStatus(stage: 'settings' | 'workspace' | 'ready') {
  const status = document.getElementById('initial-splash-status');
  if (status) status.textContent = i18n.t(`startup.${stage}`);
}

export function showStartupError() {
  const splash = document.getElementById('initial-splash');
  splash?.classList.remove('is-leaving');
  const status = document.getElementById('initial-splash-status');
  if (status) status.textContent = i18n.t('startup.failed');
  const retry = document.getElementById('initial-splash-retry');
  if (retry) { retry.textContent = i18n.t('startup.retry'); retry.hidden = false; }
  window.dispatchEvent(new Event('odyssey-startup-failed'));
}

export function completeStartup() {
  window.dispatchEvent(new Event('odyssey-startup-ready'));
  const splash = document.getElementById('initial-splash');
  const root = document.getElementById('root');
  setStartupStatus('ready');
  let cleanupTimer: number | undefined;
  const remove = () => splash?.remove();
  const onEnd = (event: TransitionEvent) => {
    if (event.target === splash && event.propertyName === 'opacity') remove();
  };
  const frame = requestAnimationFrame(() => {
    root?.classList.add('is-ready');
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { remove(); return; }
    splash?.addEventListener('transitionend', onEnd);
    splash?.classList.add('is-leaving');
    // Только страховочное удаление завершившей анимацию заставки, без задержки UI.
    cleanupTimer = window.setTimeout(remove, 500);
  });
  return () => {
    cancelAnimationFrame(frame);
    window.clearTimeout(cleanupTimer);
    splash?.removeEventListener('transitionend', onEnd);
  };
}
