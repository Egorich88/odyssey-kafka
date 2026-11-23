import odysseyI18n from '../../../i18n';
import { useTranslation as useInterfaceLanguage } from 'react-i18next';
/*
 * Copyright 2026 Egor Khomenko (Egorich88)
 *
 * Licensed under the Apache License, Version 2.0
 */

/**
 * =============================================================================
 * ConsumerOffsets.tsx
 * =============================================================================
 *
 * Таблица реальных offsets выбранной Consumer Group.
 *
 * В отличие от старой версии здесь больше нет двух тестовых строк.
 * Backend возвращает каждую topic/partition отдельно.
 * =============================================================================
 */

import '../styles/consumer-offsets.css';

import type {
    ConsumerGroupDetails
} from '../types/consumer-groups.types';

interface Props {
    group: ConsumerGroupDetails | null;
}

export default function ConsumerOffsets({ group }: Props) {
  useInterfaceLanguage();

    if (!group) {
        return null;
    }

    return (
        <div className="consumer-offsets">

            <div className="consumer-offsets-title"> {odysseyI18n.t('interface.partitionOffsets')} </div>

            <div className="consumer-offsets-scroll">

                {group.offsets.length === 0 ? (
                    <div className="consumer-offsets-empty"> {odysseyI18n.t('interface.thisGroupHasNoCommittedOffsets')} </div>
                ) : (
                    <table className="consumer-offsets-table">

                        <thead>
                            <tr>
                                <th>{odysseyI18n.t('interface.topic')}</th>
                                <th>{odysseyI18n.t('interface.partition')}</th>
                                <th>Offset</th>
                                <th>{odysseyI18n.t('interface.end')}</th>
                                <th>Lag</th>
                            </tr>
                        </thead>

                        <tbody>
                            {group.offsets.map(offset => (
                                <tr
                                    key={`${offset.topic}-${offset.partition}`}
                                >
                                    <td>{offset.topic}</td>
                                    <td>{offset.partition}</td>
                                    <td>{offset.currentOffset}</td>
                                    <td>
                                        {offset.endOffset >= 0
                                            ? offset.endOffset
                                            : '—'}
                                    </td>
                                    <td className={
                                        offset.lag > 0
                                            ? 'consumer-offset-lag'
                                            : ''
                                    }>
                                        {offset.lag}
                                    </td>
                                </tr>
                            ))}
                        </tbody>

                    </table>
                )}

            </div>

        </div>
    );
}
