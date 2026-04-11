// Centralized game state management to ensure consistency across Socket.io and REST routes
let factionState = {
  grid: Array(100).fill(''),
  players: {}, // { sessionId: { name, team, isReady, lastSeen } }
  timeLeft: 60,
  phase: 'lobby', // 'lobby' | 'countdown' | 'playing' | 'finished'
  winner: null
};

let bossState = {
  hp: 10000,
  max_hp: 10000,
  is_alive: true,
  killed_by: null,
  players: {}, // { sessionId: name }
  kills: [] // { player_name, total_damage }
};

module.exports = {
  factionState,
  bossState,
  
  // Resetters to ensure games can start fresh
  resetFaction: () => {
    factionState.grid = Array(100).fill('');
    factionState.phase = 'lobby';
    factionState.timeLeft = 60;
    factionState.winner = null;
    Object.values(factionState.players).forEach(p => {
      p.isReady = false;
      p.name = '';
    });
  },
  
  resetBoss: () => {
    bossState.hp = 10000;
    bossState.max_hp = 10000;
    bossState.is_alive = true;
    bossState.killed_by = null;
    bossState.players = {};
    bossState.kills = [];
  }
};
