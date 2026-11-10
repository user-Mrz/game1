// 游戏状态工厂 + 初始化 + 回合系统

import { PLAYER_COLORS, TERRAIN, BUILDING_TYPES } from './config.js';
import { collectFood, consumeUnitSupplies, supplyNearby } from './economy.js';
import { arrowTowerAttack, checkBuildingDestroyed } from './buildings.js';
import { aiTurn } from './ai.js';
import { updateAllExplored } from './vision.js';
import { centerViewOnPlayer } from './camera.js';

export function createGameState(mapW = 500, mapH = 500) {
  return {
    gameId: 'g_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
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
    effects: [], // 视觉效果反馈队列
    difficulty: 'easy', // 难度等级
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
  // 只保留人类玩家的探索视野数组；AI 决策不依赖 explored（见 findings），
  // 后端结算也不返回 AI 视野，前端渲染仅用人类视野 → 大图多 AI 时显著省内存
  state.explored = state.players.map(p => (p.isHuman ? new Uint8Array(state.mapW * state.mapH) : null));
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
    // 出生环半径：必须落在「部队作战半径」之内，否则任何进攻都会在半路断粮。
    // 0.20 × 地图边长，配合 8 回合续航与 2 格移动，能在 15~20 回合形成接触。
    const distFromCenter = Math.min(state.mapW, state.mapH) * 0.2;
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

    state.buildings.set(`${hx},${hy}`, { type: 'hq', owner: p, hp: BUILDING_TYPES.hq.hp });
    state.players[p].hqX = hx;
    state.players[p].hqY = hy;

    // 出生地整平：清掉主营 5×5 内的山地，避免随机地形把某个玩家彻底困死（原本只有人类玩家享受这个待遇）
    if (state.terrain) {
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const nx = hx + dx, ny = hy + dy;
          if (nx < 0 || ny < 0 || nx >= state.mapW || ny >= state.mapH) continue;
          if (state.terrain[ny * state.mapW + nx] === TERRAIN.MOUNTAIN) {
            state.terrain[ny * state.mapW + nx] = TERRAIN.PLAIN;
          }
        }
      }
    }

    // 开局农田：优先贴主营 1 格，找不到再退到 2 格，避免"没有农田=经济停摆"
    let farmPlaced = false;
    for (const r of [1, 2]) {
      if (farmPlaced) break;
      for (let dy = -r; dy <= r && !farmPlaced; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const fx = hx + dx, fy = hy + dy;
          if (fx < 0 || fy < 0 || fx >= state.mapW || fy >= state.mapH) continue;
          if (state.buildings.get(`${fx},${fy}`)) continue;
          const t = state.terrain ? state.terrain[fy * state.mapW + fx] : TERRAIN.PLAIN;
          if (t === TERRAIN.MOUNTAIN || t === TERRAIN.FOREST) continue;
          state.buildings.set(`${fx},${fy}`, { type: 'farm', owner: p, hp: BUILDING_TYPES.farm.hp });
          farmPlaced = true;
          break;
        }
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
    if (u.owner === playerIdx && u.riverDelay > 0) {
      u.riverDelay--;
    }
  }

  for (const u of state.units) {
    if (u.owner === playerIdx) {
      u.moved = false;
      u.attacked = false;
    }
  }

  for (const [bkey, b] of state.buildings) {
    if (b.owner !== playerIdx) continue;
    // 产兵冷却递减：cd=3 表示还要等 3 个回合
    if (b.cd > 0) b.cd--;
    const maxHp = BUILDING_TYPES[b.type]?.hp;
    if (!maxHp) continue;
    // 农田 +100/回合，粮仓 +200/回合（被占领后的重建速度）
    if (b.type === 'farm' && b.hp < maxHp) b.hp = Math.min(maxHp, b.hp + 100);
    if (b.type === 'granary' && b.hp < maxHp) b.hp = Math.min(maxHp, b.hp + 200);
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
  // 仅第一回合视角居中主营，后续回合保持上一回合视角
  if (state.turn === 1) {
    centerViewOnPlayer(state);
  }
  renderFn();
  if (updateUIFn) updateUIFn();
}

export function endTurn(state, renderFn, updateUIFn, onGameOver, rand = Math.random) {
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
    aiTurn(state, rand);
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
