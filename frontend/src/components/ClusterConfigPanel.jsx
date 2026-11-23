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

import {

  FiX,
  FiTrash2,
  FiMinus

} from 'react-icons/fi';

export default function ClusterConfigPanel({

  cluster,
  onSave,
  onCancel,
  onDelete

}) {
  useInterfaceLanguage();

  const [collapsed, setCollapsed] =
    useState(false);

  const [config, setConfig] =
    useState({

      name: '',
      brokers: '',
      authType: 'PLAINTEXT',
      username: '',
      password: '',
      cert: '',
      key: '',
      ca: ''
    });

  useEffect(() => {

    if (cluster) {

      setConfig(cluster);

    } else {

      setConfig({

        name: '',
        brokers: '',
        authType: 'PLAINTEXT',
        username: '',
        password: '',
        cert: '',
        key: '',
        ca: ''
      });
    }

  }, [cluster]);

  const handleChange = (e) => {

    setConfig({

      ...config,
      [e.target.name]:
        e.target.value
    });
  };

  const handleSubmit = () => {

    if (
      !config.name ||
      !config.brokers
    ) {

      alert(
        odysseyI18n.t('interface.enterANameAndBootstrapServers')
      );

      return;
    }

    onSave(config);
  };

  const handleDelete = () => {

    if (!cluster) return;

    const confirmed =
      window.confirm(

        odysseyI18n.t('interface.deleteCluster', { v0: cluster.name })
      );

    if (confirmed) {

      onDelete(cluster.id);
    }
  };

  if (collapsed) {

    return null;
  }

  return (

    <div className="cluster-config-modal">

      {/* HEADER */}

      <div className="cluster-config-header">

        <div>

          <h2>

            {cluster
              ? odysseyI18n.t('interface.clusterSettings')
              : odysseyI18n.t('interface.newCluster')}

          </h2>

          <span>

            {cluster
              ? odysseyI18n.t('interface.editConnectionSettings')
              : odysseyI18n.t('interface.createAConnection')}

          </span>

        </div>

        <div className="cluster-config-actions">

          <button
            className="modal-icon-btn"
            onClick={() =>
              setCollapsed(true)
            }
          >

            <FiMinus />

          </button>

          <button
            className="modal-icon-btn"
            onClick={onCancel}
          >

            <FiX />

          </button>

        </div>

      </div>

      {/* BODY */}

      <div className="cluster-config-body">

        <label> {odysseyI18n.t('interface.name')} </label>

        <input
          name="name"
          value={config.name}
          onChange={handleChange}
        />

        <label> {odysseyI18n.t('interface.brokers')} </label>

        <input
          name="brokers"
          value={config.brokers}
          onChange={handleChange}
          placeholder="host:9092"
        />

        <label> {odysseyI18n.t('interface.authentication')} </label>

        <select
          name="authType"
          value={config.authType}
          onChange={handleChange}
        >

          <option value="PLAINTEXT">
            PLAINTEXT
          </option>

          <option value="SASL_PLAIN">
            SASL/PLAIN
          </option>

          <option value="SASL_SCRAM">
            SASL/SCRAM
          </option>

          <option value="MTLS">
            mTLS
          </option>
</select>

        {(config.authType ===
          'SASL_PLAIN' ||

          config.authType ===
          'SASL_SCRAM') && (

          <>

            <label>
              Username
            </label>

            <input
              name="username"
              value={config.username}
              onChange={handleChange}
            />

            <label>
              Password
            </label>

            <input
              type="password"
              name="password"
              value={config.password}
              onChange={handleChange}
            />

            <label>SCRAM mechanism (used for SASL_SCRAM)</label>
            <select name="saslMechanism" value={config.saslMechanism || 'SCRAM-SHA-512'} onChange={handleChange}>
              <option value="SCRAM-SHA-256">SCRAM-SHA-256</option>
              <option value="SCRAM-SHA-512">SCRAM-SHA-512</option>
            </select>

            <label>CA certificate (for internal TLS CA)</label>
            <textarea rows="3" name="ca" value={config.ca || ''} onChange={handleChange} />

          </>
        )}

        {config.authType ===
          'MTLS' && (

          <>

            <label>
              Certificate
            </label>

            <textarea
              rows="4"
              name="cert"
              value={config.cert}
              onChange={handleChange}
            />

            <label>
              Private key
            </label>

            <textarea
              rows="4"
              name="key"
              value={config.key}
              onChange={handleChange}
            />

            <label>
              CA
            </label>

            <textarea
              rows="3"
              name="ca"
              value={config.ca}
              onChange={handleChange}
            />

          </>
        )}

      </div>

      {/* FOOTER */}

      <div className="cluster-config-footer">

        <div>

          {cluster && (

            <button
              className="delete-cluster-btn-danger"
              onClick={handleDelete}
            >

              <FiTrash2 />

              Delete

            </button>
          )}

        </div>

        <div className="cluster-config-footer-right">

          <button
            className="secondary-btn"
            onClick={onCancel}
          >

            Cancel

          </button>

          <button
            className="primary-btn"
            onClick={handleSubmit}
          >

            Save

          </button>

        </div>

      </div>

    </div>
  );
}