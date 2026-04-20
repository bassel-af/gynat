import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// E2E suite: talks to the real dev server + Mailpit. Kept separate from the
// mocked unit suite so CI / pre-commit can run `pnpm test` without requiring
// the docker stack.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['src/test/e2e/**/*.test.ts'],
    root: __dirname,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // E2E tests share state on the Mailpit server — run serially.
    fileParallelism: false,
  },
});
