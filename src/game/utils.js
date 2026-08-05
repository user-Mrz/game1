// 工具函数 — 纯函数

import { TERRAIN } from './config.js';

export function idx(state, x, y) { return y * state.mapW + x; }
export function key(x, y) { return x + ',' + y; }
export function dist(x1, y1, x2, y2) { return Math.abs(x1 - x2) + Math.abs(y1 - y2); }
export function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

export function getBuilding(state, x, y) {
  return state.buildings.get(key(x, y)) || null;
}

// 建筑通行规则：己方建筑可自由通行/停留；他人建筑（农田除外）不可通行
export function isBuildingBlocked(state, x, y, playerIdx) {
  const b = getBuilding(state, x, y);
  if (!b) return false;
  return b.owner !== playerIdx && b.type !== 'farm';
}

export function getTerrain(state, x, y) {
  if (x < 0 || y < 0 || x >= state.mapW || y >= state.mapH) return TERRAIN.MOUNTAIN;
  return state.terrain[idx(state, x, y)];
}

export function isPassable(state, x, y, playerIdx) {
  if (x < 0 || y < 0 || x >= state.mapW || y >= state.mapH) return false;
  if (getTerrain(state, x, y) === TERRAIN.MOUNTAIN) return false;
  if (isBuildingBlocked(state, x, y, playerIdx)) return false;
  return true;
}

// 颜色辅助函数
export function darkenColor(hex, factor) {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  const dr = Math.floor(r * factor), dg = Math.floor(g * factor), db = Math.floor(b * factor);
  return `rgb(${dr},${dg},${db})`;
}

export function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function lightenColor(hex, amount) {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  const lr = Math.min(255, Math.floor(r + (255 - r) * amount));
  const lg = Math.min(255, Math.floor(g + (255 - g) * amount));
  const lb = Math.min(255, Math.floor(b + (255 - b) * amount));
  return `rgb(${lr},${lg},${lb})`;
}

// 坐标变换
export function worldToScreen(state, wx, wy, canvasW, canvasH) {
  const sx = canvasW / 2 + (wx - state.viewCX) * state.tileSize;
  const sy = 44 + (canvasH - 44 - 120) / 2 + (wy - state.viewCY) * state.tileSize;
  return { x: sx, y: sy };
}

export function screenToWorld(state, sx, sy, canvasW, canvasH) {
  const wx = state.viewCX + (sx - canvasW / 2) / state.tileSize;
  const wy = state.viewCY + (sy - 44 - (canvasH - 44 - 120) / 2) / state.tileSize;
  return { x: Math.round(wx), y: Math.round(wy) };
}

export function updateTileSize(state, canvasW, canvasH) {
  const availW = canvasW;
  const availH = canvasH - 44 - 120;
  const tsW = Math.floor(availW / 12);
  const tsH = Math.floor(availH / 8);
  state.tileSize = clamp(Math.min(tsW, tsH), 24, 56);
}
