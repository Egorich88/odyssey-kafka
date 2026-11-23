import odysseyI18n from '../../i18n';
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
    get title() { return odysseyI18n.t('interface.overview'); },
    get description() { return odysseyI18n.t('interface.monitorKafkaClusterHealthAndKeyMetrics'); },
    mode: 'monitoring',
  },
  '/overview': {
    get title() { return odysseyI18n.t('interface.overview'); },
    get description() { return odysseyI18n.t('interface.monitorKafkaClusterHealthAndKeyMetrics'); },
    mode: 'monitoring',
  },
  '/brokers': {
    get title() { return odysseyI18n.t('interface.brokers'); },
    get description() { return odysseyI18n.t('interface.kafkaBrokerHealthAndConfiguration'); },
    mode: 'monitoring',
  },
  '/topics': {
    get title() { return odysseyI18n.t('interface.topics'); },
    get description() { return odysseyI18n.t('interface.manageTopicsAndTheirConfiguration'); },
    mode: 'monitoring',
  },
  '/groups': {
    get title() { return odysseyI18n.t('interface.consumerGroups'); },
    get description() { return odysseyI18n.t('interface.monitorConsumerGroupsAndConsumerLag'); },
    mode: 'monitoring',
  },
  '/alerts': {
    get title() { return odysseyI18n.t('interface.alerts'); },
    get description() { return odysseyI18n.t('interface.activeClusterEventsAndWarnings'); },
    mode: 'monitoring',
  },
  '/search': {
    get title() { return odysseyI18n.t('interface.messageSearch'); },
    get description() { return odysseyI18n.t('interface.findAndInspectKafkaMessages'); },
    mode: 'monitoring',
  },
  '/acls': {
    title: 'ACL',
    get description() { return odysseyI18n.t('interface.manageKafkaAccessPolicies'); },
    mode: 'monitoring',
  },
  '/audit': {
    get title() { return odysseyI18n.t('interface.audit'); },
    get description() { return odysseyI18n.t('interface.reviewClusterActivityAndSecurityEvents'); },
    mode: 'default',
  },
  '/console': {
    get title() { return odysseyI18n.t('interface.console'); },
    get description() { return odysseyI18n.t('interface.runKafkaCommandsAndOperations'); },
    mode: 'default',
  },
  '/settings': {
    get title() { return odysseyI18n.t('interface.settings'); },
    get description() { return odysseyI18n.t('interface.interfaceAndApplicationSettings'); },
    mode: 'default',
  },
  '/user': {
    get title() { return odysseyI18n.t('interface.user'); },
    get description() { return odysseyI18n.t('interface.userProfileAndPreferences'); },
    mode: 'default',
  },
  '/delete': {
    get title() { return odysseyI18n.t('interface.deletion'); },
    get description() { return odysseyI18n.t('interface.deleteTheSelectedKafkaCluster'); },
    mode: 'default',
  },
  '/connect': {
    title: 'Kafka Connect',
    get description() { return odysseyI18n.t('interface.kafkaConnectIntegration'); },
    mode: 'default',
  },
  '/ksqldb': {
    title: 'ksqlDB',
    get description() { return odysseyI18n.t('interface.workWithKsqlDBStreamsAndQueries'); },
    mode: 'default',
  },
  '/schema-registry': {
    title: 'Schema Registry',
    get description() { return odysseyI18n.t('interface.manageKafkaMessageSchemas'); },
    mode: 'default',
  },
};
