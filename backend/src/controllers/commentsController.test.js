import { describe, it, expect, vi, beforeEach } from 'vitest';

// Must be the first statements, before every other import.
vi.mock('../db');

import { getComments, addComment, deleteComment } from './commentsController.js';
import { query } from '../db';

// The plan explicitly prefers calling the controller functions directly
// over mounting the full Express router (backend/src/routes/comments.js
// guards deleteComment/addComment behind `authenticate`, which is unrelated
// to what REL-02's logging fix is testing here) — lighter and unaffected by
// auth. Minimal stub req/res, mirroring the two methods these handlers
// actually call.
function makeRes() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

beforeEach(() => {
  // restoreMocks/mockReset (vitest.config.mjs) clear this automatically
  // before every test — re-spy fresh each time.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('getComments (REL-02: diagnosable error logging)', () => {
  it('logs [GetComments Error] with err.stack || err.message and still responds 500 with the unchanged body shape', async () => {
    const err = new Error('連線逾時：資料庫無回應');
    query.mockRejectedValueOnce(err);

    const req = { query: { type: 'blog', id: '1' } };
    const res = makeRes();
    await getComments(req, res);

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ success: false, message: err.message });

    expect(console.error).toHaveBeenCalledTimes(1);
    const [tag, logged] = console.error.mock.calls[0];
    expect(tag).toBe('[GetComments Error]');
    // UTF-8 integrity: the logged value is err.stack (always truthy for a
    // real Error) and must carry the Chinese message through byte-identical
    // — not truncated, not mojibake.
    expect(logged).toBe(err.stack);
    expect(logged).toContain('連線逾時：資料庫無回應');
  });

  it('logs a non-empty line even when the caught value has only a message and no stack', async () => {
    const errLike = { message: '純文字錯誤，非 Error 物件' };
    query.mockRejectedValueOnce(errLike);

    const req = { query: { type: 'blog', id: '1' } };
    const res = makeRes();
    await getComments(req, res);

    expect(res.statusCode).toBe(500);
    const [, logged] = console.error.mock.calls[0];
    // err.stack is undefined on a plain object, so `err.stack || err.message`
    // falls through to err.message — must not be empty and must not throw.
    expect(logged).toBe(errLike.message);
    expect(logged).toBeTruthy();
  });
});

describe('deleteComment (REL-02: diagnosable error logging)', () => {
  it('logs [DeleteComment Error] with err.stack || err.message and still responds 500 with the unchanged body shape', async () => {
    const err = new Error('連線逾時：資料庫無回應');
    // Admin path skips the ownership SELECT, so exactly one query() call
    // (the UPDATE) happens and needs mocking.
    query.mockRejectedValueOnce(err);

    const req = { params: { id: '42' }, userId: 'admin-user-1', userRole: 'admin' };
    const res = makeRes();
    await deleteComment(req, res);

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ success: false, message: err.message });

    expect(console.error).toHaveBeenCalledTimes(1);
    const [tag, logged] = console.error.mock.calls[0];
    expect(tag).toBe('[DeleteComment Error]');
    expect(logged).toBe(err.stack);
    expect(logged).toContain('連線逾時：資料庫無回應');
  });
});

describe('addComment (must remain byte-for-byte unchanged — the project\'s own correct reference implementation)', () => {
  it('still logs the full error object under the original [AddComment Error] tag, not err.stack || err.message', async () => {
    const err = new Error('無法寫入資料庫');
    query.mockRejectedValueOnce(err);

    const req = { body: { type: 'blog', id: '1', content: '測試留言' }, userId: 'user-1' };
    const res = makeRes();
    await addComment(req, res);

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ success: false, message: err.message });
    // addComment's own pattern (console.error('[AddComment Error]', err)) is
    // this project's reference implementation and is out of this plan's
    // scope — this assertion exists only to catch an accidental rewrite.
    expect(console.error).toHaveBeenCalledWith('[AddComment Error]', err);
  });
});
