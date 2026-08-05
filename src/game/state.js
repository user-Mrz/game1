// 游戏状态工厂 + 初始化 + 回合系统

import { PLAYER_COLORS, TERRAIN } from './config.js';
import { collectFood, consumeUnitSupplies, supplyNearby } from './economy.js';
import { arrowTowerAttack, checkBuildingDestroyed } from './buildings.js';
import { aiTurn } from './ai.js';
import { updateAllExplored } from './vision.js';
import { centerViewOnPlayer } from './camera.js';

export function createGameState(mapW = 500, mapH = 500) {
  return {
    mapW, mapH,
    terrain: null,
    buildings: null,
    players: [],
    units: [],
    currentPlayer: 0,
    explored: [],
    turn: 1,
    nextUnitId: 1,
    selectedUnitId: null,
    selectedBuilding: null,
    viewCX: 0, viewCY: 0,
    tileSize: 40,
    zoomFactor: 1.0,
    phase: 'menu',
    actionMsg: '',
    aiThinking: false,
    winner: null,
  };
}

export function initPlayers(state, numHumans, numAI) {
  const total = numHumans + numAI;
  state.players = [];
  for (let i = 0; i < total; i++) {
    state.players.push({
      index: i,
      name: i === 0 ? '玩家' : ('AI-' + i),
      color: PLAYER_COLORS[i],
      isHuman: i < numHumans,
      food: 3000,
      alive: true,
      hqX: 0, hqY: 0,
    });
  }
  state.explored = state.players.map(() => new Uint8Array(state.mapW * state.mapH));
  state.currentPlayer = 0;
  state.turn = 1;
  state.units = [];
  state.nextUnitId = 1;
  state.selectedUnitId = null;
  state.selectedBuilding = null;
  state.aiThinking = false;
  state.actionMsg = '';
}

export function placeInitialBuildings(state) {
  state.buildings = new Map();
  const numPlayers = state.players.length;

  for (let p = 0; p < numPlayers; p++) {
    const angle = (p / numPlayers) * Math.PI * 2;
    const distFromCenter = Math.min(state.mapW, state.mapH) * 0.35;
    const cx = state.mapW / 2 + Math.cos(angle) * distFromCenter;
    const cy = state.mapH / 2 + Math.sin(angle) * distFromCenter;

    let hx = Math.max(5, Math.min(state.mapW - 5, Math.floor(cx)));
    let hy = Math.max(5, Math.min(state.mapH - 5, Math.floor(cy)));
    let tries = 0;
    while (state.terrain && state.terrain[hy * state.mapW + hx] === TERRAIN.MOUNTAIN && tries < 200) {
      hx = Math.max(5, Math.min(state.mapW - 5, hx + Math.floor(Math.random() * 6 - 3)));
      hy = Math.max(5, Math.min(state.mapH - 5, hy + Math.floor(Math.random() * 6 - 3)));
      tries++;
    }

    state.buildings.set(`${hx},${hy}`, { type: 'hq', owner: p, hp: 10000 });
    state.players[p].hqX = hx;
    state.players[p].hqY = hy;

    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const fx = hx + dx, fy = hy + dy;
      if (fx >= 0 && fy >= 0 && fx < state.mapW && fy < state.mapH &&
          state.terrain[fy * state.mapW + fx] !== TERRAIN.MOUNTAIN &&
          state.terrain[fy * state.mapW + fx] !== TERRAIN.FOREST &&
          !state.buildings.get(`${fx},${fy}`)) {
        state.buildings.set(`${fx},${fy}`, { type: 'farm', owner: p, hp: 1000 });
        break;
      }
    }
  }
}

// ========== 回合系统 ==========

// 单个玩家的回合开始结算：收粮、消耗、箭塔、补给、重置行动状态
function preparePlayerTurn(state, playerIdx) {
  const prev = state.currentPlayer;
  state.currentPlayer = playerIdx;
  state.actionMsg = '';

  // 首回合（回合1）不收获，保持开局粮草为初始值；农田从第2回合起产出
  if (state.turn > 1) {
    const collected = collectFood(state);
    if (collected > 0) state.actionMsg += `收获${collected}粮草；`;
  }

  consumeUnitSupplies(state);

  const arrowMsg = arrowTowerAttack(state);
  if (arrowMsg) state.actionMsg += arrowMsg;

  for (const u of state.units) {
    if (u.owner === playerIdx && u.type === 'supply') supplyNearby(state, u);
  }

  for (const u of state.units) {
    if (u.owner === playerIdx && u.type === 'heavy_cavalry') {
      if (u.moveCD > 0) u.moveCD--;
    }
  }

  for (const u of state.units) {
    if (u.owner === playerIdx) {
      u.moved = false;
      u.attacked = false;
    }
  }

  for (const [bkey, b] of state.buildings) {
    if (b.owner === playerIdx && b.type === 'farm' && b.hp < 1000) {
      b.hp = Math.min(1000, b.hp + 100);
    }
    if (b.owner === playerIdx && b.type === 'granary' && b.hp < 2000) {
      b.hp = Math.min(2000, b.hp + 200);
    }
  }

  state.currentPlayer = prev;
}

export function startTurn(state, renderFn, updateUIFn, onGameOver) {
  const hp = state.players.find(p => p.isHuman && p.alive);
  if (!hp) {
    state.phase = 'over';
    state.winner = null;
    if (onGameOver) onGameOver(false);
    return;
  }

  // 所有人同一回合：回合开始即人类玩家操作阶段
  state.currentPlayer = hp.index;
  state.selectedUnitId = null;
  state.selectedBuilding = null;
  state.aiThinking = false;
  preparePlayerTurn(state, hp.index);
  updateAllExplored(state);
  centerViewOnPlayer(state);
  renderFn();
  if (updateUIFn) updateUIFn();
}

export function endTurn(state, renderFn, updateUIFn, onGameOver) {
  checkBuildingDestroyed(state);

  const humanPlayer = state.players.find(p => p.isHuman);
  if (humanPlayer && !humanPlayer.alive) {
    state.phase = 'over';
    state.winner = null;
    if (onGameOver) onGameOver(false);
    return;
  }

  const alivePlayers = state.players.filter(p => p.alive);
  if (alivePlayers.length <= 1) {
    state.phase = 'over';
    state.winner = alivePlayers[0] || null;
    const humanWon = humanPlayer && humanPlayer.alive;
    if (onGameOver) onGameOver(!!humanWon);
    return;
  }

  // 同一回合内静默结算所有存活AI：不渲染、不停顿、不展示AI行动，结算完直接进入下一回合
  // 教学关卡无AI结算，直接进入下一回合
  const ais = state.tutorialMode ? [] : state.players.filter(p => p.alive && !p.isHuman);
  state.aiThinking = true;
  for (const ai of ais) {
    state.currentPlayer = ai.index;
    preparePlayerTurn(state, ai.index);
    aiTurn(state);
    checkBuildingDestroyed(state);
    updateAllExplored(state);

    const hpAlive = state.players.find(p => p.isHuman && p.alive);
    const aliveNow = state.players.filter(p => p.alive).length;
    if (!hpAlive) {
      state.phase = 'over';
      state.winner = null;
      state.aiThinking = false;
      if (onGameOver) onGameOver(false);
      return;
    }
    if (aliveNow <= 1) {
      state.phase = 'over';
      state.winner = state.players.find(p => p.alive) || null;
      state.aiThinking = false;
      if (onGameOver) onGameOver(true);
      return;
    }
  }
  state.aiThinking = false;
  state.turn++;
  startTurn(state, renderFn, updateUIFn, onGameOver);
}
