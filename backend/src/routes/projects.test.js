import { describe, it, expect, vi, beforeEach } from 'vitest';

// Must be the first statements, before every other import — see
// backend/src/routes/auth.test.js for why vi.mock('../db') must precede the
// import of the router under test.
vi.mock('../db');
vi.mock('../services/githubService');

import { createRequire } from 'node:module';
import express from 'express';
import request from 'supertest';
import projectsRouter from './projects.js';
import { generateAccessToken } from '../utils/jwt.js';
import { query } from '../db';
import { fetchUserRepos } from '../services/githubService';

// `projects.js` is a plain-CommonJS file reached here via an ESM `import` —
// per the interop note in backend/src/test/setup.js, its internal
// `require('../controllers/projectsController')` runs through Node's real,
// native module loader (and cache), NOT through Vite's SSR module graph.
// A static `import { _resetBackfillGuardForTests } from '../controllers/projectsController.js'`
// at the top of this file would instead resolve through Vite's SSR graph and
// land on a SEPARATE module instance with its own independent module-level
// state — resetting it would have no effect on the instance the route
// actually uses. `createRequire` gives a genuine native `require`, which
// resolves through the exact same real Module cache `projects.js`'s nested
// require uses, so both sides share the identical singleton instance.
const nodeRequire = createRequire(import.meta.url);
const { _resetBackfillGuardForTests } = nodeRequire('../controllers/projectsController.js');

// Build a fresh, minimal Express app per call, mounting only the projects
// router at the same path backend/src/index.js uses (index.js:82) — never
// import backend/src/index.js itself, which calls server.listen() at module
// load and would bind a real port / boot a real Socket.io server.
const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/projects', projectsRouter);
  return app;
};

const adminToken = () => generateAccessToken('admin-user-1', 'admin');
const visitorToken = () => generateAccessToken('visitor-user-1', 'visitor');

// The read-path backfill (Task 2) guards itself with module-level state
// (in-flight flag + cooldown timestamp) so it does not fire once per
// visitor. Reset it before every test so cases in this file cannot leak
// into one another.
beforeEach(() => {
  _resetBackfillGuardForTests();
});

describe('POST /api/projects/sync', () => {
  beforeEach(() => {
    fetchUserRepos.mockResolvedValue([]);
  });

  it('returns 401 and never invokes the GitHub service without an Authorization header', async () => {
    const res = await request(buildApp()).post('/api/projects/sync');

    expect(res.status).toBe(401);
    expect(fetchUserRepos).not.toHaveBeenCalled();
  });

  it('returns 401 and never invokes the GitHub service for a malformed/wrong-secret token', async () => {
    const res = await request(buildApp())
      .post('/api/projects/sync')
      .set('Authorization', 'Bearer this-is-not-a-valid-jwt');

    expect(res.status).toBe(401);
    expect(fetchUserRepos).not.toHaveBeenCalled();
  });

  it('returns 403 and never invokes the GitHub service for a valid non-admin token', async () => {
    const res = await request(buildApp())
      .post('/api/projects/sync')
      .set('Authorization', `Bearer ${visitorToken()}`);

    expect(res.status).toBe(403);
    expect(fetchUserRepos).not.toHaveBeenCalled();
  });

  it('reaches the controller and invokes the GitHub service once for a valid admin token', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const res = await request(buildApp())
      .post('/api/projects/sync')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(fetchUserRepos).toHaveBeenCalledTimes(1);
  });
});

describe('GET /api/projects', () => {
  it('remains reachable with no credentials', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 1, name: 'demo', language_stats: { JS: 100 } }] });

    const res = await request(buildApp()).get('/api/projects');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('responds immediately from cache and never invokes the GitHub service when every row has language stats (D-12)', async () => {
    const completeRows = [
      { id: 1, name: 'demo-a', language_stats: { JS: 80, CSS: 20 } },
      { id: 2, name: 'demo-b', language_stats: { Python: 100 } },
    ];
    query.mockResolvedValueOnce({ rows: completeRows });

    const res = await request(buildApp()).get('/api/projects');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, source: 'cache', data: completeRows });
    expect(fetchUserRepos).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('backfills missing language stats server-side when a cached row is missing them, then responds with the completed rows', async () => {
    const cachedRowsMissingStats = [
      { id: 1, name: 'demo-a', language_stats: {} },
      { id: 2, name: 'demo-b', language_stats: { Python: 100 } },
    ];
    const completedRows = [
      { id: 1, name: 'demo-a', language_stats: { JS: 80, CSS: 20 } },
      { id: 2, name: 'demo-b', language_stats: { Python: 100 } },
    ];
    query.mockResolvedValueOnce({ rows: cachedRowsMissingStats }); // cache SELECT
    query.mockResolvedValueOnce({}); // upsert INSERT (return value unused)
    query.mockResolvedValueOnce({ rows: completedRows }); // re-read SELECT
    fetchUserRepos.mockResolvedValueOnce([
      { github_id: 1, name: 'demo-a', language_stats: { JS: 80, CSS: 20 }, updated_at: new Date().toISOString() },
    ]);

    const res = await request(buildApp()).get('/api/projects');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, source: 'cache', data: completedRows });
    expect(fetchUserRepos).toHaveBeenCalledTimes(1);
  });

  it('falls back to the original cached rows when the GitHub fetch fails during backfill — never an error or an empty list', async () => {
    const cachedRowsMissingStats = [{ id: 1, name: 'demo-a', language_stats: null }];
    query.mockResolvedValueOnce({ rows: cachedRowsMissingStats });
    fetchUserRepos.mockRejectedValueOnce(new Error('GitHub API 錯誤 403（已超過 rate limit）'));

    const res = await request(buildApp()).get('/api/projects');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, source: 'cache', data: cachedRowsMissingStats });
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('does not invoke the GitHub service a second time for a repeat request shortly after one that produced no improvement', async () => {
    const cachedRowsMissingStats = [{ id: 1, name: 'demo-a', language_stats: {} }];

    // First request: attempts a backfill, but GitHub returns no repos at all
    // (no improvement) — this still counts as an attempt and starts the cooldown.
    query.mockResolvedValueOnce({ rows: cachedRowsMissingStats });
    fetchUserRepos.mockResolvedValueOnce([]);
    const firstRes = await request(buildApp()).get('/api/projects');
    expect(firstRes.status).toBe(200);
    expect(fetchUserRepos).toHaveBeenCalledTimes(1);

    // Second request arrives immediately after, still missing stats, well
    // within the cooldown window — must not call the GitHub service again.
    query.mockResolvedValueOnce({ rows: cachedRowsMissingStats });
    const secondRes = await request(buildApp()).get('/api/projects');
    expect(secondRes.status).toBe(200);
    expect(fetchUserRepos).toHaveBeenCalledTimes(1);
  });

  it('keeps the existing response shape (success flag, source label, data array)', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 1, name: 'demo', language_stats: { JS: 100 } }] });

    const res = await request(buildApp()).get('/api/projects');

    expect(typeof res.body.success).toBe('boolean');
    expect(typeof res.body.source).toBe('string');
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});
