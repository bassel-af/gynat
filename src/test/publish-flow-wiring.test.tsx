import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PublishFlow } from '@/components/public-tree/PublishFlow/PublishFlow';
import type { PublishCheckpointData } from '@/components/public-tree/PublishCheckpoint/types';

const EMPTY_CHECKPOINT: PublishCheckpointData = {
  livingCount: 0,
  attention: [],
  households: [],
};

const FAMILY = 'آل السعيد';

function renderFlow(overrides: Partial<Parameters<typeof PublishFlow>[0]> = {}) {
  return render(
    <PublishFlow
      isOpen
      onClose={overrides.onClose ?? vi.fn()}
      familyName={FAMILY}
      currentLevel="private"
      checkpointData={EMPTY_CHECKPOINT}
      shareUrl="https://gynat.com/family/x"
      {...overrides}
    />,
  );
}

// Walk: choose 'link' -> continue -> checkpoint (no confirm input to fill anymore).
async function proceedToPublish() {
  // Select the by-link level radio (the ladder renders the levels).
  fireEvent.click(screen.getByText(/عامة عبر الرابط/));
  fireEvent.click(screen.getByText('متابعة'));
  // Now on the checkpoint — wait for it to mount before clicking publish.
  await screen.findByText('تأكيد النشر');
}

describe('PublishFlow real-action wiring', () => {
  test('calls onPublishConfirm with the chosen level and phrase, then shows success', async () => {
    const onPublishConfirm = vi.fn().mockResolvedValue(undefined);
    renderFlow({ onPublishConfirm });

    await proceedToPublish();
    fireEvent.click(screen.getByRole('button', { name: /نشر/ }));

    await waitFor(() => expect(onPublishConfirm).toHaveBeenCalledTimes(1));
    expect(onPublishConfirm).toHaveBeenCalledWith('link', FAMILY);
    // Success screen appears (share link is shown).
    await screen.findByText(/https:\/\/gynat\.com\/family\/x/);
  });

  test('a rejected publish keeps the user on the checkpoint (no success)', async () => {
    const onPublishConfirm = vi.fn().mockRejectedValue(new Error('عبارة التأكيد غير صحيحة'));
    renderFlow({ onPublishConfirm });

    await proceedToPublish();
    fireEvent.click(screen.getByRole('button', { name: /نشر/ }));

    await waitFor(() => expect(onPublishConfirm).toHaveBeenCalled());
    // Still on the checkpoint — no success link, the publish button is still there.
    expect(screen.queryByText(/https:\/\/gynat\.com\/family\/x/)).toBeNull();
    expect(screen.getByRole('button', { name: /نشر/ })).toBeTruthy();
  });

  // The person-pages opt-in is owned by the container; the flow only carries the
  // value down to the ladder and the intent back up.
  test('forwards the person-pages opt-in from the ladder to the caller', () => {
    const onPersonPagesIndexableChange = vi.fn();
    renderFlow({ onPersonPagesIndexableChange });

    fireEvent.click(screen.getByText(/عامة وتظهر في محركات البحث/));
    fireEvent.click(screen.getByRole('checkbox', { name: /صفحة لكل فرد في نتائج البحث/ }));

    expect(onPersonPagesIndexableChange).toHaveBeenCalledWith(true);
  });

  test('shows the opt-in as already enabled when the tree has it on', () => {
    renderFlow({ personPagesIndexable: true });

    fireEvent.click(screen.getByText(/عامة وتظهر في محركات البحث/));
    const box = screen.getByRole('checkbox', { name: /صفحة لكل فرد في نتائج البحث/ }) as HTMLInputElement;

    expect(box.checked).toBe(true);
  });
});
