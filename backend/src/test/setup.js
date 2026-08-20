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
// Fix: patch Node's Module._load directly so any require of a *real*
// production file's absolute path resolves to the exact same vi.fn()
// instances its corresponding backend/src/**/__mocks__/*.js exports (the
// same instances vi.mock(...) already serves to direct importers). This
// keeps ONE mock object graph shared by both resolution paths, so
// `*.mock.calls` assertions see calls made from either side. Every other
// require (pg, express, jsonwebtoken, axios, ...) falls through to Node's
// original loader untouched.
//
// Redirect list: extend this array whenever a new test needs to mock a
// dependency of a plain-CommonJS production file (per the pattern this
// file established in plan 01-01 — see 01-01-SUMMARY.md "patterns-established").
import Module from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { query, pool, runMigrations, migrationsReady } from '../db/__mocks__/index.js';
import { fetchUserRepos, fetchRepoLanguages, fetchRepoReadme } from '../services/__mocks__/githubService.js';
import passportStub from '../config/__mocks__/passport.js';
import { MsEdgeTTS, OUTPUT_FORMAT } from './__mocks__/msedge-tts.js';
import * as geminiStub from './__mocks__/google-generative-ai.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// `msedge-tts` is a third-party package resolved via node_modules, not a
// project-relative file — createRequire gives a genuine native `require`
// whose `.resolve()` walks node_modules exactly like ai.js's own
// `require('msedge-tts')` does, so both sides resolve to the identical
// absolute path (verified: both resolve to
// backend/node_modules/msedge-tts/dist/index.js).
const nodeRequire = createRequire(import.meta.url);

const redirects = [
  { realPath: path.resolve(__dirname, '../db/index.js'), mockExports: { query, pool, runMigrations, migrationsReady } },
  { realPath: path.resolve(__dirname, '../services/githubService.js'), mockExports: { fetchUserRepos, fetchRepoLanguages, fetchRepoReadme } },
  { realPath: path.resolve(__dirname, '../config/passport.js'), mockExports: passportStub },
  { realPath: nodeRequire.resolve('msedge-tts'), mockExports: { MsEdgeTTS, OUTPUT_FORMAT } },
  { realPath: nodeRequire.resolve('@google/generative-ai'), mockExports: geminiStub },
];

if (!Module._load.__gsdDbMockPatched) {
  const originalModuleLoad = Module._load;
  const patchedLoad = function (request, parent, isMain) {
    try {
      const resolved = Module._resolveFilename(request, parent, isMain);
      const match = redirects.find((r) => r.realPath === resolved);
      if (match) {
        return match.mockExports;
      }
    } catch {
      // Resolution failed for reasons unrelated to our redirect targets —
      // fall through to the original loader below.
    }
    return originalModuleLoad.apply(this, arguments);
  };
  patchedLoad.__gsdDbMockPatched = true;
  Module._load = patchedLoad;
}
