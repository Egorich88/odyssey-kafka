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
 * @file LoadingBootstrap.tsx
 * =============================================================================
 *
 * Контроллер первоначального запуска Odyssey.
 *
 * Назначение:
 *
 * • запускает реальную инициализацию приложения;
 * • отображает LoadingScreen во время запуска;
 * • после успешного завершения передаёт управление App;
 * • не содержит бизнес-логики Kafka или страниц приложения.
 *
 * Архитектура:
 *
 * LoadingBootstrap
 *       │
 *       ├── useLoading()
 *       │
 *       ├── LoadingScreen
 *       │
 *       └── App
 *
 * =============================================================================
 */

import { useEffect } from 'react';
import { useLoading } from './hooks/useLoading';

import LoadingScreen from './components/LoadingScreen';

import App from '../../App';


/**
 * =============================================================================
 * LoadingBootstrap
 * =============================================================================
 *
 * Основная точка перехода от стартового экрана к приложению.
 * =============================================================================
 */
export default function LoadingBootstrap(): JSX.Element | null {
    const loading = useLoading();

    useEffect(() => {
        if (loading.completed) {
            // Статический splash из index.html является единственным экраном
            // самого раннего запуска. После готовности React он удаляется.
            document.getElementById('initial-splash')?.remove();
        }
    }, [loading.completed]);

    // Не рисуем второй React-splash поверх статического. Именно это раньше
    // вызывало визуальный скачок логотипа и повторное появление полоски.
    if (!loading.completed) return null;

    return <App />;
}
