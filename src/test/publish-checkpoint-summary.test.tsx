import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PublishCheckpoint } from '@/components/public-tree/PublishCheckpoint/PublishCheckpoint';
import type { PublishCheckpointData } from '@/components/public-tree/PublishCheckpoint/types';

// Substring of the count-summary banner that should be conditionally shown.
const SUMMARY_FRAGMENT = 'سيُعرض';

function renderCheckpoint(data: PublishCheckpointData) {
  return render(
    <PublishCheckpoint isOpen data={data} confirmPhrase="آل السعيد" onClose={() => {}} />,
  );
}

describe('PublishCheckpoint living-count summary', () => {
  test('shows the count summary when there are living people', () => {
    const data: PublishCheckpointData = {
      livingCount: 3,
      attention: [],
      households: [
        {
          id: 'h1',
          title: 'بيت أحمد',
          members: [
            { id: 'a', name: 'أحمد', gender: 'male', meta: 'وُلد ١٩٩٠' },
            { id: 'b', name: 'سارة', gender: 'female', meta: 'وُلد ١٩٩٢' },
            { id: 'c', name: 'علي', gender: 'male', meta: 'وُلد ٢٠١٠' },
          ],
        },
      ],
    };
    renderCheckpoint(data);
    expect(screen.queryByText(new RegExp(SUMMARY_FRAGMENT))).not.toBeNull();
  });

  test('hides the count summary entirely when the living count is 0', () => {
    const data: PublishCheckpointData = {
      livingCount: 0,
      attention: [],
      households: [],
    };
    renderCheckpoint(data);
    // The confusing "0 living people will be shown…" banner must not render.
    expect(screen.queryByText(new RegExp(SUMMARY_FRAGMENT))).toBeNull();
  });
});
