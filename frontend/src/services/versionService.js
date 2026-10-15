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
 * @file versionService.js
 * @project Odyssey new 4.2.36
 * @description Сервис проверки актуальной версии Odyssey.
 * @changes Проверка версии выполняется через бэкенд.
 */

 /**
  * @fileoverview
  * Сервис для получения информации о последней версии Odyssey
  * из GitHub Releases.
  *
  * Используется Sidebar для проверки наличия новых версий приложения.
  */
export async function getLatestVersion() {
  try {
    const response = await fetch('/api/version/check', {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data.checked ? (data.latestVersion || null) : null;
  } catch {
    return null;
  }
}
