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
 * ConsumerGroupsTable.tsx
 * =============================================================================
 *
 * Основная таблица Consumer Groups.
 *
 * Отвечает за:
 *
 * • отображение групп;
 * • выбор группы;
 * • состояние группы;
 * • отображение Lag;
 * • действия над группой.
 *
 * В столбце «Действия» используются только реальные действия:
 *
 * • Eye       — скрыть / показать группу;
 * • Refresh   — обновить данные группы;
 * • Trash     — удалить группу.
 *
 * Карандаш удалён.
 *
 * Причина:
 * текущая модель ConsumerGroup не содержит редактируемых пользовательских
 * параметров. Поэтому показывать неработающую кнопку редактирования
 * профессионально некорректно.
 *
 * =============================================================================
 */

import {
    FiEye,
    FiEyeOff,
    FiRefreshCw,
    FiTrash2
} from 'react-icons/fi';

import '../styles/consumer-table.css';

import type {
    ConsumerGroup
} from '../types/consumer-groups.types';

import ConsumerStateBadge from './ConsumerStateBadge';

import {
    formatLag,
    getLagBarWidth,
    getLagLevel
} from '../utils/lag.utils';


interface Props {

    groups: ConsumerGroup[];

    selectedGroup: ConsumerGroup | null;

    onSelectGroup: (
        group: ConsumerGroup
    ) => void;

    onToggleHidden: (
        name: string
    ) => void;

    onRefreshGroup: (
        group: ConsumerGroup
    ) => void;

    onDeleteGroup: (
        group: ConsumerGroup
    ) => void;

}


export default function ConsumerGroupsTable({

    groups,

    selectedGroup,

    onSelectGroup,

    onToggleHidden,

    onRefreshGroup,

    onDeleteGroup

}: Props) {
  useInterfaceLanguage();

    /*
     * =========================================================================
     * Максимальный Lag.
     *
     * Используется только для расчёта относительной длины полоски Lag.
     * =========================================================================
     */

    const maxLag =
        Math.max(
            ...groups.map(
                group => group.lag
            ),
            1
        );


    /*
     * =========================================================================
     * Пустое состояние.
     * =========================================================================
     */

    if (groups.length === 0) {

        return (

            <div className="consumer-table-empty"> {odysseyI18n.t('interface.noGroupsFound')} </div>

        );

    }


    return (

        <div className="consumer-table-wrapper">

            <table className="consumer-groups-table">

                <thead>

                    <tr>

                        <th> {odysseyI18n.t('interface.group')} </th>

                        <th> {odysseyI18n.t('interface.state')} </th>

                        <th> {odysseyI18n.t('interface.members')} </th>

                        <th> {odysseyI18n.t('interface.topics')} </th>

                        <th> {odysseyI18n.t('interface.consumerLag')} </th>

                        <th> {odysseyI18n.t('interface.coordinator')} </th>

                        <th> {odysseyI18n.t('interface.actions')} </th>

                    </tr>

                </thead>


                <tbody>

                    {groups.map(group => {

                        const lagLevel =
                            getLagLevel(
                                group.lag,
                                maxLag
                            );


                        const barWidth =
                            getLagBarWidth(
                                group.lag,
                                maxLag
                            );


                        const isSelected =
                            selectedGroup?.name === group.name;


                        return (

                            <tr
                                key={group.name}
                                onClick={() =>
                                    onSelectGroup(group)
                                }
                                className={
                                    isSelected
                                        ? 'consumer-group-selected'
                                        : ''
                                }
                            >

                                {/* =================================================
                                    Группа
                                   ================================================= */}

                                <td className="consumer-group-name">

                                    {group.name}

                                </td>


                                {/* =================================================
                                    Состояние
                                   ================================================= */}

                                <td>

                                    <ConsumerStateBadge
                                        state={group.state}
                                    />

                                </td>


                                {/* =================================================
                                    Участники
                                   ================================================= */}

                                <td>

                                    {group.members}

                                </td>


                                {/* =================================================
                                    Топики
                                   ================================================= */}

                                <td className="consumer-topics-cell">

                                    {group.topics
                                        ?.slice(0, 2)
                                        .join(', ')
                                    }

                                    {(group.topics?.length ?? 0) > 2 && (

                                        <span className="topics-more">

                                            +
                                            {(group.topics?.length ?? 0) - 2}

                                        </span>

                                    )}

                                </td>


                                {/* =================================================
                                    Lag
                                   ================================================= */}

                                <td>

                                    <div className="lag-cell">

                                        <span
                                            className={
                                                `lag-value lag-${lagLevel}`
                                            }
                                        >

                                            {formatLag(group.lag)}

                                        </span>


                                        <div className="lag-bar-track">

                                            <div
                                                className={
                                                    `lag-bar-fill lag-${lagLevel}`
                                                }
                                                style={{
                                                    width:
                                                        `${barWidth}%`
                                                }}
                                            />

                                        </div>

                                    </div>

                                </td>


                                {/* =================================================
                                    Координатор
                                   ================================================= */}

                                <td className="consumer-coordinator">

                                    {group.coordinator}

                                </td>


                                {/* =================================================
                                    Actions
                                   ================================================= */}

                                <td
                                    className="consumer-actions-cell"
                                    onClick={event =>
                                        event.stopPropagation()
                                    }
                                >

                                    <div className="consumer-actions">

                                    {/* -------------------------------------------------
                                       Скрыть / показать группу
                                       ------------------------------------------------- */}

                                    <button
                                        type="button"
                                        className="action-icon-btn"
                                        title={
                                            group.hidden
                                                ? odysseyI18n.t('interface.showGroup')
                                                : odysseyI18n.t('interface.hideGroupFromList')
                                        }
                                        onClick={() =>
                                            onToggleHidden(
                                                group.name
                                            )
                                        }
                                    >

                                        {group.hidden
                                            ? <FiEyeOff />
                                            : <FiEye />
                                        }

                                    </button>


                                    {/* -------------------------------------------------
                                       Обновить группу
                                       ------------------------------------------------- */}

                                    <button
                                        type="button"
                                        className="action-icon-btn"
                                        title={odysseyI18n.t('interface.refreshGroupData')}
                                        onClick={() =>
                                            onRefreshGroup(group)
                                        }
                                    >

                                        <FiRefreshCw />

                                    </button>


                                    {/* -------------------------------------------------
                                       Удалить группу
                                       ------------------------------------------------- */}

                                    <button
                                        type="button"
                                        className="action-icon-btn danger"
                                        title={odysseyI18n.t('interface.deleteGroup')}
                                        onClick={() =>
                                            onDeleteGroup(group)
                                        }
                                    >

                                        <FiTrash2 />

                                    </button>

                                    </div>

                                </td>

                            </tr>

                        );

                    })}

                </tbody>

            </table>

        </div>

    );

}