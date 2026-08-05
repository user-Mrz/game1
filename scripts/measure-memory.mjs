// 浏览器内存量化：对比迁移前后（保留全部玩家 explored vs 仅人类 explored）的持久数组占用
// 用法：node --expose-gc scripts/measure-memory.mjs

import { createGameState, initPlayers, placeInitialBuildings } from '../src/game/state.js';
import { generateTerrain } from '../src/game/terrain.js';

function buildState(mapSize, aiCount) {
  const state = createGameState(mapSize, mapSize);
  initPlayers(state, 1, aiCount);
  state.terrain = generateTerrain(state.mapW, state.mapH);
  placeInitialBuildings(state);
  return state;
}

const cases = [
  { map: 100, ai: 1 },
  { map: 500, ai: 9 },
  { map: 1000, ai: 9 },
  { map: 2000, ai: 9 },
];

console.log('迁移前 = 每个玩家一份 explored（旧逻辑） | 迁移后 = 仅人类一份 explored');
console.log('地图\tAI数\t地形\t迁移前explored\t迁移后explored\t节省');

for (const { map, ai } of cases) {
  const players = 1 + ai;
  const terrainMB = (map * map) / 1024 / 1024;
  const exploredLegacyMB = (map * map * players) / 1024 / 1024;
  const exploredNewMB = (map * map) / 1024 / 1024;
  const savedMB = exploredLegacyMB - exploredNewMB;
  console.log(
    `${map}\t${ai}\t${terrainMB.toFixed(1)}MB\t${exploredLegacyMB.toFixed(1)}MB\t${exploredNewMB.toFixed(1)}MB\t${savedMB.toFixed(1)}MB`
  );
}

// 实测逻辑占用（2000×2000 × 10 玩家）：按 byteLength 统计，反映浏览器真实持有量
if (global.gc) {
  const state = buildState(2000, 9);
  global.gc();
  const terrainBytes = state.terrain.byteLength;
  const exploredLegacyBytes = state.players.length * terrainBytes;
  const exploredNewBytes = terrainBytes;
  console.log(`\n实测（2000×2000 × 10 玩家）逻辑占用：`);
  console.log(`  terrain: ${(terrainBytes / 1024 / 1024).toFixed(1)} MB`);
  console.log(`  全部玩家 explored: ${(exploredLegacyBytes / 1024 / 1024).toFixed(1)} MB`);
  console.log(`  仅人类 explored:   ${(exploredNewBytes / 1024 / 1024).toFixed(1)} MB`);
  console.log(`  释放: ${((exploredLegacyBytes - exploredNewBytes) / 1024 / 1024).toFixed(1)} MB`);
} else {
  console.log('\n（未启用 --expose-gc，跳过实测部分）');
}
