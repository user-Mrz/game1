// 建筑系统

import { BUILDING_TYPES, UNIT_TYPES, TERRAIN } from './config.js';
import { getTerrain, getBuilding, isPassable, dist } from './utils.js';
import { getUnitsAt, spawnUnit, removeDeadUnits } from './units.js';

// ========== 建造 ==========

export function canBuildOn(state, x, y, playerIdx) {
  // 只允许在平原和沃土上建造；森林、山地、河流均不可建造
  const t = getTerrain(state, x, y);
  if (t !== TERRAIN.PLAIN && t !== TERRAIN.FERTILE) return false;
  if (getBuilding(state, x, y)) return false;
  if (getUnitsAt(state, x, y).length > 0) return false;
  return true;
}

// 获取玩家视野内所有可建造位置
export function getBuildablePositions(state, playerIdx) {
  const exp = state.explored[playerIdx];
  if (!exp) return [];
  const positions = [];
  for (let y = 0; y < state.mapH; y++) {
    for (let x = 0; x < state.mapW; x++) {
      if (!exp[y * state.mapW + x]) continue;
      if (canBuildOn(state, x, y, playerIdx)) {
        positions.push({ x, y });
      }
    }
  }
  return positions;
}

export function buildStructure(state, playerIdx, x, y, buildingType) {
  const cfg = BUILDING_TYPES[buildingType];
  const player = state.players[playerIdx];
  if (player.food < cfg.buildCost) return false;
  player.food -= cfg.buildCost;
  state.buildings.set(`${x},${y}`, { type: buildingType, owner: playerIdx, hp: cfg.hp });
  state.actionMsg = `建造了${cfg.name}！`;
  return true;
}

// ========== 拆除 ==========

export function demolishStructure(state, playerIdx, x, y) {
  const b = state.buildings.get(`${x},${y}`);
  if (!b || b.owner !== playerIdx) return false;
  const cfg = BUILDING_TYPES[b.type];
  // 除主营外，其他建筑（农田/兵营/箭塔/城墙/哨塔）均可拆除
  if (b.type === 'hq' || !cfg.buildCost) return false;
  const refund = Math.floor(cfg.buildCost * 0.5);
  const player = state.players[playerIdx];
  player.food += refund;
  state.buildings.delete(`${x},${y}`);
  state.actionMsg = `拆除了${cfg.name}，返还${refund}粮草！`;
  return true;
}

// ========== 生产 ==========

export function canProduce(state, playerIdx, buildingKey) {
  const [bx, by] = buildingKey.split(',').map(Number);
  const b = state.buildings.get(buildingKey);
  if (!b || b.owner !== playerIdx) return null;
  if (getUnitsAt(state, bx, by).some(u => u.owner !== playerIdx)) return null;
  return b.type;
}

export function produceUnit(state, playerIdx, buildingKey, unitType) {
  const [bx, by] = buildingKey.split(',').map(Number);
  const b = state.buildings.get(buildingKey);
  if (!b || b.owner !== playerIdx) return false;

  const cfg = UNIT_TYPES[unitType];
  const player = state.players[playerIdx];
  if (player.food < cfg.buildCost) return false;

  let placeX = bx, placeY = by;
  if (getUnitsAt(state, bx, by).length > 0) {
    let found = false;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const nx = bx + dx, ny = by + dy;
      if (isPassable(state, nx, ny, playerIdx) && getUnitsAt(state, nx, ny).length === 0) {
        placeX = nx; placeY = ny; found = true; break;
      }
    }
    if (!found) return false;
  }

  player.food -= cfg.buildCost;
  spawnUnit(state, playerIdx, unitType, placeX, placeY);
  state.actionMsg = `生产了${cfg.name}！`;
  return true;
}

// ========== 箭塔攻击 ==========

export function arrowTowerAttack(state) {
  let msg = '';
  for (const [bkey, b] of state.buildings) {
    if (b.owner !== state.currentPlayer || b.type !== 'arrow_tower') continue;
    const [bx, by] = bkey.split(',').map(Number);
    for (const u of state.units) {
      if (u.owner === state.currentPlayer) continue;
      if (dist(bx, by, u.x, u.y) <= 2) {
        const dmg = BUILDING_TYPES.arrow_tower.atk;
        const defCfg = UNIT_TYPES[u.type];
        const troopLoss = Math.ceil(dmg / defCfg.hpPerTroop);
        u.troops = Math.max(0, u.troops - troopLoss);
        msg += `箭塔对${defCfg.name}造成${dmg}伤害！`;
        break;
      }
    }
  }
  removeDeadUnits(state);
  return msg;
}

// ========== 粮仓：单位站上后，将玩家个人粮草转化为该单位储备 ==========

export function granarySupply(state, unit) {
  const b = state.buildings.get(`${unit.x},${unit.y}`);
  if (!b || b.type !== 'granary' || b.owner !== unit.owner) return;
  const cfg = UNIT_TYPES[unit.type];
  const player = state.players[unit.owner];
  if (!player) return;
  const needed = cfg.foodCap - unit.supplies;
  if (needed > 0 && player.food > 0) {
    const give = Math.min(needed, player.food);
    unit.supplies += give;
    player.food -= give;
    state.actionMsg += `粮仓补充${give}粮草给${cfg.name}；`;
  }
}

// ========== 建筑摧毁处理 ==========

export function checkBuildingDestroyed(state) {
  const toRemove = [];
  for (const [bkey, b] of state.buildings) {
    if (b.hp <= 0) {
      if (b.type === 'farm' || b.type === 'granary') {
        const [bx, by] = bkey.split(',').map(Number);
        // 归属摧毁它的玩家；若无攻击者信息则回退为最近的敌方单位
        let newOwner = b.lastHitBy !== undefined && b.lastHitBy >= 0 ? b.lastHitBy : -1;
        if (newOwner === b.owner || newOwner < 0 || newOwner >= state.players.length) {
          newOwner = b.owner;
          let minD = Infinity;
          for (const u of state.units) {
            if (u.owner !== b.owner) {
              const d = dist(u.x, u.y, bx, by);
              if (d < minD) { minD = d; newOwner = u.owner; }
            }
          }
        }
        b.owner = newOwner;
        b.hp = 500;
        b.lastHitBy = undefined;
        state.actionMsg += `${BUILDING_TYPES[b.type].name}被占领！`;
      } else if (b.type === 'hq') {
        const player = state.players[b.owner];
        player.alive = false;
        state.units = state.units.filter(u => u.owner !== b.owner);
        toRemove.push(bkey);
        state.actionMsg += `${player.name}的主营被摧毁！${player.name}出局！`;
      } else {
        toRemove.push(bkey);
        state.actionMsg += `${BUILDING_TYPES[b.type]?.name || '建筑'}被摧毁！`;
      }
    }
  }
  for (const bk of toRemove) state.buildings.delete(bk);
}
