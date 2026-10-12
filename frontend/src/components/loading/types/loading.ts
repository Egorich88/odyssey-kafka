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
 * loading.ts
 * =============================================================================
 *
 * Общие типы системы стартовой загрузки Odyssey.
 *
 * Данный файл содержит все интерфейсы и перечисления,
 * используемые экраном загрузки приложения.
 *
 * Благодаря этому:
 *
 * ✔ все компоненты используют одинаковые типы;
 * ✔ отсутствует дублирование интерфейсов;
 * ✔ при расширении функциональности меняется только один файл.
 *
 * =============================================================================
 */

//
// -----------------------------------------------------------------------------
// Возможные этапы загрузки приложения
// -----------------------------------------------------------------------------

export enum LoadingStage {

    /**
     * Инициализация React приложения.
     */
    INITIALIZATION = 'initialization',

    /**
     * Проверка backend.
     */
    SERVER = 'server',

    /**
     * Загрузка конфигурации.
     */
    CONFIGURATION = 'configuration',

    /**
     * Проверка Kafka кластера.
     */
    CLUSTER = 'cluster',

    /**
     * Загрузка данных.
     */
    DATA = 'data',

    /**
     * Завершение запуска.
     */
    COMPLETE = 'complete'
}

//
// -----------------------------------------------------------------------------
// Описание одного этапа
// -----------------------------------------------------------------------------

export interface LoadingStep {

    /**
     * Уникальный идентификатор этапа.
     */
    id: LoadingStage;

    /**
     * Заголовок этапа.
     */
    title: string;

    /**
     * Процент завершения.
     */
    progress: number;
}

//
// -----------------------------------------------------------------------------
// Полное состояние экрана загрузки
// -----------------------------------------------------------------------------

export interface LoadingState {

    /**
     * Общий процент выполнения.
     */
    progress: number;

    /**
     * Текущий этап.
     */
    currentStage: LoadingStage;

    /**
     * Отображаемый пользователю текст.
     */
    message: string;

    /**
     * Завершена ли загрузка.
     */
    completed: boolean;
}