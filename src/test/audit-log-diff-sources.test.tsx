/**
 * Sources R2 — the audit diff shows a source's people as a count, never the
 * raw person ids a shared-source snapshot now carries.
 */
import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AuditLogDiff } from '@/components/tree/AuditLog/AuditLogDiff';

describe('AuditLogDiff — shared source snapshots', () => {
  const before = { id: 's1', visibility: 'members', text: 'دفتر', personIds: ['p-aaa', 'p-bbb'], peopleCount: 2 };
  const after = { ...before, personIds: ['p-aaa', 'p-bbb', 'p-ccc'], peopleCount: 3 };

  test('the people count change is labelled «عدد الأشخاص»', () => {
    render(<AuditLogDiff before={before} after={after} />);
    expect(screen.getByText('عدد الأشخاص')).toBeTruthy();
  });

  test('person ids never reach the screen', () => {
    const { container } = render(<AuditLogDiff before={before} after={after} />);
    expect(container.textContent).not.toMatch(/p-ccc|personIds/);
  });
});
