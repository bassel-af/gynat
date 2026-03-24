'use client';

import { TreeProvider } from '@/context/TreeContext';
import { CalendarPreferenceContext, useCalendarPreferenceState } from '@/hooks/useCalendarPreference';

interface ProvidersProps {
  children: React.ReactNode;
  forcedRootId?: string;
}

export function Providers({ children, forcedRootId }: ProvidersProps) {
  const calendarPref = useCalendarPreferenceState();

  return (
    <CalendarPreferenceContext.Provider value={calendarPref}>
      <TreeProvider forcedRootId={forcedRootId}>{children}</TreeProvider>
    </CalendarPreferenceContext.Provider>
  );
}
