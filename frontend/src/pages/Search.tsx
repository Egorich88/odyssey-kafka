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
 * @fileoverview Страница поиска сообщений в Kafka.
 * Позволяет выбирать топик, партицию, оффсеты, искать по ключу/значению.
 * Реализована пагинация (25 сообщений на страницу) и экспорт выделенных записей.
 * При смене кластера все данные и параметры поиска полностью сбрасываются.
 */
import { FiDownload, FiChevronDown } from 'react-icons/fi';
import SearchToolbar from '../pages/search/SearchToolbar'
import MessagesTable from '../pages/search/MessagesTable'
import Pagination from '../pages/search/Pagination'
import MessageViewer from '../pages/search/MessageViewer'
import '../styles/search.css';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import toast, { Toaster } from 'react-hot-toast';
import { useCluster } from '../contexts/ClusterContext';

export default function Search() {
  const { currentCluster } = useCluster();
  const [searchParams, setSearchParams] = useSearchParams();

  // Состояния формы поиска
  const [startOffset, setStartOffset] = useState('')
  const [endOffset, setEndOffset] = useState('')
  const [topics, setTopics] = useState([]);
  const [selectedTopic, setSelectedTopic] = useState(searchParams.get('topic') || '');
  const [partition, setPartition] = useState(searchParams.get('partition') || 'all');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [messages, setMessages] = useState([])
  const [maxMessages, setMaxMessages] = useState(100)
  const [partitions, setPartitions] = useState([])
  const [selectedMessage, setSelectedMessage] = useState(null)
  const [selectedRows, setSelectedRows] = useState([])
  const [viewFormat, setViewFormat] = useState("json")
  const [exportMenu, setExportMenu] = useState(null)
  const [searching, setSearching] = useState(false);
  const [isTopicDropdownOpen, setIsTopicDropdownOpen] = useState(false);
  const [isPartitionDropdownOpen, setIsPartitionDropdownOpen] = useState(false)
  const [topicSearch, setTopicSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1)
  const [totalMessages, setTotalMessages] = useState(0)

  const pageSize = 25
  const totalPages = Math.max(1, Math.ceil(totalMessages / pageSize))

  // Уникальный ключ сообщения для выделения
  const getRowKey = useCallback((msg) => `${selectedTopic}-${msg.partition}-${msg.offset}`, [selectedTopic]);

  // Переключение выбора строки
  const toggleRowSelection = (rowKey) => {
    setSelectedRows((prev) =>
      prev.includes(rowKey) ? prev.filter((v) => v !== rowKey) : [...prev, rowKey]
    )
  }

  // Выбрать / снять все на текущей странице
  const toggleAllRows = () => {
    const currentPageKeys = messages.map(getRowKey)
    const allSelected = currentPageKeys.every(key => selectedRows.includes(key))
    if (allSelected) {
      setSelectedRows(prev => prev.filter(key => !currentPageKeys.includes(key)))
    } else {
      const newKeys = currentPageKeys.filter(key => !selectedRows.includes(key))
      setSelectedRows(prev => [...prev, ...newKeys])
    }
  }

  const allCurrentSelected = messages.length > 0 && messages.every(msg => selectedRows.includes(getRowKey(msg)))

  const topicDropdownRef = useRef(null);
  const partitionDropdownRef = useRef(null);

  // --- Загрузка списка топиков при смене кластера ---
  useEffect(() => {
    if (!currentCluster) return;
    const loadTopics = async () => {
      try {
        const response = await axios.get('/api/topics', {
          headers: { 'X-Kafka-Profile-ID': currentCluster.id }
        });
        let topicsList = response.data.topics || [];
        if (topicsList.length > 0 && typeof topicsList[0] === 'object') {
          topicsList = topicsList.map(t => t.name);
        }
        setTopics(topicsList);
      } catch (err) {
        toast.error('Ошибка загрузки топиков');
      }
    };
    loadTopics();
  }, [currentCluster]);

  // --- Загрузка партиций при выборе топика ---
  useEffect(() => {
    if (!selectedTopic || !currentCluster) return;
    axios.get(`/api/topics/${selectedTopic}/partitions`, {
      headers: { 'X-Kafka-Profile-ID': currentCluster.id }
    }).then((res) => {
      setPartitions(res.data.partitions || [])
    }).catch(() => setPartitions([]))
  }, [selectedTopic, currentCluster])

  // --- Синхронизация параметров URL ---
  useEffect(() => {
    if (selectedTopic) {
      setSearchParams({ topic: selectedTopic, partition });
    } else {
      setSearchParams({});
    }
  }, [selectedTopic, partition, setSearchParams]);

  // --- Сброс страницы при смене топика, партиции, поискового ключа ---
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedTopic, partition, searchKeyword]);

  // --- Сброс состояния при смене топика (если топик очищен) ---
  useEffect(() => {
    if (!selectedTopic) {
      setPartition("all");
      setMessages([]);
      setSelectedRows([]);
      setSelectedMessage(null);
      setCurrentPage(1);
      setTotalMessages(0);
      setPartitions([]);
    }
  }, [selectedTopic]);

  // --- ПОЛНАЯ ОЧИСТКА ПРИ СМЕНЕ КЛАСТЕРА (ВАЖНО) ---
  useEffect(() => {
    // Сбрасываем все данные, связанные с предыдущим кластером
    setMessages([]);
    setSelectedRows([]);
    setSelectedMessage(null);
    setTotalMessages(0);
    setCurrentPage(1);
    setPartitions([]);
    // Сбрасываем параметры формы (опционально — чтобы пользователь начал с чистого листа)
    setSelectedTopic('');
    setPartition('all');
    setSearchKeyword('');
    setStartOffset('');
    setEndOffset('');
    setMaxMessages(100);
    setTopicSearch('');
    setIsTopicDropdownOpen(false);
    setIsPartitionDropdownOpen(false);
    // Очищаем URL-параметры
    setSearchParams({});
  }, [currentCluster]);

  // --- Функция загрузки сообщений (пагинация) ---
  const fetchMessages = useCallback(async () => {
    if (!selectedTopic || !topics.includes(selectedTopic)) return;
    if (!currentCluster) return;
    setSearching(true);
    try {
      const baseOffset = startOffset !== '' ? Number(startOffset) : 0
      const calculatedOffset = baseOffset + ((currentPage - 1) * pageSize)
      const partitionParam = partition === "all" ? "" : partition;

      let url = `/api/topics/${encodeURIComponent(selectedTopic)}/messages?partition=${partitionParam}&offset=${calculatedOffset}&limit=${maxMessages}`;
      if (endOffset) url += `&endOffset=${endOffset}`;
      if (searchKeyword) url += `&search=${encodeURIComponent(searchKeyword)}`;

      const response = await axios.get(url, {
        headers: { 'X-Kafka-Profile-ID': currentCluster.id }
      });
      setMessages(response.data.messages || [])
      setTotalMessages(response.data.total || 0)
      toast.success(`Получено ${response.data.messages?.length || 0} сообщений из ${response.data.total || 0}`);
    } catch (err) {
      toast.error('Ошибка чтения сообщений: ' + (err.response?.data?.error || err.message));
      setMessages([]);
      setTotalMessages(0);
    } finally {
      setSearching(false);
    }
  }, [selectedTopic, topics, currentCluster, startOffset, currentPage, pageSize, partition, maxMessages, endOffset, searchKeyword]);

  // Загрузка при изменении параметров
  useEffect(() => {
    if (selectedTopic && currentCluster) {
      fetchMessages();
    }
  }, [selectedTopic, partition, currentPage, searchKeyword, fetchMessages]);

  // Обработчик отправки формы (сброс на первую страницу)
  const handleSearch = (e) => {
    e.preventDefault();
    setCurrentPage(1);
    fetchMessages();
  };

  // Закрытие выпадающих меню при клике вне
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (topicDropdownRef.current && !topicDropdownRef.current.contains(event.target)) {
        setIsTopicDropdownOpen(false);
        setTopicSearch('');
      }
      if (partitionDropdownRef.current && !partitionDropdownRef.current.contains(event.target)) {
        setIsPartitionDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Экспорт сообщений
  const exportMessages = (format, onlySelected = false) => {
    const rows = onlySelected
      ? messages.filter((m) => selectedRows.includes(getRowKey(m)))
      : messages
    if (rows.length === 0) {
      toast.error("Нет сообщений для выгрузки")
      return
    }
    if (format === "json") {
      const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" })
      downloadBlob(blob, "messages.json")
    }
    if (format === "csv") {
      const csv = [
        ["offset", "key", "timestamp", "value"].join(","),
        ...rows.map((m) => [
          m.offset,
          `"${m.key || ""}"`,
          `"${m.timestamp}"`,
          `"${(m.value || "").replace(/"/g, '""')}"`
        ].join(","))
      ].join("\n")
      const blob = new Blob([csv], { type: "text/csv" })
      downloadBlob(blob, "messages.csv")
    }
    if (format === "txt") {
      const text = rows.map((m) => [
        `Offset: ${m.offset}`,
        `Key: ${m.key || "-"}`,
        `Timestamp: ${m.timestamp}`,
        `Value:`,
        m.value,
        "--------------------------------"
      ].join("\n")).join("\n")
      const blob = new Blob([text], { type: "text/plain" })
      downloadBlob(blob, "messages.txt")
    }
    setExportMenu(null)
  }

  const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const filteredTopics = topics.filter(topic => topic.toLowerCase().includes(topicSearch.toLowerCase()));

  return (
    <div className="search-page">
      <Toaster position="top-right" />


      <div className="search-toolbar-card">
        <SearchToolbar
          handleSearch={handleSearch}
          topicDropdownRef={topicDropdownRef}
          partitionDropdownRef={partitionDropdownRef}
          isTopicDropdownOpen={isTopicDropdownOpen}
          setIsTopicDropdownOpen={setIsTopicDropdownOpen}
          topicSearch={topicSearch}
          setTopicSearch={setTopicSearch}
          selectedTopic={selectedTopic}
          setSelectedTopic={setSelectedTopic}
          filteredTopics={filteredTopics}
          partition={partition}
          setPartition={setPartition}
          partitions={partitions}
          isPartitionDropdownOpen={isPartitionDropdownOpen}
          setIsPartitionDropdownOpen={setIsPartitionDropdownOpen}
          startOffset={startOffset}
          setStartOffset={setStartOffset}
          endOffset={endOffset}
          setEndOffset={setEndOffset}
          maxMessages={maxMessages}
          setMaxMessages={setMaxMessages}
          setCurrentPage={setCurrentPage}
          searching={searching}
          currentCluster={currentCluster}
          searchKeyword={searchKeyword}
          setSearchKeyword={setSearchKeyword}
        />
      </div>

      {messages.length > 0 && (
        <div className="search-results-card">
          <div className="search-results-header">
            <div className="search-results-title-row">
              <h2>Результаты поиска</h2>
              <div className="search-results-badge">Найдено: {totalMessages} сообщений</div>
            </div>
            <div className="search-actions">
              {/* Единый экспорт — если есть выбранные, экспортируем их, иначе все */}
              <div className="export-dropdown">
                <button
                  type="button"
                  className="export-btn"
                  onClick={() => setExportMenu(exportMenu === 'export' ? null : 'export')}
                >
                  <FiDownload className="export-icon" />
                  Экспорт ({selectedRows.length})
                  <FiChevronDown className="export-chevron" />
                </button>

                {exportMenu === 'export' && (
                  <div className="export-menu">
                    <button onClick={() => exportMessages('json', selectedRows.length > 0)}>
                      JSON
                    </button>
                    <button onClick={() => exportMessages('csv', selectedRows.length > 0)}>
                      CSV
                    </button>
                    <button onClick={() => exportMessages('txt', selectedRows.length > 0)}>
                      TXT
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="messages-table-wrapper">
            <MessagesTable
              messages={messages}
              selectedRows={selectedRows}
              toggleAllRows={toggleAllRows}
              toggleRowSelection={toggleRowSelection}
              selectedMessage={selectedMessage}
              setSelectedMessage={setSelectedMessage}
              selectedTopic={selectedTopic}
              allCurrentSelected={allCurrentSelected}
              getRowKey={getRowKey}
            />
          </div>

          <div className="table-footer">
            <div className="table-footer-left">
              <span className="selected-count">Выбрано: {selectedRows.length} сообщений</span>
              <button className="clear-selection-btn" onClick={() => setSelectedRows([])}>Очистить выбор</button>
            </div>
            <Pagination
              currentPage={currentPage}
              setCurrentPage={setCurrentPage}
              totalPages={totalPages}
            />
          </div>

          <MessageViewer
            selectedMessage={selectedMessage}
            viewFormat={viewFormat}
            setViewFormat={setViewFormat}
          />
        </div>
      )}
    </div>
  );
}