package com.inkgame.backend.sim;

import java.util.Map;

/**
 * 游戏常量配置 — 与前端 src/game/config.js 保持一致。
 * 平衡标尺：战力点 PP = √(血量 × 攻击力)，造价统一落在 3.2~3.7 粮/PP。
 */
public final class GameConfig {

    public static final int PLAIN = 0;
    public static final int FOREST = 1;
    public static final int MOUNTAIN = 2;
    public static final int RIVER = 3;
    public static final int FERTILE = 4;

    /** 农田每回合产出（沃土 ×2） */
    public static final int FARM_FOOD_PER_TURN = 900;
    /** 箭塔单次伤害 */
    public static final int ARROW_TOWER_ATK = 400;
    /** 箭塔射程 */
    public static final int ARROW_TOWER_RANGE = 2;
    /** 农田/粮仓被摧毁后归攻击者时的血量 */
    public static final int CAPTURED_HP = 500;
    /** 粮仓换算率：1 粮草换多少储备（全局唯一，按兵种取会产生套利） */
    public static final int GRANARY_CONV = 5;

    /**
     * 后勤射程：储备上限不是"能撑几回合"，而是"能走多远"。
     * 续航回合 = ceil(单程射程 / 移动力) + 抵达后的战斗回合；foodCap = 续航回合 × 每回合粮耗。
     * 与前端 SUPPLY_RULES 一一对应，禁止单边改动。
     */
    public static final int SUPPLY_TARGET_RANGE = 16;
    public static final int SUPPLY_COMBAT_TURNS = 6;

    /**
     * 饥兵：储备见底会削弱攻击力。刻度用「还能撑几回合」而不是储备百分比——
     * 各兵种 foodCap 差 5 倍，百分比不可比，回合数可比。与前端 HUNGER_RULES 一一对应。
     */
    public static final double HUNGER_FULL_TURNS = 6;
    public static final double HUNGER_WARN_TURNS = 3;
    public static final double HUNGER_LOW_TURNS = 1;
    public static final double HUNGER_MUL_FULL = 1.00;
    public static final double HUNGER_MUL_WARN = 0.85;
    public static final double HUNGER_MUL_LOW = 0.65;
    public static final double HUNGER_MUL_STARVING = 0.45;

    /** 单位当前攻击力系数（1.0 = 满战力）。补给兵 foodConsumeMul 为 0，永不挨饿。 */
    public static double hungerMul(int supplies, int troops, int foodConsumeMul) {
        if (foodConsumeMul == 0 || troops <= 0) return HUNGER_MUL_FULL;
        double turns = (double) supplies / ((double) troops * foodConsumeMul);
        if (turns >= HUNGER_FULL_TURNS) return HUNGER_MUL_FULL;
        if (turns >= HUNGER_WARN_TURNS) return HUNGER_MUL_WARN;
        if (turns >= HUNGER_LOW_TURNS) return HUNGER_MUL_LOW;
        return HUNGER_MUL_STARVING;
    }

    /** 单位实例 → 攻击力系数 */
    public static double unitHungerMul(UnitCfg cfg, int supplies, int troops) {
        return cfg == null ? 1.0 : hungerMul(supplies, troops, cfg.foodConsumeMul());
    }

    public record UnitCfg(
            String name,
            int move,
            int atkRange,
            double atkPerTroop,
            int hpPerTroop,
            int troops,
            int foodConsumeMul,
            int foodCap,
            int buildCost,
            int moveCD,
            int moveShootRange,
            int produceTurns
    ) {}

    public record BuildingCfg(
            String name,
            int hp,
            int atk,
            int atkRange,
            int visionRadius,
            int foodPerTurn,
            boolean buildable,
            int buildCost,
            int granaryConv
    ) {}

    /** moveShootRange > 0 表示"本回合移动过则射程降为该值"（弓兵防风筝） */
    /** granaryConv 全局唯一：储备可被补给兵 1:1 转移，按兵种取汇率会产生套利 */
    public static final Map<String, UnitCfg> UNIT_TYPES = Map.of(
            "light_cavalry", new UnitCfg("轻骑兵", 4, 1, 0.75, 1, 600, 2, 12000, 1900, 0, 0, 2),
            "infantry", new UnitCfg("步兵", 1, 1, 0.5, 1, 1000, 1, 22000, 2300, 0, 0, 3),
            "archer", new UnitCfg("弓兵", 1, 2, 0.7, 1, 550, 1, 12100, 1500, 0, 1, 2),
            "heavy_cavalry", new UnitCfg("重骑兵", 2, 1, 4.0, 6, 200, 8, 22400, 3500, 0, 0, 4),
            "supply", new UnitCfg("后勤补给兵", 1, 0, 0, 1, 300, 0, 66000, 800, 0, 0, 1)
    );

    public static final Map<String, BuildingCfg> BUILDING_TYPES = Map.ofEntries(
            Map.entry("hq", new BuildingCfg("主营", 12000, 0, 0, 1, 0, false, 0, 0)),
            Map.entry("farm", new BuildingCfg("农田", 1200, 0, 0, 1, FARM_FOOD_PER_TURN, true, 2400, 0)),
            Map.entry("infantry_barracks", new BuildingCfg("步兵营", 1200, 0, 0, 1, 0, true, 2300, 0)),
            Map.entry("archer_barracks", new BuildingCfg("弓兵营", 1200, 0, 0, 1, 0, true, 1500, 0)),
            Map.entry("lc_barracks", new BuildingCfg("轻骑兵营", 1200, 0, 0, 1, 0, true, 1900, 0)),
            Map.entry("hc_barracks", new BuildingCfg("重骑兵营", 1200, 0, 0, 1, 0, true, 3500, 0)),
            Map.entry("supply_barracks", new BuildingCfg("后勤补给兵营", 1200, 0, 0, 1, 0, true, 800, 0)),
            Map.entry("arrow_tower", new BuildingCfg("箭塔", 3000, ARROW_TOWER_ATK, ARROW_TOWER_RANGE, 2, 0, true, 2800, 0)),
            Map.entry("wall", new BuildingCfg("城墙", 3000, 0, 0, 1, 0, true, 700, 0)),
            Map.entry("watchtower", new BuildingCfg("哨塔", 800, 0, 0, 8, 0, true, 800, 0)),
            Map.entry("granary", new BuildingCfg("粮仓", 2000, 0, 0, 1, 0, true, 1200, GRANARY_CONV))
    );

    /** 兵营建筑类型 → 可产兵种 */
    public static final Map<String, String> BARRACKS_TYPE_MAP = Map.of(
            "infantry_barracks", "infantry",
            "archer_barracks", "archer",
            "lc_barracks", "light_cavalry",
            "hc_barracks", "heavy_cavalry",
            "supply_barracks", "supply"
    );

    private GameConfig() {}
}
