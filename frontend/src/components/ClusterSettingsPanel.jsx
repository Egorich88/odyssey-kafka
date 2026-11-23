import odysseyI18n from '../i18n';
import { useTranslation as useInterfaceLanguage } from 'react-i18next';
/*
 * Copyright 2026 Egor Khomenko (Egorich88)
 *
 * Licensed under the Apache License, Version 2.0
 */

import {

  useState,
  useEffect

} from 'react';

export default function ClusterSettingsPanel({

  cluster,
  onSave,
  onCancel,
  onDelete

}) {
  useInterfaceLanguage();

  const [config, setConfig] =
    useState(cluster);

  useEffect(() => {

    setConfig(cluster);

  }, [cluster]);

  const handleChange = (e) => {

    setConfig({

      ...config,
      [e.target.name]:
        e.target.value
    });
  };

  const handleSubmit = () => {

    onSave(config);
  };

  const handleDelete = () => {

    const confirmed =
      window.confirm(

        odysseyI18n.t('interface.deleteCluster', { v0: cluster.name })
      );

    if (confirmed) {

      onDelete(cluster.id);
    }
  };

  if (!config) return null;

  return (

    <div className="cluster-config-modal">

      <div className="cluster-config-header">

        <div>

          <h2> {odysseyI18n.t('interface.clusterSettings')} </h2>

        </div>

        <button
          className="modal-hide-btn"
          onClick={onCancel}
        > {odysseyI18n.t('interface.hide')} </button>

      </div>

      <div className="cluster-config-body">

        {/* NAME */}

        <label> {odysseyI18n.t('interface.name')} </label>

        <input
          name="name"
          placeholder={odysseyI18n.t('interface.enterAClusterName')}
          value={config.name || ''}
          onChange={handleChange}
        />

        {/* BROKERS */}

        <label> {odysseyI18n.t('interface.brokersHostPortCommaSeparated')} </label>

        <input
          name="brokers"
          placeholder="kafka1:9092,kafka2:9092"
          value={config.brokers || ''}
          onChange={handleChange}
        />

        {/* AUTH */}

        <div className="auth-section-title"> {odysseyI18n.t('interface.authentication')} </div>

        {/* PLAINTEXT */}

        <div
          className={`auth-card ${
            config.authType === 'PLAINTEXT'
              ? 'active'
              : ''
          }`}
          onClick={() =>
            setConfig({
              ...config,
              authType:
                'PLAINTEXT'
            })
          }
        >

          <div className="auth-radio">

            <div className="auth-radio-dot" />

          </div>

          <div>

            <h4> {odysseyI18n.t('interface.plaintextNoAuthentication')} </h4>

            <p> {odysseyI18n.t('interface.noUsernameOrPasswordForLocalDevelopmentOnly')} </p>

          </div>

        </div>

        {/* SASL */}

        <div
          className={`auth-card ${
            ['SASL', 'SASL_PLAIN', 'SASL_SCRAM'].includes(config.authType)
              ? 'active'
              : ''
          }`}
          onClick={() =>
            setConfig({
              ...config,
              authType: 'SASL'
            })
          }
        >

          <div className="auth-radio">

            <div className="auth-radio-dot" />

          </div>

          <div>

            <h4> {odysseyI18n.t('interface.saslUsernamePassword')} </h4>

            <p> {odysseyI18n.t('interface.usernameAndPasswordOverTLSSupportsPLAINAnd')} </p>

            <p> {odysseyI18n.t('interface.forProductionPreferSCRAMSHA512OverTLS')} </p>

          </div>

        </div>

        {['SASL', 'SASL_PLAIN', 'SASL_SCRAM'].includes(config.authType) && (

          <div className="auth-fields">

            <input
              name="username"
              placeholder="Username"
              value={config.username || ''}
              onChange={handleChange}
            />

            <input
              type="password"
              name="password"
              placeholder="Password"
              value={config.password || ''}
              onChange={handleChange}
            />

            <label>{odysseyI18n.t('interface.saslMechanism')}</label>
            <select name="saslMechanism" value={config.saslMechanism || 'PLAIN'} onChange={handleChange}>
              <option value="PLAIN">{odysseyI18n.t('interface.plainCompatibility')}</option>
              <option value="SCRAM-SHA-256">SCRAM-SHA-256</option>
              <option value="SCRAM-SHA-512">{odysseyI18n.t('interface.scramSHA512Recommended')}</option>
            </select>

            <label>{odysseyI18n.t('interface.serverCACertificateOptionalForASystemCA')}</label>
            <textarea rows="3" name="ca" placeholder="-----BEGIN CERTIFICATE-----" value={config.ca || ''} onChange={handleChange} />

          </div>
        )}


        {/* MTLS */}

        <div
          className={`auth-card ${
            config.authType === 'MTLS'
              ? 'active'
              : ''
          }`}
          onClick={() =>
            setConfig({
              ...config,
              authType: 'MTLS'
            })
          }
        >

          <div className="auth-radio">

            <div className="auth-radio-dot" />

          </div>

          <div>

            <h4> {odysseyI18n.t('interface.mtlsMutualAuthentication')} </h4>

            <p> {odysseyI18n.t('interface.theClientAndServerAuthenticateEachOtherUsing')} </p>

            <p> {odysseyI18n.t('interface.recommendedForProduction')} </p>

          </div>

        </div>

        {config.authType === 'MTLS' && (

          <div className="auth-fields">

            <textarea
              rows="4"
              name="cert"
              placeholder="Client certificate"
              value={config.cert || ''}
              onChange={handleChange}
            />

            <textarea
              rows="4"
              name="key"
              placeholder="Private key"
              value={config.key || ''}
              onChange={handleChange}
            />

            <textarea
              rows="3"
              name="ca"
              placeholder="CA certificate"
              value={config.ca || ''}
              onChange={handleChange}
            />

          </div>
        )}

      </div>

      <div className="cluster-config-footer">

        <button
          className="delete-cluster-btn-danger"
          onClick={handleDelete}
        > {odysseyI18n.t('interface.deleteCluster2')} </button>

        <div className="cluster-config-footer-right">

          <button
            className="secondary-btn"
            onClick={onCancel}
          > {odysseyI18n.t('interface.cancel')} </button>

          <button
            className="primary-btn"
            onClick={handleSubmit}
          > {odysseyI18n.t('interface.saveChanges')} </button>

        </div>

      </div>

    </div>
  );
}
