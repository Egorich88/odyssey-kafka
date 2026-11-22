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


import { useEffect, useState, type ComponentType } from 'react';
import { setStartupStatus } from '../startup';

// Общая загрузка модуля также используется при повторном эффекте React StrictMode.
let applicationModule: Promise<typeof import('../../../App')> | undefined;

export function useLoading() {
  const [App, setApp] = useState<ComponentType | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setStartupStatus('workspace');
    // Загружаем модуль приложения, не ожидая backend, Kafka или метрик.
    applicationModule ??= import('../../../App');
    void applicationModule.then(module => {
      if (!cancelled) setApp(() => module.default);
    }).catch(() => {
      if (!cancelled) setFailed(true);
    });
    return () => { cancelled = true; };
  }, []);
  return { App, failed };
}
