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
 * @file main.tsx
 * Точка входа frontend-приложения Odyssey.
 *
 * Статический splash из index.html показывается раньше React.
 * После монтирования его место занимает React LoadingScreen.
 */

import React from 'react';
import ReactDOM from 'react-dom/client';

import './styles/global.css';
import './styles/themes.css';
import './styles/layout.css';
import './styles/sidebar.css';
import './i18n/index.js';

import { ThemeProvider } from './contexts/ThemeContext';
import { LanguageProvider } from './contexts/LanguageContext';
import LoadingBootstrap from './components/loading/LoadingBootstrap';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Odyssey: root element "#root" was not found.');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <LanguageProvider>
        <LoadingBootstrap />
      </LanguageProvider>
    </ThemeProvider>
  </React.StrictMode>
);
