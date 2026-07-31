import { vi } from 'vitest';

// Manual mock for backend/src/db/index.js — Vitest picks this up automatically
// whenever a test calls vi.mock('../db') (resolved relative to the test file).
// Mirrors the real module's two exports (`pool`, `query`) so every consumer —
// including CommonJS `require('../db')` callers such as jwt.js, auth.js, and
// config/passport.js — destructures successfully.
//
// This module must NEVER open a real socket and must NEVER schedule the
// `runMigrations` timer that the real backend/src/db/index.js runs at import
// time (see backend/src/db/index.js:45).

export const query = vi.fn();

export const pool = {
  on: vi.fn(),
  query: vi.fn(),
};
