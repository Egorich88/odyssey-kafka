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
 * @fileoverview Таблица конфигурации топика
 */

import { CONFIG_DESCRIPTIONS } from '../constants/configDescriptions';

export default function TopicConfigTable({
  configs,
  selectedConfigParam,
  setSelectedConfigParam,
  editingParam,
  handleConfigDoubleClick,
  canEdit = false,
}) {
  useInterfaceLanguage();
  return (
    <div className="topic-section topic-config-section">
      <h3>{odysseyI18n.t('interface.configuration')}</h3>

      <div className="topic-config-wrapper">
        <table className="topic-config-table">
          <thead>
            <tr>
              <th>{odysseyI18n.t('interface.parameter')}</th>
              <th>{odysseyI18n.t('interface.value2')}</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(configs || {}).map(([key, value]) => (
              <tr
                key={key}
                className={
                  selectedConfigParam === key ? 'active-config' : ''
                }
                onClick={() => setSelectedConfigParam(key)}
              >
                <td className="config-key-cell">
                  <div className="config-key-name">{key}</div>
                  {CONFIG_DESCRIPTIONS[key] && (
                    <div className="config-key-desc">
                      {CONFIG_DESCRIPTIONS[key]}
                    </div>
                  )}
                </td>
                <td>
                  <span
                    className={`config-value ${
                      editingParam === key ? 'editing' : ''
                    }`}
                    style={canEdit ? undefined : { cursor: 'text' }}
                    onDoubleClick={canEdit ? () => handleConfigDoubleClick(key, value) : undefined}
                  >
                    {value}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
