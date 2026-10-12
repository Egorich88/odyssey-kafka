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
 * @file LoadingLogo.tsx
 * =============================================================================
 *
 * Логотип стартового экрана Odyssey.
 *
 * Компонент отвечает исключительно за отображение логотипа
 * во время первоначальной загрузки приложения.
 *
 * Никакой логики здесь быть не должно.
 * Только отображение.
 * =============================================================================
 */

import "./../styles/loading-screen.css";

export default function LoadingLogo() {

    return (

        <div className="loading-logo">

            <img
                src="/logo.svg"
                alt="Odyssey"
                draggable={false}
            />

        </div>

    );

}