/*
 * Copyright 2026 Egor Khomenko (Egorich88)
 * Licensed under the Apache License, Version 2.0.
 */

/**
 * @file CertificatesPanel.tsx
 * @project Odyssey new 4.2.36
 * @description Панель отображения сертификатов Kafka.
 * @changes Убраны моковые данные и значок щита/фильтра в выпадающих фильтрах; данные берутся с API.
 */

/**
 * @file CertificatesPanel.tsx
 * Таблица сертификатов Kafka и связанных TLS-файлов.
 *
 * Refactor 4.2.35:
 * - фильтры сделаны частью заголовка в стиле Grafana;
 * - сортировка использует только react-icons;
 * - добавлены расположение, тип и Subject/Issuer (CN/SAN);
 * - статус срока действия визуально соответствует 30/7 дням.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { FiChevronDown, FiChevronUp, FiCheck } from 'react-icons/fi';
import PanelInfo from '../../../components/common/PanelInfo';
import PanelFullscreenButton from './PanelFullscreenButton';
import { useCluster } from '../../../contexts/ClusterContext';

interface Certificate {
  name: string;
  path: string;
  type: string;
  expiresAt: string;
  daysLeft: number;
  subject?: string;
  issuer?: string;
  commonName?: string;
  san?: string;
  error?: string;
}

interface ResponseData {
  count: number;
  nearestDays: number;
  certificates: Certificate[];
  available: boolean;
  message?: string;
}

type SortKey = 'name' | 'type' | 'expiresAt' | 'daysLeft' | 'path' | 'subject';
type ExpiryFilter = 'ALL' | 'OK' | 'WARNING' | 'CRITICAL';
type TypeFilter = 'ALL' | string;

function expiryStatus(days: number): 'ok' | 'warning' | 'critical' | 'neutral' {
  if (days < 0) return 'neutral';
  if (days < 7) return 'critical';
  if (days < 30) return 'warning';
  return 'ok';
}

function expiryLabel(days: number): string {
  if (days < 0) return '—';
  return `${days} дн.`;
}

function formatDate(value: string): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

export default function CertificatesPanel({ refreshKey }: { refreshKey: number }): JSX.Element {
  const { currentCluster } = useCluster();
  const [data, setData] = useState<ResponseData | null>(null);
  const [expiryFilter, setExpiryFilter] = useState<ExpiryFilter>('ALL');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('ALL');
  const [sortKey, setSortKey] = useState<SortKey>('daysLeft');
  const [sortAsc, setSortAsc] = useState(false);
  const [openFilter, setOpenFilter] = useState<'type' | 'expiry' | null>(null);
  // Общий контейнер обоих фильтров для определения клика снаружи.
  const filtersRef = useRef<HTMLDivElement | null>(null);

  // Закрываем любое из двух меню при клике за пределами фильтров.
  useEffect(() => {
    if (!openFilter) return;

    const handleOutsideClick = (event: MouseEvent) => {
      if (!filtersRef.current?.contains(event.target as Node)) {
        setOpenFilter(null);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [openFilter]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!currentCluster) return;
      try {
        const bootstrap = currentCluster.brokers || currentCluster.bootstrapServers;
        const response = await axios.get<ResponseData>('/api/overview/certificates', {
          headers: { 'X-Kafka-Bootstrap': bootstrap },
        });
        if (!cancelled) setData(response.data);
      } catch (error) {
        if (!cancelled) setData(null);
        console.warn('Не удалось получить сертификаты Kafka:', error);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [currentCluster?.id, currentCluster?.brokers, currentCluster?.bootstrapServers, refreshKey]);

  const realCertificates = data?.certificates ?? [];
  const certificates = realCertificates;
  const count = data?.count ?? 0;
  const nearest = data?.nearestDays ?? 0;

  const types = useMemo(() => Array.from(new Set(certificates.map((item) => item.type).filter(Boolean))).sort(), [certificates]);

  const filteredCertificates = useMemo(() => {
    const result = certificates.filter((certificate) => {
      const status = expiryStatus(certificate.daysLeft);
      const expiryMatch = expiryFilter === 'ALL' || (expiryFilter === 'OK' && status === 'ok') || (expiryFilter === 'WARNING' && status === 'warning') || (expiryFilter === 'CRITICAL' && status === 'critical');
      const typeMatch = typeFilter === 'ALL' || certificate.type === typeFilter;
      return expiryMatch && typeMatch;
    });

    result.sort((a, b) => {
      const av = sortKey === 'daysLeft' ? a.daysLeft : sortKey === 'expiresAt' ? new Date(a.expiresAt || 0).getTime() : String(a[sortKey] || '').toLowerCase();
      const bv = sortKey === 'daysLeft' ? b.daysLeft : sortKey === 'expiresAt' ? new Date(b.expiresAt || 0).getTime() : String(b[sortKey] || '').toLowerCase();
      if (av < bv) return sortAsc ? -1 : 1;
      if (av > bv) return sortAsc ? 1 : -1;
      return 0;
    });
    return result;
  }, [certificates, expiryFilter, typeFilter, sortKey, sortAsc]);

  const changeSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc((value) => !value);
    else { setSortKey(key); setSortAsc(true); }
  };

  const SortIcon = ({ column }: { column: SortKey }) => sortKey === column ? (sortAsc ? <FiChevronUp /> : <FiChevronDown />) : null;

  return (
    <div className="dashboard-panel certificate-panel">
      <div className="panel-header certificate-panel-header">
        <div className="panel-title-with-info">
          <PanelInfo
            title="Сертификаты Kafka"
            description="Список TLS-сертификатов и связанных хранилищ Kafka. Отображаются срок действия, расположение и данные Subject/Issuer, если их удалось прочитать."
          />
          <span>Сертификаты Kafka</span>
        </div>
        <div className="certificate-header-controls">
          <div className="certificate-summary-main"><strong>{count}</strong><span>сертификатов</span></div>
          <div className="certificate-summary-nearest">Ближайшее истечение: <strong>{nearest >= 0 ? `${nearest} дн.` : '—'}</strong></div>
          <div className="certificate-filters" ref={filtersRef}>
            <div className="certificate-filter-menu-wrap">
              <button type="button" className={`certificate-filter-trigger ${openFilter === 'type' ? 'is-open' : ''}`} aria-label="Выбрать тип сертификата" aria-expanded={openFilter === 'type'} onClick={() => setOpenFilter((value) => value === 'type' ? null : 'type')}><span>{typeFilter === 'ALL' ? 'Все типы' : typeFilter}</span><FiChevronDown /></button>
              {openFilter === 'type' && <div className="certificate-dropdown-menu" role="listbox" aria-label="Тип сертификата">
                {[['ALL', 'Все типы'], ...types.map((type) => [type, type])].map(([value, label]) => <button type="button" key={value} className={typeFilter === value ? 'selected' : ''} onClick={() => { setTypeFilter(value); setOpenFilter(null); }}><span>{label}</span>{typeFilter === value && <FiCheck />}</button>)}
              </div>}
            </div>
            <div className="certificate-filter-menu-wrap">
              <button type="button" className={`certificate-filter-trigger ${openFilter === 'expiry' ? 'is-open' : ''}`} aria-label="Выбрать срок действия" aria-expanded={openFilter === 'expiry'} onClick={() => setOpenFilter((value) => value === 'expiry' ? null : 'expiry')}><span>{({ ALL: 'Все сроки', OK: 'Более 30 дней', WARNING: 'Менее 30 дней', CRITICAL: 'Менее 7 дней' } as Record<ExpiryFilter, string>)[expiryFilter]}</span><FiChevronDown /></button>
              {openFilter === 'expiry' && <div className="certificate-dropdown-menu" role="listbox" aria-label="Статус срока действия">
                {([['ALL', 'Все сроки'], ['OK', 'Более 30 дней'], ['WARNING', 'Менее 30 дней'], ['CRITICAL', 'Менее 7 дней']] as [ExpiryFilter, string][]).map(([value, label]) => <button type="button" key={value} className={expiryFilter === value ? 'selected' : ''} onClick={() => { setExpiryFilter(value); setOpenFilter(null); }}><span>{label}</span>{expiryFilter === value && <FiCheck />}</button>)}
              </div>}
            </div>
          </div>
          <PanelFullscreenButton />
        </div>
      </div>

      <div className="certificate-panel-body">
        <div className="certificate-table-wrap">
          <div className="certificate-table">
            <div className="certificate-table-row header">
              <button type="button" onClick={() => changeSort('name')}>Сертификат <SortIcon column="name" /></button>
              <button type="button" onClick={() => changeSort('type')}>Тип</button>
              <button type="button" onClick={() => changeSort('expiresAt')}>Истекает <SortIcon column="expiresAt" /></button>
              <button type="button" onClick={() => changeSort('daysLeft')}>Осталось <SortIcon column="daysLeft" /></button>
              <button type="button" onClick={() => changeSort('path')}>Расположение</button>
              <button type="button" onClick={() => changeSort('subject')}>Subject / Issuer</button>
            </div>

            {filteredCertificates.length === 0 && (
              <div className="certificate-empty-state">
                {data?.message || (data ? 'Отсутствуют сертификаты' : 'Не получилось подключиться к сертификатам. Проверьте доступ к кластеру.')}
              </div>
            )}
            {filteredCertificates.map((certificate) => {
              const status = expiryStatus(certificate.daysLeft);
              return (
                <div className="certificate-table-row" key={`${certificate.name}-${certificate.path}`}>
                  <span title={certificate.name}>{certificate.name}</span>
                  <span title={certificate.type}>{certificate.type || '—'}</span>
                  <span className="certificate-expiry">{formatDate(certificate.expiresAt)}</span>
                  <span className={`certificate-days certificate-${status}`}>{expiryLabel(certificate.daysLeft)}</span>
                  <span className="certificate-location" title={certificate.error || certificate.path}>{certificate.error ? `Ошибка: ${certificate.error}` : (certificate.path || '—')}</span>
                  <span className="certificate-metadata" title={`${certificate.subject || '—'} / ${certificate.issuer || '—'}`}>
                    <strong>{certificate.commonName || certificate.subject || '—'}</strong>
                    <small>{certificate.issuer || '—'}{certificate.san && certificate.san !== '—' ? ` · ${certificate.san}` : ''}</small>
                  </span>
                </div>
              );
            })}

          </div>
        </div>
      </div>
    </div>
  );
}
