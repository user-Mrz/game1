// 常量 & 配置

export const TERRAIN = { PLAIN:0, FOREST:1, MOUNTAIN:2, RIVER:3, FERTILE:4 };
export const TERRAIN_NAMES = ['平原','森林','山地','河流','沃土'];
// 黑白水墨地形色：平原白、森林灰、山地深灰、河流浅灰、沃土米白
export const TERRAIN_COLORS = ['#f8f6f0','#c8c4bc','#9a9590','#d4d0c8','#ece8e0'];

// ---------- 后勤射程（foodCap 的定义式）----------
// 储备上限不是"能撑几回合"，而是"能走多远"——这两件事在数值上完全不同。
// 若所有兵种都按固定回合数写 foodCap，作战半径就退化成移动力的正比：
// 步兵（move 1）只有 6 格，而相邻两家主营间距 ≈ 0.283 × 地图边长（70 图 = 20 格），
// 于是步兵/弓兵在数学上永远走不到对面，前线只能堆在自家门口互相看着。
//
// 正确写法：续航回合 = ceil(单程射程 R / 移动力) + 抵达后的战斗回合
//           foodCap   = 续航回合 × 每回合粮耗（troops × foodConsumeMul）
// R = 16 由「最小地图主营间距 14 格 + 绕地形余量 2 格」反推；
// 6 个战斗回合 ≈ 一次围城战的时长，超过就该回粮仓补给了。
// 校验：scripts/balance-check.mjs 第 1 节会重算一遍并断言，改表不许改错。
export const SUPPLY_RULES = {
  targetRange: 16,   // 单程作战半径（格）
  combatTurns: 6,    // 抵达目标后还能支撑的战斗回合
};

// 便于其它模块/校验脚本按同一公式重算，避免手写数字漂移
export function supplyCapFor(move, troops, foodConsumeMul, range = SUPPLY_RULES.targetRange) {
  return (Math.ceil(range / move) + SUPPLY_RULES.combatTurns) * troops * foodConsumeMul;
}

// ---------- 饥兵：储备见底会削弱战力 ----------
// 为什么用「还能撑几回合」而不是「储备百分比」做刻度：
// 各兵种 foodCap 差 5 倍（步兵 22 回合 / 轻骑 10 回合），同样 50% 储备，
// 步兵还剩 11 回合、轻骑只剩 5 回合 —— 百分比在不同兵种之间不可比，回合数可比。
//
// 分档依据（80 回合 × 4 局实测的剩余续航分布）：
//   ≥6 回合 70.3% / 3~6 回合 5.5% / 1~3 回合 3.1% / <1 回合 1.2%
// 所以只有约 10% 的采样会吃到任何惩罚 —— 这套规则是「补给断了」的警报，不是背景噪音。
// 满战力档放在 6 回合：给玩家 5 个回合的预警窗口去拉补给，之后才开始真的掉战力。
//
// 数值含义：断粮步兵 1000 兵 × 0.5 攻 × 0.45 = 225 伤害（正常 500），
// 打满编同行需要 5 击而不是 2 击 —— 断粮的军队会输掉同规模交战，但不至于瞬间蒸发。
export const HUNGER_RULES = {
  fullTurns: 6,     // ≥6 回合续航：满战力
  warnTurns: 3,     // 3~6 回合：缺粮
  lowTurns: 1,      // 1~3 回合：断粮在即
  mulFull: 1.00,
  mulWarn: 0.85,
  mulLow: 0.65,
  mulStarving: 0.45, // <1 回合（本回合已吃不上饭，正在掉兵）
};

// 返回该单位当前的攻击力系数（1.0 = 满战力）。补给兵 foodConsumeMul 为 0，永不挨饿。
export function hungerMul(supplies, troops, foodConsumeMul) {
  if (!foodConsumeMul || troops <= 0) return HUNGER_RULES.mulFull;
  const turns = supplies / (troops * foodConsumeMul);
  if (turns >= HUNGER_RULES.fullTurns) return HUNGER_RULES.mulFull;
  if (turns >= HUNGER_RULES.warnTurns) return HUNGER_RULES.mulWarn;
  if (turns >= HUNGER_RULES.lowTurns) return HUNGER_RULES.mulLow;
  return HUNGER_RULES.mulStarving;
}

// 单位实例 → 攻击力系数
export function unitHungerMul(unit) {
  const cfg = UNIT_TYPES[unit.type];
  return cfg ? hungerMul(unit.supplies, unit.troops, cfg.foodConsumeMul) : 1;
}

// ---------- 兵种 ----------
// 平衡标尺：战力点 PP = √(血量 × 攻击力)，所有兵种造价落在 3.2~3.7 粮/PP 区间，
// 机动（轻骑 4 格）、射程（弓兵 2 格）、破阵（重骑）用造价溢价体现。
// 关键约束：血攻比 R = 血量 / 攻击力 必须 > 1，否则满编一击即秒，战斗退化成败者先手。
// produceTurns：该兵营生产一次后需要多少回合才能再生产。
// 取值 ≈ 兵种造价 ÷ 单农田产出(900)，含义是「一座兵营的产能 ≈ 一块农田的供给」，
// 于是"田 : 营 : 兵"形成 1:1:1 的可读节奏，同时给损失后的重建加上硬性冷却。
// granaryConv 为什么是「全局一个数」而不是按兵种取：
// 储备可以被补给兵 1:1 转移给任意友军，也就是一种完全可流通的商品。
// 只要两个兵种的换算率不同，就存在无风险套利——在便宜的兵种上买储备，转手补给贵兵种。
// 实测按兵种取 7/11/9/7/92 时，补给兵这条通道买储备比步兵通道便宜 8.4 倍，后勤直接崩。
// 所以换算率只能有一个，按兵种差异通过 foodCap（一箱油能跑多远）体现，不通过汇率体现。
export const UNIT_TYPES = {
  // R=1.33：高攻高速的袭扰单位，负责切后排（弓兵/补给兵）与断粮道，正面打不过步兵
  // 续航 ceil(16/4)+6 = 10 回合；单程 40 格
  light_cavalry:  { name:'轻骑兵', move:4, atkRange:1, atkPerTroop:0.75, hpPerTroop:1, troops:600, foodConsumeMul:2, foodCap:12000, buildCost:1900, buildAt:'轻骑兵营', produceTurns:2 },
  // R=2.00：基准单位，粮耗 1:1，最便宜的战力，负责占线与吸收伤害
  // 续航 ceil(16/1)+6 = 22 回合；单程 22 格
  infantry:       { name:'步兵',   move:1, atkRange:1, atkPerTroop:0.5,  hpPerTroop:1, troops:1000, foodConsumeMul:1, foodCap:22000, buildCost:2300, buildAt:'步兵营', produceTurns:3 },
  // R=1.43：射程 2，但移动后射程降为 1（moveShootRange），只能在原地输出 → 需要步兵掩护
  // 续航 22 回合；单程 22 格
  archer:         { name:'弓兵',   move:1, atkRange:2, moveShootRange:1, atkPerTroop:0.7, hpPerTroop:1, troops:550, foodConsumeMul:1, foodCap:12100, buildCost:1500, buildAt:'弓兵营', produceTurns:2 },
  // R=1.50：唯一的破阵单位，一击可秒杀轻骑/弓兵/补给兵，粮耗最高、数量最少
  // 续航 ceil(16/2)+6 = 14 回合；单程 28 格
  heavy_cavalry:  { name:'重骑兵', move:2, moveCD:0, atkRange:1, atkPerTroop:4, hpPerTroop:6, troops:200, foodConsumeMul:8, foodCap:22400, buildCost:3500, buildAt:'重骑兵营', produceTurns:4 },
  // 0 攻击，纯后勤：储备 = 3 个步兵的满额储备，一趟能把三个空了的步兵喂满
  // 自身粮耗为 0 → 永不断粮
  supply:         { name:'后勤补给兵', move:1, atkRange:0, atkPerTroop:0, hpPerTroop:1, troops:300, foodConsumeMul:0, foodCap:66000, buildCost:800, buildAt:'后勤补给兵营', produceTurns:1 },
};

// 建造规则：只能在「己方当前视野内」+「主营建造半径内」建造，两者取交集。
// 半径每回合 +1 格，与步兵移动力同步——扩张速度不会跑在部队前面。
// 关键：建造视野只由兵种提供，建筑（含哨塔）一律不给。
// 否则"建一座 → 它开出新范围 → 再建一座"会自我滚动，一路滚到对面家。
export const BUILD_RULES = {
  baseRadius: 3,
  radiusPerTurn: 1,
  requireVision: true,
  maxWatchtowers: 3,
  buildingGrantsBuildVision: false, // 建筑/哨塔 只管"看"，不管"建"
  hqGrantsBuildVision: true,        // 主营自带 1 格建造视野，保证老家永远能修东西
};

// ---------- 建筑 ----------
// 兵营价 = 兵种价（"第一支部队付双倍"），兵营本身不再是门槛，兵种造价才是
export const BUILDING_TYPES = {
  hq:            { name:'主营', hp:12000, atk:0, atkRange:0, visionRadius:1, buildable:false },
  // 1200/回合 ≈ 供养 1 个步兵的满额粮耗，形成"1 农田养 1 步兵"的可读比例
  farm:          { name:'农田', hp:1200, atk:0, atkRange:0, visionRadius:1, foodPerTurn:900, fertileMul:2, buildable:true, buildCost:2400 },
  infantry_barracks: { name:'步兵营', hp:1200, atk:0, atkRange:0, visionRadius:1, buildable:true, buildCost:2300 },
  archer_barracks:   { name:'弓兵营', hp:1200, atk:0, atkRange:0, visionRadius:1, buildable:true, buildCost:1500 },
  lc_barracks:       { name:'轻骑兵营', hp:1200, atk:0, atkRange:0, visionRadius:1, buildable:true, buildCost:1900 },
  hc_barracks:       { name:'重骑兵营', hp:1200, atk:0, atkRange:0, visionRadius:1, buildable:true, buildCost:3500 },
  supply_barracks:   { name:'后勤补给兵营', hp:1200, atk:0, atkRange:0, visionRadius:1, buildable:true, buildCost:800 },
  // 400 伤害/回合：3 回合点杀 1 个步兵，而步兵需 6 击才能拆掉 → 单兵强攻箭塔必亏
  arrow_tower:  { name:'箭塔', hp:3000, atk:400, atkRange:2, visionRadius:2, buildable:true, buildCost:2800 },
  // 700 粮/3000 血：单位血量的 4 倍性价比，但不可移动、不可攻击，只换取时间
  wall:         { name:'城墙', hp:3000, atk:0, atkRange:0, visionRadius:1, buildable:true, buildCost:700 },
  // 视野 8：必须强于轻骑兵的移动视野才有存在意义（轻骑 4 格移动 = 12 格视野）
  watchtower:   { name:'哨塔', hp:800, atk:0, atkRange:0, visionRadius:8, buildable:true, buildCost:800 },
  // granaryConv：1 粮草换 5 储备。全局唯一一个数，理由见 UNIT_TYPES 上方注释。
  // 换算后：补满一个满编步兵需 4400 粮（重建价的 1.9 倍），每回合维持 200 粮 → 1 块农田养 4.5 个步兵
  granary:      { name:'粮仓', hp:2000, atk:0, atkRange:0, visionRadius:1, granaryConv:5, buildable:true, buildCost:1200 },
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

// 难度配置：影响AI智能程度与AI属性
// 阈值按新经济重标定（农田 1000/回合）：阈值的含义是"留多少余粮再生产"，不是"攒够多少才动"
export const DIFFICULTY = {
  easy: {
    name: '简单',
    // AI智能
    aiBuildRadius: 3,        // AI建造搜索半径
    aiRangedAttack: false,   // AI是否使用远程攻击
    aiSmartTarget: false,    // AI是否智能选择攻击目标
    aiProduceThreshold: 1200, // AI生产阈值（粮草余量）
    aiBuildThreshold: 1500,   // AI建造阈值
    // AI属性倍率
    aiUnitHpMul: 1.0,       // AI兵种血量倍率
    aiUnitAtkMul: 1.0,      // AI兵种攻击倍率
    aiBuildingHpMul: 1.0,   // AI建筑血量倍率
    aiStartBonus: 0,        // AI起始粮草加成
  },
  normal: {
    name: '普通',
    aiBuildRadius: 5,
    aiRangedAttack: true,
    aiSmartTarget: true,
    aiProduceThreshold: 900,
    aiBuildThreshold: 1200,
    aiUnitHpMul: 1.15,
    aiUnitAtkMul: 1.05,
    aiBuildingHpMul: 1.1,
    aiStartBonus: 1000,
  },
  hard: {
    name: '困难',
    aiBuildRadius: 7,
    aiRangedAttack: true,
    aiSmartTarget: true,
    aiProduceThreshold: 600,
    aiBuildThreshold: 900,
    aiUnitHpMul: 1.3,
    aiUnitAtkMul: 1.15,
    aiBuildingHpMul: 1.2,
    aiStartBonus: 2000,
  },
  extreme: {
    name: '极难',
    aiBuildRadius: 9,
    aiRangedAttack: true,
    aiSmartTarget: true,
    aiProduceThreshold: 400,
    aiBuildThreshold: 700,
    aiUnitHpMul: 1.5,
    aiUnitAtkMul: 1.25,
    aiBuildingHpMul: 1.35,
    aiStartBonus: 4000,
  },
};
