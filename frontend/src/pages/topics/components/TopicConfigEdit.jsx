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
 * @fileoverview Компонент редактирования параметра конфигурации
 */

export default function TopicConfigEdit({
  editingParam,
  editValue,
  setEditValue,
  handleSaveEdit,
  handleCancelEdit,
}) {
  useInterfaceLanguage();
  if (!editingParam) return null;

  return (
    <div className="config-edit-box">
      <h4>{odysseyI18n.t('interface.editing')} {editingParam}</h4>
      <input
        type="text"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSaveEdit();
          if (e.key === 'Escape') handleCancelEdit();
        }}
        autoFocus
      />
      <div className="config-edit-actions">
        <button className="save-btn" onClick={handleSaveEdit}> {odysseyI18n.t('interface.save')} </button>
        <button className="cancel-btn" onClick={handleCancelEdit}> {odysseyI18n.t('interface.cancel')} </button>
      </div>
    </div>
  );
}