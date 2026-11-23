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
 * @fileoverview Описания параметров конфигурации топика
 * Используются в таблице конфигурации панели деталей для отображения подсказок
 */

export const CONFIG_DESCRIPTIONS = {
  get 'cleanup.policy'() { return odysseyI18n.t('interface.topicCleanupPolicyDeleteCompactCompactDelete'); },
  get 'retention.ms'() { return odysseyI18n.t('interface.messageRetentionTimeInMilliseconds'); },
  get 'min.insync.replicas'() { return odysseyI18n.t('interface.minimumNumberOfInSyncReplicasRequiredFor'); },
  get 'segment.bytes'() { return odysseyI18n.t('interface.maximumLogSegmentSizeInBytes'); },
  get 'segment.ms'() { return odysseyI18n.t('interface.logSegmentLifetimeInMilliseconds'); },
  get 'compression.type'() { return odysseyI18n.t('interface.messageCompressionTypeGzipSnappyLz4Zstd'); },
  get 'max.message.bytes'() { return odysseyI18n.t('interface.maximumMessageSizeInBytes'); },
  get 'message.timestamp.type'() { return odysseyI18n.t('interface.timestampTypeCreateTimeLogAppendTime'); },
  get 'unclean.leader.election.enable'() { return odysseyI18n.t('interface.allowOutOfSyncReplicasToBecomeLeader'); },
  get 'delete.retention.ms'() { return odysseyI18n.t('interface.retentionPeriodForDeletedRecords'); },
  get 'file.delete.delay.ms'() { return odysseyI18n.t('interface.delayBeforeDeletingSegmentFiles'); },
  get 'flush.messages'() { return odysseyI18n.t('interface.messageCountBeforeFlushingToDisk'); },
  get 'flush.ms'() { return odysseyI18n.t('interface.intervalBetweenDiskFlushes'); },
  get 'segment.index.bytes'() { return odysseyI18n.t('interface.segmentIndexFileSize'); },
  get 'segment.jitter.ms'() { return odysseyI18n.t('interface.randomVariationInSegmentRollTime'); },
  get 'retention.bytes'() { return odysseyI18n.t('interface.maximumTopicDataSize'); },
  get 'message.max.bytes'() { return odysseyI18n.t('interface.maximumMessageSize'); },
};