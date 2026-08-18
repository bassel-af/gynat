import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PublishCheckpoint } from '@/components/public-tree/PublishCheckpoint/PublishCheckpoint';
import type { PublishCheckpointData } from '@/components/public-tree/PublishCheckpoint/types';

function renderCheckpoint(data: PublishCheckpointData, onPublish = vi.fn()) {
  return render(
    <PublishCheckpoint
      isOpen
      data={data}
      confirmPhrase="آل السعيد"
      onClose={() => {}}
      onPublish={onPublish}
    />,
  );
}

describe('PublishCheckpoint (simplified confirm-only step)', () => {
  test('the publish button is enabled immediately, regardless of living count', () => {
    const onPublish = vi.fn();
    const data: PublishCheckpointData = {
      livingCount: 3,
      attention: [],
      households: [
        {
          id: 'h1',
          title: 'بيت أحمد',
          members: [{ id: 'a', name: 'أحمد', gender: 'male', meta: 'وُلد ١٩٩٠' }],
        },
      ],
    };
    renderCheckpoint(data, onPublish);
    const button = screen.getByRole('button', { name: /نشر الشجرة/ });
    expect(button).not.toBeDisabled();
    fireEvent.click(button);
    expect(onPublish).toHaveBeenCalledTimes(1);
  });

  test('never renders the living-people review list (count/search/person chips) or the type-to-confirm field', () => {
    const data: PublishCheckpointData = {
      livingCount: 3,
      attention: [{ id: 'x', name: 'خالد', gender: 'male', meta: 'يحتاج انتباها', needsAttention: true }],
      households: [
        {
          id: 'h1',
          title: 'بيت أحمد',
          members: [{ id: 'a', name: 'أحمد', gender: 'male', meta: 'وُلد ١٩٩٠' }],
        },
      ],
    };
    renderCheckpoint(data);
    expect(screen.queryByText('أحمد')).toBeNull();
    expect(screen.queryByText('خالد')).toBeNull();
    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});
