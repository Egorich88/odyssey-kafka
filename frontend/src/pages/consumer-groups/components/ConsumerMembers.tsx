import odysseyI18n from '../../../i18n';
import { useTranslation as useInterfaceLanguage } from 'react-i18next';
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
/*
 * =============================================================================
 * ConsumerMembers.tsx
 * =============================================================================
 *
 * Отображает РЕАЛЬНЫХ участников выбранной Consumer Group.
 *
 * Важный принцип:
 * количество Members во вкладке и фактическое количество карточек
 * теперь берётся из backend, поэтому Members (12) действительно означает
 * 12 доступных участников.
 * =============================================================================
 */

import '../styles/consumer-members.css';

import type {
    ConsumerGroupDetails
} from '../types/consumer-groups.types';

interface Props {
    group: ConsumerGroupDetails | null;
}

export default function ConsumerMembers({ group }: Props) {
  useInterfaceLanguage();

    if (!group) {
        return null;
    }

    return (
        <div className="consumer-members">

            <div className="consumer-members-title"> {odysseyI18n.t('interface.groupMembers')} </div>

            <div className="consumer-members-list">

                {group.membersDetail.length === 0 ? (
                    <div className="consumer-members-empty"> {odysseyI18n.t('interface.thisGroupHasNoActiveMembers')} </div>
                ) : (
                    group.membersDetail.map(member => (
                        <div
                            key={member.id}
                            className="consumer-member-card"
                        >
                            <div className="consumer-member-name">
                                {member.id}
                            </div>

                            <div>
                                Client ID: {member.clientId || '—'}
                            </div>

                            <div>
                                Host: {member.host || '—'}
                            </div>

                            <div>
                                Partition:{' '}
                                {member.partitions.length > 0
                                    ? member.partitions.join(', ')
                                    : '—'}
                            </div>
                        </div>
                    ))
                )}

            </div>

        </div>
    );
}
