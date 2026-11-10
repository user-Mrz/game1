// 粮草 & 补给系统

import { BUILDING_TYPES, UNIT_TYPES, TERRAIN } from './config.js';
import { getTerrain, dist } from './utils.js';
import { removeDeadUnits } from './units.js';

export function collectFood(state) {
  const player = state.players[state.currentPlayer];
  let collected = 0;
  const farmCfg = BUILDING_TYPES.farm;
  for (const [bkey, b] of state.buildings) {
    if (b.owner === state.currentPlayer && b.type === 'farm') {
      const [bx, by] = bkey.split(',').map(Number);
      let amount = farmCfg.foodPerTurn || 1200;
      if (getTerrain(state, bx, by) === TERRAIN.FERTILE) amount *= (farmCfg.fertileMul || 2);
      collected += amount;
    }
  }
  player.food += collected;
  return collected;
}

// 该玩家每回合的农田产出（含沃土加成），用于判断"养得起多大规模的军队"
export function estimateFarmIncome(state, playerIdx) {
  const farmCfg = BUILDING_TYPES.farm;
  let total = 0;
  for (const [bkey, b] of state.buildings) {
    if (b.owner !== playerIdx || b.type !== 'farm') continue;
    const [bx, by] = bkey.split(',').map(Number);
    let amount = farmCfg.foodPerTurn || 1200;
    if (getTerrain(state, bx, by) === TERRAIN.FERTILE) amount *= (farmCfg.fertileMul || 2);
    total += amount;
  }
  return total;
}

// 该玩家全军每回合的维持开销（折算成粮草）：Σ troops × foodConsumeMul ÷ 粮仓换算率
// 这是"军队规模"真正的成本函数——超过农田产出就无法长期维持
export function estimateArmyUpkeep(state, playerIdx) {
  const conv = BUILDING_TYPES.granary.granaryConv || 1;
  let total = 0;
  for (const u of state.units) {
    if (u.owner !== playerIdx) continue;
    const cfg = UNIT_TYPES[u.type];
    if (!cfg || !cfg.foodConsumeMul) continue;
    total += (u.troops * cfg.foodConsumeMul) / conv;
  }
  return total;
}

export function consumeUnitSupplies(state) {
  for (const u of state.units) {
    if (u.owner !== state.currentPlayer) continue;
    const cfg = UNIT_TYPES[u.type];
    const consume = u.troops * cfg.foodConsumeMul;
    u.supplies -= consume;
    if (u.supplies < 0) {
      const shortage = Math.abs(u.supplies);
      const hpLoss = shortage;
      const hpPerTroop = cfg.hpPerTroop;
      const troopLoss = Math.ceil(hpLoss / hpPerTroop);
      u.troops = Math.max(0, u.troops - troopLoss);
      u.supplies = 0;
      if (u.troops <= 0) state.actionMsg += `${cfg.name}饿死了！`;
    }
  }
  removeDeadUnits(state);
}

// 单个补给兵向目标单位传递粮草
function transferSupply(state, supplyUnit, targetUnit) {
  const uCfg = UNIT_TYPES[targetUnit.type];
  const needed = uCfg.foodCap - targetUnit.supplies;
  if (needed > 0 && supplyUnit.supplies > 0) {
    const give = Math.min(needed, supplyUnit.supplies);
    targetUnit.supplies += give;
    supplyUnit.supplies -= give;
    state.actionMsg += `补给兵补充${give}粮草给${uCfg.name}；`;
  }
}

// 回合开始：补给兵补给周围相邻友军
export function supplyNearby(state, supplyUnit) {
  for (const u of state.units) {
    if (u.owner !== supplyUnit.owner || u.id === supplyUnit.id) continue;
    if (dist(supplyUnit.x, supplyUnit.y, u.x, u.y) <= 1) {
      transferSupply(state, supplyUnit, u);
    }
  }
}

// 单位移动后：补给兵靠近友军或友军靠近补给兵，立即传递粮草
export function supplyOnMove(state, unit) {
  if (unit.type === 'supply') {
    supplyNearby(state, unit);
    return;
  }
  for (const su of state.units) {
    if (su.owner !== unit.owner || su.type !== 'supply') continue;
    if (dist(su.x, su.y, unit.x, unit.y) <= 1) {
      transferSupply(state, su, unit);
    }
  }
}
