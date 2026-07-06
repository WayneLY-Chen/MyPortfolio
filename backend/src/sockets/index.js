const { Server } = require('socket.io');
const gameState = require('./gameState');
const { factionState, bossState, resetFaction, resetBoss } = gameState;

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

  io.on('connection', (socket) => {
    const sessionId = socket.handshake.query.sessionId;
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
    socket.on('join_faction', (data) => {
      const { name, team } = data || {};
      if (!sessionId) return;
      
      const existing = factionState.players[sessionId];
      factionState.players[sessionId] = {
        socketId: socket.id,
        sessionId,
        name: name || existing?.name || '勇者',
        team: team || existing?.team || null,
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

    socket.on('faction_move', (index) => {
      if (factionState.phase !== 'playing') return;
      const player = factionState.players[sessionId];
      if (!player || !player.team) return;
      
      const color = player.team === 'blue' ? '#3b82f6' : '#f97316';
      factionState.grid[index] = color;
      
      io.emit('grid_update', { index, color, grid: factionState.grid });
    });

    socket.on('faction_forfeit', () => {
      if (factionState.phase === 'playing') {
        handleForfeit(io, sessionId);
      }
    });

    // ─── 尾刀爭奪戰邏輯 ───────────────────────────────────────────────
    
    socket.on('boss_join', (name) => {
      console.log(`[Boss] ${name} 加入戰場`);
      if (sessionId) bossState.players[sessionId] = name;
      io.emit('boss_update', { bossState, updatePlayers: true });
      socket.emit('boss_init', { bossState });
    });

    socket.on('boss_attack', (data) => {
      if (!bossState.is_alive) return;
      const { name, damage, skillName, skillType } = data;
      
      bossState.hp = Math.max(0, bossState.hp - damage);
      
      // 更新傷害排行
      let p = bossState.kills.find(k => k.player_name === name);
      if (p) p.total_damage += damage;
      else bossState.kills.push({ player_name: name, total_damage: damage });
      bossState.kills.sort((a, b) => b.total_damage - a.total_damage);

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

    socket.on('boss_reset', () => {
      // Correctly update the properties of the imported object
      bossState.hp = 10000;
      bossState.max_hp = 10000;
      bossState.is_alive = true;
      bossState.killed_by = null;
      bossState.kills = [];
      bossState.players = {}; // 重置時也清空玩家列表，邀請重新加入
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
