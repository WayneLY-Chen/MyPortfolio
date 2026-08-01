import { describe, it, expect, vi } from 'vitest';

// Must be the first statements, before every other import — see
// backend/src/routes/auth.test.js for why vi.mock('../db') must precede the
// import of the router under test.
vi.mock('../db');

import express from 'express';
import request from 'supertest';
import factionRouter from './faction.js';
import { query } from '../db';

// Build a fresh, minimal Express app per call, mounting only the faction
// router at the same path backend/src/index.js uses (index.js:124) — never
// import backend/src/index.js itself, which calls server.listen()/initSockets()
// at module load and would bind a real port / boot a real Socket.io server.
const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/faction', factionRouter);
  return app;
};

describe('GET /api/faction/results (D-03: the one route that must stay alive)', () => {
  it('returns 200 with the results list on success', async () => {
    const rows = [
      { blue_player: '藍隊', orange_player: '橘隊', winner: 'blue', blue_score: 10, orange_score: 3, created_at: '2026-08-01T00:00:00.000Z' },
    ];
    query.mockResolvedValueOnce({ rows });

    const res = await request(buildApp()).get('/api/faction/results');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: rows });
  });

  it('returns 500 with { success: false, message } when the query rejects', async () => {
    query.mockRejectedValueOnce(new Error('DB 掛了'));

    const res = await request(buildApp()).get('/api/faction/results');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, message: 'DB 掛了' });
  });
});

describe('Zero-caller REST routes removed (D-03, T-01-09/T-02-12)', () => {
  it.each([
    ['GET', '/api/faction/lobby'],
    ['POST', '/api/faction/ready'],
    ['POST', '/api/faction/start'],
    ['POST', '/api/faction/move'],
    ['POST', '/api/faction/result'],
  ])('%s %s is not handled by the faction router (falls through to 404)', async (method, path) => {
    const app = buildApp();
    const res = await request(app)[method.toLowerCase()](path).send({});

    expect(res.status).toBe(404);
  });
});
