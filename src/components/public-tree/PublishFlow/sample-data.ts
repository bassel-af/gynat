/**
 * STATIC placeholder data for the clickable publish flow.
 *
 * This is illustrative demo content so the journey is walkable end-to-end on the
 * real tree page WITHOUT any backend. The TDD phase replaces this with the
 * server-computed living-people view model (see PublishCheckpoint/types.ts).
 * NOT real data.
 */

import type { PublishCheckpointData } from '../PublishCheckpoint';

export const SAMPLE_CHECKPOINT_DATA: PublishCheckpointData = {
  livingCount: 47,
  attention: [
    { id: 'a1', name: 'سامي السعيد', gender: 'male', meta: 'بلا تاريخ ميلاد · بلا علامة وفاة', needsAttention: true },
    { id: 'a2', name: 'هدى السعيد', gender: 'female', meta: 'بلا تاريخ ميلاد · بلا علامة وفاة', needsAttention: true },
  ],
  households: [
    {
      id: 'h1',
      title: 'بيت أحمد السعيد',
      members: [
        { id: 'h1a', name: 'يوسف بن أحمد', gender: 'male', meta: 'وُلد ١٩٧٢' },
        { id: 'h1b', name: 'ليلى بنت أحمد', gender: 'female', meta: 'وُلدت ١٩٧٥' },
        { id: 'h1c', name: 'رنا بنت أحمد', gender: 'female', meta: 'وُلدت ١٩٨٠' },
      ],
    },
    {
      id: 'h2',
      title: 'بيت خالد السعيد',
      members: [
        { id: 'h2a', name: 'عمر بن خالد', gender: 'male', meta: 'وُلد ١٩٧٨' },
        { id: 'h2b', name: 'مريم بنت خالد', gender: 'female', meta: 'وُلدت ١٩٨٢' },
      ],
    },
  ],
};
