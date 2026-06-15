'use client';

import { useState } from 'react';
import type { GedcomData } from '@/lib/gedcom/types';
import type { CalendarPreference } from '@/lib/calendar-helpers';
import { PublicTreeViewer } from '@/components/public-tree';

export interface PublicTreePageClientProps {
  data: GedcomData;
  familyName: string;
  subtitle?: string;
  description?: string;
}

/**
 * Client wrapper for the public viewer: owns the visitor's calendar preference
 * (anonymous visitors persist it in localStorage only) and feeds the already-
 * redacted data to the read-only `PublicTreeViewer`. The crawlable text (h1,
 * description, names list) is server-rendered by the parent page; this only
 * adds the interactive canvas on top.
 */
export default function PublicTreePageClient({
  data,
  familyName,
  subtitle,
  description,
}: PublicTreePageClientProps) {
  const [calendar, setCalendar] = useState<CalendarPreference>('hijri');

  return (
    <PublicTreeViewer
      data={data}
      familyName={familyName}
      subtitle={subtitle}
      description={description}
      calendar={calendar}
      onCalendarChange={setCalendar}
    />
  );
}
