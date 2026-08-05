// 视野 & 战争迷雾

import { TERRAIN } from './config.js';
import { getTerrain, dist } from './utils.js';

export function isVisibleToPlayer(state, x, y, playerIdx) {
  const player = state.players[playerIdx];
  if (!player || !player.alive) return false;

  // 哨塔 3 格半径
  for (const [bkey, b] of state.buildings) {
    if (b.owner === playerIdx && b.type === 'watchtower') {
      const [bx, by] = bkey.split(',').map(Number);
      if (dist(x, y, bx, by) <= 3) return true;
    }
  }

  // 建筑和单位 9 宫格
  for (const [bkey, b] of state.buildings) {
    if (b.owner === playerIdx && b.type !== 'watchtower') {
      const [bx, by] = bkey.split(',').map(Number);
      if (Math.abs(x - bx) <= 1 && Math.abs(y - by) <= 1) return true;
    }
  }

  for (const u of state.units) {
    if (u.owner === playerIdx) {
      if (Math.abs(x - u.x) <= 1 && Math.abs(y - u.y) <= 1) return true;
    }
  }

  return false;
}

export function isUnitVisibleToPlayer(state, unit, playerIdx) {
  if (unit.owner === playerIdx) return true;
  if (!isVisibleToPlayer(state, unit.x, unit.y, playerIdx)) return false;
  // 森林隐身
  if (getTerrain(state, unit.x, unit.y) === TERRAIN.FOREST) {
    const friendlySameTile = state.units.some(u =>
      u.owner === playerIdx && u.x === unit.x && u.y === unit.y
    );
    // 对方兵种进入该方格，或森林内兵种本回合攻击过 → 可见
    return friendlySameTile || unit.attacked;
  }
  return true;
}

export function updateExplored(state, playerIdx) {
  const exp = state.explored[playerIdx];
  if (!exp) return;
  const player = state.players[playerIdx];
  if (!player || !player.alive) return;
  const scanRadius = 5;

  const toCheck = new Set();

  for (const u of state.units) {
    if (u.owner !== playerIdx) continue;
    for (let dy = -scanRadius; dy <= scanRadius; dy++) {
      for (let dx = -scanRadius; dx <= scanRadius; dx++) {
        const nx = u.x + dx, ny = u.y + dy;
        if (nx >= 0 && ny >= 0 && nx < state.mapW && ny < state.mapH && !exp[ny * state.mapW + nx]) {
          toCheck.add(`${nx},${ny}`);
        }
      }
    }
  }

  for (const [bkey, b] of state.buildings) {
    if (b.owner !== playerIdx) continue;
    const [bx, by] = bkey.split(',').map(Number);
    const r = b.type === 'watchtower' ? 5 : scanRadius;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const nx = bx + dx, ny = by + dy;
        if (nx >= 0 && ny >= 0 && nx < state.mapW && ny < state.mapH && !exp[ny * state.mapW + nx]) {
          toCheck.add(`${nx},${ny}`);
        }
      }
    }
  }

  for (const k of toCheck) {
    const [cx, cy] = k.split(',').map(Number);
    if (isVisibleToPlayer(state, cx, cy, playerIdx)) {
      exp[cy * state.mapW + cx] = 1;
    }
  }
}

export function updateAllExplored(state) {
  for (let p = 0; p < state.players.length; p++) {
    if (state.players[p].alive) updateExplored(state, p);
  }
}
