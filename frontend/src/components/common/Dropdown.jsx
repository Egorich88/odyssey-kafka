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

import { useState, useEffect, useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { FiChevronDown, FiChevronUp, FiSearch, FiCheck } from 'react-icons/fi';
import '../../styles/dropdown.css';
import useDropdownPosition from '../../hooks/useDropdownPosition';

/**
 * Универсальный выпадающий список.
 * @param {Object} props
 * @param {Object} props.selectedItem - выбранный элемент (должен иметь поля id и name)
 * @param {Array} props.items - массив элементов для отображения
 * @param {Function} props.onSelect - колбэк при выборе
 * @param {string} props.addLabel - текст кнопки «Добавить»
 * @param {Function} props.onAdd - колбэк для добавления
 * @param {Function} props.statusResolver - функция для получения статуса (цвет точки)
 * @param {boolean} props.searchable - включить поиск по элементам
 */
export default function Dropdown({
  selectedItem,
  items,
  onSelect,
  addLabel,
  onAdd,
  statusResolver,
  searchable = false,
  floating = false,
  connections = false
}) {
  const { t } = useTranslation();
  const menuId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef(null);
  const menuRef = useRef(null);
  const pendingFocus = useRef(null);
  const menuStyle = useDropdownPosition(isOpen, dropdownRef, menuRef, floating, 240);

  // Фильтрация элементов по поисковому запросу
  const filteredItems = searchable && searchTerm
    ? items.filter(item => String(item.name || '').toLowerCase().includes(searchTerm.toLowerCase()))
    : items;

  // Закрытие при клике вне
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Очистка поиска при закрытии
  useEffect(() => {
    if (!isOpen) {
      setSearchTerm('');
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !pendingFocus.current) return;
    const buttons = menuRef.current?.querySelectorAll('button') || [];
    const index = pendingFocus.current === 'last' ? buttons.length - 1 : 0;
    buttons?.[index]?.focus();
    pendingFocus.current = null;
  }, [isOpen]);

  const focusTrigger = () => dropdownRef.current?.querySelector('.dropdown-selected')?.focus();
  const connectionLabel = (item) => {
    // Показываем только известные виды подключения, без произвольных полей профиля.
    const auth = String(item.authType || 'PLAINTEXT');
    if (auth === 'MTLS') return 'mTLS';
    if (['SASL', 'SASL_PLAIN', 'SASL_SCRAM'].includes(auth)) return 'SASL';
    return ['PLAINTEXT', 'TLS', 'SSL', 'SASL_SSL', 'SASL_PLAINTEXT'].includes(auth)
      ? auth : t('connectionsMenu.connection');
  };

  const handleSelect = (item) => {
    onSelect(item);
    setIsOpen(false);
    setSearchTerm('');
    focusTrigger();
  };

  return (
    <div className={`dropdown-wrapper ${floating ? 'dropdown-floating' : ''} ${connections ? 'dropdown-connections' : ''}`} ref={dropdownRef}
      onKeyDown={event => {
        if (event.key === 'Escape' && isOpen) {
          event.stopPropagation();
          setIsOpen(false);
          focusTrigger();
        } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) && event.target.tagName !== 'INPUT') {
          event.preventDefault();
          const last = event.key === 'ArrowUp' || event.key === 'End';
          if (!isOpen) {
            pendingFocus.current = last ? 'last' : 'first';
            setIsOpen(true);
            return;
          }
          const buttons = [...(menuRef.current?.querySelectorAll('button') || [])];
          if (!buttons.length) return;
          const index = buttons.indexOf(document.activeElement);
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
            : (index + (event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length;
          buttons[next]?.focus();
        }
      }}>
      <button
        type="button"
        className={`dropdown-selected ${isOpen ? 'open' : ''}`}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-controls={isOpen ? menuId : undefined}
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="dropdown-selected-left">
          {statusResolver && (
            <div className={`dropdown-status-dot ${statusResolver(selectedItem)}`} />
          )}
          <span className="dropdown-selected-name">{selectedItem.name}</span>
        </div>
        <div className="dropdown-chevron">
          {isOpen ? <FiChevronUp /> : <FiChevronDown />}
        </div>
      </button>

      {isOpen && (
        <div className="dropdown-menu" id={menuId} role="menu" aria-label={selectedItem.name} ref={menuRef} style={menuStyle}>
          {/* Поле поиска (если включено) */}
          {searchable && (
            <div className="dropdown-search">
              <FiSearch className="dropdown-search-icon" />
              <input
                type="text"
                className="dropdown-search-input"
                placeholder={t('connectionsMenu.search')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          )}

          <div className="dropdown-list">
            {filteredItems.map(item => (
              <button
                type="button"
                key={item.id}
                role="menuitemradio"
                aria-checked={item.id === selectedItem.id}
                className={`dropdown-item ${item.id === selectedItem.id ? 'selected' : ''}`}
                onClick={() => handleSelect(item)}
              >
                {statusResolver && (
                  <div className={`dropdown-status-dot ${statusResolver(item)}`} />
                )}
                <span className="dropdown-item-copy"><span>{item.name}</span>
                  {connections && <small>{connectionLabel(item)}</small>}
                </span>
                {item.id === selectedItem.id && <span className="dropdown-item-active"><FiCheck aria-hidden="true" />
                  {connections && <span>{t('connectionsMenu.active')}</span>}
                </span>}
              </button>
            ))}
            {filteredItems.length === 0 && (
              <div className="dropdown-item disabled">{t('connectionsMenu.empty')}</div>
            )}
          </div>

          {onAdd && addLabel && (
            <button type="button" role="menuitem" className="dropdown-add" onClick={() => { setIsOpen(false); focusTrigger(); onAdd(); }}>
              {addLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
