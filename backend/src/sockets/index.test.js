import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import { io as ioClient } from 'socket.io-client';
import { initSockets } from './index.js';
import { factionState, bossState, resetFaction, resetBoss } from './gameState.js';
import { generateGuestSessionToken, generateAccessToken } from '../utils/jwt.js';

// TEST-04 / SEC-04 / SEC-05: a throwaway http server + a real socket.io-client,
// never backend/src/index.js (which binds a real port and would collide with
// a running dev server — see 01-RESEARCH.md Pitfall 4).
let httpServer;
let ioServer;
let port;

const activeClients = [];

const connectClient = (opts = {}) => {
  const client = ioClient(`http://localhost:${port}`, {
    reconnection: false, // a rejected handshake must fail once, not retry forever and hang the run
    forceNew: true,
    ...opts,
  });
  activeClients.push(client);
  return client;
};

const waitForEvent = (emitter, event, timeoutMs = 3000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for "${event}"`));
    }, timeoutMs);
    emitter.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });

beforeAll(() => {
  return new Promise((resolve) => {
    httpServer = http.createServer();
    ioServer = initSockets(httpServer);
    httpServer.listen(0, '127.0.0.1', () => {
      port = httpServer.address().port;
      resolve();
    });
  });
});

afterAll(async () => {
  // io.close() does NOT close an http.Server instance that was handed to it
  // (only one it created itself) — both must be closed explicitly so the
  // suite exits on its own with no leaked handle.
  await new Promise((resolve) => ioServer.close(resolve));
  await new Promise((resolve) => httpServer.close(resolve));
});

beforeEach(() => {
  // Game state (backend/src/sockets/gameState.js) is module-level mutable
  // state shared across every connection for the lifetime of the process —
  // the exported resetters don't clear the players maps themselves, so those
  // are reset directly here for real test isolation.
  resetFaction();
  resetBoss();
  factionState.players = {};
  bossState.players = {};
});

afterEach(() => {
  while (activeClients.length) {
    const client = activeClients.pop();
    client.removeAllListeners();
    client.close();
  }
});

describe('Socket.io handshake authorization (SEC-04, SEC-05, TEST-04)', () => {
  it('completes the handshake for a valid guest token and acts under the identifier carried in that token', async () => {
    const sessionId = 'guest-session-alpha';
    const token = generateGuestSessionToken(sessionId);

    const client = connectClient({ auth: { token } });
    await waitForEvent(client, 'connect');

    const lobbyUpdate = waitForEvent(client, 'lobby_update');
    client.emit('join_faction', { name: 'Tester', team: 'blue' });
    const data = await lobbyUpdate;

    expect(data.players[sessionId]).toBeDefined();
    expect(data.players[sessionId].name).toBe('Tester');
  });

  it('rejects a connection presenting no token before the connection handler runs', async () => {
    const client = connectClient({ auth: {} });

    const err = await waitForEvent(client, 'connect_error');
    expect(err).toBeDefined();
    expect(client.connected).toBe(false);
  });

  it('rejects a connection presenting a signature-tampered token', async () => {
    const validToken = generateGuestSessionToken('guest-session-bravo');
    // Mutate the final character of the signature segment (the tail of the JWT).
    const lastChar = validToken.slice(-1);
    const flippedChar = lastChar === 'a' ? 'b' : 'a';
    const tamperedToken = validToken.slice(0, -1) + flippedChar;

    const client = connectClient({ auth: { token: tamperedToken } });

    const err = await waitForEvent(client, 'connect_error');
    expect(err).toBeDefined();
    expect(client.connected).toBe(false);
  });

  it('rejects a connection presenting a user access token instead of a guest session token', async () => {
    const accessToken = generateAccessToken('user-123', 'admin');

    const client = connectClient({ auth: { token: accessToken } });

    const err = await waitForEvent(client, 'connect_error');
    expect(err).toBeDefined();
    expect(client.connected).toBe(false);
  });

  it('acts under the token identifier even when a different identifier is injected via the handshake query string (SEC-05)', async () => {
    const trueSessionId = 'guest-session-real';
    const injectedSessionId = 'guest-session-injected';
    const token = generateGuestSessionToken(trueSessionId);

    const client = connectClient({
      auth: { token },
      query: { sessionId: injectedSessionId },
    });
    await waitForEvent(client, 'connect');

    const lobbyUpdate = waitForEvent(client, 'lobby_update');
    client.emit('join_faction', { name: 'RealPlayer', team: 'orange' });
    const data = await lobbyUpdate;

    expect(data.players[trueSessionId]).toBeDefined();
    expect(data.players[injectedSessionId]).toBeUndefined();
  });

  it('a rejected connection cannot join the faction lobby: no lobby broadcast and no player-map entry result (SEC-04)', async () => {
    const client = connectClient({ auth: {} }); // no token -> rejected at handshake
    await waitForEvent(client, 'connect_error');

    let lobbyBroadcastReceived = false;
    client.on('lobby_update', () => {
      lobbyBroadcastReceived = true;
    });

    // The underlying transport was never established, so this never reaches
    // the server — asserted here as the observable consequence.
    client.emit('join_faction', { name: 'Intruder', team: 'blue' });

    // Give any potential (buggy) broadcast time to arrive before asserting its absence.
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(lobbyBroadcastReceived).toBe(false);
    expect(Object.values(factionState.players).some((p) => p.name === 'Intruder')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 輸入驗證回歸測試（config/factionValidation.js）
//
// 這些測試一律「從 socket 事件觀測」，不去讀本檔上方 import 進來的
// factionState/bossState 物件。理由是實測發現的一個陷阱：sockets/index.js 是
// 純 CommonJS，內部以 require('./gameState') 取得狀態，走的是 Node 原生的
// Module._load；本測試檔的 `import ... from './gameState.js'` 走的是 Vite 的
// SSR 模組圖。兩條路徑拿到的是「不同的模組實例」（在 test/setup.js 的註解裡
// 有記載同一類問題）。實測：join_faction 成功後，lobby_update 的 payload 裡
// 有該玩家，但 import 進來的 factionState.players 是空的。
//
// 直接後果：對 import 進來的物件做斷言，會拿到「看起來是好消息」的假通過。
// 因此每一則測試都先做一次 sanity 斷言，確認觀測管道真的在運作，再驗證修補。
describe('陣營大戰輸入驗證（faction_move / join_faction / boss_join）', () => {
  const nextEvent = (client, event, timeoutMs = 2000) =>
    new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), timeoutMs);
      client.once(event, (payload) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });

  // 把兩位玩家推進 phase='playing'，回傳藍隊那位的 client。
  const startGame = async (tag) => {
    const blue = connectClient({ auth: { token: generateGuestSessionToken(`${tag}-blue`) } });
    await waitForEvent(blue, 'connect');
    const orange = connectClient({ auth: { token: generateGuestSessionToken(`${tag}-orange`) } });
    await waitForEvent(orange, 'connect');

    let p = nextEvent(blue, 'lobby_update');
    blue.emit('join_faction', { name: 'B', team: 'blue' });
    await p;
    p = nextEvent(orange, 'lobby_update');
    orange.emit('join_faction', { name: 'O', team: 'orange' });
    await p;

    const started = nextEvent(blue, 'game_start', 3000);
    blue.emit('faction_ready', true);
    orange.emit('faction_ready', true);
    const gameStart = await started;
    return { blue, orange, gameStart };
  };

  it('faction_move 只接受棋盤範圍內的整數索引', async () => {
    const { blue, gameStart } = await startGame('mv');
    // SANITY：沒真的開局的話，後面每一則「沒有事件」都會是假通過。
    expect(gameStart, '遊戲沒有真的開始，這則測試無法證明任何事').not.toBe(null);
    expect(gameStart.grid).toHaveLength(100);

    // SANITY：合法落子確實會廣播。
    const ok = nextEvent(blue, 'grid_update');
    blue.emit('faction_move', 7);
    const okPayload = await ok;
    expect(okPayload, '合法落子沒有廣播，觀測管道有問題').not.toBe(null);
    expect(okPayload.index).toBe(7);
    expect(okPayload.grid).toHaveLength(100);

    // 修補前：grid['length'] = 色碼 → RangeError → uncaughtException → 行程中止。
    //
    // 這裡必須攔 uncaughtException，不能只斷言「沒收到 grid_update」——
    // 修補前 handler 是在 io.emit 之前就拋例外，所以「沒有事件」在有漏洞與沒
    // 漏洞兩種情況下都成立，那條斷言會給出假通過（實測確認過）。真正能區分
    // 兩者的訊號是例外本身：vitest 會替 worker 掛自己的 handler，所以測試行程
    // 不會死，但真實伺服器沒有任何 uncaughtException handler，Node 預設中止行程。
    const uncaught = [];
    const onUncaught = (err) => uncaught.push(err);
    process.on('uncaughtException', onUncaught);
    const lengthAttack = nextEvent(blue, 'grid_update', 800);
    blue.emit('faction_move', 'length');
    expect(await lengthAttack).toBe(null);
    process.off('uncaughtException', onUncaught);
    expect(
      uncaught.map((e) => String(e && e.message)),
      'handler 拋出未被攔截的例外 —— 真實伺服器會直接中止行程'
    ).toEqual([]);
    expect(blue.connected, '伺服器應該還活著').toBe(true);

    // 修補前：grid 膨脹到三百萬格，且整份被廣播給所有連線者。
    const growAttack = nextEvent(blue, 'grid_update', 800);
    blue.emit('faction_move', 3000000);
    expect(await growAttack).toBe(null);

    // 負數與非整數同樣被擋。
    for (const bad of [-5, 5.5, '7', null, {}]) {
      const rejected = nextEvent(blue, 'grid_update', 400);
      blue.emit('faction_move', bad);
      expect(await rejected, `index=${JSON.stringify(bad)} 不該被接受`).toBe(null);
    }

    // 擋掉非法輸入之後，合法落子仍然正常 —— 且 grid 沒有被前面的攻擊撐大。
    const after = nextEvent(blue, 'grid_update');
    blue.emit('faction_move', 8);
    const afterPayload = await after;
    expect(afterPayload).not.toBe(null);
    expect(afterPayload.grid).toHaveLength(100);

    blue.emit('faction_forfeit');
  }, 20000);

  it('join_faction 的名字會被截斷、隊伍必須在白名單上', async () => {
    const client = connectClient({ auth: { token: generateGuestSessionToken('jf-1') } });
    await waitForEvent(client, 'connect');

    // SANITY：一般名字原樣保留。
    let p = nextEvent(client, 'lobby_update');
    client.emit('join_faction', { name: 'Tester', team: 'blue' });
    let lobby = await p;
    expect(lobby, '沒收到 lobby_update，觀測管道有問題').not.toBe(null);
    expect(lobby.players['jf-1'].name).toBe('Tester');
    expect(lobby.players['jf-1'].team).toBe('blue');

    // 修補前：20 萬字原樣存進常駐狀態並廣播給每一位連線者。
    p = nextEvent(client, 'lobby_update');
    client.emit('join_faction', { name: 'Y'.repeat(200000), team: 'blue' });
    lobby = await p;
    expect(lobby.players['jf-1'].name.length).toBe(20);

    // 修補前：任意字串被存下並廣播，且在 faction_move 裡被當成橘隊。
    p = nextEvent(client, 'lobby_update');
    client.emit('join_faction', { name: 'X', team: 'ATTACKER-CONTROLLED' });
    lobby = await p;
    expect(lobby.players['jf-1'].team).not.toBe('ATTACKER-CONTROLLED');
    expect(['blue', 'orange', null]).toContain(lobby.players['jf-1'].team);
  }, 20000);

  it('boss_join 的名字會被截斷', async () => {
    const client = connectClient({ auth: { token: generateGuestSessionToken('bj-1') } });
    await waitForEvent(client, 'connect');

    // SANITY：一般名字原樣保留。
    let p = nextEvent(client, 'boss_update');
    client.emit('boss_join', '勇者小明');
    let update = await p;
    expect(update, '沒收到 boss_update，觀測管道有問題').not.toBe(null);
    expect(update.bossState.players['bj-1']).toBe('勇者小明');

    // 修補前：boss_attack 的 player_name 上一輪修好了，同一份狀態的這個寫入點漏掉。
    p = nextEvent(client, 'boss_update');
    client.emit('boss_join', 'Z'.repeat(200000));
    update = await p;
    expect(String(update.bossState.players['bj-1']).length).toBe(20);
  }, 20000);
});
