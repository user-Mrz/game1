// 常量 & 配置

export const TERRAIN = { PLAIN:0, FOREST:1, MOUNTAIN:2, RIVER:3, FERTILE:4 };
export const TERRAIN_NAMES = ['平原','森林','山地','河流','沃土'];
// 黑白水墨地形色：平原白、森林灰、山地深灰、河流浅灰、沃土米白
export const TERRAIN_COLORS = ['#f8f6f0','#c8c4bc','#9a9590','#d4d0c8','#ece8e0'];

export const UNIT_TYPES = {
  light_cavalry:  { name:'轻骑兵', move:4, atkRange:1, atkPerTroop:1, hpPerTroop:1, troops:100, foodConsumeMul:2, foodCap:2000, buildCost:4000, buildAt:'轻骑兵营' },
  infantry:       { name:'步兵',   move:1, atkRange:1, atkPerTroop:1, hpPerTroop:1, troops:1000, foodConsumeMul:1, foodCap:10000, buildCost:2000, buildAt:'步兵营' },
  archer:         { name:'弓兵',   move:1, atkRange:2, rangedAtkRange:4, rangedAtkMul:0.5, atkPerTroop:1, hpPerTroop:1, troops:200, foodConsumeMul:1, foodCap:1000, buildCost:3000, buildAt:'弓兵营' },
  heavy_cavalry:  { name:'重骑兵', move:1, moveCD:1, atkRange:1, atkPerTroop:2, hpPerTroop:10, troops:100, foodConsumeMul:4, foodCap:1000, buildCost:8000, buildAt:'重骑兵营' },
  supply:         { name:'后勤补给兵', move:1, atkRange:0, atkPerTroop:0, hpPerTroop:1, troops:100, foodConsumeMul:0, foodCap:10000, buildCost:6000, buildAt:'后勤补给兵营' },
};

export const BUILDING_TYPES = {
  hq:            { name:'主营', hp:10000, atk:0, atkRange:0, visionRadius:1, buildable:false },
  farm:          { name:'农田', hp:1000, atk:0, atkRange:0, visionRadius:1, foodPerTurn:1000, buildable:true, buildCost:1000 },
  infantry_barracks: { name:'步兵营', hp:1000, atk:0, atkRange:0, visionRadius:1, buildable:true, buildCost:1500 },
  archer_barracks:   { name:'弓兵营', hp:1000, atk:0, atkRange:0, visionRadius:1, buildable:true, buildCost:2000 },
  lc_barracks:       { name:'轻骑兵营', hp:1000, atk:0, atkRange:0, visionRadius:1, buildable:true, buildCost:2500 },
  hc_barracks:       { name:'重骑兵营', hp:1000, atk:0, atkRange:0, visionRadius:1, buildable:true, buildCost:3000 },
  supply_barracks:   { name:'后勤补给兵营', hp:1000, atk:0, atkRange:0, visionRadius:1, buildable:true, buildCost:3500 },
  arrow_tower:  { name:'箭塔', hp:1000, atk:100, atkRange:2, visionRadius:1, buildable:true, buildCost:5000 },
  wall:         { name:'城墙', hp:5000, atk:0, atkRange:0, visionRadius:1, buildable:true, buildCost:4000 },
  watchtower:   { name:'哨塔', hp:1000, atk:0, atkRange:0, visionRadius:3, buildable:true, buildCost:3000 },
  granary:      { name:'粮仓', hp:2000, atk:0, atkRange:0, visionRadius:1, buildable:true, buildCost:4000 },
};

// 玩家色：中国传统颜料色，玩家为墨黑，每个AI独立色系
export const PLAYER_COLORS = [
  '#1a1a1a', // 玩家 — 墨黑
  '#c0392b', // AI-1 — 朱砂红
  '#2c6f9a', // AI-2 — 石青
  '#a0733a', // AI-3 — 赭石
  '#3a8a5c', // AI-4 — 石绿
  '#c4a02a', // AI-5 — 藤黄
  '#7a4c9a', // AI-6 — 紫毫
  '#b03a6a', // AI-7 — 胭脂
  '#3a5a8a', // AI-8 — 黛蓝
  '#8a6e3a', // AI-9 — 茶褐
];

// 兵营类型到兵种映射（避免重复定义）
export const BARRACKS_MAP = {
  '步兵营':'infantry', '弓兵营':'archer', '轻骑兵营':'light_cavalry',
  '重骑兵营':'heavy_cavalry', '后勤补给兵营':'supply'
};

export const BARRACKS_TYPE_MAP = {
  'infantry_barracks':'infantry', 'archer_barracks':'archer',
  'lc_barracks':'light_cavalry', 'hc_barracks':'heavy_cavalry',
  'supply_barracks':'supply'
};
