// AI 系统

import { UNIT_TYPES, BUILDING_TYPES, BARRACKS_TYPE_MAP } from './config.js';
import { canBuildOn, buildStructure, canProduce, produceUnit } from './buildings.js';
import { canAttack, resolveCombat, canAttackBuilding, resolveBuildingCombat } from './combat.js';
import { getReachableTiles, moveUnit } from './movement.js';
import { getUnitsAt } from './units.js';
import { dist } from './utils.js';

export function aiTurn(state, rand = Math.random) {
  const playerIdx = state.currentPlayer;
  const player = state.players[playerIdx];
  if (!player || !player.alive) return;

  aiProduceUnits(state, playerIdx);
  aiBuildStructures(state, playerIdx, rand);
  aiMoveAndAttack(state, playerIdx);
}

function aiProduceUnits(state, playerIdx) {
  const player = state.players[playerIdx];
  const priority = ['infantry', 'archer', 'light_cavalry', 'supply', 'heavy_cavalry'];

  for (const [bkey, b] of state.buildings) {
    if (b.owner !== playerIdx) continue;
    const bType = canProduce(state, playerIdx, bkey);
    if (!bType) continue;

    for (const utype of priority) {
      const cfg = UNIT_TYPES[utype];
      if (BARRACKS_TYPE_MAP[bType] !== utype) continue;
      if (player.food >= cfg.buildCost + 3000) {
        produceUnit(state, playerIdx, bkey, utype);
        break;
      }
    }
  }
}

function aiBuildStructures(state, playerIdx, rand = Math.random) {
  const player = state.players[playerIdx];
  if (player.food < 3000) return;

  const hqX = player.hqX, hqY = player.hqY;
  const candidates = [];
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      const x = hqX + dx, y = hqY + dy;
      if (canBuildOn(state, x, y, playerIdx)) candidates.push({ x, y });
    }
  }
  if (candidates.length === 0) return;

  const pos = candidates[Math.floor(rand() * candidates.length)];
  const hasFarms = [...state.buildings.values()].filter(b => b.owner === playerIdx && b.type === 'farm').length;
  const buildOrder = hasFarms < 2 ? 'farm' :
    (rand() < 0.4 ? 'arrow_tower' : (rand() < 0.5 ? 'infantry_barracks' : 'archer_barracks'));

  const cfg = BUILDING_TYPES[buildOrder];
  if (cfg.buildable && player.food >= cfg.buildCost + 2000) {
    buildStructure(state, playerIdx, pos.x, pos.y, buildOrder);
  }
}

function aiMoveAndAttack(state, playerIdx) {
  const myUnits = state.units.filter(u => u.owner === playerIdx && !u.moved && u.type !== 'supply');
  const enemies = state.units.filter(u => u.owner !== playerIdx);
  const supplyUnits = state.units.filter(u => u.owner === playerIdx && u.type === 'supply' && !u.moved);

  // 战斗单位
  for (const u of myUnits) {
    if (u.moved) continue;
    const cfg = UNIT_TYPES[u.type];

    // 先攻击
    let attacked = false;
    for (const enemy of enemies) {
      if (!state.units.includes(enemy)) continue;
      if (canAttack(state, u, enemy)) {
        resolveCombat(state, u, enemy);
        attacked = true;
        break;
      }
    }
    if (attacked) continue;

    // 移动
    if (enemies.length > 0 && cfg.move >= 1) {
      const reachable = getReachableTiles(state, u, playerIdx);
      if (reachable.size > 1) {
        let bestMove = null, bestDist = Infinity;
        for (const enemy of enemies) {
          for (const [rk] of reachable) {
            if (rk === `${u.x},${u.y}`) continue;
            const [rx, ry] = rk.split(',').map(Number);
            const d = dist(rx, ry, enemy.x, enemy.y);
            if (d < bestDist) { bestDist = d; bestMove = { x: rx, y: ry }; }
          }
        }
        for (const ep of state.players) {
          if (ep.index === playerIdx || !ep.alive) continue;
          for (const [rk] of reachable) {
            if (rk === `${u.x},${u.y}`) continue;
            const [rx, ry] = rk.split(',').map(Number);
            const d = dist(rx, ry, ep.hqX, ep.hqY);
            if (d < bestDist) { bestDist = d; bestMove = { x: rx, y: ry }; }
          }
        }
        if (bestMove) moveUnit(state, u, bestMove.x, bestMove.y);
      }
    }

    // 移动后攻击
    if (!u.attacked && cfg.atkRange > 0) {
      for (const enemy of enemies) {
        if (!state.units.includes(enemy)) continue;
        if (canAttack(state, u, enemy)) {
          resolveCombat(state, u, enemy);
          break;
        }
      }
      // 无单位可打时，攻击范围内敌方建筑（优先可占领的农田/粮仓）
      if (!u.attacked) {
        const prio = ['farm', 'granary', 'arrow_tower', 'hq',
          'infantry_barracks', 'archer_barracks', 'lc_barracks', 'hc_barracks',
          'supply_barracks', 'wall', 'watchtower'];
        for (const ptype of prio) {
          for (const [bkey, b] of state.buildings) {
            if (b.type !== ptype || b.owner === playerIdx) continue;
            const [bx, by] = bkey.split(',').map(Number);
            if (canAttackBuilding(state, u, bx, by)) {
              resolveBuildingCombat(state, u, bx, by);
              break;
            }
          }
          if (u.attacked) break;
        }
      }
    }
  }

  // 补给兵跟随
  for (const su of supplyUnits) {
    if (su.moved) continue;
    const myCombat = state.units.filter(u => u.owner === playerIdx && u.type !== 'supply' && u.moved);
    if (myCombat.length > 0) {
      const reachable = getReachableTiles(state, su, playerIdx);
      let bestMove = null, bestDist = Infinity;
      for (const combat of myCombat) {
        for (const [rk] of reachable) {
          if (rk === `${su.x},${su.y}`) continue;
          const [rx, ry] = rk.split(',').map(Number);
          const d = dist(rx, ry, combat.x, combat.y);
          if (d < bestDist) { bestDist = d; bestMove = { x: rx, y: ry }; }
        }
      }
      if (bestMove) moveUnit(state, su, bestMove.x, bestMove.y);
    }
  }
}
