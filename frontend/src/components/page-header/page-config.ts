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
 * =============================================================================
 * @file page-config.ts
 * =============================================================================
 * Единая конфигурация названий, описаний и режима верхней панели Odyssey.
 *
 * Важно: заголовок и краткое описание страницы теперь принадлежат общей
 * горизонтальной шапке, поэтому отдельные H1-заголовки внутри страниц
 * верхнего уровня не используются.
 * =============================================================================
 */

import type { PageHeaderMode } from './types';

export interface PageConfig {
  /** Название страницы, отображаемое крупным шрифтом. */
  title: string;
  /** Краткое описание назначения страницы. */
  description: string;
  /** Режим шапки: мониторинг или обычная страница. */
  mode: PageHeaderMode;
}

export const PAGE_CONFIG: Record<string, PageConfig> = {
  '/': {
    title: 'Обзор',
    description: 'Мониторинг состояния и ключевых показателей Kafka-кластера',
    mode: 'monitoring',
  },
  '/overview': {
    title: 'Обзор',
    description: 'Мониторинг состояния и ключевых показателей Kafka-кластера',
    mode: 'monitoring',
  },
  '/brokers': {
    title: 'Брокеры',
    description: 'Состояние и параметры брокеров Kafka-кластера',
    mode: 'monitoring',
  },
  '/topics': {
    title: 'Топики',
    description: 'Управление топиками и их конфигурацией',
    mode: 'monitoring',
  },
  '/groups': {
    title: 'Группы потребителей',
    description: 'Мониторинг групп потребителей и потребительского лага',
    mode: 'monitoring',
  },
  '/alerts': {
    title: 'Оповещения',
    description: 'Активные события и предупреждения Kafka-кластера',
    mode: 'monitoring',
  },
  '/search': {
    title: 'Поиск сообщений',
    description: 'Поиск и просмотр сообщений в Kafka',
    mode: 'default',
  },
  '/acls': {
    title: 'ACL',
    description: 'Управление политиками доступа Kafka',
    mode: 'default',
  },
  '/audit': {
    title: 'Аудит',
    description: 'Обзор активности и событий безопасности в кластере',
    mode: 'default',
  },
  '/console': {
    title: 'Консоль',
    description: 'Выполнение команд и операций Kafka',
    mode: 'default',
  },
  '/settings': {
    title: 'Настройки',
    description: 'Настройки интерфейса и приложения',
    mode: 'default',
  },
  '/user': {
    title: 'Пользователь',
    description: 'Профиль и параметры пользователя',
    mode: 'default',
  },
  '/delete': {
    title: 'Удаление',
    description: 'Удаление выбранного Kafka-кластера',
    mode: 'default',
  },
  '/connect': {
    title: 'Kafka Connect',
    description: 'Интеграция с Kafka Connect',
    mode: 'default',
  },
  '/ksqldb': {
    title: 'ksqlDB',
    description: 'Работа с потоками и запросами ksqlDB',
    mode: 'default',
  },
  '/schema-registry': {
    title: 'Schema Registry',
    description: 'Управление схемами сообщений Kafka',
    mode: 'default',
  },
};
