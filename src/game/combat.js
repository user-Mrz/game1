// 战斗系统

import { UNIT_TYPES, BUILDING_TYPES } from './config.js';
import { dist } from './utils.js';
import { removeDeadUnits } from './units.js';

export function canAttack(state, attacker, defender) {
  if (attacker.id === defender.id) return false;
  if (attacker.owner === defender.owner) return false;
  if (attacker.attacked) return false;
  const cfg = UNIT_TYPES[attacker.type];
  if (cfg.atkRange === 0) return false;
  const d = dist(attacker.x, attacker.y, defender.x, defender.y);
  return d <= cfg.atkRange;
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
  const atkPower = Math.floor(attacker.troops * atkCfg.atkPerTroop * (atkCfg.rangedAtkMul || 0.5));
  const defHP = defender.troops * defCfg.hpPerTroop;

  const damage = atkPower;
  const remainingHP = Math.max(0, defHP - damage);
  const remainingTroops = Math.ceil(remainingHP / defCfg.hpPerTroop);

  defender.troops = remainingTroops;
  attacker.attacked = true;

  state.actionMsg = `${atkCfg.name}远程射击${defCfg.name}，造成${damage}伤害！`;

  if (defender.troops <= 0 && defender.type === 'supply') {
    const killer = state.players[attacker.owner];
    killer.food += (atkCfg.foodCap * 5);
    attacker.supplies = atkCfg.foodCap;
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
  const damage = Math.floor(attacker.troops * atkCfg.atkPerTroop * (atkCfg.rangedAtkMul || 0.5));
  b.hp = Math.max(0, b.hp - damage);
  b.lastHitBy = attacker.owner;
  attacker.attacked = true;
  state.actionMsg = `${atkCfg.name}远程射击${bCfg.name}，造成${damage}伤害！`;
  if (b.hp <= 0) {
    state.actionMsg += ` ${bCfg.name}血量归零！`;
  }
  return true;
}

export function resolveCombat(state, attacker, defender) {
  const atkCfg = UNIT_TYPES[attacker.type];
  const defCfg = UNIT_TYPES[defender.type];
  const atkPower = attacker.troops * atkCfg.atkPerTroop;
  const defHP = defender.troops * defCfg.hpPerTroop;

  const damage = atkPower;
  const remainingHP = Math.max(0, defHP - damage);
  const remainingTroops = Math.ceil(remainingHP / defCfg.hpPerTroop);

  defender.troops = remainingTroops;
  attacker.attacked = true;

  state.actionMsg = `${UNIT_TYPES[attacker.type].name}攻击${UNIT_TYPES[defender.type].name}，造成${damage}伤害！`;

  // 击杀后勤补给兵奖励
  if (defender.troops <= 0 && defender.type === 'supply') {
    const atkCfg2 = UNIT_TYPES[attacker.type];
    const killer = state.players[attacker.owner];
    killer.food += (atkCfg2.foodCap * 5);
    attacker.supplies = atkCfg2.foodCap;
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
  return dist(attacker.x, attacker.y, x, y) <= cfg.atkRange;
}

export function resolveBuildingCombat(state, attacker, x, y) {
  const b = state.buildings.get(`${x},${y}`);
  if (!b) return false;
  const atkCfg = UNIT_TYPES[attacker.type];
  const bCfg = BUILDING_TYPES[b.type];
  const damage = attacker.troops * atkCfg.atkPerTroop;
  b.hp = Math.max(0, b.hp - damage);
  b.lastHitBy = attacker.owner;
  attacker.attacked = true;
  state.actionMsg = `${atkCfg.name}攻击${bCfg.name}，造成${damage}伤害！`;
  if (b.hp <= 0) {
    state.actionMsg += ` ${bCfg.name}血量归零！`;
  }
  return true;
}
