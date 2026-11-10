// 视野 & 战争迷雾

import { TERRAIN, UNIT_TYPES, BUILDING_TYPES, BUILD_RULES } from './config.js';
import { getTerrain, dist } from './utils.js';

// 兵种视野 = 移动力 × 3（切比雪夫方形）
function unitVisionAt(state, x, y, playerIdx) {
  for (const u of state.units) {
    if (u.owner !== playerIdx) continue;
    const cfg = UNIT_TYPES[u.type];
    const r = cfg ? cfg.move * 3 : 3;
    if (Math.abs(x - u.x) <= r && Math.abs(y - u.y) <= r) return true;
  }
  return false;
}

// 建筑视野：普通建筑 9 宫格，哨塔额外 8 格（曼哈顿）
function buildingVisionAt(state, x, y, playerIdx) {
  const watchRadius = BUILDING_TYPES.watchtower.visionRadius || 3;
  for (const [bkey, b] of state.buildings) {
    if (b.owner !== playerIdx) continue;
    const [bx, by] = bkey.split(',').map(Number);
    if (b.type === 'watchtower') {
      if (dist(x, y, bx, by) <= watchRadius) return true;
    } else if (Math.abs(x - bx) <= 1 && Math.abs(y - by) <= 1) {
      return true;
    }
  }
  return false;
}

function isAlivePlayer(state, playerIdx) {
  const player = state.players[playerIdx];
  return !!(player && player.alive);
}

// 「看」的视野：建筑 + 兵种，用于战争迷雾与发现敌人
export function isVisibleToPlayer(state, x, y, playerIdx) {
  if (!isAlivePlayer(state, playerIdx)) return false;
  return buildingVisionAt(state, x, y, playerIdx) || unitVisionAt(state, x, y, playerIdx);
}

// 「建」的视野：默认只由兵种提供（建筑不自我滚动），主营可单独开 1 格豁免。
export function isBuildVisibleToPlayer(state, x, y, playerIdx) {
  if (!isAlivePlayer(state, playerIdx)) return false;
  if (BUILD_RULES.hqGrantsBuildVision) {
    const p = state.players[playerIdx];
    if (Math.abs(x - p.hqX) <= 1 && Math.abs(y - p.hqY) <= 1) return true;
  }
  if (BUILD_RULES.buildingGrantsBuildVision && buildingVisionAt(state, x, y, playerIdx)) return true;
  return unitVisionAt(state, x, y, playerIdx);
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
  const defaultScanRadius = 5;

  const toCheck = new Set();

  for (const u of state.units) {
    if (u.owner !== playerIdx) continue;
    const cfg = UNIT_TYPES[u.type];
    const scanRadius = cfg ? cfg.move * 3 : defaultScanRadius;
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
    const r = b.type === 'watchtower' ? 5 : defaultScanRadius;
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
