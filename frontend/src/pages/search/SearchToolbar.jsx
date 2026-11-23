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
 * @fileoverview Панель инструментов поиска: выбор топика, партиции,
 * диапазоны оффсетов, поиск по ключу/значению, кнопка поиска.
 */

import { FiChevronDown, FiChevronUp, FiSearch } from 'react-icons/fi'
import { useState } from 'react';

export default function SearchToolbar({
  handleSearch,
  topicDropdownRef,
  partitionDropdownRef,
  isTopicDropdownOpen,
  setIsTopicDropdownOpen,
  topicSearch,
  setTopicSearch,
  selectedTopic,
  setSelectedTopic,
  filteredTopics,
  partition,
  setPartition,
  partitions,
  isPartitionDropdownOpen,
  setIsPartitionDropdownOpen,
  startOffset,
  setStartOffset,
  endOffset,
  setEndOffset,
  maxMessages,
  setMaxMessages,
  setCurrentPage,
  searching,
  currentCluster,
  searchKeyword,
  setSearchKeyword
}) {
  useInterfaceLanguage();
  const [focusedField, setFocusedField] = useState(null);

  // Флаг: выбран ли топик
  const hasTopic = Boolean(selectedTopic);

  return (
    <form className="search-toolbar" onSubmit={handleSearch}>
      {/* Топик – уменьшенная ширина через CSS-класс */}
      <div className="search-field topic-field">
        <label>{odysseyI18n.t('interface.topic')}</label>
        <div ref={topicDropdownRef} className="topic-dropdown-wrapper">
          <div
            className={`topic-dropdown-trigger ${isTopicDropdownOpen ? 'open' : ''}`}
            onClick={() => setIsTopicDropdownOpen(true)}
          >
            <FiSearch className="topic-dropdown-search-icon" />
            <input
              type="text"
              className="topic-dropdown-input"
              placeholder={isTopicDropdownOpen ? odysseyI18n.t('interface.searchTopics') : odysseyI18n.t('interface.selectATopic')}
              value={isTopicDropdownOpen ? topicSearch : (selectedTopic || '')}
              onChange={(e) => {
                setTopicSearch(e.target.value)
                setIsTopicDropdownOpen(true)
              }}
              onFocus={() => setIsTopicDropdownOpen(true)}
            />
            <div className="topic-dropdown-chevron">
              {isTopicDropdownOpen ? <FiChevronUp /> : <FiChevronDown />}
            </div>
          </div>
          {isTopicDropdownOpen && (
            <div className="topic-dropdown-menu">
              <div className="topic-dropdown-list">
                {filteredTopics.length > 0 ? (
                  filteredTopics.map(topic => (
                    <div
                      key={topic}
                      className={`topic-dropdown-item ${selectedTopic === topic ? 'active' : ''}`}
                      onClick={() => {
                        setSelectedTopic(topic)
                        setTopicSearch('')
                        setIsTopicDropdownOpen(false)
                      }}
                    >
                      {topic}
                    </div>
                  ))
                ) : (
                  <div className="topic-dropdown-item">{odysseyI18n.t('interface.nothingFound')}</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Партиция – если топик не выбран, дропдаун заблокирован */}
      <div className="search-field">
        <label>{odysseyI18n.t('interface.partition')}</label>
        <div ref={partitionDropdownRef} className="topic-dropdown-wrapper">
          <div
            className={`topic-dropdown-trigger ${isPartitionDropdownOpen ? 'open' : ''} ${!hasTopic ? 'disabled' : ''}`}
            onClick={() => {
              if (!hasTopic) return; // Не открываем, если нет топика
              setIsPartitionDropdownOpen(!isPartitionDropdownOpen)
            }}
            style={{ opacity: hasTopic ? 1 : 0.5, cursor: hasTopic ? 'pointer' : 'not-allowed' }}
          >
            <span className="topic-dropdown-value">
              {partition === "all" ? odysseyI18n.t('interface.allPartitions2') : odysseyI18n.t('interface.partition3', { v0: partition })}
            </span>
            <div className="topic-dropdown-chevron">
              {isPartitionDropdownOpen ? <FiChevronUp /> : <FiChevronDown />}
            </div>
          </div>
          {hasTopic && isPartitionDropdownOpen && (
            <div className="topic-dropdown-menu">
              <div className="topic-dropdown-list">
                <div
                  className={`topic-dropdown-item ${partition === "all" ? "active" : ""}`}
                  onClick={() => { setPartition("all"); setIsPartitionDropdownOpen(false) }}
                > {odysseyI18n.t('interface.allPartitions2')} </div>
                {partitions.map((p) => (
                  <div
                    key={p}
                    className={`topic-dropdown-item ${partition === String(p) ? "active" : ""}`}
                    onClick={() => { setPartition(String(p)); setCurrentPage(1); setIsPartitionDropdownOpen(false) }}
                  > {odysseyI18n.t('interface.partition')} {p}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Поиск по ключу или значению */}
      <div className={`search-field ${focusedField === 'searchKeyword' ? 'focused' : ''}`}>
        <label>{odysseyI18n.t('interface.searchMessages')}</label>
        <input
          type="text"
          value={searchKeyword}
          onChange={(e) => setSearchKeyword(e.target.value)}
          placeholder={odysseyI18n.t('interface.keyOrTextInValue')}
          onFocus={() => setFocusedField('searchKeyword')}
          onBlur={() => setFocusedField(null)}
        />
      </div>

      {/* Остальные поля */}
      <div className={`search-field ${focusedField === 'startOffset' ? 'focused' : ''}`}>
        <label>{odysseyI18n.t('interface.startingOffset')}</label>
        <input
          type="number"
          value={startOffset}
          onChange={(e) => setStartOffset(e.target.value)}
          onFocus={() => setFocusedField('startOffset')}
          onBlur={() => setFocusedField(null)}
        />
      </div>

      <div className={`search-field ${focusedField === 'endOffset' ? 'focused' : ''}`}>
        <label>{odysseyI18n.t('interface.endingOffset')}</label>
        <input
          type="number"
          value={endOffset}
          onChange={(e) => setEndOffset(e.target.value)}
          onFocus={() => setFocusedField('endOffset')}
          onBlur={() => setFocusedField(null)}
        />
      </div>

      <div className={`search-field ${focusedField === 'maxMessages' ? 'focused' : ''}`}>
        <label>{odysseyI18n.t('interface.maxMessages')}</label>
        <input
          type="number"
          value={maxMessages}
          onChange={(e) => setMaxMessages(Number(e.target.value))}
          min="1"
          onFocus={() => setFocusedField('maxMessages')}
          onBlur={() => setFocusedField(null)}
        />
      </div>

      <button
        type="submit"
        className="search-submit-btn"
        disabled={searching || !selectedTopic || !currentCluster}
      >
        {searching ? odysseyI18n.t('interface.searching') : <><FiSearch /> {odysseyI18n.t('interface.search')}</>}
      </button>
    </form>
  )
}