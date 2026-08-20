const { Server } = require('socket.io');
const gameState = require('./gameState');
const { factionState, bossState, resetFaction, resetBoss } = gameState;
const { verifyGuestSessionToken } = require('../utils/jwt');
const { normalizeDamage, normalizePlayerName, recordDamage } = require('../config/bossValidation');
const {
  isValidGridIndex,
  normalizeTeam,
  teamColor,
} = require('../config/factionValidation');

// 紀錄中斷連線的計時器
const disconnectTimers = {};

function initSockets(server) {
  const allowedOrigins = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    process.env.FRONTEND_URL
  ].filter(Boolean);

  const io = new Server(server, {
    cors: {
      origin: allowedOrigins,
      methods: ['GET', 'POST'],
      credentials: true
    }
  });

  console.log('Socket.io 伺服器初始化成功');

  // SEC-04/SEC-05: 握手驗證閘門，必須在 io.on('connection', ...) 之前註冊。
  // 拒絕必須發生在握手階段，而不是個別事件處理器裡——否則連線仍會建立、
  // 仍會收到 connection 事件，SEC-04 要求「驗證失敗的連線完全無法加入
  // 遊戲」就無法成立。
  //
  // 憑證一律從 handshake.auth（Socket.io 專門承載憑證的欄位）讀取，不再
  // 從 query string 讀（同時也讓 sessionId 不再出現在 server / proxy 的
  // access log 裡，T-01-08）。sessionId 一律以驗證通過後、伺服器端signed
  // payload 內的值為準，client 端在 query string 或其他欄位塞入的任何值
  // 一律被忽略（SEC-05 冒用防範）。
  io.use((socket, next) => {
    const { token } = socket.handshake.auth || {};
    if (!token) {
      console.log('[Socket] 握手被拒絕: 未提供 token');
      return next(new Error('unauthorized'));
    }
    try {
      const payload = verifyGuestSessionToken(token);
      socket.data.sessionId = payload.sid;
      next();
    } catch (err) {
      console.log('[Socket] 握手被拒絕: token 驗證失敗');
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const sessionId = socket.data.sessionId;
    console.log(`[Socket] 玩家連線: ${socket.id}, Session: ${sessionId}`);

    // 如果該玩家之前斷線在倒數中，清除計時器 (重連成功)
    if (sessionId && disconnectTimers[sessionId]) {
      console.log(`[Socket] 玩家 ${sessionId} 在 15s 內重連儲存成功`);
      clearTimeout(disconnectTimers[sessionId]);
      delete disconnectTimers[sessionId];
      
      // 廣播給對手：這傢伙回來了
      socket.broadcast.emit('player_reconnected', { sessionId });
    }

    // ─── 陣營大戰邏輯 ───────────────────────────────────────────────
    
    // 加入/更新大廳狀態
    // name / team 先前完全未驗證：20 萬字的名字會原樣存進常駐的 players
    // 物件並廣播給每一位連線者（實測確認），team 則接受任意字串。兩者現在
    // 都經過 config/factionValidation.js 收斂。
    socket.on('join_faction', (data) => {
      const { name, team } = data || {};
      if (!sessionId) return;

      const existing = factionState.players[sessionId];
      // 空字串或未帶值時保留既有名字（重連、以及「還沒填暱稱就按加入」都會
      // 走到這裡），與修改前 name || existing?.name || 預設值 的行為一致；
      // 有帶值時才做正規化。
      const resolvedName =
        name === undefined || name === null || name === ''
          ? (existing?.name || normalizePlayerName(null))
          : normalizePlayerName(name);

      factionState.players[sessionId] = {
        socketId: socket.id,
        sessionId,
        name: resolvedName,
        team: normalizeTeam(team) || existing?.team || null,
        isReady: existing?.isReady || false
      };

      io.emit('lobby_update', { players: factionState.players, phase: factionState.phase });

      // 送出目前的棋盤與狀態給這位新進來的玩家 (同步歷史資料)
      socket.emit('faction_init', {
        grid: factionState.grid,
        phase: factionState.phase,
        timeLeft: factionState.timeLeft
      });
    });

    socket.on('faction_ready', (ready) => {
      if (!sessionId || !factionState.players[sessionId]) return;
      factionState.players[sessionId].isReady = ready;
      
      // 檢查是否雙方都準備好
      const playerList = Object.values(factionState.players);
      const readyCount = playerList.filter(p => p.isReady).length;
      
      io.emit('lobby_update', { players: factionState.players, phase: factionState.phase });
      
      if (readyCount >= 2 && factionState.phase === 'lobby') {
        startFactionGame(io);
      }
    });

    // index 先前完全未驗證，實測確認兩種後果（見 config/factionValidation.js）：
    //   index = 'length'  → RangeError → uncaughtException → 行程中止
    //   index = 3000000   → grid 膨脹到三百萬格，且每次落子都整份廣播
    socket.on('faction_move', (index) => {
      if (factionState.phase !== 'playing') return;
      if (!isValidGridIndex(index)) return;
      const player = factionState.players[sessionId];
      if (!player) return;
      const color = teamColor(player.team);
      // 未選邊（team 為 null）或隊伍不在白名單上時不落子。
      // 三元式原本是「team 等於 blue 就用藍色，否則一律用橘色」，任何非
      // blue 的值——包含攻擊者自訂的字串——都會被當成橘隊並廣播出去。
      if (!color) return;

      factionState.grid[index] = color;

      io.emit('grid_update', { index, color, grid: factionState.grid });
    });

    socket.on('faction_forfeit', () => {
      if (factionState.phase === 'playing') {
        handleForfeit(io, sessionId);
      }
    });

    // ─── 尾刀爭奪戰邏輯 ───────────────────────────────────────────────
    
    // 名字先前未經正規化就存進常駐狀態並廣播 —— 上一輪修了 boss_attack 的
    // player_name，卻漏了同一份狀態的另一個寫入點。實測 20 萬字的名字會原樣
    // 存下並廣播給所有連線者。
    socket.on('boss_join', (name) => {
      if (!sessionId) return;
      const safeName = normalizePlayerName(name);
      console.log('[Boss] ' + safeName + ' 加入戰場');
      bossState.players[sessionId] = safeName;
      io.emit('boss_update', { bossState, updatePlayers: true });
      socket.emit('boss_init', { bossState });
    });

    // 驗證規則與 routes/boss.js 的 POST /attack 共用 config/bossValidation.js。
    // 這條才是前端實際走的路徑（FunPage.jsx 的 socket.emit），先前完全沒有驗證：
    // damage 送 'abc' 會讓 bossState.hp 變成 NaN 且永不復原（NaN 減任何數仍是
    // NaN，is_alive 也永遠不會轉 false），單一封包即可癱瘓整個功能直到重啟。
    socket.on('boss_attack', (data) => {
      if (!bossState.is_alive) return;

      const damage = normalizeDamage(data?.damage);
      if (damage === null) return;
      const name = normalizePlayerName(data?.name);
      const { skillName, skillType } = data || {};

      bossState.hp = Math.max(0, bossState.hp - damage);

      // 更新傷害排行（含 MAX_TRACKED_PLAYERS 上限，避免不重複名字灌爆記憶體）
      recordDamage(bossState, name, damage);

      const isKill = bossState.hp === 0;
      if (isKill) {
        bossState.is_alive = false;
        bossState.killed_by = name;
      }

      // 廣播攻擊與狀態
      io.emit('boss_update', {
        bossState: { ...bossState }, // 展開以確保 Socket.io 送出最新副本
        attacker: name,
        damage,
        skillName,
        skillType,
        isKill
      });
    });

    // 重置會清空全場狀態與整份傷害排行。前端的「重置骷髏王」按鈕只在
    // !bossState.is_alive 時才渲染（FunPage.jsx），因此在伺服器端補上同一道
    // 條件不會影響任何合法操作，但可擋掉「戰鬥進行中把別人的傷害排行清掉」
    // 的惡意重置。socket 只帶訪客 sessionId、沒有管理員身分，無法比照 REST
    // 的 /reset 鎖成管理員 —— 那會讓玩家再也無法開下一場。
    socket.on('boss_reset', () => {
      if (bossState.is_alive) return;
      resetBoss();
      io.emit('boss_update', { bossState, reset: true });
    });

    // ─── 斷線處理 ──────────────────────────────────────────────────
    
    socket.on('disconnect', () => {
      console.log(`[Socket] 玩家斷開: ${socket.id}, Session: ${sessionId}`);
      
      // 處理 Faction 斷線
      if (sessionId && factionState.players[sessionId]) {
        if (factionState.phase === 'playing') {
          handleForfeit(io, sessionId);
        }
        delete factionState.players[sessionId];
        if (disconnectTimers[sessionId]) clearTimeout(disconnectTimers[sessionId]);
        delete disconnectTimers[sessionId];
        if (Object.keys(factionState.players).length === 0) factionState.phase = 'lobby';
        io.emit('lobby_update', { players: factionState.players, phase: factionState.phase });
      }

      // 處理 Boss Raid 斷線
      if (sessionId && bossState.players[sessionId]) {
        console.log(`[Boss] 玩家 ${bossState.players[sessionId]} 退出`);
        delete bossState.players[sessionId];
        io.emit('boss_update', { bossState, updatePlayers: true });
      }
    });
  });

  return io;
}

function startFactionGame(io) {
  factionState.phase = 'playing';
  factionState.grid = Array(100).fill('');
  factionState.timeLeft = 60;
  io.emit('game_start', { grid: factionState.grid });

  const timer = setInterval(() => {
    factionState.timeLeft--;
    io.emit('timer_tick', factionState.timeLeft);

    if (factionState.timeLeft <= 0) {
      clearInterval(timer);
      endFactionGame(io);
    }
  }, 1000);
}

function endFactionGame(io) {
  const blue = factionState.grid.filter(c => c === '#3b82f6').length;
  const orange = factionState.grid.filter(c => c === '#f97316').length;
  factionState.winner = blue > orange ? 'blue' : orange > blue ? 'orange' : 'draw';
  factionState.phase = 'finished';
  
  io.emit('game_finished', { 
    winner: factionState.winner, 
    counts: { blue, orange } 
  });
  
  // 重置狀態 (5秒後回到大廳)
  setTimeout(() => {
    resetFaction();
    io.emit('lobby_update', { players: factionState.players, phase: 'lobby' });
  }, 5000);
}

function handleForfeit(io, discoSessionId) {
  if (factionState.phase === 'playing') {
    const leaver = factionState.players[discoSessionId];
    const leaverTeam = leaver?.team || 'unknown';
    
    // 贏家推算：如果走掉的是藍，贏家就是橘；反之亦然。如果不確定，預設橘隊先勝。
    const winnerTeam = leaverTeam === 'blue' ? 'orange' : 'blue';
    
    factionState.phase = 'finished';
    factionState.winner = winnerTeam;
    
    // 計算最後得分 (使用正確的 Hex Color：藍 #3b82f6, 橘 #f97316)
    const blueCount = (factionState.grid || []).filter(c => c === '#3b82f6').length;
    const orangeCount = (factionState.grid || []).filter(c => c === '#f97316').length;

    io.emit('game_finished', { 
      winner: winnerTeam, 
      forfeit: true, 
      leaver: leaver?.name || '對手',
      counts: { blue: blueCount, orange: orangeCount }
    });

    console.log(`[Forfeit] 玩家 ${discoSessionId} 離開，贏家判定為: ${winnerTeam}`);

    // 重置定時器：讓大家在結算畫面待 5 秒
    setTimeout(() => {
      resetFaction();
      io.emit('lobby_update', { players: factionState.players, phase: 'lobby' });
    }, 5000);
  }
}

module.exports = { initSockets };
