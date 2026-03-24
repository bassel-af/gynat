'use client';
import { useState, useCallback, useEffect, createContext, useContext } from 'react';
import type { CalendarPreference } from '@/lib/calendar-helpers';
import { apiFetch } from '@/lib/api/client';

interface CalendarPreferenceContextValue {
  preference: CalendarPreference;
  setPreference: (val: CalendarPreference) => void;
}

export const CalendarPreferenceContext = createContext<CalendarPreferenceContextValue>({
  preference: 'hijri',
  setPreference: () => {},
});

export function useCalendarPreference() {
  return useContext(CalendarPreferenceContext);
}

export function useCalendarPreferenceState(): CalendarPreferenceContextValue {
  const [preference, setPreferenceState] = useState<CalendarPreference>(() => {
    if (typeof window === 'undefined') return 'hijri';
    return (localStorage.getItem('calendarPreference') as CalendarPreference) || 'hijri';
  });

  // Reconcile with server-side saved preference on mount
  useEffect(() => {
    let cancelled = false;

    apiFetch('/api/users/me/preferences')
      .then(async (res) => {
        if (cancelled || !res.ok) return;
        const body = await res.json();
        const serverPref = body?.data?.calendarPreference as CalendarPreference | undefined;
        if (serverPref && (serverPref === 'hijri' || serverPref === 'gregorian')) {
          setPreferenceState((current) => {
            if (current !== serverPref) {
              localStorage.setItem('calendarPreference', serverPref);
              return serverPref;
            }
            return current;
          });
        }
      })
      .catch(() => {
        // Not authenticated or network error — keep localStorage value
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const setPreference = useCallback((val: CalendarPreference) => {
    setPreferenceState(val);
    localStorage.setItem('calendarPreference', val);
    // Fire and forget API call
    fetch('/api/users/me/preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ calendarPreference: val }),
    }).catch(() => {});
  }, []);

  return { preference, setPreference };
}
