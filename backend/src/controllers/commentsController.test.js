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
  it('logs [GetComments Error] with err.stack || err.message, and no longer leaks it to the caller', async () => {
    const err = new Error('連線逾時：資料庫無回應');
    query.mockRejectedValueOnce(err);

    const req = { query: { type: 'blog', id: '1' } };
    const res = makeRes();
    await getComments(req, res);

    expect(res.statusCode).toBe(500);
    // 回應改為固定訊息。修補前這裡回的是 err.message —— pg 的錯誤訊息會帶上
    // 主機位址、連接埠與 SQL 片段。診斷資訊只該進 log。
    expect(res.body).toEqual({ success: false, message: '讀取留言失敗' });
    expect(JSON.stringify(res.body)).not.toContain('資料庫無回應');

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

  it('target_type 不在白名單時直接回空陣列，完全不查資料庫', async () => {
    const req = { query: { type: '任意亂編的類型', id: '1' } };
    const res = makeRes();
    await getComments(req, res);

    expect(res.body).toEqual({ success: true, data: [] });
    expect(query).not.toHaveBeenCalled();
  });
});

describe('deleteComment (REL-02: diagnosable error logging)', () => {
  it('logs [DeleteComment Error] with err.stack || err.message, and no longer leaks it to the caller', async () => {
    const err = new Error('連線逾時：資料庫無回應');
    // Admin path skips the ownership SELECT, so exactly one query() call
    // (the UPDATE) happens and needs mocking.
    query.mockRejectedValueOnce(err);

    const req = { params: { id: '42' }, userId: 'admin-user-1', userRole: 'admin' };
    const res = makeRes();
    await deleteComment(req, res);

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ success: false, message: '刪除失敗' });
    expect(JSON.stringify(res.body)).not.toContain('資料庫無回應');

    expect(console.error).toHaveBeenCalledTimes(1);
    const [tag, logged] = console.error.mock.calls[0];
    expect(tag).toBe('[DeleteComment Error]');
    expect(logged).toBe(err.stack);
    expect(logged).toContain('連線逾時：資料庫無回應');
  });

  it('非作者且非管理員時回 403，且不執行刪除', async () => {
    query.mockResolvedValueOnce({ rows: [{ user_id: 'someone-else' }] });
    const req = { params: { id: '42' }, userId: 'user-1', userRole: 'visitor' };
    const res = makeRes();
    await deleteComment(req, res);

    expect(res.statusCode).toBe(403);
    // 只查了擁有者，沒有執行 UPDATE
    expect(query).toHaveBeenCalledTimes(1);
  });
});

describe('addComment', () => {
  it('錯誤訊息不再外洩給呼叫端', async () => {
    const err = new Error('無法寫入資料庫');
    query.mockRejectedValueOnce(err);

    const req = { body: { type: 'blog', id: '1', content: '測試留言' }, userId: 'user-1' };
    const res = makeRes();
    await addComment(req, res);

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ success: false, message: '留言失敗' });
    expect(JSON.stringify(res.body)).not.toContain('無法寫入資料庫');
    expect(console.error).toHaveBeenCalledWith('[AddComment Error]', err.stack);
  });

  // 這一組對應本輪實測到的冒名問題：這條路由掛的是 authenticate（一定有
  // userId），但 author_name 取自 request body —— 實測一般帳號可以用
  // 「網站管理員 Wayne」的名義留言，前端就照著顯示。
  it('author_name 一律取自資料庫的 display_name，忽略 request body 送來的值', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ display_name: '一般使用者小明' }] }) // resolveDisplayName
      .mockResolvedValueOnce({ rows: [{ id: 'c1', author_name: '一般使用者小明' }] }); // INSERT

    const req = {
      body: { type: 'blog', id: '1', content: '這是官方公告', author_name: '網站管理員 Wayne' },
      userId: 'user-1',
    };
    const res = makeRes();
    await addComment(req, res);

    const insertParams = query.mock.calls[1][1];
    expect(insertParams[2], 'author_name 不該是 body 送來的值').toBe('一般使用者小明');
    expect(JSON.stringify(insertParams)).not.toContain('網站管理員');
  });

  it('查不到 display_name 時退回預設值，不會寫入 undefined', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'c1' }] });

    const req = { body: { type: 'blog', id: '1', content: 'hi' }, userId: 'user-1' };
    const res = makeRes();
    await addComment(req, res);

    expect(query.mock.calls[1][1][2]).toBe('訪客');
  });

  it('帳號已不存在時回 401，而不是留下一筆孤兒留言', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ display_name: 'x' }] })
      .mockResolvedValueOnce({ rows: [] }); // INSERT ... SELECT FROM users 沒有命中

    const req = { body: { type: 'blog', id: '1', content: 'hi' }, userId: 'deleted-user' };
    const res = makeRes();
    await addComment(req, res);

    expect(res.statusCode).toBe(401);
  });

  // 這一組對應本輪實測到的行程中止問題：修補前的檢查是 `!content?.trim()`，
  // content 為數字或陣列時那一行直接拋 TypeError，而它在 try 區塊之外。
  // 實測（無 asyncGuard）：請求永遠不回應，unhandledRejection 為
  // "content?.trim is not a function"。
  it('content 為非字串時回 400，而不是拋 TypeError', async () => {
    for (const content of [12345, ['a'], { a: 1 }, true, null, undefined]) {
      const req = { body: { type: 'blog', id: '1', content }, userId: 'user-1' };
      const res = makeRes();
      await expect(
        addComment(req, res),
        `content=${JSON.stringify(content)} 不該拋錯`
      ).resolves.not.toThrow();
      expect(res.statusCode, `content=${JSON.stringify(content)} 應回 400`).toBe(400);
      expect(query).not.toHaveBeenCalled();
    }
  });

  it('target_type 不在白名單、或 target_id 過長時回 400，不寫入資料庫', async () => {
    for (const body of [
      { type: '任意亂編的類型', id: '1', content: 'hi' },
      { type: 'blog', id: 'x'.repeat(256), content: 'hi' },
      { type: 'blog', id: '', content: 'hi' },
      { type: null, id: '1', content: 'hi' },
    ]) {
      const res = makeRes();
      await addComment({ body, userId: 'user-1' }, res);
      expect(res.statusCode, `${JSON.stringify(body)} 應回 400`).toBe(400);
    }
    expect(query).not.toHaveBeenCalled();
  });

  it('超過 500 字的內容回 400（長度以 trim 之後為準）', async () => {
    const res = makeRes();
    await addComment({ body: { type: 'blog', id: '1', content: 'x'.repeat(501) }, userId: 'u' }, res);
    expect(res.statusCode).toBe(400);

    // 邊界：剛好 500 字通過
    query
      .mockResolvedValueOnce({ rows: [{ display_name: 'n' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'c1' }] });
    const res2 = makeRes();
    await addComment({ body: { type: 'blog', id: '1', content: 'x'.repeat(500) }, userId: 'u' }, res2);
    expect(res2.statusCode).toBe(null); // 沒有呼叫 status()，走的是 res.json()
  });

  it('前後空白不算進長度 —— 修補前是用未 trim 的長度比對、卻寫入 trim 過的值', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ display_name: 'n' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'c1' }] });
    const res = makeRes();
    const padded = '  ' + 'x'.repeat(499) + '  ';
    await addComment({ body: { type: 'blog', id: '1', content: padded }, userId: 'u' }, res);
    expect(res.statusCode).toBe(null);
    expect(query.mock.calls[1][1][3]).toBe('x'.repeat(499));
  });
});
