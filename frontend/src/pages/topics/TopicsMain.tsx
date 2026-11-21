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
 * @fileoverview Основной компонент страницы управления топиками.
 * Собирает все части в единую страницу: панель инструментов,
 * таблицу топиков, панель деталей и модальное окно создания.
 */

import '../../styles/topics.css';
import { Toaster } from 'react-hot-toast';
import { useTopics } from './hooks/useTopics';
import TopicToolbar from './components/TopicToolbar';
import TopicTable from './components/TopicTable';
import TopicDetailsPanel from './components/TopicDetailsPanel';
import CreateTopicModal from './components/CreateTopicModal';
import { useDashboardControls } from '../../contexts/DashboardControlsContext';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

export default function TopicsMain() {
  const { t } = useTranslation();
  const { registerRefreshHandler } = useDashboardControls();

  const {
    loading,
    filter,
    setFilter,
    showExportMenu,
    setShowExportMenu,
    selectedTopics,
    topics,
    selectedTopic,
    detailTopic,
    showCreateModal,
    setShowCreateModal,
    newTopic,
    setNewTopic,
    showAdvanced,
    setShowAdvanced,
    editingParam,
    editValue,
    setEditValue,
    selectedConfigParam,
    setSelectedConfigParam,
    panelRef,
    exportMenuRef,
    filteredTopics,

    toggleTopicSelection,
    toggleSelectAll,
    handleRowClick,
    closePanel,
    handleConfigDoubleClick,
    handleSaveEdit,
    handleCancelEdit,
    handleCreateTopic,
    handleDeleteTopic,
    exportTopicsList,
    exportTopicsConfig,
    fetchTopics,
    permissions,
  } = useTopics();

  // Регистрируем обработчик обновления в глобальном контексте
  useEffect(() => {
    registerRefreshHandler(fetchTopics);
    return () => registerRefreshHandler(null);
  }, [registerRefreshHandler, fetchTopics]);

  return (
    <div className="topics-container">
      <Toaster position="top-right" />

      {/* Панель инструментов */}
      <TopicToolbar
        permissions={permissions}
        filter={filter}
        setFilter={setFilter}
        showExportMenu={showExportMenu}
        setShowExportMenu={setShowExportMenu}
        selectedTopics={selectedTopics}
        topics={topics}
        exportMenuRef={exportMenuRef}
        exportTopicsList={exportTopicsList}
        exportTopicsConfig={exportTopicsConfig}
        setShowCreateModal={setShowCreateModal}
        selectedTopic={selectedTopic}
        handleDeleteTopic={handleDeleteTopic}
      />
      {!permissions.createTopic && !permissions.deleteTopic && !permissions.alterTopicConfig &&
        <p role="status">{t('adminPermissions.readOnly')}</p>}

      {/* Основное содержимое страницы */}
      <div className={`topics-content ${detailTopic ? 'with-details' : ''}`}>
        {/* Таблица топиков */}
        <TopicTable
          loading={loading}
          filteredTopics={filteredTopics}
          selectedTopics={selectedTopics}
          toggleSelectAll={toggleSelectAll}
          selectedTopic={selectedTopic}
          handleRowClick={handleRowClick}
          toggleTopicSelection={toggleTopicSelection}
        />

        {/* Панель деталей топика */}
        {detailTopic && (
          <TopicDetailsPanel
            canEditConfig={permissions.alterTopicConfig}
            detailTopic={detailTopic}
            panelRef={panelRef}
            closePanel={closePanel}
            selectedConfigParam={selectedConfigParam}
            setSelectedConfigParam={setSelectedConfigParam}
            editingParam={editingParam}
            handleConfigDoubleClick={handleConfigDoubleClick}
            editValue={editValue}
            setEditValue={setEditValue}
            handleSaveEdit={handleSaveEdit}
            handleCancelEdit={handleCancelEdit}
          />
        )}
      </div>

      {/* Модальное окно создания топика */}
      <CreateTopicModal
        showCreateModal={showCreateModal && permissions.createTopic}
        setShowCreateModal={setShowCreateModal}
        newTopic={newTopic}
        setNewTopic={setNewTopic}
        showAdvanced={showAdvanced}
        setShowAdvanced={setShowAdvanced}
        handleCreateTopic={handleCreateTopic}
      />
    </div>
  );
}
