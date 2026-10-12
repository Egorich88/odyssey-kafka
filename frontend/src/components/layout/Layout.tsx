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
 * =============================================================================
 * @file Layout.tsx
 * =============================================================================
 *
 * Основной макет (Layout) приложения Odyssey.
 *
 * @description
 * Формирует общий каркас пользовательского интерфейса:
 * - отображает боковую панель навигации (Sidebar);
 * - предоставляет область для отображения страниц приложения (Outlet);
 * - управляет окнами создания и редактирования Kafka-кластеров.
 *
 * @responsibility
 * - отображение общего Layout приложения;
 * - взаимодействие с ClusterContext;
 * - открытие и закрытие панелей управления кластерами;
 * - передача обработчиков в Sidebar;
 * - отображение текущей страницы через Outlet.
 *
 * @note
 * Layout является единым контейнером для всего пользовательского интерфейса.
 * Не отвечает за отображение страниц, работу с API или бизнес-логику.
 * =============================================================================
 */

// =============================================================================
// ИМПОРТЫ
// =============================================================================

// React и хуки
import { useState } from 'react';

// React Router
import { Outlet, useNavigate, useLocation } from 'react-router-dom';

// Контексты
import { useCluster } from '../../contexts/ClusterContext';

// Компоненты
import Sidebar from "../common/Sidebar";
import CreateClusterPanel from '../CreateClusterPanel';
import ClusterSettingsPanel from '../ClusterSettingsPanel';
import PageHeader from '../page-header/PageHeader';
import { DashboardControlsProvider } from '../../contexts/DashboardControlsContext';
import ClusterStatusScreen from '../cluster-status/ClusterStatusScreen';
import '../cluster-status/cluster-status-screen.css';
import { PAGE_CONFIG } from '../page-header/page-config';

// =============================================================================
// КОМПОНЕНТ LAYOUT
// =============================================================================

/**
 * Основной компонент макета приложения.
 *
 * @component
 * @returns {JSX.Element} - Разметка основного макета
 */
const Layout = () => {
  // =========================================================================
  // ХУКИ И СОСТОЯНИЯ
  // =========================================================================

  /** Хук навигации React Router */
  const navigate = useNavigate();

  /** Текущий маршрут используется для определения заголовка страницы. */
  const location = useLocation();

  /** Хук управления кластерами */
  const {
    clusters,
    currentCluster,
    addCluster,
    updateCluster,
    removeCluster
  } = useCluster();

  /** Состояние: видимость панели управления кластером */
  const [showPanel, setShowPanel] = useState(false);

  /** Состояние: режим панели ('create' | 'settings' | null) */
  const [panelMode, setPanelMode] = useState(null);

  /** Состояние: редактируемый кластер (null — создание нового) */
  const [editingCluster, setEditingCluster] = useState(null);

  // =========================================================================
  // ОБРАБОТЧИКИ СОБЫТИЙ
  // =========================================================================

  /**
   * Открывает панель создания нового кластера.
   */
  const handleAdd = () => {
    setPanelMode('create');
    setEditingCluster(null);
    setShowPanel(true);
  };

  /**
   * Открывает панель редактирования текущего кластера.
   */
  const handleEdit = () => {
    if (!currentCluster) return;
    setPanelMode('settings');
    setEditingCluster(currentCluster);
    setShowPanel(true);
  };

  /**
   * Сохраняет кластер (создание или обновление).
   *
   * @param {Object} clusterConfig - Конфигурация кластера
   */
  const handleSave = (clusterConfig) => {
    // Проверка: если редактируемый кластер был удалён
    if (
      editingCluster &&
      !clusters.find(c => c.id === editingCluster.id)
    ) {
      handleClose();
      return;
    }

    // Обновление существующего кластера
    if (editingCluster) {
      updateCluster({
        ...clusterConfig,
        id: editingCluster.id,
      });
    }
    // Создание нового кластера
    else {
      addCluster(clusterConfig);
    }

    handleClose();
  };

  /**
   * Закрывает панель управления кластером и сбрасывает состояние.
   */
  const handleClose = () => {
    setShowPanel(false);
    setEditingCluster(null);
    setPanelMode(null);
  };

  /**
   * Удаляет кластер и закрывает панель.
   *
   * @param {string} clusterId - ID удаляемого кластера
   */
  const handleDelete = (clusterId) => {
    removeCluster(clusterId);
    handleClose();
    navigate('/');
  };

  // =========================================================================
  // КОНФИГУРАЦИЯ ЗАГОЛОВКА СТРАНИЦЫ
  // =========================================================================

  const configuredPage = PAGE_CONFIG[location.pathname] ?? {
    title: 'ODYSSEY',
    description: 'Платформа мониторинга и управления Apache Kafka',
    mode: 'default' as const,
  };

  // Когда кластеров ещё нет, корневая страница является приветственной.
  // Поэтому заголовок и режим верхней панели не должны оставаться «Обзором».
  const isWelcome = !currentCluster && clusters.length === 0 && (location.pathname === '/' || location.pathname === '/overview');
  const currentPage = isWelcome
    ? {
        title: 'Добро пожаловать',
        description: '',
        mode: 'default' as const,
      }
    : configuredPage;

  const kafkaRequiredPage = !['/settings', '/user'].includes(location.pathname) && !isWelcome;
  // Для Kafka-страниц кластер доступен только после подтверждённого статуса connected.
  // Отсутствующий статус также считается проверкой, а не разрешением открыть страницу.
  const clusterStatus = currentCluster?.connectionStatus ?? 'checking';
  const clusterUnavailable = Boolean(currentCluster && clusterStatus !== 'connected');

  return (
    <div className="app-layout sidebar-dark">
      {/* Боковая панель */}
      <Sidebar
        onAddCluster={handleAdd}
        onEditCluster={handleEdit}
        clusterUnavailable={clusterUnavailable}
      />

      {/* Основная область контента */}
      <DashboardControlsProvider>
        <main className="main-content">
          <PageHeader
            title={currentPage.title}
            description={currentPage.description}
            mode={currentPage.mode}
          />

          <div className="main-content-body">
            {kafkaRequiredPage && clusterUnavailable ? (
              <ClusterStatusScreen status={clusterStatus} />
            ) : (
              <Outlet />
            )}
          </div>
        </main>
      </DashboardControlsProvider>

      {/* Модальное окно управления кластером */}
      {showPanel && (
        <div
          className="config-overlay"
          onClick={handleClose}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="config-panel"
            onClick={(event) => event.stopPropagation()}
          >
            {/* Панель создания кластера */}
            {panelMode === 'create' && (
              <CreateClusterPanel
                onSave={handleSave}
                onCancel={handleClose}
              />
            )}

            {/* Панель редактирования кластера */}
            {panelMode === 'settings' && (
              <ClusterSettingsPanel
                cluster={editingCluster}
                onSave={handleSave}
                onCancel={handleClose}
                onDelete={handleDelete}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Layout;