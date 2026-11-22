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
 * consumer-groups.api.ts
 * =============================================================================
 *
 * Единая точка HTTP-взаимодействия страницы Consumer Groups.
 *
 * Все запросы передают X-Kafka-Profile-ID, поэтому backend работает
 * с тем Kafka-кластером, который выбран в ClusterContext.
 * =============================================================================
 */

import type {
    ConsumerGroup,
    ConsumerGroupDetails
} from '../types/consumer-groups.types';

import { ownerFetch } from '../../../security/ownerSession';

export async function fetchConsumerGroups(
    bootstrap: string
): Promise<ConsumerGroup[]> {

    const response = await ownerFetch('/api/consumer-groups', {
        headers: {
            'Content-Type': 'application/json',
            'X-Kafka-Profile-ID': bootstrap
        }
    });

    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Ошибка загрузки групп: ${response.status}`);
    }

    return response.json();
}

export async function fetchConsumerGroupDetails(
    bootstrap: string,
    groupName: string
): Promise<ConsumerGroupDetails> {

    const response = await ownerFetch(
        `/api/consumer-groups/${encodeURIComponent(groupName)}`,
        {
            headers: {
                'Content-Type': 'application/json',
                'X-Kafka-Profile-ID': bootstrap
            }
        }
    );

    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Ошибка загрузки группы: ${response.status}`);
    }

    return response.json();
}
