// AI 系统

import { UNIT_TYPES, BUILDING_TYPES, BARRACKS_TYPE_MAP, DIFFICULTY, unitHungerMul } from './config.js';
import { estimateFarmIncome, estimateArmyUpkeep } from './economy.js';
import { canBuildOn, buildStructure, canProduce, produceUnit } from './buildings.js';
import { canAttack, resolveCombat, canAttackBuilding, resolveBuildingCombat, canRangedAttack, resolveRangedCombat, canRangedAttackBuilding, resolveRangedBuildingCombat, chargeAndRetreat } from './combat.js';
import { getReachableTiles, moveUnit } from './movement.js';
import { getUnitsAt } from './units.js';
import { dist, isPassable } from './utils.js';
import { getDistanceField, fieldAt } from './pathfind.js';

export function aiTurn(state, rand = Math.random) {
  const playerIdx = state.currentPlayer;
  const player = state.players[playerIdx];
  if (!player || !player.alive) return;

  const difficulty = state.difficulty || 'easy';
  const diff = DIFFICULTY[difficulty] || DIFFICULTY.easy;

  // 先算出"下一步该造什么"，生产时预留这笔钱，避免把粮草全部吃进兵里、永远造不起农田
  const nextBuild = aiNextBuild(state, playerIdx, rand, diff);
  aiProduceUnits(state, playerIdx, diff, nextBuild);
  aiBuildStructures(state, playerIdx, rand, diff, nextBuild);
  aiMoveAndAttack(state, playerIdx, diff);
  aiLogistics(state, playerIdx);
}

function countBuildings(state, playerIdx, type) {
  let n = 0;
  for (const [, b] of state.buildings) if (b.owner === playerIdx && b.type === type) n++;
  return n;
}

// 建筑上限：AI 每回合都能造一栋，没有上限会在 30 回合内堆出 20+ 箭塔
const AI_BUILD_CAP = {
  farm: 4, supply_barracks: 1, granary: 2,
  infantry_barracks: 2, archer_barracks: 2, lc_barracks: 1, hc_barracks: 1,
  arrow_tower: 5, watchtower: 2, wall: 6,
};

// 经济优先级：先保证 2 农田 → 后勤营 → 粮仓 → 第 3 农田 → 兵营 → 按上限补
function aiNextBuild(state, playerIdx, rand, diff) {
  const c = (t) => countBuildings(state, playerIdx, t);
  const under = (t) => c(t) < (AI_BUILD_CAP[t] ?? 1);

  if (c('farm') < 2 && under('farm')) return 'farm';
  if (under('supply_barracks')) return 'supply_barracks';
  if (under('granary')) return 'granary';
  if (c('farm') < 3 && under('farm')) return 'farm';
  if (under('infantry_barracks')) return 'infantry_barracks';
  if (under('archer_barracks')) return 'archer_barracks';

  const pool = [];
  if (under('arrow_tower')) pool.push('arrow_tower', 'arrow_tower');
  if (under('infantry_barracks')) pool.push('infantry_barracks');
  if (under('archer_barracks')) pool.push('archer_barracks');
  if (under('lc_barracks')) pool.push('lc_barracks');
  if (under('hc_barracks')) pool.push('hc_barracks');
  if (under('watchtower')) pool.push('watchtower');
  if (under('wall')) pool.push('wall');
  if (under('farm')) pool.push('farm');
  if (pool.length === 0) return null;
  return pool[Math.floor(rand() * pool.length)];
}

function aiProduceUnits(state, playerIdx, diff, nextBuild) {
  const player = state.players[playerIdx];
  const priority = ['infantry', 'archer', 'light_cavalry', 'supply', 'heavy_cavalry'];
  const combatCount = state.units.filter(u => u.owner === playerIdx && u.type !== 'supply').length;
  const supplyCount = state.units.filter(u => u.owner === playerIdx && u.type === 'supply').length;
  // 补给兵上限：每 3 个战斗单位配 1 个补给兵，防止 AI 把产能全部投进后勤
  const supplyCap = Math.max(1, Math.ceil(combatCount / 3));
  const reserve = nextBuild ? (BUILDING_TYPES[nextBuild]?.buildCost || 0) : 0;
  // 后勤闸门：过半部队吃不上饭时停止扩军（只允许继续造补给兵），否则新兵会在半路饿死
  let lowCount = 0;
  for (const u of state.units) {
    if (u.owner !== playerIdx || u.type === 'supply') continue;
    const cap = UNIT_TYPES[u.type].foodCap;
    if (cap > 0 && u.supplies < cap * 0.4) lowCount++;
  }
  // 收支闸门（原实现看的是粮草余额 < 5000，是错的）：
  // 余额只反映"这一阵子没花完"，不反映"养不养得起"。实测有 AI 每回合亏 3000 粮、
  // 余额仍剩 8000 就继续扩军，最后 59 个单位全在半饿状态；另一个 AI 囤了 12 万粮却只养 19 个兵。
  // 正确判据是「全军维持需求 > 农田产出」——超过这条线就该停手，再多造只会让全军一起饿瘦。
  // 实测这条闸门让军队稳定收敛在 4 农田 / 21~29 个战斗单位，并在超载时自动减产（负反馈闭环），
  // 而不再像以前那样一路涨到 59 个还在亏。
  const income = estimateFarmIncome(state, playerIdx);
  const upkeep = estimateArmyUpkeep(state, playerIdx);
  const overCapacity = combatCount > 0 && upkeep > income;
  const starving = combatCount > 0 && (lowCount * 2 > combatCount || overCapacity);

  for (const [bkey, b] of state.buildings) {
    if (b.owner !== playerIdx) continue;
    const bType = canProduce(state, playerIdx, bkey);
    if (!bType) continue;

    for (const utype of priority) {
      const cfg = UNIT_TYPES[utype];
      if (BARRACKS_TYPE_MAP[bType] !== utype) continue;
      if (utype === 'supply' && supplyCount >= supplyCap) break;
      if (utype !== 'supply' && starving) break;
      if (player.food >= cfg.buildCost + diff.aiProduceThreshold + reserve) {
        produceUnit(state, playerIdx, bkey, utype);
        break;
      }
    }
  }
}

function aiBuildStructures(state, playerIdx, rand, diff, buildOrder) {
  if (!buildOrder) return;
  const player = state.players[playerIdx];
  if (player.food < diff.aiBuildThreshold) return;

  const hqX = player.hqX, hqY = player.hqY;
  const buildR = diff.aiBuildRadius;
  const candidates = [];
  for (let dy = -buildR; dy <= buildR; dy++) {
    for (let dx = -buildR; dx <= buildR; dx++) {
      const x = hqX + dx, y = hqY + dy;
      if (canBuildOn(state, x, y, playerIdx, buildOrder)) candidates.push({ x, y });
    }
  }
  if (candidates.length === 0) return;

  const pos = candidates[Math.floor(rand() * candidates.length)];
  const cfg = BUILDING_TYPES[buildOrder];
  if (cfg && cfg.buildable && player.food >= cfg.buildCost + Math.floor(diff.aiBuildThreshold / 2)) {
    buildStructure(state, playerIdx, pos.x, pos.y, buildOrder);
  }
}

// 兵种击杀优先级：断粮道 > 切后排 > 打前排
const KILL_PRIORITY = { supply: 60, archer: 30, light_cavalry: 20, heavy_cavalry: 10, infantry: 0 };
// 拆建筑的价值权重（加在距离上，数值越小越优先）
const BUILD_TARGET_WEIGHT = {
  hq: 0, infantry_barracks: 1, archer_barracks: 1, lc_barracks: 1, hc_barracks: 1,
  supply_barracks: 1, arrow_tower: 2, granary: 3, farm: 4, watchtower: 5, wall: 7,
};

function nearestThreatToHQ(state, playerIdx, radius) {
  const p = state.players[playerIdx];
  let best = null, bd = Infinity;
  for (const e of state.units) {
    if (e.owner === playerIdx) continue;
    const d = dist(e.x, e.y, p.hqX, p.hqY);
    if (d <= radius && d < bd) { bd = d; best = e; }
  }
  return best;
}

// 守备单位：离主营最近的一个，负责看家 + 维持建造视野
function pickGuard(state, playerIdx, myUnits) {
  const p = state.players[playerIdx];
  return myUnits.slice().sort((a, b) =>
    (dist(a.x, a.y, p.hqX, p.hqY) - dist(b.x, b.y, p.hqX, p.hqY)) || (a.troops - b.troops)
  )[0];
}

// 追击目标评分：近的、残血的、高价值兵种优先；轻骑兵对后排加权
function pursuitScore(u, e, d) {
  const maxHp = UNIT_TYPES[e.type].troops * UNIT_TYPES[e.type].hpPerTroop;
  const hp = e.troops * UNIT_TYPES[e.type].hpPerTroop;
  const roleMul = u.type === 'light_cavalry' ? 2 : 1;
  return 50 - d * 3 + (KILL_PRIORITY[e.type] || 0) * roleMul + (1 - hp / maxHp) * 40;
}

function pickGoal(state, u, playerIdx, enemies) {
  let best = null, bestScore = -Infinity;
  for (const e of enemies) {
    if (!state.units.includes(e)) continue;
    const d = dist(u.x, u.y, e.x, e.y);
    // 只打"眼前之敌"：原实现允许追 14 格内的敌人，于是 100 个单位的军队全员在野地里追人，
    // 实测每回合贴到敌方建筑的单位只有 0~2 个、建筑伤害常年为 0 —— 军队能走到，但从不攻城。
    // 远处的敌人交给「作战目标」的宏观推进，不在这里分散兵力。
    if (d > 3) continue;
    const sc = pursuitScore(u, e, d);
    if (sc > bestScore) { bestScore = sc; best = e; }
  }
  if (best) return { x: best.x, y: best.y };

  // 附近没有敌人部队时，压向「最近的敌方建筑」，而不是最近的敌方主营。
  // 原因：四方等距开局时，所有 AI 都会锁定同一个最近主营，变成三家围殴一家、
  // 彼此之间永不交战。按建筑选目标后，每个 AI 会自然推自己面前那条边境。
  let bTarget = null, bScore = Infinity;
  for (const [bkey, b] of state.buildings) {
    if (b.owner === playerIdx) continue;
    const [bx, by] = bkey.split(',').map(Number);
    // 距离 + 目标价值惩罚：优先拆「能造兵的东西」和主营，农田/城墙往后排
    const sc = dist(u.x, u.y, bx, by) + (BUILD_TARGET_WEIGHT[b.type] ?? 4);
    if (sc < bScore) { bScore = sc; bTarget = { x: bx, y: by }; }
  }
  if (bTarget) return bTarget;

  let hq = null, hd = Infinity;
  for (const p of state.players) {
    if (p.index === playerIdx || !p.alive) continue;
    const d = dist(u.x, u.y, p.hqX, p.hqY);
    if (d < hd) { hd = d; hq = p; }
  }
  return hq ? { x: hq.hqX, y: hq.hqY } : null;
}

// 全军本回合的「作战目标」：一座敌方建筑。
// 关键：目标按「全军质心」算距离，而不是各算各的 —— 否则每个单位选中的建筑不同，
// 兵力被摊平到几条边境上，谁也打不穿。全aim在一个点上，才可能啃掉 12000 血的主营。
function pickWarTarget(state, playerIdx, myUnits) {
  if (!myUnits.length) return null;
  let cx = 0, cy = 0;
  for (const u of myUnits) { cx += u.x; cy += u.y; }
  cx /= myUnits.length; cy /= myUnits.length;

  let best = null, bestScore = Infinity;
  for (const [bkey, b] of state.buildings) {
    if (b.owner === playerIdx) continue;
    const [bx, by] = bkey.split(',').map(Number);
    // 距离 + 价值惩罚（×2 放大到"最多相当于 14 格路程"的量级，不让价值权重淹没距离）
    const score = dist(cx, cy, bx, by) + (BUILD_TARGET_WEIGHT[b.type] ?? 4) * 2;
    if (score < bestScore) { bestScore = score; best = { x: bx, y: by, key: bkey, type: b.type }; }
  }
  return best;
}

// 攻城协同：本回合能压到同一座敌方建筑旁的兵力 ≥2 时，这些单位攻击后「不撤退」，钉住攻城线。
// 单兵仍然是打了就撤（袭扰），只有形成围攻才留下 —— 撤退本身不减少输出，
// 它的价值在于"占住格子"：贴住才能阻止对方在原地补建，也才能让下一回合直接原地开打。
function siegeTargets(state, playerIdx, myUnits) {
  const set = new Set();
  for (const [bkey, b] of state.buildings) {
    if (b.owner === playerIdx) continue;
    const [bx, by] = bkey.split(',').map(Number);
    let n = 0;
    for (const u of myUnits) {
      const cfg = UNIT_TYPES[u.type];
      if (dist(u.x, u.y, bx, by) <= cfg.move + Math.max(1, cfg.atkRange)) n++;
      if (n >= 2) break;
    }
    if (n >= 2) set.add(bkey);
  }
  return set;
}

// 集火：优先「这一击能打死」的目标，其次残血，其次高价值兵种
function pickAttackTarget(state, u, enemies) {
  let best = null, bestScore = -Infinity;
  // 判断"这一击能不能打死"必须用实际输出（含饥兵系数），否则饿着肚子也会去挑满编目标
  const dmg = Math.floor(u.troops * UNIT_TYPES[u.type].atkPerTroop * unitHungerMul(u));
  for (const e of enemies) {
    if (!state.units.includes(e)) continue;
    if (!canAttack(state, u, e)) continue;
    const maxHp = UNIT_TYPES[e.type].troops * UNIT_TYPES[e.type].hpPerTroop;
    const hp = e.troops * UNIT_TYPES[e.type].hpPerTroop;
    let sc = (1 - hp / maxHp) * 60 + (KILL_PRIORITY[e.type] || 0);
    if (dmg >= hp) sc += 1000;            // 能击杀，绝不浪费伤害
    if (sc > bestScore) { bestScore = sc; best = e; }
  }
  return best;
}

function attackUnit(state, u, target, diff, retreat) {
  const origX = u.x, origY = u.y;
  const run = () => resolveCombat(state, u, target);
  if (diff.aiUnitAtkMul > 1) {
    const o = u.troops;
    u.troops = Math.ceil(u.troops * diff.aiUnitAtkMul);
    run();
    u.troops = o;
  } else run();
  if (retreat && state.units.includes(target) && target.troops > 0) {
    chargeAndRetreat(state, u, origX, origY, true);
  }
}

function attackBuilding(state, u, playerIdx, diff, holdSet) {
  const prio = diff.aiSmartTarget
    ? ['hq', 'farm', 'granary', 'arrow_tower', 'infantry_barracks', 'archer_barracks', 'lc_barracks', 'hc_barracks', 'supply_barracks', 'wall', 'watchtower']
    : ['farm', 'granary', 'arrow_tower', 'hq', 'infantry_barracks', 'archer_barracks', 'lc_barracks', 'hc_barracks', 'supply_barracks', 'wall', 'watchtower'];

  for (const ptype of prio) {
    for (const [bkey, b] of state.buildings) {
      if (b.type !== ptype || b.owner === playerIdx) continue;
      const [bx, by] = bkey.split(',').map(Number);
      if (!canAttackBuilding(state, u, bx, by)) continue;
      const origX = u.x, origY = u.y;
      const run = () => resolveBuildingCombat(state, u, bx, by);
      if (diff.aiUnitAtkMul > 1) {
        const o = u.troops;
        u.troops = Math.ceil(u.troops * diff.aiUnitAtkMul);
        run();
        u.troops = o;
      } else run();
      const after = state.buildings.get(bkey);
      // 围攻中的目标不撤退，其余打完退回原位（袭扰）
      const hold = holdSet && holdSet.has(bkey);
      if (after && after.hp > 0 && !hold) chargeAndRetreat(state, u, origX, origY, true);
      return true;
    }
    if (u.attacked) return true;
  }
  return false;
}

// 沿距离场走一步：从「可达格」里选离目标步数最少的那格，
// 贪心只看直线距离会被山地/河流卡住，距离场能绕路。
function stepToward(state, unit, tx, ty, playerIdx, cache) {
  const passable = (x, y) => isPassable(state, x, y, playerIdx);
  const field = getDistanceField(state, tx, ty, passable, cache, playerIdx);
  const cur = fieldAt(state, field, unit.x, unit.y);
  const reachable = getReachableTiles(state, unit, playerIdx);
  if (reachable.size <= 1) return false;

  let best = null;
  let bestD = cur < 0 ? Infinity : cur;
  for (const rk of reachable.keys()) {
    const i = rk.indexOf(',');
    const rx = Number(rk.slice(0, i));
    const ry = Number(rk.slice(i + 1));
    const d = fieldAt(state, field, rx, ry);
    if (d < 0) continue;
    if (d < bestD) { bestD = d; best = { x: rx, y: ry }; }
  }
  if (!best) return false;
  moveUnit(state, unit, best.x, best.y);
  return true;
}

function aiMoveAndAttack(state, playerIdx, diff) {
  const myUnits = state.units.filter(u => u.owner === playerIdx && u.type !== 'supply');
  const enemies = state.units.filter(u => u.owner !== playerIdx);
  const cache = new Map();

  // 老家被摸 → 只有「附近能赶回来的」回防，前线部队继续压
  // （如果全军掉头，两个 AI 会在各自家门口来回摆动，永远打不起来）
  const p = state.players[playerIdx];
  const threat = nearestThreatToHQ(state, playerIdx, 5);
  const guard = (!threat && myUnits.length >= 3) ? pickGuard(state, playerIdx, myUnits) : null;

  // 全军统一的作战目标 + 围攻点集合（每回合只算一次，保证同一批部队压同一个点）
  const warTarget = pickWarTarget(state, playerIdx, myUnits);
  const holdSet = siegeTargets(state, playerIdx, myUnits);

  for (const u of myUnits) {
    if (u.moved) continue;
    const cfg = UNIT_TYPES[u.type];
    if (cfg.atkRange === 0) continue;

    // 1) 站着能打就先打，不浪费输出
    if (!u.attacked) {
      const t0 = pickAttackTarget(state, u, enemies);
      if (t0) { attackUnit(state, u, t0, diff, false); continue; }
    }

    // 2) 选目标：回防 > 守家 > 压向全军作战目标 > 兜底（追近敌 / 最近敌建筑）
    let goal = null;
    if (threat && dist(u.x, u.y, p.hqX, p.hqY) <= 14) {
      goal = { x: threat.x, y: threat.y };
    } else if (u === guard) {
      goal = { x: p.hqX, y: p.hqY };
    } else {
      goal = warTarget || pickGoal(state, u, playerIdx, enemies);
    }

    // 3) 沿距离场推进
    if (goal && cfg.move >= 1) stepToward(state, u, goal.x, goal.y, playerIdx, cache);

    // 4) 移动后再打（集火优先）
    if (!u.attacked) {
      const t1 = pickAttackTarget(state, u, enemies);
      if (t1) { attackUnit(state, u, t1, diff, true); continue; }
    }

    // 5) 周围没有部队可打，就拆建筑（围攻点不撤退）
    if (!u.attacked) attackBuilding(state, u, playerIdx, diff, holdSet);
  }

  // 补给兵调度交给 aiLogistics
}

// ========== AI 后勤 ==========
// 长距离投送下，没有补给的军队会整建制饿死。
// AI 的补给兵：向「储备低于 60%」的友军靠拢；全员充足时回己方粮仓补货（站上去即按兵种换算率补满）。
function aiLogistics(state, playerIdx) {
  const supplies = state.units.filter(u => u.owner === playerIdx && u.type === 'supply' && !u.moved && u.moveCD === 0 && u.riverDelay === 0);
  if (supplies.length === 0) return;

  const granaryEntry = [...state.buildings.entries()].find(([, b]) => b.owner === playerIdx && b.type === 'granary');

  for (const su of supplies) {
    const needy = state.units
      .filter(u => u.owner === playerIdx && u.id !== su.id)
      .filter(u => {
        const c = UNIT_TYPES[u.type];
        return c.foodCap > 0 && u.supplies < c.foodCap * 0.6;
      })
      .sort((a, b) => dist(su.x, su.y, a.x, a.y) - dist(su.x, su.y, b.x, b.y));

    let target = needy[0];
    if (!target && granaryEntry) {
      const [gx, gy] = granaryEntry[0].split(',').map(Number);
      if (su.x === gx && su.y === gy) continue;      // 已在粮仓上补货，原地待命
      target = { x: gx, y: gy };
    }
    if (!target) continue;
    if (su.x === target.x && su.y === target.y) continue;

    const reachable = getReachableTiles(state, su, playerIdx);
    let bestMove = null;
    let bestDist = dist(su.x, su.y, target.x, target.y);
    for (const [rk] of reachable) {
      if (rk === `${su.x},${su.y}`) continue;
      const [rx, ry] = rk.split(',').map(Number);
      const d = dist(rx, ry, target.x, target.y);
      if (d < bestDist) { bestDist = d; bestMove = { x: rx, y: ry }; }
    }
    if (bestMove) moveUnit(state, su, bestMove.x, bestMove.y);
  }
}
