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


import { Component, useEffect, type ReactNode } from 'react';
import { useLoading } from './hooks/useLoading';
import { completeStartup, showStartupError } from './startup';
import i18n from '../../i18n';

// Граница охватывает также восстановление темы и языка в main.tsx.
export class StartupBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { showStartupError(); }
  render() {
    if (!this.state.failed) return this.props.children;
    if (document.getElementById('initial-splash')) return null;
    // После завершения заставки ошибка также оставляет доступное действие восстановления.
    return <div className="startup-error" role="alert">
      <p>{i18n.t('startup.failed')}</p>
      <button type="button" onClick={() => window.location.reload()}>{i18n.t('startup.retry')}</button>
    </div>;
  }
}

function ApplicationReady() {
  // Эффекты App, включая восстановление сохранённого профиля, уже выполнены.
  // Сетевые проверки кластеров продолжаются независимо от готовности UI.
  useEffect(() => completeStartup(), []);
  return null;
}

export default function LoadingBootstrap() {
  const { App, failed } = useLoading();
  useEffect(() => { if (failed) showStartupError(); }, [failed]);
  if (!App || failed) return null;
  return <><App /><ApplicationReady /></>;
}
