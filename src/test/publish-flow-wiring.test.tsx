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

// Walk: choose 'link' -> continue -> checkpoint -> type phrase -> publish.
async function proceedToPublish() {
  // Select the by-link level radio (the ladder renders the levels).
  fireEvent.click(screen.getByText(/عامة عبر الرابط/));
  fireEvent.click(screen.getByText('متابعة'));
  // Now on checkpoint: type the family name into the confirm input.
  const input = await screen.findByPlaceholderText(FAMILY);
  fireEvent.change(input, { target: { value: FAMILY } });
}

describe('PublishFlow real-action wiring', () => {
  test('calls onPublishConfirm with the chosen level and phrase, then shows success', async () => {
    const onPublishConfirm = vi.fn().mockResolvedValue(undefined);
    renderFlow({ onPublishConfirm });

    await proceedToPublish();
    // The publish button becomes enabled once the phrase matches.
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
    // Still on the checkpoint — the confirm input is still present, no success link.
    expect(screen.queryByText(/https:\/\/gynat\.com\/family\/x/)).toBeNull();
    expect(screen.getByPlaceholderText(FAMILY)).toBeTruthy();
  });
});
