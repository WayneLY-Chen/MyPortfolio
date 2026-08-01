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
