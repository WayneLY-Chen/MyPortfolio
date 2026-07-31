import { defineConfig } from 'vitest/config';

// .mjs extension is required: backend/package.json has no "type": "module",
// so a .js config here would be parsed as CommonJS and fail to load.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
    setupFiles: ['./src/test/setup.js'],
    // restoreMocks only restores vi.spyOn()-created mocks to their original
    // implementation — it is a no-op for standalone vi.fn() instances like
    // the query/pool mocks in db/__mocks__/index.js (verified empirically:
    // without mockReset, a vi.fn()'s call history accumulated across tests
    // in the same file). mockReset clears call history AND any queued
    // mockResolvedValueOnce/mockImplementation for every vi.fn() regardless
    // of how it was created, so each test starts from a clean slate.
    restoreMocks: true,
    mockReset: true,
  },
});
