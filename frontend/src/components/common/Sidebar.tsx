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
 * @file Sidebar.tsx
 * @project Odyssey new 4.2.36
 * @description Навигационная боковая панель Odyssey.
 * @changes Название оформлено фирменным шрифтом; статус версии доступен без наведения и ведёт в настройки.
 */

/**
 * @fileoverview Боковое меню приложения Odyssey.
 * Содержит логотип, информацию о версии, выбор/добавление кластера,
 * основную навигацию по разделам, настройки и футер с лицензией.
 */

import { useState, useEffect, type ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { Tooltip } from 'react-tooltip';
import { NavLink } from 'react-router-dom';
import {
  FiHome,
  FiPlus,
  FiServer,
  FiLayers,
  FiUsers,
  FiSearch,
  FiSliders,
  FiShield,
  FiSettings,
  FiGithub,
  FiUser,
  FiSidebar,
} from 'react-icons/fi';
import { SiApache } from 'react-icons/si';
import packageJson from '../../../package.json';
import Dropdown from '../common/Dropdown';
import { getLatestVersion } from '../../services/versionService';
import { useCluster } from '../../contexts/ClusterContext';
import ThemeToggle from '../common/ThemeToggle';
import { enterpriseSidebarItems } from '@odyssey/registry';

// =============================================================================
// Вспомогательные функции для работы с версиями
// =============================================================================

/**
 * Нормализует строку версии: удаляет ведущий символ 'v', если он есть.
 * @param {string} version - Сырая строка версии (например, "v1.2.3" или "1.2.3").
 * @returns {string} Нормализованная версия без префикса 'v'.
 */
function normalizeVersion(version: string): string {
  return version.replace(/^v/, '');
}

/**
 * Сравнивает локальную и удалённую версии.
 * @param {string} local  - Локальная версия (из package.json).
 * @param {string} remote - Удалённая версия (с GitHub).
 * @returns {number} 1, если удалённая новее; -1, если локальная новее; 0, если равны.
 */
function compareVersions(local: string, remote: string): number {
  const l = local.split('.').map(Number);
  const r = remote.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (r[i] > l[i]) return 1;
    if (r[i] < l[i]) return -1;
  }
  return 0;
}

// =============================================================================
// Основной компонент Sidebar
// =============================================================================

/**
 * Боковая панель навигации.
 * @param {Object} props
 * @param {Function} props.onAddCluster   - Колбэк для добавления нового кластера.
 * @param {Function} props.onEditCluster  - Колбэк для редактирования текущего кластера.
 */
interface SidebarProps {
  onAddCluster: () => void;
  onEditCluster: () => void;
  clusterUnavailable?: boolean;
}

interface SidebarItem {
  title: string;
  path: string;
  icon: ComponentType<any>;
  titleKey?: string;
}

// Публичные страницы, готовые к показу в стандартной сборке.
const CORE_ITEMS: SidebarItem[] = [
  { title: 'Брокеры', titleKey: 'brokers', path: '/brokers', icon: FiServer },
  { title: 'Топики', titleKey: 'topics', path: '/topics', icon: FiLayers },
  { title: 'Группы потребителей', titleKey: 'consumerGroups', path: '/groups', icon: FiUsers },
  { title: 'Поиск сообщений', titleKey: 'searchMessages', path: '/search', icon: FiSearch },
  { title: 'ACL', titleKey: 'acl', path: '/acls', icon: FiShield },
];

// Enterprise-пункты появляются только если расширение зарегистрировано.
const ENTERPRISE_INTEGRATIONS = enterpriseSidebarItems.filter((item) =>
  ['/connect', '/ksqldb', '/schema-registry'].includes(item.path)
);
const ENTERPRISE_OPERATIONS = enterpriseSidebarItems.filter((item) =>
  ['/alerts', '/audit', '/console'].includes(item.path)
);

export default function Sidebar({ onAddCluster, onEditCluster, clusterUnavailable = false }: SidebarProps) {
  const { clusters, currentCluster, changeCluster } = useCluster();
  const { t } = useTranslation();
  const version = packageJson.version;
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [animateVersion, setAnimateVersion] = useState(false);
  const [showVersionHint, setShowVersionHint] = useState(false);

  // Состояние боковой панели
  const [collapsed, setCollapsed] = useState(false);
  const [logoHovered, setLogoHovered] = useState(false);

  // Проверяем версию при запуске, чтобы кратко показать её статус без наведения.
  useEffect(() => {
    let cancelled = false;
    getLatestVersion().then((remoteVersion) => {
      if (cancelled) return;
      setLatestVersion(remoteVersion);
      localStorage.setItem('lastVersionCheck', Date.now().toString());
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setAnimateVersion(true);

      setTimeout(() => {
        setAnimateVersion(false);
      }, 2000);

    }, 2000);

    return () => clearTimeout(timer);
  }, []);



  // Результат сравнения версий
  const versionState = latestVersion ? compareVersions(version, latestVersion) : 0;
  const hasUpdate = versionState === 1;
  const localIsNewer = versionState === -1;
  const hasCluster = clusters.length > 0 && Boolean(currentCluster);
  const navigationDisabled = hasCluster && clusterUnavailable;

  useEffect(() => {
    if (!latestVersion) return;
    setShowVersionHint(true);
    const timer = window.setTimeout(() => setShowVersionHint(false), 6000);
    return () => window.clearTimeout(timer);
  }, [latestVersion]);


  useEffect(() => {
      if (!hasUpdate) return;

      const interval = setInterval(() => {
        setAnimateVersion(true);

        setTimeout(() => {
          setAnimateVersion(false);
        }, 2000);

      }, 60000);

      return () => clearInterval(interval);
    }, [hasUpdate]);



  // =========================================================================
  // Рендер
  // =========================================================================
  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      {/* -------------------- Верхняя область (логотип + кластер) -------------------- */}
      <div className="sidebar-top">
        {/* Логотип и название проекта */}
        <div className="sidebar-logo">

          {/* ----------------------------------------------------------
              Верхняя строка Sidebar
          ----------------------------------------------------------- */}
          <div className="sidebar-header">

            {/* Логотип */}
            {/* ==========================================================
                Брендинг Odyssey

                Слева:
                фирменный графический знак.

                Справа:
                короткий wordmark Odyssey.

                Полное название Odyssey
                в Sidebar не используется — здесь нужен
                компактный фирменный идентификатор.
               ========================================================== */}

            <button
              type="button"
              className={`sidebar-logo-brand ${collapsed && logoHovered ? 'is-expand-hover' : ''}`}
              onClick={() => collapsed && setCollapsed(false)}
              onMouseEnter={() => setLogoHovered(true)}
              onMouseLeave={() => setLogoHovered(false)}
              aria-label={collapsed ? t('sidebar.expand') : 'ODYSSEY'}
              data-tooltip-id={collapsed ? 'sidebar-tooltip' : undefined}
              data-tooltip-content={collapsed ? t('sidebar.expand') : undefined}
            >
              {collapsed && logoHovered ? (
                <FiSidebar className="sidebar-logo-expand-icon" aria-hidden="true" />
              ) : (
                <img
                  src="/logo.svg"
                  alt="ODYSSEY"
                  className="sidebar-logo-image"
                />
              )}

              {!collapsed && (
                <span className="sidebar-brand-name">
                  ODYSSEY
                </span>
              )}
            </button>

            {/* Кнопка сворачивания боковой панели */}
            <button
                className="sidebar-collapse-button"
                onClick={() => setCollapsed(!collapsed)}
                data-tooltip-id="sidebar-tooltip"
                data-tooltip-content={collapsed ? t('sidebar.expand') : t('sidebar.collapse')}
            >
              <FiSidebar />
            </button>

          </div>

        </div>

        {/* Блок выбора / добавления кластера */}
        <div className="sidebar-cluster">
            {hasCluster ? (
                <div className={`cluster-row ${collapsed ? 'collapsed' : ''}`}>
                    {!collapsed && (
                        <Dropdown
                            selectedItem={currentCluster}
                            items={clusters.filter(
                                cluster => cluster.id !== currentCluster.id
                            )}
                            onSelect={changeCluster}
                            addLabel={t('sidebar.addCluster')}
                            onAdd={onAddCluster}
                            statusResolver={(cluster) =>
                                cluster?.connectionStatus || 'unknown'
                            }
                            searchable={false}
                        />
                    )}

                    <FiSliders
                        className="cluster-settings-icon"
                        onClick={onEditCluster}
                        data-tooltip-id="sidebar-tooltip"
                        data-tooltip-content={t('sidebar.clusterSettings')}
                    />
                </div>
            ) : (
                collapsed ? (
                    <button
                        type="button"
                        className="cluster-add-collapsed"
                        onClick={onAddCluster}
                        data-tooltip-id="sidebar-tooltip"
                        data-tooltip-content={t('sidebar.addCluster')}
                    >
                        <FiPlus />
                    </button>
                ) : (
                    <div
                        className="cluster-add-link"
                        onClick={onAddCluster}
                    >
                        {t('sidebar.addCluster')}
                    </div>
                )
            )}
        </div>

        {/* Основная навигация. При недоступном кластере блокируются все Kafka-разделы. */}
        {hasCluster && (
          <nav className={`sidebar-nav ${navigationDisabled ? 'is-disabled' : ''}`}>
            <NavLink
              to="/"
              end
              className={`sidebar-link ${navigationDisabled ? 'is-disabled' : ''}`}
              onClick={(event) => { if (navigationDisabled) event.preventDefault(); }}
              data-tooltip-id={collapsed || navigationDisabled ? 'sidebar-tooltip' : undefined}
              data-tooltip-content={collapsed || navigationDisabled ? t('overview') : undefined}
              aria-disabled={navigationDisabled}
              tabIndex={navigationDisabled ? -1 : undefined}
            >
              <FiHome />
              {!collapsed && <span>{t('overview')}</span>}
            </NavLink>

            <div className="sidebar-divider" />

            {CORE_ITEMS.map((item) => {
              const Icon = item.icon;
              const label = t(item.titleKey || item.title);
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={`sidebar-link ${navigationDisabled ? 'is-disabled' : ''}`}
                  onClick={(event) => { if (navigationDisabled) event.preventDefault(); }}
                  data-tooltip-id={collapsed || navigationDisabled ? 'sidebar-tooltip' : undefined}
                  data-tooltip-content={collapsed || navigationDisabled ? label : undefined}
                  aria-disabled={navigationDisabled}
                  tabIndex={navigationDisabled ? -1 : undefined}
                >
                  <Icon />
                  {!collapsed && <span>{label}</span>}
                </NavLink>
              );
            })}

            {ENTERPRISE_INTEGRATIONS.length > 0 && (
              <>
                <div className="sidebar-divider sidebar-divider-integrations" />
                {ENTERPRISE_INTEGRATIONS.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      className={`sidebar-link ${navigationDisabled ? 'is-disabled' : ''}`}
                      onClick={(event) => { if (navigationDisabled) event.preventDefault(); }}
                      data-tooltip-id={collapsed || navigationDisabled ? 'sidebar-tooltip' : undefined}
                      data-tooltip-content={collapsed || navigationDisabled ? item.title : undefined}
                      aria-disabled={navigationDisabled}
                      tabIndex={navigationDisabled ? -1 : undefined}
                    >
                      <Icon />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  );
                })}
              </>
            )}

            {ENTERPRISE_OPERATIONS.length > 0 && (
              <>
                <div className="sidebar-divider" />
                {ENTERPRISE_OPERATIONS.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      className={`sidebar-link ${navigationDisabled ? 'is-disabled' : ''}`}
                      onClick={(event) => { if (navigationDisabled) event.preventDefault(); }}
                      data-tooltip-id={collapsed || navigationDisabled ? 'sidebar-tooltip' : undefined}
                      data-tooltip-content={collapsed || navigationDisabled ? item.title : undefined}
                      aria-disabled={navigationDisabled}
                      tabIndex={navigationDisabled ? -1 : undefined}
                    >
                      <Icon />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  );
                })}
              </>
            )}
          </nav>
        )}
      </div>

      {/* -------------------- Нижняя область -------------------- */}
      <div className="sidebar-bottom">
        {/* Настройки + быстрый переключатель темы */}
        <nav className="sidebar-bottom-nav">
          <div className="sidebar-settings-row">
            <NavLink
              to="/settings"
              className="sidebar-link sidebar-settings-link"
              data-tooltip-id={collapsed ? "sidebar-tooltip" : undefined}
              data-tooltip-content={collapsed ? t('settings.title') : undefined}
            >
              <FiSettings />
              {!collapsed && <span>{t('settings.title')}</span>}
            </NavLink>

            <ThemeToggle />
          </div>

          <NavLink
            to="/user"
            className="sidebar-user-link"
            data-tooltip-id={collapsed ? "sidebar-tooltip" : undefined}
            data-tooltip-content={collapsed ? t('sidebar.userTooltip') : undefined}
          >
            <FiUser />
            {!collapsed && <span>{t('sidebar.user')}</span>}
          </NavLink>
        </nav>

        {/* Полная разделительная линия находится в .sidebar-footer.
            Дополнительную короткую линию здесь не используем. */}

        {/* Футер: GitHub + Apache License и версия */}
        <div className="sidebar-footer">
          <div className="footer-links-row">
            <a
              href="https://github.com/Egorich88/odyssey-kafka"
              target="_blank"
              rel="noopener noreferrer"
              className="footer-icon-link"
              data-tooltip-id="sidebar-tooltip"
              data-tooltip-content={t('sidebar.github')}
              aria-label={t('sidebar.github')}
            >
              <FiGithub className="footer-github-icon" />
            </a>

            <a
              href="https://www.apache.org/licenses/LICENSE-2.0"
              target="_blank"
              rel="noopener noreferrer"
              className="footer-icon-link"
              data-tooltip-id="sidebar-tooltip"
              data-tooltip-content={t('sidebar.apache')}
              aria-label={t('sidebar.apache')}
            >
              <SiApache className="footer-license-icon" />
            </a>
          </div>

          <NavLink
            to="/settings"
            aria-label={hasUpdate ? `Доступна новая версия ${latestVersion}. Открыть настройки обновления` : 'Открыть настройки версии'}
            className={`sidebar-version ${hasUpdate ? 'update-available' : ''} ${animateVersion ? 'animate' : ''}`}
            data-tooltip-id="sidebar-tooltip"
            data-tooltip-content={
              hasUpdate
                ? `${t('sidebar.updateAvailable')} ${latestVersion}`
                : localIsNewer
                  ? t('sidebar.localVersionNewer')
                  : `${t('sidebar.currentVersion')} ${version}`
            }
          >
            <span className="version-label">{`ver. ${version}`}</span>
          </NavLink>
          {showVersionHint && latestVersion && (
            <NavLink to="/settings" className={`sidebar-version-hint ${hasUpdate ? 'update-available' : ''}`}>
              {hasUpdate ? `Доступна новая версия ${latestVersion}` : 'Версия актуальна'}
            </NavLink>
          )}
        </div>
      </div>
      <Tooltip id="sidebar-tooltip" place="right" offset={12} />
    </aside>
  );
}