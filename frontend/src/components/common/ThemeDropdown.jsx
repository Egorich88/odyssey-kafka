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

/**
 * Специализированный dropdown для выбора темы.
 *
 * Не изменяет универсальный Dropdown, потому что меню тем
 * имеет собственную UX-логику:
 * - выбранный пункт остаётся в списке;
 * - выбранный пункт отмечается галочкой;
 * - между наборами тем есть тонкие разделители;
 * - ширина меню определяется содержимым, а не шириной карточки.
 */

import { useEffect, useRef, useState } from 'react';
import { FiCheck, FiChevronDown, FiChevronUp } from 'react-icons/fi';
import '../../styles/theme-dropdown.css';
import useDropdownPosition from '../../hooks/useDropdownPosition';

export default function ThemeDropdown({
  selectedItem,
  items,
  onSelect
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  const menuRef = useRef(null);
  const menuStyle = useDropdownPosition(isOpen, dropdownRef, menuRef);

  // Закрытие меню при клике за его пределами.
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleSelect = (item) => {
    onSelect(item);
    setIsOpen(false);
  };

  return (
    <div
      className="theme-dropdown"
      ref={dropdownRef}
      onKeyDown={event => {
        if (event.key === 'Escape' && isOpen) {
          event.stopPropagation();
          setIsOpen(false);
          dropdownRef.current?.querySelector('button')?.focus();
        }
      }}
    >
      <button
        type="button"
        className={`theme-dropdown-selected ${isOpen ? 'open' : ''}`}
        onClick={() => setIsOpen(value => !value)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="theme-dropdown-selected-name">
          {selectedItem.name}
        </span>

        <span className="theme-dropdown-chevron">
          {isOpen ? <FiChevronUp /> : <FiChevronDown />}
        </span>
      </button>

      {isOpen && (
        <div
          className="theme-dropdown-menu"
          ref={menuRef}
          style={menuStyle}
          role="listbox"
          aria-label="Themes"
        >
          {items.map((item, index) => {
            // Визуальный разделитель между наборами тем.
            if (item.type === 'divider') {
              return (
                <div
                  key={`theme-divider-${index}`}
                  className="theme-dropdown-divider"
                  role="separator"
                />
              );
            }

            const isSelected = item.id === selectedItem.id;

            return (
              <button
                type="button"
                key={item.id}
                className={`theme-dropdown-item ${
                  isSelected ? 'selected' : ''
                }`}
                onClick={() => handleSelect(item)}
                role="option"
                aria-selected={isSelected}
              >
                <span className="theme-dropdown-item-name">
                  {item.name}
                </span>

                {/* Галочка показывает, где пользователь находится сейчас. */}
                <span className="theme-dropdown-check">
                  {isSelected && <FiCheck />}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
