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
 * ConsumerGroupsToolbar.tsx
 * =============================================================================
 *
 * Верхняя панель управления Consumer Groups.
 *
 * Пункты 1–5:
 *  1. Поиск с иконкой лупы
 *  2. Фильтр «Статус: Все / Stable / …»
 *  3. Сортировка «Сортировка: Lag (desc)» и др.
 *  4. Кнопка «Обновить» (secondary, иконка)
 *  5. Кнопка «Экспорт» (JSON / CSV / TXT)
 *  6. Кнопка «Сбросить оффсеты» (primary)
 * =============================================================================
 */

import { ChangeEvent, useRef, useEffect, useState } from 'react';
import {
    FiSearch,
    FiRefreshCw,
    FiDownload,
    FiChevronDown,
    FiChevronUp
} from 'react-icons/fi';
import KSCSelect from '../../../components/ui/select/KSCSelect';
import type { SortOption, ExportFormat } from '../utils/consumer-groups.utils';
import '../styles/consumer-toolbar.css';

interface Props {
    search: string;
    onSearchChange: (value: string) => void;
    stateFilter: string;
    onStateFilterChange: (value: string) => void;
    sortBy: SortOption;
    onSortChange: (value: SortOption) => void;
    totalGroups: number;
    onRefresh: () => void;
    onExport: (format: ExportFormat) => void;
    onResetOffsets: () => void;
    refreshing?: boolean;
}

export default function ConsumerGroupsToolbar({
    search,
    onSearchChange,
    stateFilter,
    onStateFilterChange,
    sortBy,
    onSortChange,
    totalGroups,
    onRefresh,
    onExport,
    onResetOffsets,
    refreshing = false
}: Props) {
  useInterfaceLanguage();
    const [showExportMenu, setShowExportMenu] = useState(false);
    const exportRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                showExportMenu &&
                exportRef.current &&
                !exportRef.current.contains(event.target as Node)
            ) {
                setShowExportMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showExportMenu]);

    const handleExport = (format: ExportFormat) => {
        onExport(format);
        setShowExportMenu(false);
    };

    return (
        <div className="consumer-toolbar">
            <div className="consumer-toolbar-left">
                {/* Пункт 1: Поиск с иконкой лупы */}
                <div className="consumer-toolbar-search-wrapper">
                    <FiSearch className="consumer-toolbar-search-icon" />
                    <input
                        className="consumer-toolbar-search"
                        placeholder={odysseyI18n.t('interface.searchGroups')}
                        value={search}
                        onChange={(e: ChangeEvent<HTMLInputElement>) =>
                            onSearchChange(e.target.value)
                        }
                    />
                </div>

                {/* Пункт 2: Статус: Все / Stable / … */}
                <KSCSelect
                    label={odysseyI18n.t('interface.status')}
                    value={stateFilter}
                    onChange={onStateFilterChange}
                    options={[
                        { value: 'all', label: odysseyI18n.t('interface.all') },
                        { value: 'Stable', label: 'Stable' },
                        { value: 'Rebalancing', label: 'Rebalancing' },
                        { value: 'Empty', label: 'Empty' },
                        { value: 'Dead', label: 'Dead' }
                    ]}
                />

                {/* Пункт 3: Сортировка */}
                <KSCSelect
                    label={odysseyI18n.t('interface.sortBy')}
                    value={sortBy}
                    onChange={(v) => onSortChange(v as SortOption)}
                    options={[
                        { value: 'lag-desc', label: 'Lag (desc)' },
                        { value: 'lag-asc', label: 'Lag (asc)' },
                        { value: 'name-asc', label: odysseyI18n.t('interface.nameAZ') },
                        { value: 'name-desc', label: odysseyI18n.t('interface.nameZA') },
                        { value: 'members-desc', label: odysseyI18n.t('interface.membersDescending') },
                        { value: 'state-asc', label: odysseyI18n.t('interface.state') }
                    ]}
                />
            </div>

            <div className="consumer-toolbar-right">
                {/* Пункт 4: Обновить — secondary, без яркого фона */}
                <button
                    type="button"
                    className="consumer-toolbar-button secondary"
                    onClick={onRefresh}
                    disabled={refreshing}
                    title={odysseyI18n.t('interface.refreshGroupList')}
                >
                    <FiRefreshCw className={refreshing ? 'spinning' : ''} />
                    <span>{odysseyI18n.t('interface.refresh')}</span>
                </button>

                {/* Пункт 5: Экспорт JSON / CSV / TXT */}
                <div className="consumer-export-wrapper" ref={exportRef}>
                    <button
                        type="button"
                        className="consumer-toolbar-button secondary"
                        onClick={() => setShowExportMenu(!showExportMenu)}
                    >
                        <FiDownload />
                        <span>{odysseyI18n.t('interface.export')}</span>
                        {showExportMenu
                            ? <FiChevronUp className="export-chevron" />
                            : <FiChevronDown className="export-chevron" />
                        }
                    </button>
                    {showExportMenu && (
                        <div className="consumer-export-menu">
                            <button type="button" onClick={() => handleExport('json')}>
                                JSON
                            </button>
                            <button type="button" onClick={() => handleExport('csv')}>
                                CSV
                            </button>
                            <button type="button" onClick={() => handleExport('txt')}>
                                TXT
                            </button>
                        </div>
                    )}
                </div>

                {/* Пункт 6: Сбросить оффсеты */}
                <button
                    type="button"
                    className="consumer-toolbar-button primary"
                    onClick={onResetOffsets}
                > {odysseyI18n.t('interface.resetOffsets')} </button>

                <div className="consumer-toolbar-counter"> {odysseyI18n.t('interface.totalGroups2')} {totalGroups}
                </div>
            </div>
        </div>
    );
}
