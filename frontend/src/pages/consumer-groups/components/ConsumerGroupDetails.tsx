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
 * ConsumerGroupDetails.tsx
 * =============================================================================
 *
 * Панель подробной информации выбранной Consumer Group.
 *
 * Вкладки:
 *
 * • Детали
 * • Members
 * • Offsets
 * • Topics
 * • Rebalance History
 *
 * Кнопка «Сбросить оффсеты» здесь намеренно отсутствует.
 *
 * Единая точка запуска Offset Reset находится в Toolbar страницы.
 *
 * =============================================================================
 */

import {
    useState
} from 'react';

import '../styles/consumer-details.css';

import type {
    ConsumerGroup,
    ConsumerGroupDetails as ConsumerGroupDetailsData,
    RebalanceEvent
} from '../types/consumer-groups.types';

import ConsumerMembers
    from './ConsumerMembers';

import ConsumerOffsets
    from './ConsumerOffsets';

import ConsumerStateBadge
    from './ConsumerStateBadge';

import {
    formatLag
} from '../utils/lag.utils';


interface Props {

    group: ConsumerGroup | null;

    details: ConsumerGroupDetailsData | null;

}


type TabId =
    | 'details'
    | 'members'
    | 'offsets'
    | 'topics'
    | 'rebalance';


const MOCK_REBALANCE: RebalanceEvent[] = [

    {
        time: '2026-07-23 14:32',
        reason: 'Member joined',
        members: 12,
        duration: '1.2s'
    },

    {
        time: '2026-07-23 12:15',
        reason: 'Member left',
        members: 11,
        duration: '0.8s'
    },

    {
        time: '2026-07-22 18:40',
        reason: 'Subscription changed',
        members: 12,
        duration: '2.1s'
    }

];


export default function ConsumerGroupDetails({

    group,

    details

}: Props) {
  useInterfaceLanguage();

    /*
     * =========================================================================
     * Активная вкладка.
     * =========================================================================
     */

    const [
        activeTab,
        setActiveTab
    ] = useState<TabId>('details');


    /*
     * =========================================================================
     * Нет выбранной группы.
     * =========================================================================
     */

    if (!group) {

        return (

            <div className="consumer-details consumer-details-empty"> {odysseyI18n.t('interface.selectAConsumerGroup')} </div>

        );

    }


    /*
     * =========================================================================
     * Вкладки.
     * =========================================================================
     */

    const tabs: {
        id: TabId;
        label: string;
    }[] = [

        {
            id: 'details',
            label: odysseyI18n.t('interface.details')
        },

        {
            id: 'members',
            label:
                `Members (${details?.membersDetail.length ?? group.members})`
        },

        {
            id: 'offsets',
            label:
                `Offsets (${details?.offsets.length ?? group.partitions ?? 0})`
        },

        {
            id: 'topics',
            label:
                `Topics (${group.topics?.length ?? 0})`
        },

        {
            id: 'rebalance',
            label: 'Rebalance History'
        }

    ];


    return (

        <div className="consumer-details">

            {/* ================================================================
                Вкладки
               ================================================================ */}

            <div className="consumer-details-tabs">

                {tabs.map(tab => (

                    <button
                        key={tab.id}
                        type="button"
                        className={
                            `consumer-details-tab ${
                                activeTab === tab.id
                                    ? 'active'
                                    : ''
                            }`
                        }
                        onClick={() =>
                            setActiveTab(tab.id)
                        }
                    >

                        {tab.label}

                    </button>

                ))}

            </div>


            {/* ================================================================
                Детали группы
               ================================================================ */}

            {activeTab === 'details' && (

                <div className="consumer-details-content">

                    <div className="consumer-details-section-title consumer-details-info-title"> {odysseyI18n.t('interface.groupInformation')} </div>


                    <div className="consumer-details-header">

                        <div className="consumer-details-group">

                            {group.name}

                        </div>


                        <ConsumerStateBadge
                            state={group.state}
                        />

                    </div>


                    <div className="consumer-details-section">

                        <div className="consumer-details-row">

                            <span className="consumer-details-label"> {odysseyI18n.t('interface.lag')} </span>

                            <span className="consumer-details-value">
                                {formatLag(group.lag)}
                            </span>

                        </div>


                        <div className="consumer-details-row">

                            <span className="consumer-details-label"> {odysseyI18n.t('interface.members')} </span>

                            <span className="consumer-details-value">
                                {group.members}
                            </span>

                        </div>


                        <div className="consumer-details-row">

                            <span className="consumer-details-label"> {odysseyI18n.t('interface.topics')} </span>

                            <span className="consumer-details-value">
                                {group.topics?.length ?? 0}
                            </span>

                        </div>


                        <div className="consumer-details-row">

                            <span className="consumer-details-label"> {odysseyI18n.t('interface.partitions')} </span>

                            <span className="consumer-details-value">
                                {group.partitions ?? '—'}
                            </span>

                        </div>


                        <div className="consumer-details-row">

                            <span className="consumer-details-label"> {odysseyI18n.t('interface.protocol')} </span>

                            <span className="consumer-details-value">
                                {group.protocol ?? '—'}
                            </span>

                        </div>


                        <div className="consumer-details-row">

                            <span className="consumer-details-label"> {odysseyI18n.t('interface.coordinator')} </span>

                            <span className="consumer-details-value">
                                {group.coordinator}
                            </span>

                        </div>

                    </div>

                </div>

            )}


            {/* ================================================================
                Members
               ================================================================ */}

            {activeTab === 'members' && (

                details ? (
                    <ConsumerMembers group={details} />
                ) : (
                    <div className="consumer-details-loading"> {odysseyI18n.t('interface.loadingMembers')} </div>
                )

            )}


            {/* ================================================================
                Offsets
               ================================================================ */}

            {activeTab === 'offsets' && (

                details ? (
                    <ConsumerOffsets group={details} />
                ) : (
                    <div className="consumer-details-loading"> {odysseyI18n.t('interface.loadingOffsets')} </div>
                )

            )}


            {/* ================================================================
                Topics
               ================================================================ */}

            {activeTab === 'topics' && (

                <div className="consumer-details-section">

                    <div className="consumer-details-section-title"> {odysseyI18n.t('interface.groupTopics')} </div>


                    <ul className="consumer-topics-list">

                        {(group.topics ?? []).map(topic => (

                            <li key={topic}>

                                {topic}

                            </li>

                        ))}

                    </ul>

                </div>

            )}


            {/* ================================================================
                Rebalance History
               ================================================================ */}

            {activeTab === 'rebalance' && (

                <div className="consumer-details-section">

                    <div className="consumer-details-section-title"> {odysseyI18n.t('interface.rebalanceHistory')} </div>


                    <table className="rebalance-table">

                        <thead>

                            <tr>

                                <th> {odysseyI18n.t('interface.time')} </th>

                                <th> {odysseyI18n.t('interface.reason')} </th>

                                <th>
                                    Members
                                </th>

                                <th> {odysseyI18n.t('interface.duration')} </th>

                            </tr>

                        </thead>


                        <tbody>

                            {MOCK_REBALANCE.map(
                                (event, index) => (

                                    <tr key={index}>

                                        <td>
                                            {event.time}
                                        </td>

                                        <td>
                                            {event.reason}
                                        </td>

                                        <td>
                                            {event.members}
                                        </td>

                                        <td>
                                            {event.duration}
                                        </td>

                                    </tr>

                                )
                            )}

                        </tbody>

                    </table>

                </div>

            )}

        </div>

    );

}