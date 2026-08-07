// AI 系统

import { UNIT_TYPES, BUILDING_TYPES, BARRACKS_TYPE_MAP, DIFFICULTY } from './config.js';
import { canBuildOn, buildStructure, canProduce, produceUnit } from './buildings.js';
import { canAttack, resolveCombat, canAttackBuilding, resolveBuildingCombat, canRangedAttack, resolveRangedCombat, canRangedAttackBuilding, resolveRangedBuildingCombat, chargeAndRetreat } from './combat.js';
import { getReachableTiles, moveUnit } from './movement.js';
import { getUnitsAt } from './units.js';
import { dist } from './utils.js';

export function aiTurn(state, rand = Math.random) {
  const playerIdx = state.currentPlayer;
  const player = state.players[playerIdx];
  if (!player || !player.alive) return;

  const difficulty = state.difficulty || 'easy';
  const diff = DIFFICULTY[difficulty] || DIFFICULTY.easy;

  aiProduceUnits(state, playerIdx, diff);
  aiBuildStructures(state, playerIdx, rand, diff);
  aiMoveAndAttack(state, playerIdx, diff);
}

function aiProduceUnits(state, playerIdx, diff) {
  const player = state.players[playerIdx];
  const priority = ['infantry', 'archer', 'light_cavalry', 'supply', 'heavy_cavalry'];

  for (const [bkey, b] of state.buildings) {
    if (b.owner !== playerIdx) continue;
    const bType = canProduce(state, playerIdx, bkey);
    if (!bType) continue;

    for (const utype of priority) {
      const cfg = UNIT_TYPES[utype];
      if (BARRACKS_TYPE_MAP[bType] !== utype) continue;
      if (player.food >= cfg.buildCost + diff.aiProduceThreshold) {
        produceUnit(state, playerIdx, bkey, utype);
        break;
      }
    }
  }
}

function aiBuildStructures(state, playerIdx, rand, diff) {
  const player = state.players[playerIdx];
  if (player.food < diff.aiBuildThreshold) return;

  const hqX = player.hqX, hqY = player.hqY;
  const buildR = diff.aiBuildRadius;
  const candidates = [];
  for (let dy = -buildR; dy <= buildR; dy++) {
    for (let dx = -buildR; dx <= buildR; dx++) {
      const x = hqX + dx, y = hqY + dy;
      if (canBuildOn(state, x, y, playerIdx)) candidates.push({ x, y });
    }
  }
  if (candidates.length === 0) return;

  const pos = candidates[Math.floor(rand() * candidates.length)];
  const hasFarms = [...state.buildings.values()].filter(b => b.owner === playerIdx && b.type === 'farm').length;
  let buildOrder;
  if (hasFarms < 2) {
    buildOrder = 'farm';
  } else if (diff.aiSmartTarget) {
    // 智能AI：优先箭塔 + 兵营
    const r = rand();
    if (r < 0.35) buildOrder = 'arrow_tower';
    else if (r < 0.6) buildOrder = 'infantry_barracks';
    else if (r < 0.8) buildOrder = 'archer_barracks';
    else if (r < 0.9) buildOrder = 'lc_barracks';
    else buildOrder = 'watchtower';
  } else {
    buildOrder = rand() < 0.4 ? 'arrow_tower' : (rand() < 0.5 ? 'infantry_barracks' : 'archer_barracks');
  }

  const cfg = BUILDING_TYPES[buildOrder];
  if (cfg.buildable && player.food >= cfg.buildCost + 1000) {
    buildStructure(state, playerIdx, pos.x, pos.y, buildOrder);
  }
}

function aiMoveAndAttack(state, playerIdx, diff) {
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
        // 难度属性加成：攻击时增加伤害
        if (diff.aiUnitAtkMul > 1) {
          const origTroops = u.troops;
          u.troops = Math.ceil(u.troops * diff.aiUnitAtkMul);
          resolveCombat(state, u, enemy);
          u.troops = origTroops;
        } else {
          resolveCombat(state, u, enemy);
        }
        attacked = true;
        break;
      }
      // 远程攻击（仅困难+）
      if (!attacked && diff.aiRangedAttack && cfg.rangedAtkRange && canRangedAttack(state, u, enemy)) {
        if (diff.aiUnitAtkMul > 1) {
          const origTroops = u.troops;
          u.troops = Math.ceil(u.troops * diff.aiUnitAtkMul);
          resolveRangedCombat(state, u, enemy);
          u.troops = origTroops;
        } else {
          resolveRangedCombat(state, u, enemy);
        }
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
        // 智能AI：同时考虑攻击敌方主营
        if (diff.aiSmartTarget) {
          for (const ep of state.players) {
            if (ep.index === playerIdx || !ep.alive) continue;
            for (const [rk] of reachable) {
              if (rk === `${u.x},${u.y}`) continue;
              const [rx, ry] = rk.split(',').map(Number);
              const d = dist(rx, ry, ep.hqX, ep.hqY);
              if (d < bestDist) { bestDist = d; bestMove = { x: rx, y: ry }; }
            }
          }
        } else {
          for (const ep of state.players) {
            if (ep.index === playerIdx || !ep.alive) continue;
            for (const [rk] of reachable) {
              if (rk === `${u.x},${u.y}`) continue;
              const [rx, ry] = rk.split(',').map(Number);
              const d = dist(rx, ry, ep.hqX, ep.hqY);
              if (d < bestDist) { bestDist = d; bestMove = { x: rx, y: ry }; }
            }
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
          const origX = u.x, origY = u.y;
          if (diff.aiUnitAtkMul > 1) {
            const origTroops = u.troops;
            u.troops = Math.ceil(u.troops * diff.aiUnitAtkMul);
            resolveCombat(state, u, enemy);
            u.troops = origTroops;
          } else {
            resolveCombat(state, u, enemy);
          }
          // 目标未死则撤回
          if (state.units.includes(enemy) && enemy.troops > 0) {
            chargeAndRetreat(state, u, origX, origY, true);
          }
          break;
        }
      }
      // 远程攻击（仅困难+）
      if (!u.attacked && diff.aiRangedAttack && cfg.rangedAtkRange) {
        for (const enemy of enemies) {
          if (!state.units.includes(enemy)) continue;
          if (canRangedAttack(state, u, enemy)) {
            if (diff.aiUnitAtkMul > 1) {
              const origTroops = u.troops;
              u.troops = Math.ceil(u.troops * diff.aiUnitAtkMul);
              resolveRangedCombat(state, u, enemy);
              u.troops = origTroops;
            } else {
              resolveRangedCombat(state, u, enemy);
            }
            break;
          }
        }
      }
      // 攻击建筑
      if (!u.attacked) {
        if (diff.aiSmartTarget) {
          const prio = ['hq', 'farm', 'granary', 'arrow_tower',
            'infantry_barracks', 'archer_barracks', 'lc_barracks', 'hc_barracks',
            'supply_barracks', 'wall', 'watchtower'];
          for (const ptype of prio) {
            for (const [bkey, b] of state.buildings) {
              if (b.type !== ptype || b.owner === playerIdx) continue;
              const [bx, by] = bkey.split(',').map(Number);
              if (canAttackBuilding(state, u, bx, by)) {
                const origX = u.x, origY = u.y;
                if (diff.aiUnitAtkMul > 1) {
                  const origTroops = u.troops;
                  u.troops = Math.ceil(u.troops * diff.aiUnitAtkMul);
                  resolveBuildingCombat(state, u, bx, by);
                  u.troops = origTroops;
                } else {
                  resolveBuildingCombat(state, u, bx, by);
                }
                // 建筑未摧毁则撤回
                const bAfter = state.buildings.get(bkey);
                if (bAfter && bAfter.hp > 0) {
                  chargeAndRetreat(state, u, origX, origY, true);
                }
                break;
              }
              // 远程攻击建筑
              if (!u.attacked && diff.aiRangedAttack && cfg.rangedAtkRange) {
                if (canRangedAttackBuilding(state, u, bx, by)) {
                  if (diff.aiUnitAtkMul > 1) {
                    const origTroops = u.troops;
                    u.troops = Math.ceil(u.troops * diff.aiUnitAtkMul);
                    resolveRangedBuildingCombat(state, u, bx, by);
                    u.troops = origTroops;
                  } else {
                    resolveRangedBuildingCombat(state, u, bx, by);
                  }
                  break;
                }
              }
            }
            if (u.attacked) break;
          }
        } else {
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
