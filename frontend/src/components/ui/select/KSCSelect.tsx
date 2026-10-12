/*
 * Copyright 2026 Egor Khomenko (Egorich88)
 *
 * Licensed under the Apache License, Version 2.0
 */

/**
 * =============================================================================
 * KSCSelect.tsx
 * =============================================================================
 *
 * Единый выпадающий список Odyssey.
 *
 * Используется во всех страницах проекта.
 *
 * Подходит для:
 *
 * • фильтрации;
 * • сортировки;
 * • выбора периода;
 * • выбора режима;
 * • выбора статуса.
 *
 * НЕ используется для больших списков
 * (Cluster, Topic и т.п. — для них будет KSCSearchSelect).
 *
 * =============================================================================
 */
import './ksc-select.css';
import { FiChevronDown } from "react-icons/fi";

interface Option {

    value: string;

    label: string;

}

interface Props {

    label: string;

    value: string;

    options: Option[];

    onChange: (value: string) => void;

}

export default function KSCSelect({

    label,

    value,

    options,

    onChange

}: Props) {

    return (

        <div className="ksc-select">

            <span className="ksc-select-label">

                {label}

            </span>

            <select

                value={value}

                onChange={(e) => onChange(e.target.value)}

                className="ksc-select-input"

            >

                {options.map(option => (

                    <option

                        key={option.value}

                        value={option.value}

                    >

                        {option.label}

                    </option>

                ))}

            </select>

            <FiChevronDown className="ksc-select-icon" />

        </div>

    );

}