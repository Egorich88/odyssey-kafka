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
 * ConsumerDonutCharts.tsx
 * =============================================================================
 *
 * Пункт 10: Три кольцевых графика с легендой справа.
 *  1. Топики
 *  2. Распределение Lag
 *  3. Состояние групп
 * =============================================================================
 */

import { useMemo } from 'react';
import {
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell
} from 'recharts';
import '../styles/consumer-donut-charts.css';
import type { ConsumerGroup } from '../types/consumer-groups.types';
import { formatLag } from '../utils/lag.utils';

const COLORS = [
    '#3b82f6', '#8b5cf6', '#22c55e', '#f59e0b',
    '#ef4444', '#06b6d4', '#ec4899', '#84cc16'
];

const STATE_COLORS: Record<string, string> = {
    Stable: '#22c55e',
    Rebalancing: '#f59e0b',
    Empty: '#94a3b8',
    Dead: '#ef4444'
};

interface Props {
    groups: ConsumerGroup[];
}

interface DonutPanelProps {
    title: string;
    data: { name: string; value: number; color: string }[];
    totalLabel: string;
}

function DonutPanel({ title, data, totalLabel }: DonutPanelProps) {
  useInterfaceLanguage();
    const total = data.reduce((s, d) => s + d.value, 0);

    return (
        <div className="donut-panel">
            <div className="donut-panel-title">{title}</div>
            <div className="donut-panel-body">
                <div className="donut-chart-wrap">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={data}
                                cx="50%"
                                cy="50%"
                                innerRadius="58%"
                                outerRadius="80%"
                                dataKey="value"
                                stroke="none"
                                paddingAngle={2}
                            >
                                {data.map((entry, i) => (
                                    <Cell key={i} fill={entry.color} />
                                ))}
                            </Pie>
                        </PieChart>
                    </ResponsiveContainer>
                    <div className="donut-center">
                        <span className="donut-center-value">{totalLabel}</span>
                        <span className="donut-center-label">{odysseyI18n.t('interface.total')}</span>
                    </div>
                </div>
                <ul className="donut-legend">
                    {data.map(item => (
                        <li key={item.name}>
                            <span
                                className="donut-legend-dot"
                                style={{ background: item.color }}
                            />
                            <span className="donut-legend-name">{item.name}</span>
                            <span className="donut-legend-value">
                                {total > 0
                                    ? `${Math.round((item.value / total) * 100)}%`
                                    : '0%'
                                }
                            </span>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}

export default function ConsumerDonutCharts({ groups }: Props) {
  useInterfaceLanguage();
    const topicsData = useMemo(() => {
        const map = new Map<string, number>();
        groups.forEach(g => {
            (g.topics ?? []).forEach(t => {
                map.set(t, (map.get(t) ?? 0) + 1);
            });
        });
        return Array.from(map.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([name, value], i) => ({
                name,
                value,
                color: COLORS[i % COLORS.length]
            }));
    }, [groups]);

    const lagData = useMemo(() =>
        groups
            .filter(g => g.lag > 0)
            .sort((a, b) => b.lag - a.lag)
            .slice(0, 6)
            .map((g, i) => ({
                name: g.name,
                value: g.lag,
                color: COLORS[i % COLORS.length]
            })),
        [groups]
    );

    const stateData = useMemo(() => {
        const map = new Map<string, number>();
        groups.forEach(g => {
            map.set(g.state, (map.get(g.state) ?? 0) + 1);
        });
        return Array.from(map.entries()).map(([name, value]) => ({
            name,
            value,
            color: STATE_COLORS[name] ?? '#94a3b8'
        }));
    }, [groups]);

    const totalLag = lagData.reduce((s, d) => s + d.value, 0);

    return (
        <div className="consumer-donut-grid">
            <DonutPanel
                title={odysseyI18n.t('interface.topics')}
                data={topicsData}
                totalLabel={String(topicsData.length)}
            />
            <DonutPanel
                title={odysseyI18n.t('interface.lagDistribution')}
                data={lagData}
                totalLabel={formatLag(totalLag)}
            />
            <DonutPanel
                title={odysseyI18n.t('interface.groupStates')}
                data={stateData}
                totalLabel={String(groups.length)}
            />
        </div>
    );
}
