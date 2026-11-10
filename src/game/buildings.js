// 建筑系统

import { BUILDING_TYPES, UNIT_TYPES, TERRAIN, BUILD_RULES } from './config.js';
import { getTerrain, getBuilding, isPassable, dist } from './utils.js';
import { getUnitsAt, spawnUnit, removeDeadUnits } from './units.js';
import { isBuildVisibleToPlayer } from './vision.js';

// ========== 建造 ==========

export function getBuildRadius(state) {
  const r = BUILD_RULES.baseRadius + (state.turn - 1) * BUILD_RULES.radiusPerTurn;
  return Math.min(r, Math.max(state.mapW, state.mapH));
}

export function isInBuildRange(state, x, y, playerIdx) {
  const player = state.players[playerIdx];
  if (!player) return false;
  const r = getBuildRadius(state);
  return Math.abs(x - player.hqX) <= r && Math.abs(y - player.hqY) <= r;
}

// 建造必须在自己当前视野内：看不见的地方不许起楼
// 注意用的是「建」的视野——哨塔不提供建造视野，否则可以靠铺塔一路铺到对面家
export function isInBuildVision(state, x, y, playerIdx) {
  if (!BUILD_RULES.requireVision) return true;
  return isBuildVisibleToPlayer(state, x, y, playerIdx);
}

export function countPlayerBuildings(state, playerIdx, type) {
  let n = 0;
  for (const [, b] of state.buildings) {
    if (b.owner === playerIdx && b.type === type) n++;
  }
  return n;
}

// 返回不能建造的原因（供 UI 精确提示），可建造时返回 null
// buildingType 可选：用于校验哨塔数量上限等单类型限制
export function getBuildBlockReason(state, x, y, playerIdx, buildingType) {
  if (!isInBuildRange(state, x, y, playerIdx)) return '超出建筑范围';
  if (!isInBuildVision(state, x, y, playerIdx)) return '视野之外，无法建造';
  const t = getTerrain(state, x, y);
  if (t !== TERRAIN.PLAIN && t !== TERRAIN.FERTILE) return '仅平原和沃土可建造';
  if (getBuilding(state, x, y)) return '此处已有建筑';
  if (getUnitsAt(state, x, y).length > 0) return '此处有部队驻扎';
  if (buildingType === 'watchtower') {
    const owned = countPlayerBuildings(state, playerIdx, 'watchtower');
    if (owned >= BUILD_RULES.maxWatchtowers) {
      return `哨塔已达上限（${BUILD_RULES.maxWatchtowers} 座）`;
    }
  }
  return null;
}

export function canBuildOn(state, x, y, playerIdx, buildingType) {
  return getBuildBlockReason(state, x, y, playerIdx, buildingType) === null;
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
  state.buildings.set(`${x},${y}`, { type: buildingType, owner: playerIdx, hp: cfg.hp, cd: 0 });
  // 建造效果反馈
  if (state.effects) {
    state.effects.push({ type: 'build', x, y, startTime: performance.now(), duration: 800 });
  }
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

// 产兵冷却：生产后要等 cd 回合才能再生产（cd 在回合开始递减）
export function getProduceCooldown(state, buildingKey) {
  const b = state.buildings.get(buildingKey);
  return b ? (b.cd || 0) : 0;
}

export function canProduce(state, playerIdx, buildingKey) {
  const [bx, by] = buildingKey.split(',').map(Number);
  const b = state.buildings.get(buildingKey);
  if (!b || b.owner !== playerIdx) return null;
  if ((b.cd || 0) > 0) return null;
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
  b.cd = cfg.produceTurns || 1;
  state.actionMsg = `生产了${cfg.name}！（${b.cd} 回合后可再生产）`;
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
// 换算率是全局一个数（BUILDING_TYPES.granary.granaryConv）：储备能通过补给兵 1:1 流通，
// 各兵种用不同汇率就会产生"在便宜的兵种上买储备再倒卖"的套利，所以汇率必须唯一。

export function granarySupply(state, unit) {
  const b = state.buildings.get(`${unit.x},${unit.y}`);
  if (!b || b.type !== 'granary' || b.owner !== unit.owner) return;
  const cfg = UNIT_TYPES[unit.type];
  const player = state.players[unit.owner];
  if (!player) return;
  const conv = BUILDING_TYPES.granary.granaryConv || 1;
  const needed = cfg.foodCap - unit.supplies;
  if (needed > 0 && player.food > 0) {
    const give = Math.min(needed, player.food * conv);
    unit.supplies += give;
    player.food -= Math.ceil(give / conv);
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
