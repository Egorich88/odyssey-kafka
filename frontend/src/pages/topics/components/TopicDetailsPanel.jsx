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
 * @fileoverview Панель с детальной информацией о топике
 */

import TopicConfigTable from './TopicConfigTable';
import TopicConfigEdit from './TopicConfigEdit';
import { useTranslation } from 'react-i18next';

export default function TopicDetailsPanel({
  detailTopic,
  panelRef,
  closePanel,
  selectedConfigParam,
  setSelectedConfigParam,
  editingParam,
  handleConfigDoubleClick,
  editValue,
  setEditValue,
  handleSaveEdit,
  handleCancelEdit,
  canEditConfig = false,
}) {
  const { t } = useTranslation();
  return (
    <div className="topic-details-panel" ref={panelRef}>
      {/* Заголовок панели */}
      <div className="topic-details-header">
        <h2>Детали топика</h2>
        <button className="topic-hide-btn" onClick={closePanel}>
          Скрыть
        </button>
      </div>

      <div className="topic-details-body">
        {/* Основная информация */}
        <div className="topic-summary">
          <div>
            <strong>Имя топика:</strong> {detailTopic.name}
          </div>
          <div>
            <strong>Сообщений:</strong> {detailTopic.messageCount ?? '-'}
          </div>
          <div>
            <strong>Фактор репликации:</strong> {detailTopic.replicationFactor}
          </div>
          <div>
            <strong>Партиций:</strong> {detailTopic.partitions?.length ?? 0}
          </div>
        </div>

        {/* Подсказка о редактировании */}
        <div className="topic-hint">
          {canEditConfig ? t('adminPermissions.editHint') : t('adminPermissions.readOnly')}
        </div>

        {/* Таблица конфигурации */}
        <TopicConfigTable
          canEdit={canEditConfig}
          configs={detailTopic.configs}
          selectedConfigParam={selectedConfigParam}
          setSelectedConfigParam={setSelectedConfigParam}
          editingParam={editingParam}
          handleConfigDoubleClick={handleConfigDoubleClick}
        />

        {/* Редактирование параметра */}
        {canEditConfig && <TopicConfigEdit
          editingParam={editingParam}
          editValue={editValue}
          setEditValue={setEditValue}
          handleSaveEdit={handleSaveEdit}
          handleCancelEdit={handleCancelEdit}
        />}
      </div>
    </div>
  );
}
