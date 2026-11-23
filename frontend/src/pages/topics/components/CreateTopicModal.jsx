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
 * @fileoverview Модальное окно создания нового топика
 */

export default function CreateTopicModal({
  showCreateModal,
  setShowCreateModal,
  newTopic,
  setNewTopic,
  showAdvanced,
  setShowAdvanced,
  handleCreateTopic,
}) {
  useInterfaceLanguage();
  if (!showCreateModal) return null;

  return (
    <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2>{odysseyI18n.t('interface.createTopic')}</h2>

        <form onSubmit={handleCreateTopic}>
          <div className="modal-field">
            <label>{odysseyI18n.t('interface.topicName')}</label>
            <input
              type="text"
              placeholder={odysseyI18n.t('interface.exampleOrdersEvents')}
              value={newTopic.topic}
              onChange={(e) =>
                setNewTopic({
                  ...newTopic,
                  topic: e.target.value,
                })
              }
              required
            />
          </div>

          <div className="modal-field">
            <label>{odysseyI18n.t('interface.partitionCount')}</label>
            <input
              type="text"
              placeholder="1"
              value={newTopic.partitions}
              onChange={(e) =>
                setNewTopic({
                  ...newTopic,
                  partitions: e.target.value,
                })
              }
            />
          </div>

          <div className="modal-field">
            <label>{odysseyI18n.t('interface.replicationFactor')}</label>
            <input
              type="text"
              placeholder="1"
              value={newTopic.replication}
              onChange={(e) =>
                setNewTopic({
                  ...newTopic,
                  replication: e.target.value,
                })
              }
            />
          </div>

          <button
            type="button"
            className="advanced-toggle"
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            {showAdvanced
              ? odysseyI18n.t('interface.hideAdvancedOptions')
              : odysseyI18n.t('interface.advancedOptions')}
          </button>

          {showAdvanced && (
            <div className="advanced-section">
              <div className="modal-field">
                <label>cleanup.policy</label>
                <select
                  value={newTopic.cleanupPolicy}
                  onChange={(e) =>
                    setNewTopic({
                      ...newTopic,
                      cleanupPolicy: e.target.value,
                    })
                  }
                >
                  <option value="delete">delete</option>
                  <option value="compact">compact</option>
                  <option value="compact,delete">compact,delete</option>
                </select>
              </div>

              <div className="modal-field">
                <label>retention.ms</label>
                <input
                  type="text"
                  value={newTopic.retentionMs}
                  onChange={(e) =>
                    setNewTopic({
                      ...newTopic,
                      retentionMs: e.target.value,
                    })
                  }
                />
              </div>

              <div className="modal-field">
                <label>min.insync.replicas</label>
                <input
                  type="text"
                  placeholder="1"
                  value={newTopic.minInSyncReplicas}
                  onChange={(e) =>
                    setNewTopic({
                      ...newTopic,
                      minInSyncReplicas: e.target.value,
                    })
                  }
                />
              </div>
            </div>
          )}

          <div className="modal-buttons">
            <button type="submit">{odysseyI18n.t('interface.create')}</button>
            <button type="button" onClick={() => setShowCreateModal(false)}> {odysseyI18n.t('interface.cancel')} </button>
          </div>
        </form>
      </div>
    </div>
  );
}