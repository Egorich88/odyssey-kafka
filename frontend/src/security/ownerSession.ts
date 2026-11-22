import axios from 'axios';

let csrfToken = '';
let sessionEpoch = 0;
const requestEpochs = new WeakMap<object, number>();
export function setOwnerCSRF(token: string) { csrfToken = token; sessionEpoch++; }
export const ownerExpiredEvent = 'odyssey-owner-session-expired';

// Токены не записываются в localStorage. Cookie сессии доступна только серверу.
axios.interceptors.request.use(config => {
  requestEpochs.set(config,sessionEpoch);
  if (config.url?.startsWith('/api/') && !['get', 'head', 'options'].includes((config.method || 'get').toLowerCase()) && csrfToken) {
    config.headers.set('X-CSRF-Token', csrfToken);
  }
  return config;
});
axios.interceptors.response.use(response => response, error => {
  if (error.response?.status === 401 && error.config?.url?.startsWith('/api/') && error.config.url !== '/api/auth/login' && requestEpochs.get(error.config) === sessionEpoch) {
    setOwnerCSRF(''); window.dispatchEvent(new Event(ownerExpiredEvent));
  }
  return Promise.reject(error);
});

export async function ownerFetch(url: string, options: RequestInit = {}) {
  const epoch=sessionEpoch;
  const headers = new Headers(options.headers);
  if (url.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes((options.method || 'GET').toUpperCase()) && csrfToken) headers.set('X-CSRF-Token', csrfToken);
  const response = await fetch(url, { ...options, headers, credentials: 'same-origin' });
  if (response.status === 401 && epoch===sessionEpoch) { setOwnerCSRF(''); window.dispatchEvent(new Event(ownerExpiredEvent)); }
  return response;
}
