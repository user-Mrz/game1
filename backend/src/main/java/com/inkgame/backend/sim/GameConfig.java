package com.inkgame.backend.sim;

import java.util.Map;

/**
 * 游戏常量配置 — 与前端 src/game/config.js 保持一致。
 */
public final class GameConfig {

    public static final int PLAIN = 0;
    public static final int FOREST = 1;
    public static final int MOUNTAIN = 2;
    public static final int RIVER = 3;
    public static final int FERTILE = 4;

    /** 农田每回合产出（沃土 ×2） */
    public static final int FARM_FOOD_PER_TURN = 1000;
    /** 箭塔单次伤害 */
    public static final int ARROW_TOWER_ATK = 100;
    /** 箭塔射程 */
    public static final int ARROW_TOWER_RANGE = 2;
    /** 农田/粮仓被摧毁后归攻击者时的血量 */
    public static final int CAPTURED_HP = 500;

    public record UnitCfg(
            String name,
            int move,
            int atkRange,
            int atkPerTroop,
            int hpPerTroop,
            int troops,
            int foodConsumeMul,
            int foodCap,
            int buildCost,
            int moveCD
    ) {}

    public record BuildingCfg(
            String name,
            int hp,
            int atk,
            int atkRange,
            int visionRadius,
            int foodPerTurn,
            boolean buildable,
            int buildCost
    ) {}

    public static final Map<String, UnitCfg> UNIT_TYPES = Map.of(
            "light_cavalry", new UnitCfg("轻骑兵", 4, 1, 1, 1, 100, 2, 2000, 4000, 0),
            "infantry", new UnitCfg("步兵", 1, 1, 1, 1, 1000, 1, 10000, 2000, 0),
            "archer", new UnitCfg("弓兵", 1, 2, 1, 1, 200, 1, 1000, 3000, 0),
            "heavy_cavalry", new UnitCfg("重骑兵", 1, 1, 2, 10, 100, 4, 1000, 8000, 1),
            "supply", new UnitCfg("后勤补给兵", 1, 0, 0, 1, 100, 0, 10000, 6000, 0)
    );

    public static final Map<String, BuildingCfg> BUILDING_TYPES = Map.ofEntries(
            Map.entry("hq", new BuildingCfg("主营", 10000, 0, 0, 1, 0, false, 0)),
            Map.entry("farm", new BuildingCfg("农田", 1000, 0, 0, 1, FARM_FOOD_PER_TURN, true, 1000)),
            Map.entry("infantry_barracks", new BuildingCfg("步兵营", 1000, 0, 0, 1, 0, true, 1500)),
            Map.entry("archer_barracks", new BuildingCfg("弓兵营", 1000, 0, 0, 1, 0, true, 2000)),
            Map.entry("lc_barracks", new BuildingCfg("轻骑兵营", 1000, 0, 0, 1, 0, true, 2500)),
            Map.entry("hc_barracks", new BuildingCfg("重骑兵营", 1000, 0, 0, 1, 0, true, 3000)),
            Map.entry("supply_barracks", new BuildingCfg("后勤补给兵营", 1000, 0, 0, 1, 0, true, 3500)),
            Map.entry("arrow_tower", new BuildingCfg("箭塔", 1000, ARROW_TOWER_ATK, ARROW_TOWER_RANGE, 1, 0, true, 5000)),
            Map.entry("wall", new BuildingCfg("城墙", 5000, 0, 0, 1, 0, true, 4000)),
            Map.entry("watchtower", new BuildingCfg("哨塔", 1000, 0, 0, 3, 0, true, 3000)),
            Map.entry("granary", new BuildingCfg("粮仓", 2000, 0, 0, 1, 0, true, 4000))
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
