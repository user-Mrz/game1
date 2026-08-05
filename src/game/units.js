// 单位管理

import { UNIT_TYPES } from './config.js';

export function spawnUnit(state, playerIdx, unitType, x, y) {
  const cfg = UNIT_TYPES[unitType];
  const u = {
    id: state.nextUnitId++,
    type: unitType,
    owner: playerIdx,
    x, y,
    troops: cfg.troops,
    supplies: cfg.foodCap,
    moved: false,
    attacked: false,
    moveCD: 0,
    riverDelay: 0,
  };
  state.units.push(u);
  return u;
}

export function getUnitById(state, id) {
  return state.units.find(u => u.id === id) || null;
}

export function getUnitsAt(state, x, y) {
  return state.units.filter(u => u.x === x && u.y === y);
}

export function getPlayerUnits(state, playerIdx) {
  return state.units.filter(u => u.owner === playerIdx);
}

export function removeDeadUnits(state) {
  state.units = state.units.filter(u => u.troops > 0);
}
