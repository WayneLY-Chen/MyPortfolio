import { describe, it, expect, vi } from 'vitest';

// Must be the first statements, before every other import — see
// backend/src/routes/auth.test.js for why vi.mock('../db') must precede the
// import of the router under test.
vi.mock('../db');

import express from 'express';
import request from 'supertest';
import leaderboardRouter from './leaderboard.js';
import { query } from '../db';
import { LEGACY_SELECT } from '../config/leaderboardQuery.js';

// Build a fresh, minimal Express app per call, mounting only the leaderboard
// router at the same path backend/src/index.js uses (index.js:122) — never
// import backend/src/index.js itself, which calls server.listen()/initSockets()
// at module load and would bind a real port / boot a real Socket.io server.
const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/leaderboard', leaderboardRouter);
  return app;
};

describe('POST /api/leaderboard game_type allowlist (D-24)', () => {
  it('rejects an unknown game_type with 400 and never calls query', async () => {
    const res = await request(buildApp()).post('/api/leaderboard').send({
      game_type: 'not-a-real-game',
      player_name: 'test',
      score: 10,
    });
    expect(res.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('accepts game_type snake with 200', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const res = await request(buildApp()).post('/api/leaderboard').send({
      game_type: 'snake',
      player_name: 'test',
      score: 10,
    });
    expect(res.status).toBe(200);
  });

  it('accepts game_type typing_zh with legal fields with 200', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const res = await request(buildApp()).post('/api/leaderboard').send({
      game_type: 'typing_zh',
      player_name: '小明',
      score: 100,
      accuracy: 95,
    });
    expect(res.status).toBe(200);
  });

  it('missing game_type falls back to the existing snake default and still succeeds', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const res = await request(buildApp()).post('/api/leaderboard').send({
      player_name: 'test',
      score: 10,
    });
    expect(res.status).toBe(200);
    expect(query).toHaveBeenCalledWith(expect.any(String), ['snake', 'test', 10]);
  });
});

describe('POST /api/leaderboard 暱稱規則僅套用在 typing (D-23)', () => {
  it('typing_zh + 合法暱稱 → 200', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const res = await request(buildApp()).post('/api/leaderboard').send({
      game_type: 'typing_zh',
      player_name: 'ok_name',
      score: 100,
      accuracy: 95,
    });
    expect(res.status).toBe(200);
  });

  it('typing_zh + 含 emoji 的暱稱 → 400', async () => {
    const res = await request(buildApp()).post('/api/leaderboard').send({
      game_type: 'typing_zh',
      player_name: 'hi🎉',
      score: 100,
      accuracy: 95,
    });
    expect(res.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('typing_zh + 13 字暱稱 → 400', async () => {
    const res = await request(buildApp()).post('/api/leaderboard').send({
      game_type: 'typing_zh',
      player_name: '一二三四五六七八九十十一十二十三',
      score: 100,
      accuracy: 95,
    });
    expect(res.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });
});

describe('D-24 迴歸:snake/2048 的既有寬鬆行為完全未變', () => {
  it('snake + 含 emoji 且長度 25 字的暱稱 → 仍然 200,且寫入值截斷至 20 字', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const longNickname = 'a'.repeat(24) + '🎉'; // 25 個「使用者感知字元」概念上的長暱稱
    const res = await request(buildApp()).post('/api/leaderboard').send({
      game_type: 'snake',
      player_name: longNickname,
      score: 10,
    });
    expect(res.status).toBe(200);
    const [, params] = query.mock.calls[0];
    expect(params[1]).toBe(longNickname.substring(0, 20));
    expect(params[1].length).toBeLessThanOrEqual(20);
  });

  it('snake + score: 999999 → 仍然 200(舊遊戲無上限)', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const res = await request(buildApp()).post('/api/leaderboard').send({
      game_type: 'snake',
      player_name: 'test',
      score: 999999,
    });
    expect(res.status).toBe(200);
  });

  it('snake 不帶 accuracy → 仍然 200', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const res = await request(buildApp()).post('/api/leaderboard').send({
      game_type: 'snake',
      player_name: 'test',
      score: 10,
    });
    expect(res.status).toBe(200);
  });

  it('2048 + 含 emoji 的暱稱與極端分數 → 仍然 200(第二個既有呼叫端同樣不受影響)', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const res = await request(buildApp()).post('/api/leaderboard').send({
      game_type: '2048',
      player_name: 'weird🎉name_with_more_than_twenty_chars',
      score: 123456,
    });
    expect(res.status).toBe(200);
  });
});

describe('D-22 分數上限', () => {
  it('typing_zh + score: 150 → 200', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const res = await request(buildApp()).post('/api/leaderboard').send({
      game_type: 'typing_zh',
      player_name: 'ok_name',
      score: 150,
      accuracy: 95,
    });
    expect(res.status).toBe(200);
  });

  it('typing_zh + score: 151 → 400', async () => {
    const res = await request(buildApp()).post('/api/leaderboard').send({
      game_type: 'typing_zh',
      player_name: 'ok_name',
      score: 151,
      accuracy: 95,
    });
    expect(res.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('typing_en + score: 250 → 200', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const res = await request(buildApp()).post('/api/leaderboard').send({
      game_type: 'typing_en',
      player_name: 'ok_name',
      score: 250,
      accuracy: 95,
    });
    expect(res.status).toBe(200);
  });

  it('typing_en + score: 251 → 400', async () => {
    const res = await request(buildApp()).post('/api/leaderboard').send({
      game_type: 'typing_en',
      player_name: 'ok_name',
      score: 251,
      accuracy: 95,
    });
    expect(res.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });
});

describe('D-20 正確率門檻', () => {
  it('typing_en + accuracy: 90 → 200', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const res = await request(buildApp()).post('/api/leaderboard').send({
      game_type: 'typing_en',
      player_name: 'ok_name',
      score: 100,
      accuracy: 90,
    });
    expect(res.status).toBe(200);
  });

  it('typing_en + accuracy: 89 → 400', async () => {
    const res = await request(buildApp()).post('/api/leaderboard').send({
      game_type: 'typing_en',
      player_name: 'ok_name',
      score: 100,
      accuracy: 89,
    });
    expect(res.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('typing_en 缺 accuracy 欄位 → 400', async () => {
    const res = await request(buildApp()).post('/api/leaderboard').send({
      game_type: 'typing_en',
      player_name: 'ok_name',
      score: 100,
    });
    expect(res.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });
});

describe('零 schema 變更:accuracy 不入庫', () => {
  it('成功的 typing 寫入時,query 第二個參數的陣列長度為 3(不含 accuracy)', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const res = await request(buildApp()).post('/api/leaderboard').send({
      game_type: 'typing_zh',
      player_name: '小明',
      score: 100,
      accuracy: 95,
    });
    expect(res.status).toBe(200);
    const [, params] = query.mock.calls[0];
    expect(params.length).toBe(3);
    expect(params).toEqual(['typing_zh', '小明', 100]);
  });
});

describe('既有行為(必填欄位與分數格式,本計畫未改動)', () => {
  it('缺 player_name → 400「缺少必要欄位」', async () => {
    const res = await request(buildApp()).post('/api/leaderboard').send({ score: 10 });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, error: '缺少必要欄位' });
  });

  it('缺 score → 400「缺少必要欄位」', async () => {
    const res = await request(buildApp()).post('/api/leaderboard').send({ player_name: 'test' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, error: '缺少必要欄位' });
  });

  it('score 為負數 → 400「分數無效」', async () => {
    const res = await request(buildApp()).post('/api/leaderboard').send({
      player_name: 'test',
      score: -1,
    });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, error: '分數無效' });
  });

  it('score 為非數字 → 400「分數無效」', async () => {
    const res = await request(buildApp()).post('/api/leaderboard').send({
      player_name: 'test',
      score: 'not-a-number',
    });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, error: '分數無效' });
  });

  it('query reject 時 → 500 且回應形狀為 { success: false, error }', async () => {
    query.mockRejectedValueOnce(new Error('DB 掛了'));
    const res = await request(buildApp()).post('/api/leaderboard').send({
      player_name: 'test',
      score: 10,
    });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, error: 'DB 掛了' });
  });
});

// 這個 describe 原名「GET /api/leaderboard 未受影響」——D-34 之後這個說法已經
// 不成立(打字榜的查詢與回傳列數確實改變了),留著原名會誤導下一個讀者。這裡
// 驗的其實是「route 不對 query 回傳的 rows 做任何額外的 JS 端過濾或轉換,
// 原樣穿透」,改名反映真正的斷言內容,斷言本身不動。
describe('GET /api/leaderboard 回應形狀原樣穿透(route 不做額外過濾或轉換)', () => {
  it('GET /api/leaderboard?game=typing_zh&limit=10 在 query 回傳 rows 時 → 200', async () => {
    const rows = [{ player_name: '小明', score: 100, created_at: '2026-08-02T00:00:00.000Z' }];
    query.mockResolvedValueOnce({ rows });

    const res = await request(buildApp()).get('/api/leaderboard?game=typing_zh&limit=10');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: rows });
  });
});

describe('GET /api/leaderboard 打字榜去重查詢(D-34)', () => {
  it('?game=typing_zh → query 收到含 DISTINCT ON (player_name) 的 SQL,參數為 [typing_zh, 10]', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const res = await request(buildApp()).get('/api/leaderboard?game=typing_zh');

    expect(res.status).toBe(200);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('DISTINCT ON (player_name)');
    expect(params).toEqual(['typing_zh', 10]);
  });

  it('?game=typing_en → query 收到含 DISTINCT ON (player_name) 的 SQL,參數為 [typing_en, 10]', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const res = await request(buildApp()).get('/api/leaderboard?game=typing_en');

    expect(res.status).toBe(200);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('DISTINCT ON (player_name)');
    expect(params).toEqual(['typing_en', 10]);
  });

  it('?game=typing_zh&limit=999 → limit 仍被夾制為 50(既有行為未變)', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const res = await request(buildApp()).get('/api/leaderboard?game=typing_zh&limit=999');

    expect(res.status).toBe(200);
    const [, params] = query.mock.calls[0];
    expect(params).toEqual(['typing_zh', 50]);
  });

  it('?game=typing_zh 時 query reject → 仍回 200 與 { success: true, data: [] }(既有吞錯行為未變)', async () => {
    query.mockRejectedValueOnce(new Error('DB 掛了'));

    const res = await request(buildApp()).get('/api/leaderboard?game=typing_zh');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: [] });
  });
});

describe('POST /api/leaderboard 暱稱內容黑名單(D-35) — 端到端最薄一刀', () => {
  it("player_name: 'fuck' + typing_zh → 400，訊息逐字為指定文案，且 query 未被呼叫", async () => {
    const res = await request(buildApp()).post('/api/leaderboard').send({
      game_type: 'typing_zh',
      player_name: 'fuck',
      score: 100,
      accuracy: 95,
    });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, error: '暱稱包含不適當的字詞，請換一個' });
    expect(query).not.toHaveBeenCalled();
  });

  it("player_name: 'Yamashita' + typing_zh → 200(這一刀沒有順手擋掉無辜名字)", async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const res = await request(buildApp()).post('/api/leaderboard').send({
      game_type: 'typing_zh',
      player_name: 'Yamashita',
      score: 100,
      accuracy: 95,
    });
    expect(res.status).toBe(200);
  });
});

describe('POST /api/leaderboard 暱稱內容黑名單(D-35) — 四個 game_type 全部受保護', () => {
  // 直接證明決策 G 的「沒有換榜繞過的縫隙」——想罵髒話的人換個 game_type
  // 也上不了榜。snake/2048 走舊遊戲寬鬆分支、typing_zh/typing_en 走嚴格
  // 分支,但兩條分支在 D-35 的檢查點匯流,四個榜共用同一道防線。
  it.each(['snake', '2048', 'typing_zh', 'typing_en'])(
    "game_type: %s + player_name: 'fuck' → 400,query 未被呼叫",
    async (gameType) => {
      const payload = { game_type: gameType, player_name: 'fuck', score: 10 };
      if (gameType === 'typing_zh' || gameType === 'typing_en') {
        payload.accuracy = 95;
      }
      const res = await request(buildApp()).post('/api/leaderboard').send(payload);
      expect(res.status).toBe(400);
      expect(query).not.toHaveBeenCalled();
    }
  );

  it.each(['Dick Van Dyke', 'Michelle Yeoh'])(
    '舊遊戲(snake)的無辜長暱稱 %s(含空白、超過 12 字)仍然 200(寬鬆行為與新檢查並存)',
    async (name) => {
      query.mockResolvedValueOnce({ rows: [] });
      const res = await request(buildApp()).post('/api/leaderboard').send({
        game_type: 'snake',
        player_name: name,
        score: 10,
      });
      expect(res.status).toBe(200);
    }
  );

  it("中文髒話 '幹你娘' 走 typing_zh → 400", async () => {
    const res = await request(buildApp()).post('/api/leaderboard').send({
      game_type: 'typing_zh',
      player_name: '幹你娘',
      score: 100,
      accuracy: 95,
    });
    expect(res.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });
});

describe('GET /api/leaderboard 舊遊戲查詢逐字未變迴歸(D-27 未被推翻的部分)', () => {
  it('?game=snake → query 收到的 SQL 與 LEGACY_SELECT 逐字相等,不含 DISTINCT,參數為 [snake, 10]', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const res = await request(buildApp()).get('/api/leaderboard?game=snake');

    expect(res.status).toBe(200);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toBe(LEGACY_SELECT);
    expect(sql).not.toContain('DISTINCT');
    expect(params).toEqual(['snake', 10]);
  });

  it('?game=2048 → query 收到的 SQL 與 LEGACY_SELECT 逐字相等,不含 DISTINCT,參數為 [2048, 10]', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const res = await request(buildApp()).get('/api/leaderboard?game=2048');

    expect(res.status).toBe(200);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toBe(LEGACY_SELECT);
    expect(sql).not.toContain('DISTINCT');
    expect(params).toEqual(['2048', 10]);
  });

  it('不帶 game 參數 → 沿用既有的 snake 預設,走舊路徑', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const res = await request(buildApp()).get('/api/leaderboard');

    expect(res.status).toBe(200);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toBe(LEGACY_SELECT);
    expect(params).toEqual(['snake', 10]);
  });
});
