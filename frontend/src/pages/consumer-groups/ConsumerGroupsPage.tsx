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
 * ConsumerGroupsPage.tsx
 * =============================================================================
 *
 * Главная страница Consumer Groups.
 *
 * Порядок блоков:
 *
 * 1. KPI-карточки.
 * 2. Аналитические диаграммы.
 * 3. Toolbar.
 * 4. Таблица Consumer Groups.
 * 5. Details + Consumer Lag.
 * 6. Offset Reset Wizard.
 *
 * =============================================================================
 */

import {
    useEffect,
    useMemo,
    useState, useRef, useLayoutEffect
} from 'react';

import toast from 'react-hot-toast';

import { useCluster } from '../../contexts/ClusterContext';
import { useDashboardControls } from '../../contexts/DashboardControlsContext';

import type {
    ConsumerGroup,
    ConsumerGroupDetails
} from './types/consumer-groups.types';

import {
    fetchConsumerGroupDetails,
    fetchConsumerGroups
} from './services/consumer-groups.api';

import {
    exportGroups,
    sortGroups,
    type ExportFormat,
    type SortOption
} from './utils/consumer-groups.utils';

import ConsumerGroupsKpi
    from './components/ConsumerGroupsKpi';

import ConsumerGroupsToolbar
    from './components/ConsumerGroupsToolbar';

import ConsumerGroupsTable
    from './components/ConsumerGroupsTable';

import ConsumerGroupDetails
    from './components/ConsumerGroupDetails';

import ConsumerLagChart
    from './components/ConsumerLagChart';

import ConsumerDonutCharts
    from './components/ConsumerDonutCharts';

import OffsetResetWizard
    from './components/OffsetResetWizard';

import './styles/consumer-groups.css';


export default function ConsumerGroupsPage() {

    const { currentCluster } = useCluster();
    const profileKey = currentCluster ? `${currentCluster.id}:${currentCluster.revision ?? 0}` : '';
    const activeProfile = useRef(profileKey);
    activeProfile.current = profileKey;
    const groupsRequest = useRef(0);
    const { setPageLoading } = useDashboardControls();

    const [groups, setGroups] =
        useState<ConsumerGroup[]>([]);

    const [selectedGroup, setSelectedGroup] =
        useState<ConsumerGroup | null>(null);

    const [selectedDetails, setSelectedDetails] =
        useState<ConsumerGroupDetails | null>(null);

    const [search, setSearch] =
        useState('');

    const [stateFilter, setStateFilter] =
        useState('all');

    const [sortBy, setSortBy] =
        useState<SortOption>('lag-desc');

    const [loading, setLoading] =
        useState(false);

    const [detailsLoading, setDetailsLoading] =
        useState(false);

    const [refreshing, setRefreshing] =
        useState(false);

    const [offsetResetOpen, setOffsetResetOpen] =
        useState(false);


    /**
     * =========================================================================
     * Загрузка списка Consumer Groups.
     * =========================================================================
     */

    const loadGroups = async (showToast = false) => {
        const request = ++groupsRequest.current;

        if (!currentCluster?.brokers) {

            setGroups([]);
            setSelectedGroup(null);
            setSelectedDetails(null);

            return;
        }

        setLoading(true);

        try {

            const data =
                await fetchConsumerGroups(
                    currentCluster.id
                );

            if (activeProfile.current !== profileKey || request !== groupsRequest.current) return;
            setGroups(data);

            if (showToast) {

                toast.success(
                    'Список Consumer Groups обновлён'
                );
            }

        } catch (error) {
            if (activeProfile.current !== profileKey || request !== groupsRequest.current) return;

            const message =
                error instanceof Error
                    ? error.message
                    : 'Не удалось загрузить Consumer Groups';

            toast.error(message);

            setGroups([]);
            setSelectedGroup(null);
            setSelectedDetails(null);

        } finally {

            if (activeProfile.current === profileKey && request === groupsRequest.current) setLoading(false);
        }
    };


    /**
     * =========================================================================
     * Загрузка групп при смене Kafka-кластера.
     * =========================================================================
     */

    useLayoutEffect(() => {
        activeProfile.current = profileKey;
        setGroups([]);
        setSelectedGroup(null);
        setSelectedDetails(null);
        setOffsetResetOpen(false);
        return () => { groupsRequest.current++; activeProfile.current = ''; };
    }, [profileKey]);

    useEffect(() => {

        void loadGroups();

        // Идентичность подключения определяется серверным ID и ревизией.
        // eslint-disable-next-line react-hooks/exhaustive-deps

    }, [currentCluster?.id, currentCluster?.revision]);


    /**
     * =========================================================================
     * Загрузка подробностей выбранной Consumer Group.
     * =========================================================================
     */

    useEffect(() => {

        if (
            !selectedGroup ||
            !currentCluster?.brokers
        ) {

            setSelectedDetails(null);

            return;
        }

        let cancelled = false;

        const loadDetails = async () => {

            setDetailsLoading(true);

            try {

                const details =
                    await fetchConsumerGroupDetails(
                        currentCluster.id,
                        selectedGroup.name
                    );

                if (!cancelled) {

                    setSelectedDetails(details);
                }

            } catch (error) {

                if (!cancelled) {

                    setSelectedDetails(null);

                    toast.error(
                        error instanceof Error
                            ? error.message
                            : 'Не удалось загрузить детали группы'
                    );
                }

            } finally {

                if (!cancelled) {

                    setDetailsLoading(false);
                }
            }
        };

        void loadDetails();

        return () => {

            cancelled = true;
        };

    }, [
        selectedGroup?.name,
        currentCluster?.id, currentCluster?.revision
    ]);


    /**
     * =========================================================================
     * Фильтрация и сортировка групп.
     *
     * Скрытые группы исключаются из основной таблицы.
     * =========================================================================
     */

    const filteredGroups = useMemo(() => {

        const normalizedSearch =
            search.trim().toLowerCase();

        const result =
            groups.filter(group => {

                const matchesSearch =
                    group.name
                        .toLowerCase()
                        .includes(normalizedSearch);

                const matchesState =
                    stateFilter === 'all' ||
                    group.state === stateFilter;

                const isVisible =
                    !group.hidden;

                return (
                    matchesSearch &&
                    matchesState &&
                    isVisible
                );
            });

        return sortGroups(
            result,
            sortBy
        );

    }, [
        groups,
        search,
        stateFilter,
        sortBy
    ]);


    /**
     * =========================================================================
     * Синхронизация выбранной группы с текущим результатом фильтрации.
     * =========================================================================
     */

    useEffect(() => {

        if (filteredGroups.length === 0) {

            setSelectedGroup(null);

            return;
        }

        const selectedStillExists =
            selectedGroup !== null &&
            filteredGroups.some(
                group =>
                    group.name === selectedGroup.name
            );

        if (!selectedStillExists) {

            setSelectedGroup(
                filteredGroups[0]
            );
        }

    }, [
        filteredGroups,
        selectedGroup
    ]);


    /**
     * =========================================================================
     * Обновление списка Consumer Groups.
     * =========================================================================
     */

    const handleRefresh = async () => {

        if (refreshing) {

            return;
        }

        setRefreshing(true);

        try {

            await loadGroups(true);

        } finally {

            setRefreshing(false);
        }
    };


    /**
     * =========================================================================
     * Экспорт отфильтрованных групп.
     * =========================================================================
     */

    const handleExport = (
        format: ExportFormat
    ) => {

        if (filteredGroups.length === 0) {

            toast.error(
                'Нет групп для экспорта'
            );

            return;
        }

        exportGroups(
            filteredGroups,
            format
        );

        toast.success(
            `Экспорт ${format.toUpperCase()} выполнен`
        );
    };


    /**
     * =========================================================================
     * Открытие Offset Reset Wizard.
     * =========================================================================
     */

    const handleOpenOffsetReset = () => {

        if (!selectedGroup) {

            toast.error(
                'Сначала выберите Consumer Group'
            );

            return;
        }

        setOffsetResetOpen(true);
    };


    /**
     * =========================================================================
     * Скрытие / восстановление Consumer Group.
     *
     * Фактическое состояние hidden хранится в frontend state.
     * =========================================================================
     */

    const handleToggleHidden = (
        name: string
    ) => {

        setGroups(currentGroups =>
            currentGroups.map(group => {

                if (group.name !== name) {

                    return group;
                }

                return {
                    ...group,
                    hidden: !group.hidden
                };
            })
        );
    };


    /**
     * =========================================================================
     * Обновление конкретной Consumer Group.
     * =========================================================================
     */

    const handleRefreshGroup = async (
        group: ConsumerGroup
    ) => {

        if (!currentCluster?.brokers) {

            return;
        }

        try {

            const [
                groupsData,
                details
            ] = await Promise.all([

                fetchConsumerGroups(
                    currentCluster.id
                ),

                fetchConsumerGroupDetails(
                    currentCluster.id,
                    group.name
                )
            ]);

            if (activeProfile.current !== profileKey) return;
            setGroups(groupsData);

            setSelectedDetails(details);

            const updatedGroup =
                groupsData.find(
                    item =>
                        item.name === group.name
                );

            if (updatedGroup) {

                setSelectedGroup(
                    updatedGroup
                );
            }

            toast.success(
                `Данные «${group.name}» обновлены`
            );

        } catch (error) {

            toast.error(
                error instanceof Error
                    ? error.message
                    : 'Не удалось обновить группу'
            );
        }
    };


    /**
     * =========================================================================
     * Удаление Consumer Group.
     *
     * Пока операция не подключена к Kafka API.
     * =========================================================================
     */

    const handleDeleteGroup = (
        group: ConsumerGroup
    ) => {

        toast(
            `Удаление Kafka Consumer Group «${group.name}» пока не подключено`
        );
    };


    useEffect(() => {
        setPageLoading(loading);
        return () => setPageLoading(false);
    }, [loading, setPageLoading]);

    return (
        <div className="consumer-groups-page">

            {/*
             * KPI-карточки.
             */}
            <ConsumerGroupsKpi
                groups={groups}
            />


            {/*
             * Аналитические диаграммы.
             *
             * Они располагаются сразу после KPI,
             * чтобы верхняя часть страницы давала
             * быстрый обзор состояния Kafka Consumer Groups.
             */}
            <ConsumerDonutCharts
                groups={groups}
            />


            {/*
             * Toolbar.
             */}
            <ConsumerGroupsToolbar
                search={search}
                onSearchChange={setSearch}
                stateFilter={stateFilter}
                onStateFilterChange={
                    setStateFilter
                }
                sortBy={sortBy}
                onSortChange={setSortBy}
                totalGroups={
                    filteredGroups.length
                }
                onRefresh={handleRefresh}
                onExport={handleExport}
                onResetOffsets={
                    handleOpenOffsetReset
                }
                refreshing={
                    refreshing || loading
                }
            />


            {/*
             * Основная таблица Consumer Groups.
             */}
            <ConsumerGroupsTable
                groups={filteredGroups}
                selectedGroup={selectedGroup}
                onSelectGroup={
                    setSelectedGroup
                }
                onToggleHidden={
                    handleToggleHidden
                }
                onRefreshGroup={
                    handleRefreshGroup
                }
                onDeleteGroup={
                    handleDeleteGroup
                }
            />


            {/*
             * Нижняя рабочая область.
             *
             * Слева:
             *   информация о выбранной группе.
             *
             * Справа:
             *   график Consumer Lag.
             *
             * Высота обоих блоков регулируется CSS,
             * поэтому переключение вкладок Details
             * не должно менять геометрию страницы.
             */}
            <div className="consumer-bottom-layout">

                <ConsumerGroupDetails
                    group={selectedGroup}
                    details={
                        detailsLoading
                            ? null
                            : selectedDetails
                    }
                />

                <ConsumerLagChart
                    group={selectedGroup}
                />

            </div>


            {/*
             * Wizard сброса offsets.
             *
             * Это единственная точка рендера
             * модального окна Offset Reset.
             */}
            <OffsetResetWizard
                group={selectedGroup}
                open={offsetResetOpen}
                onClose={() =>
                    setOffsetResetOpen(false)
                }
            />

        </div>
    );
}
