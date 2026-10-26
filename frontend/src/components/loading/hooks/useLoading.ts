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
 * @file useLoading.ts
 * =============================================================================
 * Управляет фактическими этапами первоначального запуска Odyssey.
 *
 * Статус обновляется непосредственно в раннем HTML-splash: это позволяет
 * показывать ход запуска до того, как React отрисует основное приложение.
 * Проверка Backend отделена от проверки Kafka: отсутствие кластера не является
 * ошибкой запуска и не блокирует переход в интерфейс.
 * =============================================================================
 */

import { useEffect, useState } from 'react';
import axios from 'axios';
import { LoadingStage, LoadingState } from '../types/loading';

const INITIAL_STATE: LoadingState = {
    progress: 0,
    currentStage: LoadingStage.INITIALIZATION,
    message: 'Инициализация...',
    completed: false,
};

/** Обновляет текст статуса в статическом splash, если он ещё отображается. */
function setSplashStatus(message: string): void {
    const status = document.getElementById('initial-splash-status');
    if (status) status.textContent = message;
}

export function useLoading(): LoadingState {
    const [state, setState] = useState<LoadingState>(INITIAL_STATE);

    useEffect(() => {
        let cancelled = false;

        /** Синхронно обновляет и React-состояние, и ранний HTML-экран. */
        const publish = (
            currentStage: LoadingStage,
            message: string,
            progress: number,
            completed = false,
        ) => {
            if (cancelled) return;
            setSplashStatus(message);
            setState({ progress, currentStage, message, completed });
        };

        const initialize = async () => {
            try {
                publish(LoadingStage.INITIALIZATION, 'Инициализация приложения...', 10);

                // Даём браузеру отобразить первый кадр фирменного splash.
                await new Promise<void>(resolve => window.requestAnimationFrame(() => resolve()));
                if (cancelled) return;

                // Читаем сохранённые настройки и проверяем их структуру.
                publish(LoadingStage.CONFIGURATION, 'Чтение конфигурации...', 30);
                let clusters: Array<{ id?: string; brokers?: string; bootstrapServers?: string }> = [];
                try {
                    const stored = window.localStorage.getItem('kafka_clusters');
                    if (stored) {
                        const parsed: unknown = JSON.parse(stored);
                        if (Array.isArray(parsed)) clusters = parsed;
                    }
                } catch (error) {
                    // Повреждённая конфигурация не должна блокировать запуск UI.
                    console.warn('Не удалось прочитать сохранённую конфигурацию кластеров:', error);
                }
                if (cancelled) return;

                // Отдельно проверяем Backend. Этот endpoint не требует Kafka.
                publish(LoadingStage.SERVER, 'Проверка доступности Backend...', 55);
                try {
                    await axios.get('/api/health', { timeout: 5000 });
                    if (cancelled) return;
                    publish(LoadingStage.SERVER, 'Backend доступен', 70);
                } catch (error) {
                    if (cancelled) return;
                    // Backend недоступен — всё равно открываем UI, чтобы пользователь
                    // увидел интерфейс и мог диагностировать проблему подключения.
                    console.warn('Backend пока недоступен:', error);
                    publish(LoadingStage.SERVER, 'Backend недоступен — запускаем интерфейс...', 70);
                }
                if (cancelled) return;

                // Не проверяем Kafka повторно здесь: ClusterContext выполняет
                // настоящий health-check после монтирования App. Пустой список
                // кластеров — штатная ситуация для первого запуска.
                if (clusters.length > 0) {
                    publish(LoadingStage.CLUSTER, 'Настройки кластера найдены — подготовка интерфейса...', 85);
                } else {
                    publish(LoadingStage.CONFIGURATION, 'Кластер не настроен — открываем интерфейс добавления...', 85);
                }

                // Завершаем только frontend bootstrap, а не проверку Kafka.
                publish(LoadingStage.COMPLETE, 'Запуск интерфейса...', 100, true);
            } catch (error) {
                // Не допускаем бесконечного splash при неожиданной ошибке инициализации.
                console.error('Ошибка первоначальной инициализации Odyssey:', error);
                if (!cancelled) {
                    publish(LoadingStage.COMPLETE, 'Запускаем интерфейс в ограниченном режиме...', 100, true);
                }
            }
        };

        void initialize();
        return () => { cancelled = true; };
    }, []);

    return state;
}
