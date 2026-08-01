import { describe, it, expect, vi, beforeEach } from 'vitest';

// Must be the first statements, before every other import — see
// backend/src/routes/auth.test.js for why vi.mock('../db') must precede the
// import of the router under test.
vi.mock('../db');
vi.mock('../services/githubService');

import express from 'express';
import request from 'supertest';
import projectsRouter from './projects.js';
import { generateAccessToken } from '../utils/jwt.js';
import { query } from '../db';
import { fetchUserRepos } from '../services/githubService';

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
});
