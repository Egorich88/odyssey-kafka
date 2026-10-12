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
 * @file LoadingStatus.tsx
 * =============================================================================
 *
 * Текстовый индикатор состояния запуска Odyssey.
 *
 * -----------------------------------------------------------------------------
 * Назначение
 * -----------------------------------------------------------------------------
 *
 * Компонент отображает текущее состояние процесса запуска.
 *
 * Например:
 *
 * • Initializing...
 * • Loading configuration...
 * • Connecting to Kafka...
 * • Starting services...
 * • Ready
 *
 * Компонент не содержит собственной логики.
 * Полученный текст просто отображается в интерфейсе.
 *
 * -----------------------------------------------------------------------------
 * Архитектурная роль
 * -----------------------------------------------------------------------------
 *
 * LoadingStatus не отвечает за определение состояния загрузки.
 *
 * Он не содержит:
 *
 * • useState;
 * • useEffect;
 * • таймеров;
 * • API-запросов;
 * • бизнес-логики.
 *
 * =============================================================================
 */

/**
 * =============================================================================
 * Свойства компонента.
 * =============================================================================
 */
interface LoadingStatusProps {

    /**
     * Текст текущего состояния запуска.
     */
    text: string;

}

/**
 * =============================================================================
 * LoadingStatus
 * =============================================================================
 *
 * Отображает текущее состояние загрузки приложения.
 * =============================================================================
 */
export default function LoadingStatus({

    text

}: LoadingStatusProps) {

    return (

        <div className="loading-status">

            {text}

        </div>

    );

}