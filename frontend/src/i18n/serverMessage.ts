import i18n from './index';
import ru from '../locales/ru/common.json';

// Переводим только известный текст Odyssey; технические сведения остаются дословными.
export function serverMessage(message: string) {
  if (!message || i18n.language !== 'en') return message;
  for (const [key, pattern] of Object.entries(ru.serverMessage)) {
    if (pattern.endsWith('{{detail}}')) {
      const prefix = pattern.slice(0, -10);
      if (message.startsWith(prefix)) return i18n.t('serverMessage.' + key, { detail: message.slice(prefix.length) });
    } else if (message === pattern) return i18n.t('serverMessage.' + key);
  }
  return message;
}
