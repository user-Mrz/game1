// 移动系统

import { UNIT_TYPES, TERRAIN } from './config.js';
import { key, getTerrain, isBuildingBlocked, isPassable } from './utils.js';
import { granarySupply } from './buildings.js';
import { supplyOnMove } from './economy.js';

export function getMoveCost(state, unit, x, y, playerIdx) {
  const t = getTerrain(state, x, y);
  if (t === TERRAIN.MOUNTAIN) return Infinity;
  // 己方建筑可通行（成本1）；他人建筑（农田除外）不可通行
  if (isBuildingBlocked(state, x, y, playerIdx)) return Infinity;
  // 有其他单位占据的格子不可通行
  if (state.units.some(u => u.x === x && u.y === y && u.id !== unit.id)) return Infinity;
  let cost = 1;
  if (t === TERRAIN.RIVER) cost = 2;
  return cost;
}

export function getReachableTiles(state, unit, playerIdx) {
  if (unit.moved) return new Set();
  if (unit.moveCD > 0) return new Set();
  if (unit.riverDelay > 0) return new Set();
  const movePoints = UNIT_TYPES[unit.type].move;
  if (movePoints < 1) return new Set();

  const reachable = new Map();
  const startKey = key(unit.x, unit.y);
  reachable.set(startKey, 0);
  const queue = [{ x: unit.x, y: unit.y, cost: 0 }];
  const visited = new Set([startKey]);

  while (queue.length > 0) {
    const cur = queue.shift();
    if (cur.cost >= movePoints) continue;

    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cur.x + dx, ny = cur.y + dy;
      const nk = key(nx, ny);
      if (visited.has(nk)) continue;
      visited.add(nk);

      const mc = getMoveCost(state, unit, nx, ny, playerIdx);
      if (mc === Infinity) continue;
      const newCost = cur.cost + mc;
      if (newCost <= movePoints) {
        reachable.set(nk, newCost);
        queue.push({ x: nx, y: ny, cost: newCost });
      } else if (getTerrain(state, nx, ny) === TERRAIN.RIVER && newCost <= movePoints + 1) {
        // 河流通行增加一回合：移速不足时仍可进入河流，但本回合无法继续前进
        reachable.set(nk, newCost);
        queue.push({ x: nx, y: ny, cost: movePoints });
      }
    }
  }

  return reachable;
}

export function moveUnit(state, unit, tx, ty) {
  const fromX = unit.x, fromY = unit.y;
  unit.x = tx;
  unit.y = ty;
  unit.moved = true;
  const cfg = UNIT_TYPES[unit.type];
  if (cfg.moveCD && cfg.moveCD > 0) {
    unit.moveCD = cfg.moveCD;
  }
  if (getTerrain(state, tx, ty) === TERRAIN.RIVER) {
    unit.riverDelay = 1;
  }
  // 移动效果反馈
  if (state.effects) {
    state.effects.push({ type: 'move', fromX, fromY, x: tx, y: ty, startTime: performance.now(), duration: 500 });
  }
  // 站上己方粮仓：将个人粮草转化为该单位储备
  granarySupply(state, unit);
  // 移动后立即与相邻补给兵传递粮草（移动后可见反馈）
  supplyOnMove(state, unit);
}
