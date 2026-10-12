/**
 * =============================================================================
 * @file i18n/index.js
 * =============================================================================
 *
 * Инициализация системы локализации приложения Odyssey.
 *
 * Загружает словари переводов, подключает react-i18next,
 * определяет язык интерфейса и выполняет первоначальную настройку i18next.
 *
 * Поддерживаемые языки:
 * • Русский
 * • Английский
 *
 * Текущий язык восстанавливается из localStorage.
 * =============================================================================
 */

import i18n from 'i18next';

import { initReactI18next } from 'react-i18next';

// Подключение переводов
import enCommon from '../locales/en/common.json';
import ruCommon from '../locales/ru/common.json';

// Инициализация i18next
i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: {
        translation: enCommon
      },
      ru: {
        translation: ruCommon
      }
    },
    supportedLngs: [
        'ru',
        'en'
    ],

    // Язык интерфейса по умолчанию.
    // При наличии сохранённого значения используется оно.
    lng: localStorage.getItem('ksc_language') || 'ru',

    // Язык, используемый при отсутствии перевода.
    fallbackLng: 'en',

    // Режим отладки i18next.
    debug: false,

    // React самостоятельно экранирует значения.
    interpolation: {
      escapeValue: false
    }
  });
export default i18n;