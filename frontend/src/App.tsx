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
  * @file App.tsx
  * =============================================================================
  *
  * Корневой компонент приложения Odyssey.
  *
  * Назначение файла:
  * - определяет основную структуру React-приложения;
  * - инициализирует маршрутизацию (React Router);
  * - подключает глобальный контекст кластеров (ClusterContext);
  * - связывает Layout со всеми страницами приложения.
  *
  * Ответственность файла:
  * - регистрация маршрутов приложения;
  * - определение стартовой страницы;
  * - подключение глобальных Provider'ов, относящихся к приложению;
  * - формирование общей структуры навигации.
  *
  * В этом файле запрещено размещать:
  * - бизнес-логику;
  * - запросы к API;
  * - состояние отдельных страниц;
  * - код пользовательского интерфейса страниц;
  * - стили компонентов.
  *
  * App.jsx является точкой сборки всего интерфейса приложения.
  * =============================================================================
  */
import React from 'react';// Маршрутизация
import { BrowserRouter, Routes, Route } from 'react-router-dom';

// Общий макет
import Layout from './components/layout/Layout';

// Страницы
import Overview from './pages/Overview';
import Brokers from './pages/Brokers';
import Topics from './pages/Topics';
import ConsumerGroupsPage from './pages/consumer-groups/ConsumerGroupsPage';
import Acl from './pages/Acl';
import Search from './pages/Search';
import Settings from './pages/Settings';
import User from './pages/User';
import { enterpriseRoutes } from '@odyssey/registry';

// Контексты
import { ClusterProvider } from './contexts/ClusterContext';

function App() {
  return (
      /* ============================================================
         Глобальный контекст управления Kafka-кластерами
         ============================================================ */
    <ClusterProvider>
        {/* ============================================================
            Маршрутизация приложения
            ============================================================ */}
      <BrowserRouter>
        <Routes>
            {/* ========================================================
                Общий макет приложения (Sidebar + область контента)
                ======================================================== */}
          <Route element={<Layout />}>

            {/* Главная страница */}
            <Route index element={<Overview />} />

            {/* Раздел "Обзор" */}
            <Route path="overview" element={<Overview />} />

            {/* Управление брокерами */}
            <Route path="brokers" element={<Brokers />} />

            {/* Управление топиками */}
            <Route path="topics" element={<Topics />} />

            {/* Управление группами консьюмеров */}
            <Route path="groups" element={<ConsumerGroupsPage />} />

            {/* Управление ACL */}
            <Route path="acls" element={<Acl />} />

            {/* Поиск сообщений */}
            <Route path="search" element={<Search />} />
{/* Пользователь */}
            <Route path="user" element={<User />} />

            {/* Настройки приложения */}
            <Route path="/settings" element={<Settings />} />

            {enterpriseRoutes.map((route) => (
              <Route
                key={route.path}
                path={route.path}
                element={React.createElement(route.element)}
              />
            ))}
          </Route>
        </Routes>
      </BrowserRouter>
    </ClusterProvider>
  );
}

export default App;