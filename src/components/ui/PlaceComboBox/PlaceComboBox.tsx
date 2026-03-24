'use client';

import { useState, useRef, useCallback, useEffect, useId } from 'react';
import { apiFetch } from '@/lib/api/client';
import styles from './PlaceComboBox.module.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PlaceResult {
  id: string;
  nameAr: string;
  nameEn: string | null;
  parentNameAr: string | null;
  fullPath: string;
}

export interface PlaceComboBoxProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  workspaceId: string;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
}

type Mode = 'search' | 'pickParent';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PlaceComboBox({
  id,
  label,
  value,
  onChange,
  workspaceId,
  placeholder,
  disabled = false,
  error,
}: PlaceComboBoxProps) {
  const [inputValue, setInputValue] = useState(value);
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  // Parent-picker state
  const [mode, setMode] = useState<Mode>('search');
  const [pendingName, setPendingName] = useState('');
  const [parentQuery, setParentQuery] = useState('');
  const [parentResults, setParentResults] = useState<PlaceResult[]>([]);
  const [isParentLoading, setIsParentLoading] = useState(false);
  const [parentHighlightedIndex, setParentHighlightedIndex] = useState(-1);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const parentDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const parentInputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();

  // Sync inputValue when value prop changes externally
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  // -------------------------------------------------------------------------
  // Search (main place search)
  // -------------------------------------------------------------------------

  const search = useCallback(
    async (query: string) => {
      if (!query.trim()) {
        setResults([]);
        setIsOpen(false);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setIsOpen(true);

      try {
        const res = await apiFetch(
          `/api/workspaces/${workspaceId}/places?q=${encodeURIComponent(query)}`,
        );
        if (res.ok) {
          const json = await res.json();
          setResults(json.data);
        } else {
          setResults([]);
        }
      } catch {
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    },
    [workspaceId],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      setInputValue(newValue);
      setHighlightedIndex(-1);

      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      debounceRef.current = setTimeout(() => {
        search(newValue);
      }, 250);
    },
    [search],
  );

  // -------------------------------------------------------------------------
  // Parent search
  // -------------------------------------------------------------------------

  const searchParent = useCallback(
    async (query: string) => {
      if (!query.trim()) {
        setParentResults([]);
        setIsParentLoading(false);
        return;
      }

      setIsParentLoading(true);

      try {
        const res = await apiFetch(
          `/api/workspaces/${workspaceId}/places?q=${encodeURIComponent(query)}`,
        );
        if (res.ok) {
          const json = await res.json();
          setParentResults(json.data);
        } else {
          setParentResults([]);
        }
      } catch {
        setParentResults([]);
      } finally {
        setIsParentLoading(false);
      }
    },
    [workspaceId],
  );

  const handleParentQueryChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      setParentQuery(newValue);
      setParentHighlightedIndex(-1);

      if (parentDebounceRef.current) {
        clearTimeout(parentDebounceRef.current);
      }

      parentDebounceRef.current = setTimeout(() => {
        searchParent(newValue);
      }, 250);
    },
    [searchParent],
  );

  // -------------------------------------------------------------------------
  // Selection
  // -------------------------------------------------------------------------

  const selectPlace = useCallback(
    (nameAr: string) => {
      onChange(nameAr);
      setInputValue(nameAr);
      setIsOpen(false);
      setResults([]);
      setHighlightedIndex(-1);
      setMode('search');
    },
    [onChange],
  );

  const finishCreate = useCallback(
    async (nameAr: string, parentId?: string) => {
      onChange(nameAr);
      setInputValue(nameAr);
      setIsOpen(false);
      setResults([]);
      setHighlightedIndex(-1);
      setMode('search');
      setPendingName('');
      setParentQuery('');
      setParentResults([]);
      setParentHighlightedIndex(-1);

      try {
        await apiFetch(`/api/workspaces/${workspaceId}/places`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nameAr, parentId }),
        });
      } catch {
        // Place still works as a string value even if DB save fails
      }
    },
    [onChange, workspaceId],
  );

  const startPickParent = useCallback((nameAr: string) => {
    setPendingName(nameAr);
    setParentQuery('');
    setParentResults([]);
    setParentHighlightedIndex(-1);
    setMode('pickParent');
    // Focus the parent search input after render
    setTimeout(() => parentInputRef.current?.focus(), 0);
  }, []);

  const handleClear = useCallback(() => {
    onChange('');
    setInputValue('');
    setIsOpen(false);
    setResults([]);
    setMode('search');
  }, [onChange]);

  const closeDropdown = useCallback(() => {
    setIsOpen(false);
    setMode('search');
    setPendingName('');
    setParentQuery('');
    setParentResults([]);
    setHighlightedIndex(-1);
    setParentHighlightedIndex(-1);
  }, []);

  // -------------------------------------------------------------------------
  // Keyboard navigation
  // -------------------------------------------------------------------------

  // Build items list: results + possibly the "create" option
  const hasExactMatch = results.some(
    (r) => r.nameAr === inputValue.trim(),
  );
  const showCreate = inputValue.trim() && !hasExactMatch;
  const totalItems = results.length + (showCreate ? 1 : 0);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        closeDropdown();
        return;
      }

      if (!isOpen) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < totalItems - 1 ? prev + 1 : prev,
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
          selectPlace(results[highlightedIndex].nameAr);
        } else if (
          highlightedIndex === results.length &&
          showCreate
        ) {
          startPickParent(inputValue.trim());
        }
      }
    },
    [isOpen, totalItems, highlightedIndex, results, selectPlace, startPickParent, showCreate, inputValue, closeDropdown],
  );

  // Parent picker keyboard nav
  const parentTotalItems = parentResults.length + 1; // +1 for "skip" option

  const handleParentKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        closeDropdown();
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setParentHighlightedIndex((prev) =>
          prev < parentTotalItems - 1 ? prev + 1 : prev,
        );
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setParentHighlightedIndex((prev) => (prev > 0 ? prev - 1 : prev));
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        if (parentHighlightedIndex >= 0 && parentHighlightedIndex < parentResults.length) {
          finishCreate(pendingName, parentResults[parentHighlightedIndex].id);
        } else if (parentHighlightedIndex === parentResults.length) {
          // "Skip" option
          finishCreate(pendingName);
        }
      }
    },
    [parentTotalItems, parentHighlightedIndex, parentResults, finishCreate, pendingName, closeDropdown],
  );

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const inputClassName = [
    styles.input,
    error ? styles.inputError : '',
  ]
    .filter(Boolean)
    .join(' ');

  const showDropdown = isOpen && (mode === 'pickParent' || isLoading || results.length > 0 || inputValue.trim());

  return (
    <div className={styles.wrapper}>
      {label && (
        <label htmlFor={id} className={styles.label}>
          {label}
        </label>
      )}
      <div className={styles.inputWrapper}>
        <input
          id={id}
          role="combobox"
          aria-expanded={isOpen && showDropdown ? 'true' : 'false'}
          aria-controls={listboxId}
          aria-activedescendant={
            mode === 'search' && highlightedIndex >= 0
              ? `${listboxId}-option-${highlightedIndex}`
              : undefined
          }
          aria-autocomplete="list"
          className={inputClassName}
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            // If user re-focuses and mode is pickParent, reset to search
            if (mode === 'pickParent') {
              setMode('search');
            }
          }}
          onBlur={() => {
            // Delay close to allow click events on dropdown items
            if (mode === 'search') {
              setTimeout(() => closeDropdown(), 200);
            }
          }}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
        />
        {value && !disabled && (
          <button
            type="button"
            className={styles.clearButton}
            onClick={handleClear}
            aria-label="مسح"
            tabIndex={-1}
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
        )}
        <svg viewBox="0 0 16 16" fill="none" className={styles.locationIcon}>
          <path
            d="M8 1.5C5.5 1.5 3.5 3.5 3.5 6C3.5 9.5 8 14.5 8 14.5S12.5 9.5 12.5 6C12.5 3.5 10.5 1.5 8 1.5Z"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="8" cy="6" r="1.5" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      </div>

      {showDropdown && (
        <div className={styles.dropdown}>
          {mode === 'search' && (
            <ul
              id={listboxId}
              role="listbox"
              className={styles.dropdownList}
              aria-label={label}
            >
              {isLoading && (
                <li className={styles.stateItem}>جارٍ البحث...</li>
              )}

              {!isLoading && results.length === 0 && inputValue.trim() && (
                <li className={styles.stateItem}>لا توجد نتائج</li>
              )}

              {!isLoading &&
                results.map((place, index) => (
                  <li
                    key={place.id}
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
                      e.preventDefault(); // prevent blur
                      selectPlace(place.nameAr);
                    }}
                    onMouseEnter={() => setHighlightedIndex(index)}
                  >
                    <span className={styles.optionPrimary}>
                      <span>{place.nameAr}</span>
                      {place.nameEn && (
                        <span className={styles.optionEn}> — {place.nameEn}</span>
                      )}
                    </span>
                    {place.parentNameAr && (
                      <span className={styles.optionSecondary}>
                        {place.parentNameAr}
                      </span>
                    )}
                  </li>
                ))}

              {!isLoading && showCreate && (
                <li
                  id={`${listboxId}-option-${results.length}`}
                  role="option"
                  aria-selected={highlightedIndex === results.length}
                  className={[
                    styles.option,
                    styles.optionCreate,
                    highlightedIndex === results.length ? styles.optionHighlighted : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    startPickParent(inputValue.trim());
                  }}
                  onMouseEnter={() => setHighlightedIndex(results.length)}
                >
                  + إضافة &quot;{inputValue.trim()}&quot;
                </li>
              )}
            </ul>
          )}

          {mode === 'pickParent' && (
            <div
              className={styles.parentPicker}
              onMouseDown={(e) => e.preventDefault()}
            >
              <div className={styles.parentPickerHeader}>
                إضافة &quot;{pendingName}&quot;
              </div>
              <div className={styles.parentPickerLabel}>
                في أي دولة أو منطقة؟
              </div>
              <input
                ref={parentInputRef}
                className={styles.parentInput}
                value={parentQuery}
                onChange={handleParentQueryChange}
                onKeyDown={handleParentKeyDown}
                placeholder="ابحث عن دولة أو منطقة..."
                autoComplete="off"
              />
              <ul className={styles.dropdownList} role="listbox">
                {isParentLoading && (
                  <li className={styles.stateItem}>جارٍ البحث...</li>
                )}

                {!isParentLoading &&
                  parentResults.map((place, index) => (
                    <li
                      key={place.id}
                      role="option"
                      aria-selected={parentHighlightedIndex === index}
                      className={[
                        styles.option,
                        parentHighlightedIndex === index ? styles.optionHighlighted : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        finishCreate(pendingName, place.id);
                      }}
                      onMouseEnter={() => setParentHighlightedIndex(index)}
                    >
                      <span className={styles.optionPrimary}>
                        <span>{place.nameAr}</span>
                        {place.nameEn && (
                          <span className={styles.optionEn}> — {place.nameEn}</span>
                        )}
                      </span>
                      {place.parentNameAr && (
                        <span className={styles.optionSecondary}>
                          {place.parentNameAr}
                        </span>
                      )}
                    </li>
                  ))}

                <li
                  role="option"
                  aria-selected={parentHighlightedIndex === parentResults.length}
                  className={[
                    styles.option,
                    styles.optionSkip,
                    parentHighlightedIndex === parentResults.length ? styles.optionHighlighted : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    finishCreate(pendingName);
                  }}
                  onMouseEnter={() => setParentHighlightedIndex(parentResults.length)}
                >
                  إضافة بدون تحديد موقع ←
                </li>
              </ul>
            </div>
          )}
        </div>
      )}

      {error && <span className={styles.errorMessage}>{error}</span>}
    </div>
  );
}
