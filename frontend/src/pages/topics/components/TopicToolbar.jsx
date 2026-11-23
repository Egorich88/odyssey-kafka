import odysseyI18n from '../../../i18n';
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
 * @fileoverview Панель инструментов управления топиками
 * Содержит поле поиска, кнопки экспорта, создания и удаления
 */

import { FiDownload, FiChevronDown, FiChevronUp } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';

export default function TopicToolbar({
  filter,
  setFilter,
  showExportMenu,
  setShowExportMenu,
  selectedTopics,
  exportMenuRef,
  exportTopicsList,
  exportTopicsConfig,
  setShowCreateModal,
  selectedTopic,
  handleDeleteTopic,
  permissions = {},
}) {
  useInterfaceLanguage();
  const { t } = useTranslation();
  return (
    <div className="topics-toolbar">
      <div className="toolbar-left">
        {/* Поле поиска */}
        <input
          type="text"
          placeholder={odysseyI18n.t('interface.searchTopics')}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="filter-input"
        />

        {/* Экспорт с выпадающим меню */}
        <div className="export-dropdown-wrapper" ref={exportMenuRef}>
          <button
            className="action-btn export-btn"
            onClick={() => setShowExportMenu(!showExportMenu)}
          >
            <FiDownload className="export-icon" /> {odysseyI18n.t('interface.export2')}{selectedTopics.length})
            {showExportMenu ? <FiChevronUp className="export-chevron" /> : <FiChevronDown className="export-chevron" />}
          </button>

          {showExportMenu && (
            <div className="export-menu">
              <button className="export-item" onClick={exportTopicsList}> {odysseyI18n.t('interface.topicList')} </button>
              <button className="export-item" onClick={exportTopicsConfig}> {odysseyI18n.t('interface.topicConfiguration')} </button>
            </div>
          )}
        </div>

        {/* Кнопка создания топика */}
        <button className="action-btn" onClick={() => setShowCreateModal(true)}
          disabled={!permissions.createTopic} title={!permissions.createTopic ? t('adminPermissions.readOnly') : undefined}> {odysseyI18n.t('interface.create')} </button>

        {/* Кнопка удаления топика */}
        <button
          className="action-btn delete"
          onClick={handleDeleteTopic}
          disabled={!selectedTopic || !permissions.deleteTopic}
          title={!permissions.deleteTopic ? t('adminPermissions.readOnly') : undefined}
        > {odysseyI18n.t('interface.delete')} </button>
      </div>
    </div>
  );
}
