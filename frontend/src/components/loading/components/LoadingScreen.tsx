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
 * @file LoadingScreen.tsx
 * =============================================================================
 *
 * Главный визуальный контейнер стартового экрана
 * Odyssey.
 *
 * -----------------------------------------------------------------------------
 * Назначение
 * -----------------------------------------------------------------------------
 *
 * LoadingScreen объединяет отдельные визуальные элементы Splash Screen:
 *
 *     LoadingLogo
 *          ↓
 *     LoadingProgress
 *          ↓
 *     LoadingStatus
 *
 * Компонент отвечает только за структуру интерфейса.
 *
 * -----------------------------------------------------------------------------
 * Важно
 * -----------------------------------------------------------------------------
 *
 * LoadingScreen не отвечает за:
 *
 * • получение данных;
 * • подключение к Kafka;
 * • запросы к API;
 * • определение состояния приложения;
 * • таймеры;
 * • бизнес-логику.
 *
 * Эти задачи будут подключены позже через отдельный слой
 * управления инициализацией приложения.
 *
 * На текущем этапе компонент используется совместно
 * с LoadingDemo для безопасной проверки UI.
 *
 * =============================================================================
 */

import "../styles/loading-screen.css";

import LoadingLogo from "./LoadingLogo";
import LoadingStatus from "./LoadingStatus";
import LoadingProgress from "./LoadingProgress";

/**
 * =============================================================================
 * Свойства LoadingScreen.
 * =============================================================================
 */
/**
 * =============================================================================
 * Свойства LoadingScreen
 * =============================================================================
 *
 * LoadingScreen получает только текст текущего состояния.
 *
 * Процент загрузки больше не передаётся, поскольку индикатор под логотипом
 * является декоративным световым индикатором, а не progress bar.
 * =============================================================================
 */
interface LoadingScreenProps {

    /**
     * Текущее состояние запуска приложения.
     */
    status: string;

}

/**
 * =============================================================================
 * LoadingScreen
 * =============================================================================
 *
 * Формирует центральную композицию стартового экрана.
 * =============================================================================
 */
export default function LoadingScreen({

    status

}: LoadingScreenProps) {

    return (

        <div className="loading-screen">

            <div className="loading-container">

                {/* Фирменный логотип Odyssey */}
                <LoadingLogo />

                {/* Световой индикатор активности */}
                <LoadingProgress/>

                {/* Текущее состояние запуска */}
                <LoadingStatus
                    text={status}
                />

            </div>

        </div>

    );

}