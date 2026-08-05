// JS/Java 结算一致性验证：
// 同一初始状态 + 同一 seed，分别用前端本地 endTurn 与后端 /api/sim/end-turn 结算，
// 对比 players/units/buildings/turn/nextUnitId/phase/winner 是否完全一致。
// 用法：node --experimental-vm-modules scripts/verify-sim.mjs
// 前置：后端已启动（默认 http://localhost:8080）

import { createGameState, initPlayers, placeInitialBuildings, startTurn, endTurn } from '../src/game/state.js';
import { generateTerrain } from '../src/game/terrain.js';
import { spawnUnit } from '../src/game/units.js';
import { updateAllExplored } from '../src/game/vision.js';
import { serializeGameState, deserializeGameState } from '../src/game/save.js';
import { buildSimRequest } from '../src/api/simApi.js';
import { TERRAIN } from '../src/game/config.js';

const SIM_URL = process.env.SIM_URL || 'http://localhost:8080/api/sim/end-turn';
const SEED = 20260805;

// 与后端 Mulberry32 一致的 PRNG
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 复制 startGame 的开局逻辑（含初始单位规则）
function createInitialState(mapSize, aiCount) {
  const state = createGameState(mapSize, mapSize);
  state.phase = 'playing';
  state.turn = 1;
  initPlayers(state, 1, aiCount);
  state.terrain = generateTerrain(state.mapW, state.mapH);
  placeInitialBuildings(state);

  const hp = state.players[0];
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const nx = hp.hqX + dx, ny = hp.hqY + dy;
      if (nx >= 0 && ny >= 0 && nx < state.mapW && ny < state.mapH &&
          state.terrain[ny * state.mapW + nx] === TERRAIN.MOUNTAIN) {
        state.terrain[ny * state.mapW + nx] = 0;
      }
    }
  }

  for (let p = 0; p < state.players.length; p++) {
    const player = state.players[p];
    const offsets = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
    const freeTiles = [];
    for (const [dx, dy] of offsets) {
      const x = player.hqX + dx, y = player.hqY + dy;
      if (x < 0 || y < 0 || x >= state.mapW || y >= state.mapH) continue;
      if (state.buildings.has(`${x},${y}`)) continue;
      freeTiles.push([x, y]);
    }
    const toSpawn = p === 0
      ? [['infantry'], ['infantry']]
      : [['infantry'], ['infantry'], ['archer']];
    for (let i = 0; i < toSpawn.length; i++) {
      const [sx, sy] = freeTiles[i % freeTiles.length];
      spawnUnit(state, p, toSpawn[i][0], sx, sy);
    }
  }
  updateAllExplored(state);
  return state;
}

function cloneViaJson(state) {
  return deserializeGameState(JSON.parse(JSON.stringify(serializeGameState(state))));
}

function applyBackendResult(state, result) {
  state.players = result.players;
  state.units = result.units;
  state.buildings = new Map(
    (result.buildings || []).map(b => [b.key, {
      type: b.type, owner: b.owner, hp: b.hp, lastHitBy: b.lastHitBy,
    }])
  );
  state.currentPlayer = result.currentPlayer;
  state.turn = result.turn;
  state.nextUnitId = result.nextUnitId;
  state.phase = result.phase;
  state.winner = result.winner ?? null;
  return state;
}

function normBuildings(state) {
  return JSON.stringify(
    Array.from(state.buildings.entries()).map(([k, v]) => ({
      key: k, type: v.type, owner: v.owner, hp: v.hp,
      lastHitBy: v.lastHitBy === undefined ? null : v.lastHitBy,
    }))
  );
}

function normUnits(units) {
  return JSON.stringify(units.map(u => ({
    id: u.id, type: u.type, owner: u.owner, x: u.x, y: u.y,
    troops: u.troops, supplies: u.supplies, moved: u.moved,
    attacked: u.attacked, moveCD: u.moveCD, riverDelay: u.riverDelay,
  })));
}

function normPlayers(players) {
  return JSON.stringify(players.map(p => ({
    index: p.index, name: p.name, color: p.color, isHuman: p.isHuman,
    food: p.food, alive: p.alive, hqX: p.hqX, hqY: p.hqY,
  })));
}

function checkInvariants(state, label) {
  const errors = [];
  for (const u of state.units) {
    if (u.troops <= 0) errors.push(`unit ${u.id} troops<=0`);
    if (u.x < 0 || u.y < 0 || u.x >= state.mapW || u.y >= state.mapH) errors.push(`unit ${u.id} out of map`);
  }
  for (const [k, b] of state.buildings) {
    if (b.hp < 0) errors.push(`building ${k} hp<0`);
    const cfgMax = b.type === 'farm' ? 1000 : b.type === 'granary' ? 2000 : 10000;
    if (b.hp > cfgMax) errors.push(`building ${k} hp>max`);
  }
  for (const p of state.players) {
    if (p.food < 0) errors.push(`player ${p.index} food<0`);
    const hasHq = [...state.buildings.values()].some(b => b.type === 'hq' && b.owner === p.index);
    if (p.alive && !hasHq) errors.push(`player ${p.index} alive without HQ`);
  }
  if (errors.length) {
    throw new Error(`${label} invariants violated: ${errors.join('; ')}`);
  }
}

async function roundTrip(base, roundLabel) {
  const local = cloneViaJson(base);
  const backend = cloneViaJson(base);

  endTurn(local, () => {}, () => {}, () => {}, mulberry32(SEED));
  checkInvariants(local, `${roundLabel} local`);

  const res = await fetch(SIM_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildSimRequest(backend, SEED)),
  });
  if (!res.ok) throw new Error(`${roundLabel} HTTP ${res.status}: ${await res.text()}`);
  const result = await res.json();
  applyBackendResult(backend, result);
  // 与真实客户端流程一致：后端返回结算后状态，客户端再执行人类回合准备/视野更新
  if (result.phase !== 'over') {
    startTurn(backend, () => {}, () => {}, () => {});
  }
  checkInvariants(backend, `${roundLabel} backend`);

  const diffs = [];
  if (normUnits(local.units) !== normUnits(backend.units)) diffs.push('units');
  if (normBuildings(local) !== normBuildings(backend)) diffs.push('buildings');
  if (normPlayers(local.players) !== normPlayers(backend.players)) diffs.push('players');
  for (const f of ['currentPlayer', 'turn', 'nextUnitId', 'phase', 'winner']) {
    if (JSON.stringify(local[f]) !== JSON.stringify(backend[f])) diffs.push(f);
  }

  if (diffs.length) {
    console.error(`[FAIL] ${roundLabel}: 差异字段 = ${diffs.join(', ')}`);
    console.error('local turn/nextUnitId:', local.turn, local.nextUnitId);
    console.error('backend turn/nextUnitId:', backend.turn, backend.nextUnitId);
    return { ok: false, state: local };
  }
  console.log(`[PASS] ${roundLabel}: turn=${backend.turn} units=${backend.units.length} buildings=${backend.buildings.size} phase=${backend.phase}`);
  return { ok: true, state: local };
}

let allPass = true;

// 场景1：100×100，1 人类 + 3 AI，连续 3 回合
{
  let state = createInitialState(100, 3);
  for (let r = 1; r <= 3; r++) {
    if (!(await roundTrip(state, `100x100 4P 回合${r}`)).ok) allPass = false;
    // 用后端结果继续下一轮
    const res = await fetch(SIM_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildSimRequest(state, SEED)),
    });
    const result = await res.json();
    state = applyBackendResult(state, result);
  }
}

// 场景2：500×500，1 人类 + 2 AI，2 回合（多回合粮草/生产累积）
{
  let state = createInitialState(500, 2);
  for (let r = 1; r <= 2; r++) {
    if (!(await roundTrip(state, `500x500 3P 回合${r}`)).ok) allPass = false;
    const res = await fetch(SIM_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildSimRequest(state, SEED)),
    });
    const result = await res.json();
    state = applyBackendResult(state, result);
  }
}

// 场景3：定制状态，确定性触发“建筑攻占”路径
// 全平原地图：人类农田(15,10) 血量60，AI-1 弓兵(16,10) 射程内无敌人单位 → 必然攻击建筑
{
  const state = createGameState(100, 100);
  state.phase = 'playing';
  state.turn = 5;
  state.terrain = new Uint8Array(100 * 100); // 全平原
  initPlayers(state, 1, 1);
  state.players[0].hqX = 10; state.players[0].hqY = 10;
  state.players[1].hqX = 80; state.players[1].hqY = 80;
  state.buildings = new Map();
  state.buildings.set('10,10', { type: 'hq', owner: 0, hp: 10000 });
  state.buildings.set('80,80', { type: 'hq', owner: 1, hp: 10000 });
  state.buildings.set('15,10', { type: 'farm', owner: 0, hp: 60 });
  spawnUnit(state, 1, 'archer', 16, 10);

  const rt = await roundTrip(state, '100x100 建筑攻占');
  if (!rt.ok) allPass = false;
  const captured = rt.state.buildings.get('15,10');
  if (!captured || captured.owner !== 1 || captured.hp !== 500) {
    console.error(`[FAIL] 农田未被 AI-1 占领：${JSON.stringify(captured)}`);
    allPass = false;
  } else {
    console.log(`[PASS] 农田被占领: owner=1 hp=${captured.hp}`);
  }
}

console.log(allPass ? '\n全部一致：JS 本地结算与后端结算结果完全一致' : '\n存在不一致！');
process.exit(allPass ? 0 : 1);
