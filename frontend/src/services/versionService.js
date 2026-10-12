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
  * @fileoverview
  * Сервис для получения информации о последней версии Odyssey
  * из GitHub Releases.
  *
  * Используется Sidebar для проверки наличия новых версий приложения.
  */
export async function getLatestVersion() {
  try {
    const response = await fetch(
      'https://api.github.com/repos/Egorich88/kafka-system-control-4/releases/latest'
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    return data.tag_name.replace(/^v/, '');
  } catch {
    return null;
  }
}