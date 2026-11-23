import { serverMessage } from '../../../i18n/serverMessage';
import odysseyI18n from '../../../i18n';
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
 * @fileoverview Кастомный хук для управления топиками
 * Содержит всю бизнес-логику страницы управления топиками
 */

import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useCluster } from '../../../contexts/ClusterContext';
import { CONFIG_DESCRIPTIONS } from '../constants/configDescriptions';
import { useTranslation } from 'react-i18next';
import { useTopicPermissions } from './useTopicPermissions';

/**
 * Форматирует значение retention.ms в человекочитаемый вид
 * @param {string} value - Значение в миллисекундах
 * @returns {string} - Отформатированная строка (например, "7d", "24h", "infinite")
 */
export const formatRetention = (value) => {
  if (!value || value === '-') return '-';
  const ms = Number(value);
  if (ms === -1) return 'infinite';
  const days = Math.floor(ms / 86400000);
  if (days >= 1) return `${days}d`;
  const hours = Math.floor(ms / 3600000);
  if (hours >= 1) return `${hours}h`;
  return `${ms}ms`;
};

export function useTopics() {
  const { currentCluster } = useCluster();
  const profileKey = currentCluster ? `${currentCluster.id}:${currentCluster.revision ?? 0}` : '';
  const activeProfile = useRef(profileKey);
  activeProfile.current = profileKey;
  const listRequest = useRef(null);
  const detailRequest = useRef(null);
  const { t } = useTranslation();
  const { permissions, revoke } = useTopicPermissions(currentCluster);
  const rejectAdministration = useCallback(() => toast.error(t('adminPermissions.readOnly')), [t]);

  // ===========================================================================
  // Состояния
  // ===========================================================================

  // Состояние списка топиков
  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('');

  // Экспорт
  const [showExportMenu, setShowExportMenu] = useState(false);

  // Выбранный топик для деталей
  const [selectedTopic, setSelectedTopic] = useState(null);

  // Множественный выбор топиков
  const [selectedTopics, setSelectedTopics] = useState([]);

  // Детали топика
  const [detailTopic, setDetailTopic] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Модальное окно создания топика
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Форма создания нового топика
  const [newTopic, setNewTopic] = useState({
    topic: '',
    partitions: '1',
    replication: '1',
    cleanupPolicy: 'delete',
    retentionMs: '604800000',
    minInSyncReplicas: '1',
  });

  const [showAdvanced, setShowAdvanced] = useState(false);

  // Редактирование конфигурации
  const [editingParam, setEditingParam] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [originalValue, setOriginalValue] = useState('');

  // Подсветка выбранной строки в конфигурации
  const [selectedConfigParam, setSelectedConfigParam] = useState(null);

  // Рефы
  const panelRef = useRef(null);
  const exportMenuRef = useRef(null);

  // ===========================================================================
  // Эффекты
  // ===========================================================================

  /**
   * Блокировка прокрутки страницы при открытой панели деталей топика
   */
  useEffect(() => {
    if (detailTopic) {
      document.body.classList.add('drawer-open');
    } else {
      document.body.classList.remove('drawer-open');
    }
    return () => {
      document.body.classList.remove('drawer-open');
    };
  }, [detailTopic]);

  /**
   * Сброс всех состояний при смене кластера
   */
  useLayoutEffect(() => {
    setTopics([]);
    setSelectedTopic(null);
    setDetailTopic(null);
    setEditingParam(null);
    setFilter('');
    setSelectedTopics([]);
    setSelectedConfigParam(null);
    setShowCreateModal(false);
    setNewTopic(previous => ({ ...previous, topic: '' }));
    setLoading(false);
    setDetailLoading(false);
    return () => { listRequest.current?.abort(); detailRequest.current?.abort(); };
  }, [profileKey]);

  // ===========================================================================
  // Загрузка данных
  // ===========================================================================

  /**
   * Загружает список топиков из API
   */
  const fetchTopics = useCallback(async () => {
    if (activeProfile.current !== profileKey) return;
    if (!currentCluster) {
      setTopics([]);
      return;
    }

    setLoading(true);
    listRequest.current?.abort();
    const request = new AbortController();
    listRequest.current = request;

    try {
      const response = await axios.get('/api/topics/', {
        signal: request.signal,
        headers: {
          'X-Kafka-Profile-ID': currentCluster.id,
          'X-Kafka-Profile-Revision': String(currentCluster.revision),
        },
      });
      if (request.signal.aborted || activeProfile.current !== profileKey) return;

      const topicsData = response.data.topics || [];

      const normalized = topicsData.map((t) => ({
        name: t.name || t,
        partitions: t.partitions || 0,
        replicationFactor: t.replicationFactor || 1,
        cleanupPolicy: t.cleanupPolicy || t['cleanup.policy'] || '-',
        retentionMs: t.retentionMs || t['retention.ms'] || '-',
      }));

      setTopics(normalized);
    } catch (error) {
      if (request.signal.aborted || activeProfile.current !== profileKey) return;
      console.error('Не удалось выполнить запрос Kafka.');
      setTopics([]);
      toast.error(odysseyI18n.t('interface.couldNotLoadTopics'));
    } finally {
      if (!request.signal.aborted && activeProfile.current === profileKey) setLoading(false);
    }
  }, [profileKey]);

  useEffect(() => {
    fetchTopics();
  }, [fetchTopics]);

  /**
   * Загружает детальную информацию о выбранном топике
   * @param {string} topicName - Имя топика
   */
  const loadTopicDetails = useCallback(async (topicName) => {
    if (!currentCluster || activeProfile.current !== profileKey) return;
    detailRequest.current?.abort();
    const request = new AbortController();
    detailRequest.current = request;

    setDetailLoading(true);
    setDetailTopic(null);
    setEditingParam(null);
    setSelectedConfigParam(null);

    try {
      const response = await axios.get(
        `/api/topics/${encodeURIComponent(topicName)}`,
        {
          signal: request.signal,
          headers: {
            'X-Kafka-Profile-ID': currentCluster.id,
          'X-Kafka-Profile-Revision': String(currentCluster.revision),
          },
        }
      );

      if (!request.signal.aborted && activeProfile.current === profileKey) setDetailTopic(response.data);
    } catch (error) {
      if (request.signal.aborted || activeProfile.current !== profileKey) return;
      console.error('Не удалось выполнить запрос Kafka.');
      toast.error(odysseyI18n.t('interface.couldNotLoadTopicDetails'));
    } finally {
      if (!request.signal.aborted && activeProfile.current === profileKey) setDetailLoading(false);
    }
  }, [profileKey]);

  // ===========================================================================
  // Обработчики событий таблицы
  // ===========================================================================

  /**
   * Переключает выбор отдельного топика в таблице
   */
  const toggleTopicSelection = (topicName) => {
    setSelectedTopics((prev) =>
      prev.includes(topicName)
        ? prev.filter((t) => t !== topicName)
        : [...prev, topicName]
    );
  };

  /**
   * Выбирает или снимает выбор всех топиков на текущей странице
   */
  const toggleSelectAll = () => {
    if (selectedTopics.length === filteredTopics.length) {
      setSelectedTopics([]);
    } else {
      setSelectedTopics(filteredTopics.map((t) => t.name));
    }
  };

  /**
   * Обработчик клика по строке топика
   */
  const handleRowClick = (topic) => {
    setSelectedTopic(topic);
    loadTopicDetails(topic.name);
  };

  // ===========================================================================
  // Управление панелью деталей
  // ===========================================================================

  /**
   * Закрывает панель деталей топика
   */
  const closePanel = () => {
    detailRequest.current?.abort();
    setDetailTopic(null);
    setEditingParam(null);
    setSelectedConfigParam(null);
  };

  /**
   * Закрывает панель при клике вне её области
   */
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        detailTopic &&
        panelRef.current &&
        !panelRef.current.contains(event.target)
      ) {
        closePanel();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [detailTopic]);

  // ===========================================================================
  // Редактирование конфигурации
  // ===========================================================================

  /**
   * Обработчик двойного клика по параметру конфигурации
   */
  const handleConfigDoubleClick = (key, currentValue) => {
    if (!permissions.alterTopicConfig) return;
    setEditingParam(key);
    setEditValue(String(currentValue));
    setOriginalValue(String(currentValue));
  };

  /**
   * Сохраняет изменённое значение параметра конфигурации
   */
  const handleSaveEdit = useCallback(async () => {
    if (activeProfile.current !== profileKey) return;
    if (!permissions.alterTopicConfig) { rejectAdministration(); return; }
    if (!selectedTopic || !editingParam) return;

    if (editValue === originalValue) {
      setEditingParam(null);
      return;
    }

    try {
      await axios.patch(
        `/api/topics/${encodeURIComponent(selectedTopic.name)}/config`,
        {
          configs: {
            [editingParam]: editValue,
          },
        },
        {
          headers: {
            'X-Kafka-Profile-ID': currentCluster.id,
          'X-Kafka-Profile-Revision': String(currentCluster.revision),
          },
        }
      );

      if (activeProfile.current !== profileKey) return;
      toast.success(odysseyI18n.t('interface.updatedParameter', { v0: editingParam }));

      setDetailTopic((prev) => prev ? ({
        ...prev,
        configs: {
          ...prev.configs,
          [editingParam]: editValue,
        },
      }) : prev);

      setEditingParam(null);
      setSelectedConfigParam(null);
    } catch (error) {
      if (activeProfile.current !== profileKey) return;
      if ([403, 409].includes(error.response?.status)) { revoke(); rejectAdministration(); return; }
      console.error('Не удалось выполнить запрос Kafka.');
      toast.error(
        odysseyI18n.t('interface.couldNotSave') +
          serverMessage(error.response?.data?.error || error.message)
      );
    }
  }, [profileKey, selectedTopic, editingParam, editValue, originalValue, currentCluster, permissions.alterTopicConfig, rejectAdministration, revoke]);

  /**
   * Отменяет редактирование параметра
   */
  const handleCancelEdit = () => {
    setEditingParam(null);
    setEditValue('');
    setSelectedConfigParam(null);
  };

  // ===========================================================================
  // Управление топиками (создание, удаление)
  // ===========================================================================

  /**
   * Обработчик создания нового топика
   */
  const handleCreateTopic = useCallback(async (e) => {
    e.preventDefault();
    if (activeProfile.current !== profileKey) return;
    if (!permissions.createTopic) { rejectAdministration(); return; }

    if (!currentCluster) return;

    if (!newTopic.topic.trim()) {
      toast.error(odysseyI18n.t('interface.enterATopicName'));
      return;
    }

    try {
      const payload = {
        topic: newTopic.topic.trim(),
        partitions: Number(newTopic.partitions),
        replication: Number(newTopic.replication),
      };

      if (showAdvanced) {
        payload.configs = {
          'cleanup.policy': newTopic.cleanupPolicy,
          'retention.ms': newTopic.retentionMs,
          'min.insync.replicas': newTopic.minInSyncReplicas,
        };
      }

      await axios.post('/api/topics', payload, {
        headers: {
          'X-Kafka-Profile-ID': currentCluster.id,
          'X-Kafka-Profile-Revision': String(currentCluster.revision),
        },
      });

      if (activeProfile.current !== profileKey) return;
      toast.success(odysseyI18n.t('interface.createdTopic', { v0: newTopic.topic }));

      setNewTopic({
        topic: '',
        partitions: '1',
        replication: '1',
        cleanupPolicy: 'delete',
        retentionMs: '604800000',
        minInSyncReplicas: '1',
      });
      setShowAdvanced(false);
      setShowCreateModal(false);

      fetchTopics();
    } catch (error) {
      if (activeProfile.current !== profileKey) return;
      if ([403, 409].includes(error.response?.status)) { revoke(); rejectAdministration(); return; }
      console.error('Не удалось выполнить запрос Kafka.');
      const backendError = error.response?.data?.error || '';

      if (
        backendError.includes('Topic name is invalid') ||
        backendError.includes('contains one or more characters')
      ) {
        toast.error(
          odysseyI18n.t('interface.couldNotCreateTopicUseOnlyLettersA')
        );
      } else {
        toast.error(serverMessage(backendError) || odysseyI18n.t('interface.couldNotCreateTopic'));
      }
    }
  }, [profileKey, currentCluster, newTopic, showAdvanced, fetchTopics, permissions.createTopic, rejectAdministration, revoke]);

  /**
   * Удаляет выбранный топик
   */
  const handleDeleteTopic = useCallback(async () => {
    if (activeProfile.current !== profileKey) return;
    if (!permissions.deleteTopic) { rejectAdministration(); return; }
    if (!selectedTopic) {
      toast.error(odysseyI18n.t('interface.selectATopic'));
      return;
    }

    if (!window.confirm(odysseyI18n.t('interface.deleteTopic', { v0: selectedTopic.name }))) {
      return;
    }

    try {
      await axios.delete(
        `/api/topics/${encodeURIComponent(selectedTopic.name)}`,
        {
          headers: {
            'X-Kafka-Profile-ID': currentCluster.id,
          'X-Kafka-Profile-Revision': String(currentCluster.revision),
          },
        }
      );

      if (activeProfile.current !== profileKey) return;
      toast.success(odysseyI18n.t('interface.deletedTopic', { v0: selectedTopic.name }));

      closePanel();
      fetchTopics();
    } catch (error) {
      if (activeProfile.current !== profileKey) return;
      if ([403, 409].includes(error.response?.status)) { revoke(); rejectAdministration(); return; }
      console.error('Не удалось выполнить запрос Kafka.');
      toast.error(odysseyI18n.t('interface.couldNotDeleteTopic'));
    }
  }, [profileKey, selectedTopic, currentCluster, fetchTopics, permissions.deleteTopic, rejectAdministration, revoke]);

  // ===========================================================================
  // Экспорт данных
  // ===========================================================================

  /**
   * Экспортирует список названий выбранных топиков с количеством партиций
   */
  const exportTopicsList = useCallback(() => {
    const selected =
      selectedTopics.length > 0
        ? topics.filter((t) => selectedTopics.includes(t.name))
        : topics;

    const content = selected
      .map((t) => odysseyI18n.t('interface.partitions3', { v0: t.name, v1: t.partitions }))
      .join('\n');

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'topics-list.txt';
    link.click();
    window.URL.revokeObjectURL(url);

    setShowExportMenu(false);
    toast.success(odysseyI18n.t('interface.exportedTopics', { v0: selected.length }));
  }, [topics, selectedTopics]);

  /**
   * Экспортирует конфигурацию выбранных топиков с количеством партиций
   */
  const exportTopicsConfig = useCallback(async () => {
    if (!currentCluster) {
      return;
    }

    try {
      const selected =
        selectedTopics.length > 0
          ? topics.filter((t) => selectedTopics.includes(t.name))
          : topics;

      const result = [];

      for (const topic of selected) {
        const response = await axios.get(
          `/api/topics/${encodeURIComponent(topic.name)}`,
          {
            headers: {
              'X-Kafka-Profile-ID': currentCluster.id,
          'X-Kafka-Profile-Revision': String(currentCluster.revision),
            },
          }
        );

        result.push({
          topic: topic.name,
          partitions: topic.partitions,
          configs: response.data.configs || {},
        });
      }

      const blob = new Blob([JSON.stringify(result, null, 2)], {
        type: 'application/json;charset=utf-8',
      });

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `topics-config-${selected.length}.json`;
      link.click();
      window.URL.revokeObjectURL(url);

      setShowExportMenu(false);
      toast.success(odysseyI18n.t('interface.exportedTopics', { v0: selected.length }));
    } catch (error) {
      console.error('Не удалось выполнить запрос Kafka.');
      toast.error(odysseyI18n.t('interface.couldNotExportConfiguration'));
    }
  }, [currentCluster, topics, selectedTopics]);

  /**
   * Закрытие меню экспорта при клике вне
   */
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showExportMenu && exportMenuRef.current && !exportMenuRef.current.contains(event.target)) {
        setShowExportMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showExportMenu]);

  // ===========================================================================
  // Фильтрация данных
  // ===========================================================================

  /**
   * Фильтрует список топиков по названию
   */
  const filteredTopics = topics.filter((topic) =>
    topic.name.toLowerCase().includes(filter.toLowerCase())
  );

  // ===========================================================================
  // Возвращаемые значения
  // ===========================================================================

  return {
    permissions,
    // Состояния
    topics,
    loading,
    filter,
    setFilter,
    showExportMenu,
    setShowExportMenu,
    selectedTopics,
    selectedTopic,
    detailTopic,
    detailLoading,
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

    // Обработчики
    fetchTopics,
    loadTopicDetails,
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
  };
}
