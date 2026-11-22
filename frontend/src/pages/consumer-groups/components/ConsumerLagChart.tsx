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

/*
 * =============================================================================
 * ConsumerLagChart.tsx
 * =============================================================================
 *
 * График реального Consumer Lag.
 *
 * Backend уже хранит историю в кольцевом буфере и отдаёт её через:
 * /api/overview/consumer-lag?range=...
 *
 * Поэтому здесь больше нет генератора Math.random().
 * =============================================================================
 */

import { useEffect, useMemo, useState } from 'react';

import {
    ResponsiveContainer,
    AreaChart,
    Area,
    CartesianGrid,
    Tooltip,
    XAxis,
    YAxis
} from 'recharts';

import KSCSelect from '../../../components/ui/select/KSCSelect';
import { useCluster } from '../../../contexts/ClusterContext';
import { ownerFetch } from '../../../security/ownerSession';
import '../styles/consumer-chart.css';
import type { ConsumerGroup } from '../types/consumer-groups.types';
import { formatLag } from '../utils/lag.utils';

type TimeRange = '15m' | '1h' | '6h' | '24h';

const RANGE_OPTIONS: {
    value: TimeRange;
    label: string;
}[] = [
    { value: '15m', label: 'Последние 15 минут' },
    { value: '1h', label: 'Последний 1 час' },
    { value: '6h', label: 'Последние 6 часов' },
    { value: '24h', label: 'Последние 24 часа' }
];

interface Props {
    group: ConsumerGroup | null;
}

interface LagPoint {
    time: string;
    group: string;
    value: number;
}

export default function ConsumerLagChart({ group }: Props) {

    const { currentCluster } = useCluster();

    const [range, setRange] =
        useState<TimeRange>('15m');

    const [points, setPoints] =
        useState<LagPoint[]>([]);

    const [loading, setLoading] =
        useState(false);

    useEffect(() => {

        if (!group || !currentCluster?.brokers) {
            setPoints([]);
            return;
        }

        let cancelled = false;

        const load = async () => {

            setLoading(true);

            try {

                const response = await ownerFetch(
                    `/api/overview/consumer-lag?range=${range}`,
                    {
                        headers: {
                            'Content-Type': 'application/json',
                            'X-Kafka-Profile-ID': currentCluster.id
                        }
                    }
                );

                if (!response.ok) {
                    throw new Error(
                        `Ошибка Consumer Lag: ${response.status}`
                    );
                }

                const data = await response.json();

                if (!cancelled) {
                    setPoints(
                        (data.points ?? []).filter(
                            (point: LagPoint) =>
                                point.group === group.name
                        )
                    );
                }

            } catch (error) {

                if (!cancelled) {
                    setPoints([]);
                    console.error(error);
                }

            } finally {

                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        void load();

        return () => {
            cancelled = true;
        };

    }, [group?.name, currentCluster?.id, currentCluster?.revision, range]);


    const chartData = useMemo(() =>
        points.map(point => ({
            time: point.time,
            lag: point.value
        })),
        [points]
    );

    if (!group) {
        return (
            <div className="consumer-chart">
                <div className="consumer-chart-header">
                    <div className="consumer-chart-title">
                        Consumer Lag
                    </div>
                </div>
                <div className="consumer-chart-empty">
                    Выберите группу
                </div>
            </div>
        );
    }

    return (
        <div className="consumer-chart">

            <div className="consumer-chart-header">

                <div className="consumer-chart-title">
                    Consumer Lag
                </div>

                <KSCSelect
                    label=""
                    value={range}
                    onChange={value =>
                        setRange(value as TimeRange)
                    }
                    options={RANGE_OPTIONS.map(option => ({
                        value: option.value,
                        label: option.label
                    }))}
                />

            </div>

            <div className="consumer-chart-body">

                {loading && chartData.length === 0 ? (
                    <div className="consumer-chart-empty">
                        Загрузка данных...
                    </div>
                ) : chartData.length === 0 ? (
                    <div className="consumer-chart-empty">
                        История lag пока не накоплена
                    </div>
                ) : (
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData}>

                            <CartesianGrid
                                vertical={false}
                                strokeDasharray="3 3"
                                stroke="var(--border-color)"
                            />

                            <XAxis
                                dataKey="time"
                                axisLine={false}
                                tickLine={false}
                                tick={{
                                    fontSize: 11,
                                    fill: 'var(--text-secondary)'
                                }}
                            />

                            <YAxis
                                axisLine={false}
                                tickLine={false}
                                tick={{
                                    fontSize: 11,
                                    fill: 'var(--text-secondary)'
                                }}
                                tickFormatter={value =>
                                    formatLag(value)
                                }
                            />

                            <Tooltip
                                formatter={(value: number) => [
                                    formatLag(value),
                                    'Lag'
                                ]}
                                contentStyle={{
                                    background: 'var(--panel-bg)',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: 8
                                }}
                            />

                            <Area
                                dataKey="lag"
                                stroke="var(--accent-color)"
                                fill="var(--accent-color)"
                                fillOpacity={0.2}
                                strokeWidth={2}
                            />

                        </AreaChart>
                    </ResponsiveContainer>
                )}

            </div>
        </div>
    );
}
