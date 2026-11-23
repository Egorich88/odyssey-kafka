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
 * @fileoverview Таблица сообщений с возможностью выбора строк.
 */

export default function MessagesTable({
  messages,
  selectedRows,
  toggleAllRows,
  toggleRowSelection,
  selectedMessage,
  setSelectedMessage,
  selectedTopic,
  allCurrentSelected,   // флаг: выбраны ли все сообщения на текущей странице
  getRowKey            // функция получения уникального ключа сообщения
}) {
  useInterfaceLanguage();
  return (
    <table className="messages-table">
      <thead>
        <tr>
          <th>
            <input
              type="checkbox"
              checked={allCurrentSelected}
              onChange={toggleAllRows}
            />
          </th>
          <th>Offset</th>
          <th>{odysseyI18n.t('interface.partition')}</th>
          <th>{odysseyI18n.t('interface.key')}</th>
          <th>{odysseyI18n.t('interface.time')}</th>
          <th>{odysseyI18n.t('interface.size')}</th>
          <th>{odysseyI18n.t('interface.valuePreview')}</th>
        </tr>
      </thead>
      <tbody>
        {messages.map((msg) => {
          const rowKey = getRowKey(msg)
          const isSelected = selectedMessage?.offset === msg.offset && selectedMessage?.partition === msg.partition
          return (
            <tr
              key={rowKey}
              className={isSelected ? "active-row" : ""}
              onClick={() => setSelectedMessage(msg)}
            >
              <td>
                <input
                  type="checkbox"
                  checked={selectedRows.includes(rowKey)}
                  onChange={(e) => {
                    e.stopPropagation()
                    toggleRowSelection(rowKey)
                  }}
                />
              </td>
              <td>{msg.offset}</td>
              <td>{typeof msg.partition === "number" ? msg.partition : "—"}</td>
              <td className="message-key-cell">{msg.key || "-"}</td>
              <td>{msg.timestamp}</td>
              <td>{new Blob([msg.value]).size} B</td>
              <td className="preview-cell">{msg.value?.slice(0, 90)}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}