// 常量 & 配置

export const TERRAIN = { PLAIN:0, FOREST:1, MOUNTAIN:2, RIVER:3, FERTILE:4 };
export const TERRAIN_NAMES = ['平原','森林','山地','河流','沃土'];
// 黑白水墨地形色：平原白、森林灰、山地深灰、河流浅灰、沃土米白
export const TERRAIN_COLORS = ['#f8f6f0','#c8c4bc','#9a9590','#d4d0c8','#ece8e0'];

export const UNIT_TYPES = {
  light_cavalry:  { name:'轻骑兵', move:4, atkRange:1, atkPerTroop:1, hpPerTroop:1, troops:100, foodConsumeMul:2, foodCap:2000, buildCost:4000, buildAt:'轻骑兵营' },
  infantry:       { name:'步兵',   move:1, atkRange:1, atkPerTroop:1, hpPerTroop:1, troops:1000, foodConsumeMul:1, foodCap:10000, buildCost:2000, buildAt:'步兵营' },
  archer:         { name:'弓兵',   move:1, atkRange:2, atkPerTroop:1, hpPerTroop:1, troops:200, foodConsumeMul:1, foodCap:1000, buildCost:3000, buildAt:'弓兵营' },
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

// 黑白水墨玩家色：从浓墨到淡墨，10个灰度层次
export const PLAYER_COLORS = ['#1a1a1a','#3a3a3a','#555555','#6e6e6e','#848484','#2e2e2e','#464646','#5c5c5c','#707070','#7e7e7e'];

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
