'use client';

import { useState, useRef, useCallback, useMemo, useId } from 'react';
import type { GedcomData, Individual } from '@/lib/gedcom/types';
import { getDisplayNameWithNasab, DEFAULT_NASAB_DEPTH } from '@/lib/gedcom/display';
import { matchesSearch } from '@/lib/utils/search';
import styles from './IndividualPicker.module.css';

export interface IndividualPickerProps {
  value: string | null;
  onChange: (individualId: string | null) => void;
  data: GedcomData;
  label: string;
  placeholder?: string;
  exclude?: Set<string>;
  /** Filter results by sex ('M' or 'F'). Individuals with null/undefined sex are always included. */
  sexFilter?: 'M' | 'F';
}

const MAX_RESULTS = 30;

export function IndividualPicker({
  value,
  onChange,
  data,
  label,
  placeholder = 'ابحث عن شخص...',
  exclude,
  sexFilter,
}: IndividualPickerProps) {
  const individuals = data.individuals;
  const selectedPerson = value ? individuals[value] : null;
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listboxId = useId();

  const results = useMemo(() => {
    if (!query.trim()) return [];
    const matches: Individual[] = [];
    for (const person of Object.values(individuals)) {
      if (person.isPrivate) continue;
      if (exclude?.has(person.id)) continue;
      if (sexFilter && person.sex && person.sex !== sexFilter) continue;
      const name = getDisplayNameWithNasab(data, person, DEFAULT_NASAB_DEPTH);
      if (matchesSearch(name, query)) {
        matches.push(person);
        if (matches.length >= MAX_RESULTS) break;
      }
    }
    return matches;
  }, [query, data, exclude, sexFilter]);

  const selectPerson = useCallback(
    (id: string) => {
      onChange(id);
      setQuery('');
      setIsOpen(false);
      setHighlightedIndex(-1);
    },
    [onChange],
  );

  const handleClear = useCallback(() => {
    onChange(null);
    setQuery('');
    setIsOpen(false);
    setHighlightedIndex(-1);
  }, [onChange]);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setQuery(e.target.value);
      setHighlightedIndex(-1);
      if (!isOpen) setIsOpen(true);
    },
    [isOpen],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        setHighlightedIndex(-1);
        return;
      }

      if (!isOpen || results.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < results.length - 1 ? prev + 1 : prev,
        );
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : prev));
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < results.length) {
          selectPerson(results[highlightedIndex].id);
        }
      }
    },
    [isOpen, results, highlightedIndex, selectPerson],
  );

  const getBirthYear = (person: Individual): string => {
    const date = person.birth || person.birthHijriDate;
    if (!date) return '';
    const match = date.match(/\d{3,4}/);
    return match ? match[0] : '';
  };

  const showDropdown = isOpen && query.trim().length > 0;

  if (selectedPerson) {
    const name = getDisplayNameWithNasab(data, selectedPerson, DEFAULT_NASAB_DEPTH);
    const birthYear = getBirthYear(selectedPerson);
    return (
      <div className={styles.wrapper}>
        {label && <span className={styles.label}>{label}</span>}
        <div className={styles.selectedChip}>
          <span
            className={
              selectedPerson.sex === 'M'
                ? styles.sexIndicatorMale
                : selectedPerson.sex === 'F'
                  ? styles.sexIndicatorFemale
                  : styles.sexIndicatorUnknown
            }
          />
          <span className={styles.selectedName}>{name}</span>
          {birthYear && (
            <span className={styles.selectedYear}>{birthYear}</span>
          )}
          <button
            type="button"
            className={styles.clearButton}
            onClick={handleClear}
            aria-label="مسح"
          >
            <svg viewBox="0 0 16 16" fill="none" className={styles.clearIcon}>
              <path
                d="M12 4L4 12M4 4l8 8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      {label && (
        <label htmlFor={`${listboxId}-input`} className={styles.label}>
          {label}
        </label>
      )}
      <div className={styles.inputWrapper}>
        <input
          id={`${listboxId}-input`}
          ref={inputRef}
          role="combobox"
          aria-expanded={showDropdown ? 'true' : 'false'}
          aria-controls={listboxId}
          aria-activedescendant={
            highlightedIndex >= 0
              ? `${listboxId}-option-${highlightedIndex}`
              : undefined
          }
          aria-autocomplete="list"
          className={styles.input}
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (query.trim()) setIsOpen(true);
          }}
          onBlur={() => {
            blurTimerRef.current = setTimeout(() => setIsOpen(false), 200);
          }}
          placeholder={placeholder}
          autoComplete="off"
        />
        <svg viewBox="0 0 24 24" fill="none" className={styles.searchIcon}>
          <circle
            cx="11"
            cy="11"
            r="7"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path
            d="M20 20L16.5 16.5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </div>

      {showDropdown && (
        <div className={styles.dropdown}>
          <ul
            id={listboxId}
            role="listbox"
            className={styles.dropdownList}
            aria-label={label}
          >
            {results.length === 0 && (
              <li className={styles.stateItem}>لا توجد نتائج</li>
            )}
            {results.map((person, index) => {
              const name = getDisplayNameWithNasab(data, person, DEFAULT_NASAB_DEPTH);
              const birthYear = getBirthYear(person);
              return (
                <li
                  key={person.id}
                  id={`${listboxId}-option-${index}`}
                  role="option"
                  aria-selected={highlightedIndex === index}
                  className={[
                    styles.option,
                    highlightedIndex === index ? styles.optionHighlighted : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    selectPerson(person.id);
                  }}
                  onMouseEnter={() => setHighlightedIndex(index)}
                >
                  <span
                    className={
                      person.sex === 'M'
                        ? styles.sexIndicatorMale
                        : person.sex === 'F'
                          ? styles.sexIndicatorFemale
                          : styles.sexIndicatorUnknown
                    }
                  />
                  <span className={styles.optionName}>{name}</span>
                  {birthYear && (
                    <span className={styles.optionYear}>{birthYear}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
