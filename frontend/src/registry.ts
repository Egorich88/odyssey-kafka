/*
 * Copyright 2026 Egor Khomenko (Egorich88)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 */

import type { ComponentType } from 'react';

/** Маршрут дополнительного модуля. */
export interface EnterpriseRoute {
  path: string;
  element: ComponentType;
}

/** Пункт бокового меню дополнительного модуля. */
export interface EnterpriseSidebarItem {
  title: string;
  path: string;
  icon: ComponentType<any>;
}

/**
 * Публичный реестр всегда пустой.
 * Enterprise подключается отдельной приватной конфигурацией сборки.
 */
export const enterpriseRoutes: EnterpriseRoute[] = [];
export const enterpriseSidebarItems: EnterpriseSidebarItem[] = [];
