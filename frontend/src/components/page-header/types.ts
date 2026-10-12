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
 * @file types.ts
 * =============================================================================
 * Типы глобальной панели страницы Odyssey.
 * =============================================================================
 */

export type RelativeTimeRangeId = '5m' | '15m' | '30m' | '1h' | '3h' | '6h' | '12h' | '24h';

export interface RelativeTimeRange {
  type: 'relative';
  id: RelativeTimeRangeId;
  label: string;
}

export interface AbsoluteTimeRange {
  type: 'absolute';
  from: string;
  to: string;
}

export type TimeRange = RelativeTimeRange | AbsoluteTimeRange;

export interface RefreshInterval {
  value: number;
  label: string;
}

export type RefreshHandler = () => void | Promise<void>;

export type PageHeaderMode = 'monitoring' | 'default';
