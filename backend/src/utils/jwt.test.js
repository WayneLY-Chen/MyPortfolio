import { describe, it, expect, vi } from 'vitest';

// Must be the first statement, before any other import: backend/src/utils/jwt.js
// requires ../db (for generateRefreshToken), which — unmocked — would run the
// real Pool construction and the deferred migration timer in backend/src/db/index.js.
vi.mock('../db');

import { generateAccessToken, generateRefreshToken, verifyAccessToken } from './jwt.js';
import { query } from '../db';

// Task 1 tracer: the thinnest possible slice through the whole test
// architecture (script -> config -> env setup -> db mock -> real production
// function). Breadth is Task 2's job — do not expand coverage here.
describe('jwt.js (tracer)', () => {
  it('signs an access token and verifies it back to the original claims', () => {
    const token = generateAccessToken('user-123', 'admin');
    const decoded = verifyAccessToken(token);

    expect(decoded.sub).toBe('user-123');
    expect(decoded.role).toBe('admin');
    expect(decoded.type).toBe('access');
  });

  it('interop proof: generateRefreshToken (CommonJS require(\'../db\')) is served by the ESM __mocks__/index.js manual mock', async () => {
    await generateRefreshToken('user-123');

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO refresh_tokens/i);
    expect(params).toHaveLength(3);
  });
});
