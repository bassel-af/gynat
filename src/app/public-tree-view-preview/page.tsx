'use client';

/**
 * Full-page preview of the read-only PublicTreeViewer, fed by a static redacted
 * sample tree. This is a dev harness so the owner can see the actual public
 * viewer at full size — NOT the live dynamic public route (no data fetching).
 * Dev-only: noindex + production notFound() guard in layout.tsx.
 */

import { useState } from 'react';
import type { CalendarPreference } from '@/lib/calendar-helpers';
import { PublicTreeViewer } from '@/components/public-tree';
import { SAMPLE_PUBLIC_TREE } from '@/components/public-tree/PublicTreeViewer/sample-tree';

export default function PublicTreeViewPreviewPage() {
  const [calendar, setCalendar] = useState<CalendarPreference>('hijri');

  return (
    <PublicTreeViewer
      data={SAMPLE_PUBLIC_TREE}
      familyName="عائلة السعيد"
      subtitle="حلب · ٦ أجيال موثّقة"
      description="عائلةٌ حلبيّة الأصل استقرّ جدُّها الأوّل في دمشق مطلع القرن العشرين."
      calendar={calendar}
      onCalendarChange={setCalendar}
    />
  );
}
