// Suite-wide environment setup for Vitest (see vitest.config.mjs `setupFiles`).
// Runs once before the whole suite so no test ever depends on a developer's
// real .env file. Several backend modules call `require('dotenv').config()`
// at import time — dotenv's default behavior never overwrites an env var
// that is already set, so setting these here (before any production module
// is imported) keeps these values stable for the entire run.

process.env.NODE_ENV = 'test';
// Test-only signing secret. Signs nothing that leaves the test process.
process.env.JWT_ACCESS_SECRET = 'test-only-jwt-access-secret-do-not-use-outside-tests';
// Deliberately empty: guarantees no test can accidentally resolve a real
// database host, even if a mock is missing somewhere in the import chain.
process.env.DATABASE_URL = '';
process.env.FRONTEND_URL = 'http://localhost:5173';

// --- CommonJS require('../db') interop shim --------------------------------
//
// `vi.mock('../db')` correctly intercepts a *test file's own* direct
// `import { query } from '../db'` (that import is resolved through Vite's SSR
// module graph). It does NOT intercept the nested `require('../db')` calls
// that production files (jwt.js, auth.js, config/passport.js, every
// controller, ...) issue internally — those files are plain CommonJS with no
// import/export syntax, so Vite loads them via Node's real, native
// `Module._load`, entirely outside Vite's module graph and outside
// vi.mock()'s reach. Verified empirically this session (printing
// `require.name` inside such a file shows Node's genuine native `require`,
// and both a folder-based __mocks__ redirect and an explicit vi.mock factory
// fail identically for the nested call — ruling out a mock-definition-side
// fix). This is a documented deviation from the plan's original "vi.mock
// alone is sufficient" assumption; see 01-01-SUMMARY.md.
//
// Fix: patch Node's Module._load directly so any require of the *real*
// db/index.js absolute path resolves to the exact same query/pool vi.fn()
// instances that backend/src/db/__mocks__/index.js exports (the same
// instances vi.mock('../db') already serves to direct importers). This
// keeps ONE mock object graph shared by both resolution paths, so
// query.mock.calls assertions see calls made from either side. Every other
// require (pg, express, jsonwebtoken, ...) falls through to Node's original
// loader untouched.
import Module from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { query, pool } from '../db/__mocks__/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const realDbPath = path.resolve(__dirname, '../db/index.js');

if (!Module._load.__gsdDbMockPatched) {
  const originalModuleLoad = Module._load;
  const patchedLoad = function (request, parent, isMain) {
    try {
      const resolved = Module._resolveFilename(request, parent, isMain);
      if (resolved === realDbPath) {
        return { query, pool };
      }
    } catch {
      // Resolution failed for reasons unrelated to our redirect target —
      // fall through to the original loader below.
    }
    return originalModuleLoad.apply(this, arguments);
  };
  patchedLoad.__gsdDbMockPatched = true;
  Module._load = patchedLoad;
}
