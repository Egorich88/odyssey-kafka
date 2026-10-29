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

        `Удалить кластер "${cluster.name}"?`
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

          <h2>
            Настройки кластера
          </h2>

        </div>

        <button
          className="modal-hide-btn"
          onClick={onCancel}
        >

          Скрыть

        </button>

      </div>

      <div className="cluster-config-body">

        {/* NAME */}

        <label>
          Название
        </label>

        <input
          name="name"
          placeholder="Введите название кластера"
          value={config.name || ''}
          onChange={handleChange}
        />

        {/* ZOOKEEPER */}

        <label>
          Zookeeper (host:port, через запятую)
        </label>

        <input
          name="zookeeper"
          placeholder="zookeeper1:2181,zookeeper2:2181"
          value={config.zookeeper || ''}
          onChange={handleChange}
        />

        {/* BROKERS */}

        <label>
          Брокеры (host:port, через запятую)
        </label>

        <input
          name="brokers"
          placeholder="kafka1:9092,kafka2:9092"
          value={config.brokers || ''}
          onChange={handleChange}
        />

        {/* AUTH */}

        <div className="auth-section-title">

          Аутентификация

        </div>

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

            <h4>
              PLAINTEXT (без аутентификации)
            </h4>

            <p>
              Доступ без логина и пароля.
              Только для локальной разработки.
            </p>

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

            <h4>
              SASL (логин/пароль)
            </h4>

            <p>
              Логин/пароль по TLS; доступен PLAIN и SCRAM.
            </p>

            <p>
              Для production предпочтительнее SCRAM-SHA-512 поверх TLS.
            </p>

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

            <label>Механизм SASL</label>
            <select name="saslMechanism" value={config.saslMechanism || 'PLAIN'} onChange={handleChange}>
              <option value="PLAIN">PLAIN (совместимость)</option>
              <option value="SCRAM-SHA-256">SCRAM-SHA-256</option>
              <option value="SCRAM-SHA-512">SCRAM-SHA-512 (рекомендуется)</option>
            </select>

            <label>CA-сертификат сервера (необязательно для системного CA)</label>
            <textarea rows="3" name="ca" placeholder="-----BEGIN CERTIFICATE-----" value={config.ca || ''} onChange={handleChange} />

          </div>
        )}

        {/* KERBEROS / GSSAPI */}
        <div
          className={`auth-card ${config.authType === 'SASL_GSSAPI' ? 'active' : ''}`}
          onClick={() => setConfig({ ...config, authType: 'SASL_GSSAPI' })}
        >
          <div className="auth-radio"><div className="auth-radio-dot" /></div>
          <div>
            <h4>Kerberos (GSSAPI)</h4>
            <p>Для корпоративной инфраструктуры с Kerberos/KDC.</p>
          </div>
        </div>

        {config.authType === 'SASL_GSSAPI' && (
          <div className="auth-fields">
            <input name="kerberosUsername" placeholder="Kerberos principal / username" value={config.kerberosUsername || ''} onChange={handleChange} />
            <input type="password" name="kerberosPassword" placeholder="Kerberos password" value={config.kerberosPassword || ''} onChange={handleChange} />
            <input name="kerberosRealm" placeholder="REALM.EXAMPLE.COM" value={config.kerberosRealm || ''} onChange={handleChange} />
            <input name="kerberosServiceName" placeholder="kafka" value={config.kerberosServiceName || 'kafka'} onChange={handleChange} />
            <input name="kerberosConfigPath" placeholder="/etc/krb5.conf (путь внутри backend-контейнера)" value={config.kerberosConfigPath || '/etc/krb5.conf'} onChange={handleChange} />
            <input name="kerberosKeytabPath" placeholder="Путь к keytab внутри backend-контейнера (необязательно)" value={config.kerberosKeytabPath || ''} onChange={handleChange} />
            <p>Путь должен существовать внутри backend-контейнера. Для production настройте SASL_SSL на брокере.</p>
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

            <h4>
              mTLS (взаимные сертификаты)
            </h4>

            <p>
              Клиент и сервер подтверждают
              личность цифровыми сертификатами.
            </p>

            <p>
              Самый безопасный метод,
              рекомендуется для production.
            </p>

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
        >

          Удалить кластер

        </button>

        <div className="cluster-config-footer-right">

          <button
            className="secondary-btn"
            onClick={onCancel}
          >

            Отмена

          </button>

          <button
            className="primary-btn"
            onClick={handleSubmit}
          >

            Сохранить изменения

          </button>

        </div>

      </div>

    </div>
  );
}