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
 * @fileoverview Детальный просмотр выбранного сообщения.
 * Выбор формата (JSON/RAW) через кастомный дропдаун, кнопка скачивания сообщения.
 * Для обоих форматов реализована подсветка синтаксиса: ключи и значения разных цветов.
 */

import { useState, useRef, useEffect } from 'react';
import { FiChevronDown, FiChevronUp, FiDownload } from 'react-icons/fi';

/**
 * Токенизирует строку JSON и возвращает массив токенов с типами.
 * Сохраняет все пробелы и переносы строк.
 */
function tokenizeJson(str) {
  const tokens = [];
  let i = 0;

  while (i < str.length) {
    const ch = str[i];

    // Пунктуация
    if (ch === '{' || ch === '}' || ch === '[' || ch === ']' || ch === ',' || ch === ':') {
      tokens.push({ type: 'punctuation', value: ch });
      i++;
      continue;
    }

    // Пробелы и переносы
    if (ch === ' ' || ch === '\n' || ch === '\t' || ch === '\r') {
      let j = i;
      while (j < str.length && (str[j] === ' ' || str[j] === '\n' || str[j] === '\t' || str[j] === '\r')) j++;
      tokens.push({ type: 'whitespace', value: str.substring(i, j) });
      i = j;
      continue;
    }

    // Строки в кавычках
    if (ch === '"') {
      let j = i + 1;
      while (j < str.length && str[j] !== '"') j++;
      const tokenValue = str.substring(i, j + 1);
      // Определяем, ключ это или значение: смотрим следующий символ после строки, игнорируя пробелы
      let nextIdx = j + 1;
      while (nextIdx < str.length && (str[nextIdx] === ' ' || str[nextIdx] === '\n' || str[nextIdx] === '\t')) nextIdx++;
      if (nextIdx < str.length && str[nextIdx] === ':') {
        tokens.push({ type: 'key', value: tokenValue });
      } else {
        tokens.push({ type: 'value', value: tokenValue });
      }
      i = j + 1;
      continue;
    }

    // Булевы и null
    if (str.startsWith('true', i)) {
      tokens.push({ type: 'value', value: 'true' });
      i += 4;
      continue;
    }
    if (str.startsWith('false', i)) {
      tokens.push({ type: 'value', value: 'false' });
      i += 5;
      continue;
    }
    if (str.startsWith('null', i)) {
      tokens.push({ type: 'value', value: 'null' });
      i += 4;
      continue;
    }

    // Числа
    if (ch === '-' || (ch >= '0' && ch <= '9')) {
      let j = i + 1;
      while (j < str.length && (str[j] >= '0' && str[j] <= '9' || str[j] === '.' || str[j] === 'e' || str[j] === 'E' || str[j] === '+' || str[j] === '-')) j++;
      tokens.push({ type: 'value', value: str.substring(i, j) });
      i = j;
      continue;
    }

    // Любой другой символ (не должен встречаться в валидном JSON)
    tokens.push({ type: 'unknown', value: ch });
    i++;
  }

  return tokens;
}

/**
 * Рендерит токены в React-элементы с цветовыми классами.
 */
function renderTokens(tokens) {
  return tokens.map((token, index) => {
    switch (token.type) {
      case 'key':
        return <span key={index} className="json-key">{token.value}</span>;
      case 'value':
        return <span key={index} className="json-value">{token.value}</span>;
      case 'punctuation':
        return <span key={index} className="json-punctuation">{token.value}</span>;
      case 'whitespace':
        return <span key={index} className="json-whitespace">{token.value}</span>;
      default:
        return <span key={index}>{token.value}</span>;
    }
  });
}

/**
 * Подсветка для формата JSON: парсим и форматируем с отступами.
 */
function highlightJson(jsonString) {
  try {
    const obj = JSON.parse(jsonString);
    const formatted = JSON.stringify(obj, null, 2);
    const tokens = tokenizeJson(formatted);
    return renderTokens(tokens);
  } catch {
    // Если невалидный JSON — показываем как есть
    return <span className="json-raw">{jsonString}</span>;
  }
}

/**
 * Подсветка для формата RAW: сохраняем исходный вид, раскрашиваем токены.
 */
function highlightRaw(jsonString) {
  try {
    // Пытаемся распарсить, чтобы убедиться, что это валидный JSON
    JSON.parse(jsonString);
    const tokens = tokenizeJson(jsonString);
    return renderTokens(tokens);
  } catch {
    // Если невалидный JSON — показываем как есть (одним цветом)
    return <span className="json-raw">{jsonString}</span>;
  }
}

export default function MessageViewer({ selectedMessage, viewFormat, setViewFormat }) {
  useInterfaceLanguage();
  const [isFormatOpen, setIsFormatOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Закрытие дропдауна при клике вне
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsFormatOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!selectedMessage) return null;

  // Скачивание текущего сообщения в формате JSON
  const downloadMessage = () => {
    const data = {
      offset: selectedMessage.offset,
      partition: selectedMessage.partition,
      key: selectedMessage.key,
      timestamp: selectedMessage.timestamp,
      value: selectedMessage.value,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `message_${selectedMessage.offset}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Рендеринг содержимого в зависимости от формата
  const renderContent = () => {
    if (viewFormat === 'raw') {
      return highlightRaw(selectedMessage.value);
    }
    return highlightJson(selectedMessage.value);
  };

  return (
    <div className="message-detail-panel">
      <div className="message-detail-header">
        <h3>{odysseyI18n.t('interface.messageDetails')}</h3>
        {/* Дропдаун выбора формата с подписью */}
        <div className="format-selector-wrapper">
          <span className="format-label">{odysseyI18n.t('interface.format')}</span>
          <div className="message-format-dropdown" ref={dropdownRef}>
            <button
              type="button"
              className={`format-dropdown-trigger ${isFormatOpen ? 'open' : ''}`}
              onClick={() => setIsFormatOpen(!isFormatOpen)}
            >
              <span>{viewFormat.toUpperCase()}</span>
              {isFormatOpen ? <FiChevronUp /> : <FiChevronDown />}
            </button>
            {isFormatOpen && (
              <div className="format-dropdown-menu">
                <div
                  className={`format-dropdown-item ${viewFormat === 'json' ? 'active' : ''}`}
                  onClick={() => { setViewFormat('json'); setIsFormatOpen(false); }}
                >
                  JSON
                </div>
                <div
                  className={`format-dropdown-item ${viewFormat === 'raw' ? 'active' : ''}`}
                  onClick={() => { setViewFormat('raw'); setIsFormatOpen(false); }}
                >
                  RAW
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="message-detail-meta">
        <span>Offset: {selectedMessage.offset}</span>
        <span>{odysseyI18n.t('interface.partition2')} {selectedMessage.partition ?? "—"}</span>
        <span>{odysseyI18n.t('interface.key2')} {selectedMessage.key || "-"}</span>
      </div>

      {/* Заголовок и кнопка скачивания */}
      <div className="message-value-header">
        <div className="message-detail-value-title">{odysseyI18n.t('interface.value')}{viewFormat.toUpperCase()})</div>
        <button className="download-message-btn" onClick={downloadMessage}>
          <FiDownload /> {odysseyI18n.t('interface.downloadMessage')} </button>
      </div>
      <pre className="message-detail-content">
        {renderContent()}
      </pre>
    </div>
  );
}