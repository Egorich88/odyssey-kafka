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
 * =============================================================================
 * ConsumerGroupsKpi.tsx
 * =============================================================================
 *
 * Верхняя KPI-панель страницы Consumer Groups.
 *
 * Отображает:
 *
 * • Всего групп
 * • Активные
 * • Empty
 * • Stable
 * • Rebalancing
 * • Dead
 *
 * Пока используются mock-данные.
 *
 * После подключения backend значения будут вычисляться
 * автоматически из useConsumerGroups().
 *
 * =============================================================================
 */

import '../styles/consumer-kpi-grid.css';

import ConsumerKpiCard from './ConsumerKpiCard';

import {
    FiUsers,
    FiShield,
    FiRefreshCw,
    FiAlertOctagon,
    FiMinusCircle
} from 'react-icons/fi';
import { LuSkull } from "react-icons/lu";

export default function ConsumerGroupsKpi({ groups }: { groups: import('../types/consumer-groups.types').ConsumerGroup[] }) {
  useInterfaceLanguage();

    /*
     * KPI считаются из тех же реальных данных, которые пришли от backend.
     * Благодаря этому верхняя панель больше не содержит захардкоженных 58/54/50.
     */
    const total = groups.length;
    const empty = groups.filter(group => group.state === 'Empty').length;
    const stable = groups.filter(group => group.state === 'Stable').length;
    const rebalancing = groups.filter(group =>
        group.state === 'Rebalancing' ||
        group.state === 'PreparingRebalance' ||
        group.state === 'CompletingRebalance'
    ).length;
    const dead = groups.filter(group => group.state === 'Dead').length;
    const active = Math.max(0, total - empty - dead);

    return (
        <div className="consumer-kpi-grid">

            <ConsumerKpiCard
                title={odysseyI18n.t('interface.totalGroups')}
                value={total}
                description={odysseyI18n.t('interface.total')}
                color="#3B82F6"
                icon={FiUsers}
            />

            <ConsumerKpiCard
                title={odysseyI18n.t('interface.activeGroups')}
                value={active}
                description={odysseyI18n.t('interface.running')}
                color="#22C55E"
                icon={FiUsers}
            />

            <ConsumerKpiCard
                title="Empty"
                value={empty}
                description={odysseyI18n.t('interface.noMembers')}
                color="#94A3B8"
                icon={FiMinusCircle}
            />

            <ConsumerKpiCard
                title="Stable"
                value={stable}
                description={odysseyI18n.t('interface.stable')}
                color="#22C55E"
                icon={FiShield}
            />

            <ConsumerKpiCard
                title="Rebalancing"
                value={rebalancing}
                description={odysseyI18n.t('interface.rebalancing')}
                color="#F59E0B"
                icon={FiRefreshCw}
            />

            <ConsumerKpiCard
                title="Dead"
                value={dead}
                description={odysseyI18n.t('interface.inactive')}
                color="#EF4444"
                icon={LuSkull}
            />

        </div>
    );
}
