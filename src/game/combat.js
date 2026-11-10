// 战斗系统

import { UNIT_TYPES, BUILDING_TYPES, unitHungerMul } from './config.js';
import { dist } from './utils.js';
import { removeDeadUnits } from './units.js';

export function canAttack(state, attacker, defender) {
  if (attacker.id === defender.id) return false;
  if (attacker.owner === defender.owner) return false;
  if (attacker.attacked) return false;
  const cfg = UNIT_TYPES[attacker.type];
  if (cfg.atkRange === 0) return false;
  const d = dist(attacker.x, attacker.y, defender.x, defender.y);
  return d <= effectiveAtkRange(attacker, cfg);
}

// 有效攻击距离：弓兵移动后只能贴脸射击（moveShootRange），
// 否则「后退1格再射」可以无限风筝所有 1 速近战，射程将无解
function effectiveAtkRange(attacker, cfg) {
  if (attacker.moved && cfg.moveShootRange) return Math.min(cfg.atkRange, cfg.moveShootRange);
  return cfg.atkRange;
}

// ========== 冲锋与撤退 ==========
// 攻击后：若目标单位/建筑未被摧毁，攻击者返回原位准备下次攻击

export function chargeAndRetreat(state, attacker, origX, origY, targetAlive) {
  if (!targetAlive) return;
  const cfg = UNIT_TYPES[attacker.type];
  // 在移动范围内才返回
  const distToOrig = Math.abs(attacker.x - origX) + Math.abs(attacker.y - origY);
  if (distToOrig <= cfg.move + 1) {
    attacker.x = origX;
    attacker.y = origY;
  }
  if (state.effects) {
    state.effects.push({ type: 'move', fromX: origX, fromY: origY, x: attacker.x, y: attacker.y, startTime: performance.now(), duration: 500 });
  }
}

// ========== 远程攻击（弓兵专属） ==========

export function canRangedAttack(state, attacker, defender) {
  if (attacker.id === defender.id) return false;
  if (attacker.owner === defender.owner) return false;
  if (attacker.attacked) return false;
  const cfg = UNIT_TYPES[attacker.type];
  if (!cfg.rangedAtkRange) return false;
  const d = dist(attacker.x, attacker.y, defender.x, defender.y);
  return d <= cfg.rangedAtkRange;
}

export function canRangedAttackBuilding(state, attacker, x, y) {
  const b = state.buildings.get(`${x},${y}`);
  if (!b) return false;
  if (attacker.owner === b.owner) return false;
  if (attacker.attacked) return false;
  const cfg = UNIT_TYPES[attacker.type];
  if (!cfg.rangedAtkRange) return false;
  return dist(attacker.x, attacker.y, x, y) <= cfg.rangedAtkRange;
}

export function resolveRangedCombat(state, attacker, defender) {
  const atkCfg = UNIT_TYPES[attacker.type];
  const defCfg = UNIT_TYPES[defender.type];
  // 饥兵系数：储备见底的部队打不动（见 config.js HUNGER_RULES）
  const atkPower = Math.floor(attacker.troops * atkCfg.atkPerTroop * (atkCfg.rangedAtkMul || 0.5) * unitHungerMul(attacker));
  const defHP = defender.troops * defCfg.hpPerTroop;

  const damage = atkPower;
  const remainingHP = Math.max(0, defHP - damage);
  const remainingTroops = Math.ceil(remainingHP / defCfg.hpPerTroop);

  defender.troops = remainingTroops;
  attacker.attacked = true;

  // 远程攻击效果反馈
  if (state.effects) {
    state.effects.push({ type: 'ranged', fromX: attacker.x, fromY: attacker.y, x: defender.x, y: defender.y, startTime: performance.now(), duration: 600 });
  }

  state.actionMsg = `${atkCfg.name}远程射击${defCfg.name}，造成${damage}伤害！`;

  if (defender.troops <= 0 && defender.type === 'supply') {
    // 按设计文档：断粮道只奖励「击杀者补满自身储备」，不额外投放玩家粮草。
    // 原实现为 foodCap × 5，步兵击杀一次即得 30000 粮（≈25 回合农田产出），一次击杀直接定胜负。
    attacker.supplies = UNIT_TYPES[attacker.type].foodCap;
  }

  if (defender.troops <= 0) {
    state.actionMsg += ' 击杀！';
  }

  removeDeadUnits(state);
}

export function resolveRangedBuildingCombat(state, attacker, x, y) {
  const b = state.buildings.get(`${x},${y}`);
  if (!b) return false;
  const atkCfg = UNIT_TYPES[attacker.type];
  const bCfg = BUILDING_TYPES[b.type];
  const damage = Math.floor(attacker.troops * atkCfg.atkPerTroop * (atkCfg.rangedAtkMul || 0.5) * unitHungerMul(attacker));
  b.hp = Math.max(0, b.hp - damage);
  b.lastHitBy = attacker.owner;
  attacker.attacked = true;
  // 远程攻击建筑效果反馈
  if (state.effects) {
    state.effects.push({ type: 'ranged', fromX: attacker.x, fromY: attacker.y, x, y, startTime: performance.now(), duration: 600 });
  }
  state.actionMsg = `${atkCfg.name}远程射击${bCfg.name}，造成${damage}伤害！`;
  if (b.hp <= 0) {
    state.actionMsg += ` ${bCfg.name}血量归零！`;
  }
  return true;
}

export function resolveCombat(state, attacker, defender) {
  const atkCfg = UNIT_TYPES[attacker.type];
  const defCfg = UNIT_TYPES[defender.type];
  // 攻击系数是小数（0.5 / 0.7 / 0.75 / 4），取整后与后端 Java 结算保持逐位一致
  // 饥兵系数：储备见底的部队打不动（见 config.js HUNGER_RULES）
  const damage = Math.floor(attacker.troops * atkCfg.atkPerTroop * unitHungerMul(attacker));
  const defHP = defender.troops * defCfg.hpPerTroop;

  const remainingHP = Math.max(0, defHP - damage);
  const remainingTroops = Math.ceil(remainingHP / defCfg.hpPerTroop);

  defender.troops = remainingTroops;
  attacker.attacked = true;

  // 近战攻击效果反馈
  if (state.effects) {
    state.effects.push({ type: 'attack', fromX: attacker.x, fromY: attacker.y, x: defender.x, y: defender.y, startTime: performance.now(), duration: 600 });
  }

  state.actionMsg = `${UNIT_TYPES[attacker.type].name}攻击${UNIT_TYPES[defender.type].name}，造成${damage}伤害！`;

  // 击杀后勤补给兵奖励：只补满击杀者自身储备（同设计文档）
  if (defender.troops <= 0 && defender.type === 'supply') {
    attacker.supplies = UNIT_TYPES[attacker.type].foodCap;
  }

  if (defender.troops <= 0) {
    state.actionMsg += ' 击杀！';
  }

  removeDeadUnits(state);
}

// ========== 攻击建筑 ==========

export function canAttackBuilding(state, attacker, x, y) {
  const b = state.buildings.get(`${x},${y}`);
  if (!b) return false;
  if (attacker.owner === b.owner) return false;
  if (attacker.attacked) return false;
  const cfg = UNIT_TYPES[attacker.type];
  if (cfg.atkRange === 0) return false;
  return dist(attacker.x, attacker.y, x, y) <= effectiveAtkRange(attacker, cfg);
}

export function resolveBuildingCombat(state, attacker, x, y) {
  const b = state.buildings.get(`${x},${y}`);
  if (!b) return false;
  const atkCfg = UNIT_TYPES[attacker.type];
  const bCfg = BUILDING_TYPES[b.type];
  const damage = Math.floor(attacker.troops * atkCfg.atkPerTroop * unitHungerMul(attacker));
  b.hp = Math.max(0, b.hp - damage);
  b.lastHitBy = attacker.owner;
  attacker.attacked = true;
  // 近战攻击建筑效果反馈
  if (state.effects) {
    state.effects.push({ type: 'attack', fromX: attacker.x, fromY: attacker.y, x, y, startTime: performance.now(), duration: 600 });
  }
  state.actionMsg = `${atkCfg.name}攻击${bCfg.name}，造成${damage}伤害！`;
  if (b.hp <= 0) {
    state.actionMsg += ` ${bCfg.name}血量归零！`;
  }
  return true;
}
