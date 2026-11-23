import odysseyI18n from '../../i18n';
import { useTranslation as useInterfaceLanguage } from 'react-i18next';
/*
 * Copyright 2026 Egor Khomenko (Egorich88)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 */

/**
 * @file ClusterStatusScreen.tsx
 * @project Odyssey new 4.2.36
 * @description Экран проверки подключения к Kafka-кластеру.
 * @changes Уточнены тексты состояния подключения и недоступности.
 */

/**
 * @file ClusterStatusScreen.tsx
 * Единый экран проверки доступности выбранного Kafka-кластера.
 *
 * Экран используется Layout, поэтому одинаково работает на всех страницах,
 * которым действительно нужен Kafka-кластер. Настройки и Пользователь
 * намеренно обходят этот экран.
 */

import { FiAlertTriangle, FiLoader } from 'react-icons/fi';
import type { ClusterConnectionStatus } from '../../contexts/ClusterContext';
import './cluster-status-screen.css';

interface Props {
  status: ClusterConnectionStatus;
}

export default function ClusterStatusScreen({ status }: Props): JSX.Element {
  useInterfaceLanguage();
  const checking = status === 'checking' || status === 'unknown';

  return (
    <div className={`cluster-status-screen ${checking ? 'is-checking' : 'is-unavailable'}`}>
      <div className="cluster-status-content">
        <div className="cluster-status-logo-wrap" aria-hidden="true">
          <img src="/logo.svg" alt="" className="cluster-status-logo" />
          <span className="cluster-status-logo-glow" />
        </div>

        <div className="cluster-status-spinner" aria-hidden="true">
          {checking ? <FiLoader /> : <FiAlertTriangle />}
        </div>

        <h2>{checking ? odysseyI18n.t('interface.connectingToCluster') : odysseyI18n.t('interface.clusterUnavailable')}</h2>
        <p>
          {checking
            ? odysseyI18n.t('interface.checkingTheSelectedKafkaClusterAndLoadingData')
            : odysseyI18n.t('interface.selectAnotherClusterOrCheckTheConnectionSettings')}
        </p>
      </div>
    </div>
  );
}
