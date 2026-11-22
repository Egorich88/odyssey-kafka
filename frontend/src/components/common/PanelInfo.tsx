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

import { FiInfo } from 'react-icons/fi';
import { useId } from 'react';
import OdysseyTooltip from './OdysseyTooltip';

interface PanelInfoProps {
  title: string;
  description: string;
}

export default function PanelInfo({
  title,
  description
}: PanelInfoProps) {
  const tooltipId = useId();
  return (
    <div className="panel-info">
      <button
        type="button"
        className="panel-info-trigger"
        data-tooltip-id={tooltipId}
        aria-label={`Информация о панели: ${title}`}
      >
        <FiInfo />
      </button>

      <OdysseyTooltip id={tooltipId} place="bottom" clickable>
        <strong className="odyssey-tooltip-title">
          {title}
        </strong>

        <div>
          {description}
        </div>
      </OdysseyTooltip>
    </div>
  );
}
