/*
 * Copyright 2026 Egor Khomenko (Egorich88)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * @file Settings.tsx
 * @project Odyssey new 4.2.36
 * @description Настройки темы, языка и обновления приложения.
 * @changes Источник метрик заменён проверкой версии и запуском обновления с SSE-прогрессом.
 */

import { useEffect, useState } from 'react';
import { FiArrowDown, FiCheckCircle, FiDownloadCloud, FiRefreshCw, FiX, FiAlertTriangle } from 'react-icons/fi';
import { useTheme } from '../contexts/ThemeContext';
import Dropdown from '../components/common/Dropdown';
import ThemeDropdown from '../components/common/ThemeDropdown';
import { useTranslation } from 'react-i18next';
import '../styles/settings.css';

const THEMES_LIST = [
  { id: 'dark', name: 'Dark' },
  { id: 'light', name: 'Light' },
  { type: 'divider' },
  { id: 'github-dark', name: 'GitHub Dark' },
  { id: 'github-light', name: 'GitHub Light' },
  { id: 'dracula', name: 'Dracula' },
  { id: 'nord', name: 'Nord' },
  { id: 'material', name: 'Material' },
  { id: 'monokai-pro', name: 'Monokai Pro' },
  { id: 'solarized-dark', name: 'Solarized Dark' },
  { id: 'solarized-light', name: 'Solarized Light' },
  { id: 'deep-ocean', name: 'Deep Ocean' },
  { type: 'divider' },
  { id: 'mac', name: 'Mac' },
  { id: 'linux', name: 'Linux' },
  { type: 'divider' },
  { id: 'coffee', name: 'Coffee' },
  { id: 'kitty', name: 'Kitty' },
  { id: 'rainbow', name: 'Rainbow' },
];

const LANGUAGES = [
  { id: 'ru', name: 'Русский' },
  { id: 'en', name: 'English' },
];

interface VersionInfo {
  currentVersion: string;
  latestVersion?: string;
  updateAvailable: boolean;
  checked: boolean;
  message?: string;
  releaseUrl?: string;
}

interface UpdateEvent {
  progress: number;
  stage: string;
  message: string;
  status: 'running' | 'completed' | 'error';
}

export default function Settings() {
  const { theme, setTheme } = useTheme();
  const { i18n } = useTranslation();
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const [confirmUpdate, setConfirmUpdate] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [updateEvents, setUpdateEvents] = useState<UpdateEvent[]>([]);
  const [updateError, setUpdateError] = useState('');

  const currentThemeObj = THEMES_LIST.find((item) => item.id === theme) || THEMES_LIST[0];
  const currentLanguageObj = LANGUAGES.find((item) => item.id === i18n.language) || LANGUAGES[0];

  const handleLanguageSelect = (selected: { id: string }) => {
    void i18n.changeLanguage(selected.id);
    localStorage.setItem('ksc_language', selected.id);
  };

  const handleThemeSelect = (selected: { id: string }) => setTheme(selected.id);

  const checkVersion = async () => {
    setChecking(true);
    setUpdateError('');
    try {
      const response = await fetch('/api/version/check', { cache: 'no-store' });
      const result = await response.json();
      setVersionInfo(result);
      if (!response.ok) setUpdateError(result.message || 'Не удалось проверить версию.');
    } catch {
      setUpdateError('Не удалось связаться с сервером проверки обновлений.');
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    void checkVersion();
  }, []);

  const startUpdate = async () => {
    setConfirmUpdate(false);
    setUpdating(true);
    setUpdateError('');
    setUpdateEvents([]);
    try {
      const response = await fetch('/api/version/update', { method: 'POST' });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Не удалось запустить обновление.');
      }
      const source = new EventSource(result.eventsUrl || '/api/version/update/events');
      source.onmessage = (event) => {
        const updateEvent = JSON.parse(event.data) as UpdateEvent;
        setUpdateEvents((previous) => [...previous, updateEvent]);
        if (updateEvent.status === 'completed' || updateEvent.status === 'error') {
          source.close();
          setUpdating(false);
          if (updateEvent.status === 'error') setUpdateError(updateEvent.message);
          if (updateEvent.status === 'completed') void checkVersion();
        }
      };
      source.onerror = () => {
        source.close();
        setUpdating(false);
        setUpdateError('Потеряно соединение с потоком обновления. Проверьте состояние сервера перед повторным запуском.');
      };
    } catch (error) {
      setUpdating(false);
      setUpdateError(error instanceof Error ? error.message : 'Ошибка запуска обновления.');
    }
  };

  const latestEvent = updateEvents[updateEvents.length - 1];
  const progress = latestEvent?.progress ?? 0;

  return (
    <div className="settings-page">
      <div className="settings-card">
        <div className="settings-block">
          <div className="settings-block-info">
            <h3>Тема оформления</h3>
            <p>Выберите цветовую тему интерфейса Odyssey.</p>
          </div>
          <ThemeDropdown selectedItem={currentThemeObj} items={THEMES_LIST} onSelect={handleThemeSelect} />
        </div>

        <div className="settings-block">
          <div className="settings-block-info">
            <h3>Язык</h3>
            <p>Язык интерфейса приложения.</p>
          </div>
          <Dropdown
            selectedItem={currentLanguageObj}
            items={LANGUAGES.filter((item) => item.id !== i18n.language)}
            onSelect={handleLanguageSelect}
            addLabel=""
            onAdd={() => undefined}
            statusResolver={() => null}
            searchable={false}
          />
        </div>

        <div className="settings-block version-settings-block">
          <div className="settings-block-info">
            <h3>Обновление версии</h3>
            <p>Проверьте наличие релиза и запустите обновление, если сервер поддерживает автоматическое развёртывание.</p>
          </div>
          <div className="version-update-controls">
            <div className={`version-check-result ${versionInfo?.checked ? (versionInfo.updateAvailable ? 'is-update' : 'is-current') : ''}`}>
              {versionInfo?.checked ? (
                versionInfo.updateAvailable ? <FiDownloadCloud /> : <FiCheckCircle />
              ) : <FiAlertTriangle />}
              <div>
                <strong>{versionInfo?.checked ? (versionInfo.updateAvailable ? 'Доступна новая версия' : 'Актуальная версия') : (checking ? 'Проверка версии…' : 'Версия не проверена')}</strong>
                <span>{versionInfo?.checked ? `Установлена ${versionInfo.currentVersion}${versionInfo.latestVersion ? ` · Последняя ${versionInfo.latestVersion}` : ''}` : (versionInfo?.message || 'Проверьте соединение с источником релизов.')}</span>
              </div>
            </div>
            <div className="version-update-actions">
              <button type="button" className="settings-action-button" onClick={() => void checkVersion()} disabled={checking || updating}>
                <FiRefreshCw className={checking ? 'is-spinning' : ''} />
                {checking ? 'Проверка…' : 'Проверить обновления'}
              </button>
              {versionInfo?.checked && versionInfo.updateAvailable && (
                <button type="button" className="settings-action-button primary" onClick={() => setConfirmUpdate(true)} disabled={updating}>
                  <FiDownloadCloud /> Обновить до новой версии
                </button>
              )}
            </div>
          </div>
        </div>
        {updateError && <div className="version-update-error"><FiAlertTriangle />{updateError}</div>}
      </div>

      {confirmUpdate && (
        <div className="update-modal-backdrop" role="presentation">
          <div className="update-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="update-confirm-title">
            <button type="button" className="update-modal-close" onClick={() => setConfirmUpdate(false)} aria-label="Закрыть"><FiX /></button>
            <FiDownloadCloud className="update-modal-icon" />
            <h2 id="update-confirm-title">Запустить обновление?</h2>
            <p>Odyssey запустит процесс обновления на сервере. Во время операции интерфейс может временно потерять соединение. Продолжить?</p>
            <div className="update-modal-actions">
              <button type="button" className="settings-action-button" onClick={() => setConfirmUpdate(false)}>Отмена</button>
              <button type="button" className="settings-action-button primary" onClick={() => void startUpdate()}>Запустить обновление</button>
            </div>
          </div>
        </div>
      )}

      {updating && (
        <div className="update-progress-backdrop" role="dialog" aria-modal="true" aria-label="Ход обновления">
          <div className="update-progress-panel">
            <div className="update-progress-brand"><img src="/logo.svg" alt="Odyssey" /><FiArrowDown className="update-progress-arrow" /></div>
            <h2>Обновление Odyssey</h2>
            <p>Не закрывайте страницу, пока выполняется обновление.</p>
            <div className="update-progress-track"><span style={{ width: `${progress}%` }} /></div>
            <div className="update-progress-summary"><strong>{progress}%</strong><span>{latestEvent?.stage || 'Подготовка'}</span></div>
            <div className="update-progress-log">
              {updateEvents.map((event, index) => (
                <div className={`update-log-line ${event.status}`} key={`${index}-${event.progress}`}>
                  <span>{event.progress}%</span><span>{event.message}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
