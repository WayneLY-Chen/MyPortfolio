import { defineConfig } from 'vitest/config';

// .mjs extension is required: backend/package.json has no "type": "module",
// so a .js config here would be parsed as CommonJS and fail to load.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
    setupFiles: ['./src/test/setup.js'],
    restoreMocks: true,
  },
});
