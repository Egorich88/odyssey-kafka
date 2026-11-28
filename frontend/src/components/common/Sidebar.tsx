import odysseyI18n from '../../i18n';
import { useTranslation as useInterfaceLanguage } from 'react-i18next';
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
 * @changes Иконки GitHub/Apache в футере показываются только при выбранном
 *           кластере; без кластера — только версия и ник по центру.
 */

/**
 * @fileoverview Боковое меню приложения Odyssey.
 * Содержит логотип, информацию о версии, выбор/добавление кластера,
 * основную навигацию по разделам, настройки и футер с лицензией.
 */

import { useState, useEffect, type ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import OdysseyTooltip from './OdysseyTooltip';
import { BrokerIcon } from './BrokerIcon';
import { Link, NavLink, useLocation } from 'react-router-dom';
import {
  FiHome,
  FiBookOpen,
  FiPlus,
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
import { documentationUrl } from '../../services/documentationUrl';
import { useCluster } from '../../contexts/ClusterContext';
import ThemeToggle from '../common/ThemeToggle';
import { enterpriseSidebarItems } from '@odyssey/registry';

// =============================================================================
// Вспомогательные функции для работы с версиями
// =============================================================================

/**
 * Нормализует строку версии: удаляет ведущий символ 'v', если он есть.
 */
function normalizeVersion(version: string): string {
  return version.replace(/^v/, '');
}

/**
 * Сравнивает локальную и удалённую версии.
 * @returns 1, если удалённая новее; -1, если локальная новее; 0, если равны.
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
  { get title() { return odysseyI18n.t('interface.brokers'); }, titleKey: 'brokers', path: '/brokers', icon: BrokerIcon },
  { get title() { return odysseyI18n.t('interface.topics'); }, titleKey: 'topics', path: '/topics', icon: FiLayers },
  { get title() { return odysseyI18n.t('interface.consumerGroups'); }, titleKey: 'consumerGroups', path: '/groups', icon: FiUsers },
  { get title() { return odysseyI18n.t('interface.messageSearch'); }, titleKey: 'searchMessages', path: '/search', icon: FiSearch },
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
  useInterfaceLanguage();
  const { pathname } = useLocation();
  const overviewActive = pathname === '/' || pathname === '/overview';
  const { clusters, currentCluster, changeCluster } = useCluster();
  const { t } = useTranslation();
  const version = packageJson.version;
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [animateVersion, setAnimateVersion] = useState(false);
  const [showVersionHint, setShowVersionHint] = useState(false);

  const [collapsed, setCollapsed] = useState(false);
  const [logoHovered, setLogoHovered] = useState(false);

  // Проверяем версию при запуске.
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
      setTimeout(() => setAnimateVersion(false), 2000);
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  const versionState = latestVersion ? compareVersions(version, latestVersion) : 0;
  const hasUpdate = versionState === 1;
  const localIsNewer = versionState === -1;
  const hasCluster = clusters.length > 0 && Boolean(currentCluster);
  const navigationDisabled = hasCluster && clusterUnavailable;

  // Кратковременно показываем плашку статуса версии над футером.
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
      setTimeout(() => setAnimateVersion(false), 2000);
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
        <div className="sidebar-logo">
          <div className="sidebar-header">
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
                <img src="/logo.svg" alt="ODYSSEY" className="sidebar-logo-image" />
              )}

              {!collapsed && (
                <span className="sidebar-brand-name">ODYSSEY</span>
              )}
            </button>

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

        <div className="sidebar-cluster">
            {hasCluster ? (
                <div className={`cluster-row ${collapsed ? 'collapsed' : ''}`}>
                    {!collapsed && (
                        <Dropdown
                            floating
                            connections
                            selectedItem={currentCluster}
                            items={clusters}
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
                    <div className="cluster-add-link" onClick={onAddCluster}>
                        {t('sidebar.addCluster')}
                    </div>
                )
            )}
        </div>

      </div>

      {/* Навигация прокручивается независимо от логотипа и нижнего блока. */}
      <div className="sidebar-navigation-region">
        {hasCluster && !clusterUnavailable && (
          <nav className="sidebar-nav">
            <Link
              to="/"
              aria-current={overviewActive ? 'page' : undefined}
              className={`sidebar-link ${overviewActive ? 'active' : ''} ${navigationDisabled ? 'is-disabled' : ''}`}
              onClick={(event) => { if (navigationDisabled) event.preventDefault(); }}
              data-tooltip-id={collapsed || navigationDisabled ? 'sidebar-tooltip' : undefined}
              data-tooltip-content={collapsed || navigationDisabled ? t('overview') : undefined}
              aria-disabled={navigationDisabled}
              tabIndex={navigationDisabled ? -1 : undefined}
            >
              <FiHome />
              {!collapsed && <span>{t('overview')}</span>}
            </Link>

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

        {/* Документация доступна при любом состоянии кластера. */}
        <div className="sidebar-footer">
          {showVersionHint && latestVersion && (
            <NavLink
              to="/settings"
              className={`sidebar-version-hint ${hasUpdate ? 'update-available' : ''}`}
            >
              {hasUpdate ? odysseyI18n.t('interface.newVersionAvailable', { v0: latestVersion }) : odysseyI18n.t('interface.upToDate')}
            </NavLink>
          )}

          <div className="sidebar-footer-meta">
            <a
              className="sidebar-author"
              href="https://github.com/Egorich88"
              target="_blank"
              rel="noopener noreferrer"
              data-tooltip-id="sidebar-owner-tooltip"
              data-tooltip-content={odysseyI18n.t('interface.productOwner')}
              aria-label={odysseyI18n.t('interface.productOwner')}
            >
              Egorich88
            </a>

            <NavLink
              to="/settings"
              aria-label={hasUpdate ? odysseyI18n.t('interface.versionAvailableOpenUpdateSettings', { v0: latestVersion }) : odysseyI18n.t('interface.openVersionSettings')}
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
          </div>

          <div className="footer-links-row">
            {!collapsed && (
              <a
                href={documentationUrl(odysseyI18n.resolvedLanguage)}
                target="_blank"
                rel="noopener noreferrer"
                className="footer-icon-link sidebar-docs-link"
                data-tooltip-id="sidebar-footer-tooltip"
                data-tooltip-content={odysseyI18n.t('interface.openDocumentation')}
                aria-label={odysseyI18n.t('interface.openDocumentation')}
              >
                <FiBookOpen className="footer-docs-icon" aria-hidden="true" />
              </a>
            )}
            <a
              href="https://github.com/Egorich88/odyssey-kafka"
              target="_blank"
              rel="noopener noreferrer"
              className="footer-icon-link"
              data-tooltip-id="sidebar-footer-tooltip"
              data-tooltip-content={t('sidebar.github')}
              aria-label={t('sidebar.github')}
            >
              <FiGithub className="footer-github-icon" aria-hidden="true" />
            </a>
            {!collapsed && (
              <a
                href="https://www.apache.org/licenses/LICENSE-2.0"
                target="_blank"
                rel="noopener noreferrer"
                className="footer-icon-link"
                data-tooltip-id="sidebar-footer-tooltip"
                data-tooltip-content={t('sidebar.apache')}
                aria-label={t('sidebar.apache')}
              >
                <SiApache className="footer-license-icon" aria-hidden="true" />
              </a>
            )}
          </div>
        </div>
      </div>
      <OdysseyTooltip id="sidebar-tooltip" place="right" />
      <OdysseyTooltip id="sidebar-footer-tooltip" place="top" />
      <OdysseyTooltip id="sidebar-owner-tooltip" place="top-start" />
    </aside>
  );
}
