package com.inkgame.backend.sim;

import com.inkgame.backend.sim.GameConfig.BuildingCfg;
import com.inkgame.backend.sim.GameConfig.UnitCfg;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.DoubleSupplier;

/**
 * 回合结算引擎 — 与前端 src/game 下 ai/movement/combat/economy/buildings/state 的逻辑逐位对齐。
 */
public final class SimEngine {

    private static final int[][] DIRS4 = {{1, 0}, {-1, 0}, {0, 1}, {0, -1}};

    private SimEngine() {}

    // ========== 工具 ==========

    static int idx(GameState s, int x, int y) {
        return y * s.mapW + x;
    }

    static String key(int x, int y) {
        return x + "," + y;
    }

    static int dist(int x1, int y1, int x2, int y2) {
        return Math.abs(x1 - x2) + Math.abs(y1 - y2);
    }

    static long pack(int x, int y) {
        return ((long) x << 32) | (y & 0xFFFFFFFFL);
    }

    static int unpackX(long k) {
        return (int) (k >>> 32);
    }

    static int unpackY(long k) {
        return (int) (k & 0xFFFFFFFFL);
    }

    static int getTerrain(GameState s, int x, int y) {
        if (x < 0 || y < 0 || x >= s.mapW || y >= s.mapH) return GameConfig.MOUNTAIN;
        return s.terrain[idx(s, x, y)] & 0xFF;
    }

    static Building getBuilding(GameState s, int x, int y) {
        return s.buildings.get(key(x, y));
    }

    static boolean isBuildingBlocked(GameState s, int x, int y, int playerIdx) {
        Building b = getBuilding(s, x, y);
        if (b == null) return false;
        return b.owner != playerIdx && !"farm".equals(b.type);
    }

    static boolean isPassable(GameState s, int x, int y, int playerIdx) {
        if (x < 0 || y < 0 || x >= s.mapW || y >= s.mapH) return false;
        if (getTerrain(s, x, y) == GameConfig.MOUNTAIN) return false;
        if (isBuildingBlocked(s, x, y, playerIdx)) return false;
        return true;
    }

    static List<Unit> getUnitsAt(GameState s, int x, int y) {
        List<Unit> result = new ArrayList<>();
        for (Unit u : s.units) {
            if (u.x == x && u.y == y) result.add(u);
        }
        return result;
    }

    static Unit spawnUnit(GameState s, int playerIdx, String unitType, int x, int y) {
        UnitCfg cfg = GameConfig.UNIT_TYPES.get(unitType);
        Unit u = new Unit();
        u.id = s.nextUnitId++;
        u.type = unitType;
        u.owner = playerIdx;
        u.x = x;
        u.y = y;
        u.troops = cfg.troops();
        u.supplies = cfg.foodCap();
        u.moved = false;
        u.attacked = false;
        u.moveCD = 0;
        u.riverDelay = 0;
        s.units.add(u);
        return u;
    }

    static void removeDeadUnits(GameState s) {
        s.units.removeIf(u -> u.troops <= 0);
    }

    // ========== 移动 ==========

    static int getMoveCost(GameState s, Unit unit, int x, int y, int playerIdx) {
        int t = getTerrain(s, x, y);
        if (t == GameConfig.MOUNTAIN) return Integer.MAX_VALUE;
        if (isBuildingBlocked(s, x, y, playerIdx)) return Integer.MAX_VALUE;
        int cost = 1;
        if (t == GameConfig.RIVER) cost = 2;
        return cost;
    }

    static LinkedHashMap<Long, Integer> getReachableTiles(GameState s, Unit unit, int playerIdx) {
        LinkedHashMap<Long, Integer> reachable = new LinkedHashMap<>();
        if (unit.moved || unit.moveCD > 0) return reachable;
        UnitCfg cfg = GameConfig.UNIT_TYPES.get(unit.type);
        int movePoints = cfg.move();
        if (movePoints < 1) return reachable;

        long startKey = pack(unit.x, unit.y);
        reachable.put(startKey, 0);
        ArrayDeque<int[]> queue = new ArrayDeque<>();
        queue.add(new int[]{unit.x, unit.y, 0});
        HashSet<Long> visited = new HashSet<>();
        visited.add(startKey);

        while (!queue.isEmpty()) {
            int[] cur = queue.poll();
            if (cur[2] >= movePoints) continue;
            for (int[] d : DIRS4) {
                int nx = cur[0] + d[0];
                int ny = cur[1] + d[1];
                long nk = pack(nx, ny);
                if (visited.contains(nk)) continue;
                visited.add(nk);

                int mc = getMoveCost(s, unit, nx, ny, playerIdx);
                if (mc == Integer.MAX_VALUE) continue;
                int newCost = cur[2] + mc;
                if (newCost <= movePoints) {
                    reachable.put(nk, newCost);
                    queue.add(new int[]{nx, ny, newCost});
                } else if (getTerrain(s, nx, ny) == GameConfig.RIVER && newCost <= movePoints + 1) {
                    // 河流通行增加一回合：移速不足时仍可进入河流，但本回合无法继续前进
                    reachable.put(nk, newCost);
                    queue.add(new int[]{nx, ny, movePoints});
                }
            }
        }
        return reachable;
    }

    static void moveUnit(GameState s, Unit unit, int tx, int ty) {
        unit.x = tx;
        unit.y = ty;
        unit.moved = true;
        UnitCfg cfg = GameConfig.UNIT_TYPES.get(unit.type);
        if (cfg.moveCD() > 0) unit.moveCD = cfg.moveCD();
        if (getTerrain(s, tx, ty) == GameConfig.RIVER) {
            unit.riverDelay = 1;
        } else if (unit.riverDelay > 0) {
            unit.riverDelay--;
        }
        granarySupply(s, unit);
        supplyOnMove(s, unit);
    }

    // ========== 战斗 ==========

    /** 有效攻击距离：弓兵移动后只能贴脸射击（与前端 moveShootRange 一致） */
    static int effectiveRange(Unit attacker, UnitCfg cfg) {
        if (attacker.moved && cfg.moveShootRange() > 0) {
            return Math.min(cfg.atkRange(), cfg.moveShootRange());
        }
        return cfg.atkRange();
    }

    static boolean canAttack(GameState s, Unit attacker, Unit defender) {
        if (attacker.id == defender.id) return false;
        if (attacker.owner == defender.owner) return false;
        if (attacker.attacked) return false;
        UnitCfg cfg = GameConfig.UNIT_TYPES.get(attacker.type);
        if (cfg.atkRange() == 0) return false;
        return dist(attacker.x, attacker.y, defender.x, defender.y) <= effectiveRange(attacker, cfg);
    }

    static void resolveCombat(GameState s, Unit attacker, Unit defender) {
        UnitCfg atkCfg = GameConfig.UNIT_TYPES.get(attacker.type);
        UnitCfg defCfg = GameConfig.UNIT_TYPES.get(defender.type);
        // 饥兵系数：储备见底的部队打不动（与前端 combat.js 一致）
        int damage = (int) (attacker.troops * atkCfg.atkPerTroop()
                * GameConfig.unitHungerMul(atkCfg, attacker.supplies, attacker.troops));
        int defHP = defender.troops * defCfg.hpPerTroop();
        int remainingHP = Math.max(0, defHP - damage);
        int remainingTroops = (remainingHP + defCfg.hpPerTroop() - 1) / defCfg.hpPerTroop();

        defender.troops = remainingTroops;
        attacker.attacked = true;

        s.actionMsg.setLength(0);
        s.actionMsg.append(atkCfg.name()).append("攻击").append(defCfg.name())
                .append("，造成").append(damage).append("伤害！");

        // 击杀后勤补给兵的奖励：只补满击杀者自身储备（与前端一致）
        if (defender.troops <= 0 && "supply".equals(defender.type)) {
            attacker.supplies = atkCfg.foodCap();
        }

        if (defender.troops <= 0) {
            s.actionMsg.append(" 击杀！");
        }
        removeDeadUnits(s);
    }

    static boolean canAttackBuilding(GameState s, Unit attacker, int x, int y) {
        Building b = s.buildings.get(key(x, y));
        if (b == null) return false;
        if (attacker.owner == b.owner) return false;
        if (attacker.attacked) return false;
        UnitCfg cfg = GameConfig.UNIT_TYPES.get(attacker.type);
        if (cfg.atkRange() == 0) return false;
        return dist(attacker.x, attacker.y, x, y) <= effectiveRange(attacker, cfg);
    }

    static boolean resolveBuildingCombat(GameState s, Unit attacker, int x, int y) {
        Building b = s.buildings.get(key(x, y));
        if (b == null) return false;
        UnitCfg atkCfg = GameConfig.UNIT_TYPES.get(attacker.type);
        BuildingCfg bCfg = GameConfig.BUILDING_TYPES.get(b.type);
        int damage = (int) (attacker.troops * atkCfg.atkPerTroop()
                * GameConfig.unitHungerMul(atkCfg, attacker.supplies, attacker.troops));
        b.hp = Math.max(0, b.hp - damage);
        b.lastHitBy = attacker.owner;
        attacker.attacked = true;
        s.actionMsg.setLength(0);
        s.actionMsg.append(atkCfg.name()).append("攻击").append(bCfg.name())
                .append("，造成").append(damage).append("伤害！");
        if (b.hp <= 0) {
            s.actionMsg.append(" ").append(bCfg.name()).append("血量归零！");
        }
        return true;
    }

    // ========== 经济 ==========

    static int collectFood(GameState s) {
        Player player = s.players.get(s.currentPlayer);
        int collected = estimateFarmIncome(s, s.currentPlayer);
        player.food += collected;
        return collected;
    }

    /** 该玩家每回合的农田产出（含沃土加成），用于判断"养得起多大规模的军队" */
    static int estimateFarmIncome(GameState s, int playerIdx) {
        int total = 0;
        for (Map.Entry<String, Building> e : s.buildings.entrySet()) {
            Building b = e.getValue();
            if (b.owner != playerIdx || !"farm".equals(b.type)) continue;
            String[] p = e.getKey().split(",");
            int amount = GameConfig.FARM_FOOD_PER_TURN;
            if (getTerrain(s, Integer.parseInt(p[0]), Integer.parseInt(p[1])) == GameConfig.FERTILE) amount *= 2;
            total += amount;
        }
        return total;
    }

    /** 该玩家全军每回合的维持开销（折算成粮草）：Σ troops × foodConsumeMul ÷ 粮仓换算率 */
    static int estimateArmyUpkeep(GameState s, int playerIdx) {
        int conv = GameConfig.GRANARY_CONV > 0 ? GameConfig.GRANARY_CONV : 1;
        double total = 0;
        for (Unit u : s.units) {
            if (u.owner != playerIdx) continue;
            UnitCfg cfg = GameConfig.UNIT_TYPES.get(u.type);
            if (cfg == null || cfg.foodConsumeMul() == 0) continue;
            total += (double) (u.troops * cfg.foodConsumeMul()) / conv;
        }
        return (int) total;
    }

    static void consumeUnitSupplies(GameState s) {
        for (Unit u : s.units) {
            if (u.owner != s.currentPlayer) continue;
            UnitCfg cfg = GameConfig.UNIT_TYPES.get(u.type);
            int consume = u.troops * cfg.foodConsumeMul();
            u.supplies -= consume;
            if (u.supplies < 0) {
                int shortage = Math.abs(u.supplies);
                int hpLoss = shortage;
                int hpPerTroop = cfg.hpPerTroop();
                int troopLoss = (hpLoss + hpPerTroop - 1) / hpPerTroop;
                u.troops = Math.max(0, u.troops - troopLoss);
                u.supplies = 0;
                if (u.troops <= 0) s.actionMsg.append(cfg.name()).append("饿死了！");
            }
        }
        removeDeadUnits(s);
    }

    static void transferSupply(GameState s, Unit supplyUnit, Unit targetUnit) {
        UnitCfg uCfg = GameConfig.UNIT_TYPES.get(targetUnit.type);
        int needed = uCfg.foodCap() - targetUnit.supplies;
        if (needed > 0 && supplyUnit.supplies > 0) {
            int give = Math.min(needed, supplyUnit.supplies);
            targetUnit.supplies += give;
            supplyUnit.supplies -= give;
            s.actionMsg.append("补给兵补充").append(give).append("粮草给").append(uCfg.name()).append("；");
        }
    }

    static void supplyNearby(GameState s, Unit supplyUnit) {
        for (Unit u : s.units) {
            if (u.owner != supplyUnit.owner || u.id == supplyUnit.id) continue;
            if (dist(supplyUnit.x, supplyUnit.y, u.x, u.y) <= 1) {
                transferSupply(s, supplyUnit, u);
            }
        }
    }

    static void supplyOnMove(GameState s, Unit unit) {
        if ("supply".equals(unit.type)) {
            supplyNearby(s, unit);
            return;
        }
        for (Unit su : s.units) {
            if (su.owner != unit.owner || !"supply".equals(su.type)) continue;
            if (dist(su.x, su.y, unit.x, unit.y) <= 1) {
                transferSupply(s, su, unit);
            }
        }
    }

    // ========== 建筑 ==========

    static boolean canBuildOn(GameState s, int x, int y, int playerIdx) {
        int t = getTerrain(s, x, y);
        if (t != GameConfig.PLAIN && t != GameConfig.FERTILE) return false;
        if (getBuilding(s, x, y) != null) return false;
        if (!getUnitsAt(s, x, y).isEmpty()) return false;
        // 与前端一致：只能在己方当前视野内建造
        if (!isBuildVisibleTo(s, x, y, playerIdx)) return false;
        return true;
    }

    /**
     * 「建」的视野：只有兵种（移动力×3）提供；建筑一律不提供，否则会自我滚动。
     * 唯一豁免：主营周围 1 格，保证老家永远能补建，不会因部队外出而彻底停摆。
     */
    static boolean isBuildVisibleTo(GameState s, int x, int y, int playerIdx) {
        Player p = s.players.get(playerIdx);
        if (p == null || !p.alive) return false;
        if (Math.abs(x - p.hqX) <= 1 && Math.abs(y - p.hqY) <= 1) return true;
        for (Unit u : s.units) {
            if (u.owner != playerIdx) continue;
            UnitCfg c = GameConfig.UNIT_TYPES.get(u.type);
            int r = c != null ? c.move() * 3 : 3;
            if (Math.abs(x - u.x) <= r && Math.abs(y - u.y) <= r) return true;
        }
        return false;
    }

    static boolean buildStructure(GameState s, int playerIdx, int x, int y, String buildingType) {
        BuildingCfg cfg = GameConfig.BUILDING_TYPES.get(buildingType);
        Player player = s.players.get(playerIdx);
        if (player.food < cfg.buildCost()) return false;
        player.food -= cfg.buildCost();
        Building b = new Building();
        b.type = buildingType;
        b.owner = playerIdx;
        b.hp = cfg.hp();
        s.buildings.put(key(x, y), b);
        s.actionMsg.setLength(0);
        s.actionMsg.append("建造了").append(cfg.name()).append("！");
        return true;
    }

    static String canProduce(GameState s, int playerIdx, String buildingKey) {
        String[] p = buildingKey.split(",");
        int bx = Integer.parseInt(p[0]);
        int by = Integer.parseInt(p[1]);
        Building b = s.buildings.get(buildingKey);
        if (b == null || b.owner != playerIdx) return null;
        if (b.cd > 0) return null;
        for (Unit u : s.units) {
            if (u.x == bx && u.y == by && u.owner != playerIdx) return null;
        }
        return b.type;
    }

    static boolean produceUnit(GameState s, int playerIdx, String buildingKey, String unitType) {
        String[] p = buildingKey.split(",");
        int bx = Integer.parseInt(p[0]);
        int by = Integer.parseInt(p[1]);
        Building b = s.buildings.get(buildingKey);
        if (b == null || b.owner != playerIdx) return false;

        UnitCfg cfg = GameConfig.UNIT_TYPES.get(unitType);
        Player player = s.players.get(playerIdx);
        if (player.food < cfg.buildCost()) return false;

        int placeX = bx, placeY = by;
        if (!getUnitsAt(s, bx, by).isEmpty()) {
            boolean found = false;
            for (int[] d : new int[][]{{1, 0}, {-1, 0}, {0, 1}, {0, -1}, {1, 1}, {-1, 1}, {1, -1}, {-1, -1}}) {
                int nx = bx + d[0], ny = by + d[1];
                if (isPassable(s, nx, ny, playerIdx) && getUnitsAt(s, nx, ny).isEmpty()) {
                    placeX = nx;
                    placeY = ny;
                    found = true;
                    break;
                }
            }
            if (!found) return false;
        }

        player.food -= cfg.buildCost();
        spawnUnit(s, playerIdx, unitType, placeX, placeY);
        b.cd = cfg.produceTurns() > 0 ? cfg.produceTurns() : 1;
        s.actionMsg.setLength(0);
        s.actionMsg.append("生产了").append(cfg.name()).append("！");
        return true;
    }

    static String arrowTowerAttack(GameState s) {
        StringBuilder msg = new StringBuilder();
        for (Map.Entry<String, Building> e : s.buildings.entrySet()) {
            Building b = e.getValue();
            if (b.owner != s.currentPlayer || !"arrow_tower".equals(b.type)) continue;
            String[] p = e.getKey().split(",");
            int bx = Integer.parseInt(p[0]);
            int by = Integer.parseInt(p[1]);
            for (Unit u : s.units) {
                if (u.owner == s.currentPlayer) continue;
                if (dist(bx, by, u.x, u.y) <= GameConfig.ARROW_TOWER_RANGE) {
                    int dmg = GameConfig.ARROW_TOWER_ATK;
                    UnitCfg defCfg = GameConfig.UNIT_TYPES.get(u.type);
                    int troopLoss = (dmg + defCfg.hpPerTroop() - 1) / defCfg.hpPerTroop();
                    u.troops = Math.max(0, u.troops - troopLoss);
                    msg.append("箭塔对").append(defCfg.name()).append("造成").append(dmg).append("伤害！");
                    break;
                }
            }
        }
        removeDeadUnits(s);
        return msg.toString();
    }

    static void granarySupply(GameState s, Unit unit) {
        Building b = s.buildings.get(key(unit.x, unit.y));
        if (b == null || !"granary".equals(b.type) || b.owner != unit.owner) return;
        UnitCfg cfg = GameConfig.UNIT_TYPES.get(unit.type);
        Player player = s.players.get(unit.owner);
        if (player == null) return;
        int needed = cfg.foodCap() - unit.supplies;
        if (needed > 0 && player.food > 0) {
            // 换算率全局唯一（储备可被补给兵 1:1 流通，各兵种不同汇率会产生套利），与前端 buildings.js 一致
            BuildingCfg bCfg = GameConfig.BUILDING_TYPES.get("granary");
            int conv = (bCfg != null && bCfg.granaryConv() > 0) ? bCfg.granaryConv() : 1;
            int give = Math.min(needed, player.food * conv);
            unit.supplies += give;
            player.food -= (give + conv - 1) / conv;
            s.actionMsg.append("粮仓补充").append(give).append("粮草给").append(cfg.name()).append("；");
        }
    }

    static void checkBuildingDestroyed(GameState s) {
        List<String> toRemove = new ArrayList<>();
        for (Map.Entry<String, Building> e : s.buildings.entrySet()) {
            Building b = e.getValue();
            if (b.hp <= 0) {
                if ("farm".equals(b.type) || "granary".equals(b.type)) {
                    String[] p = e.getKey().split(",");
                    int bx = Integer.parseInt(p[0]);
                    int by = Integer.parseInt(p[1]);
                    int newOwner = (b.lastHitBy != null && b.lastHitBy >= 0) ? b.lastHitBy : -1;
                    if (newOwner == b.owner || newOwner < 0 || newOwner >= s.players.size()) {
                        newOwner = b.owner;
                        int minD = Integer.MAX_VALUE;
                        for (Unit u : s.units) {
                            if (u.owner != b.owner) {
                                int d = dist(u.x, u.y, bx, by);
                                if (d < minD) {
                                    minD = d;
                                    newOwner = u.owner;
                                }
                            }
                        }
                    }
                    b.owner = newOwner;
                    b.hp = GameConfig.CAPTURED_HP;
                    b.lastHitBy = null;
                    s.actionMsg.append(GameConfig.BUILDING_TYPES.get(b.type).name()).append("被占领！");
                } else if ("hq".equals(b.type)) {
                    Player player = s.players.get(b.owner);
                    player.alive = false;
                    s.units.removeIf(u -> u.owner == b.owner);
                    toRemove.add(e.getKey());
                    s.actionMsg.append(player.name).append("的主营被摧毁！").append(player.name).append("出局！");
                } else {
                    toRemove.add(e.getKey());
                    String name = GameConfig.BUILDING_TYPES.get(b.type) != null
                            ? GameConfig.BUILDING_TYPES.get(b.type).name() : "建筑";
                    s.actionMsg.append(name).append("被摧毁！");
                }
            }
        }
        for (String bk : toRemove) s.buildings.remove(bk);
    }

    // ========== 回合准备 ==========

    static void preparePlayerTurn(GameState s, int playerIdx) {
        int prev = s.currentPlayer;
        s.currentPlayer = playerIdx;
        s.actionMsg.setLength(0);

        // 首回合（回合1）不收获
        if (s.turn > 1) {
            int collected = collectFood(s);
            if (collected > 0) s.actionMsg.append("收获").append(collected).append("粮草；");
        }

        consumeUnitSupplies(s);

        String arrowMsg = arrowTowerAttack(s);
        if (arrowMsg != null && !arrowMsg.isEmpty()) s.actionMsg.append(arrowMsg);

        for (Unit u : s.units) {
            if (u.owner == playerIdx && "supply".equals(u.type)) supplyNearby(s, u);
        }
        for (Unit u : s.units) {
            if (u.owner == playerIdx && "heavy_cavalry".equals(u.type)) {
                if (u.moveCD > 0) u.moveCD--;
            }
        }
        for (Unit u : s.units) {
            if (u.owner == playerIdx) {
                u.moved = false;
                u.attacked = false;
            }
        }
        for (Map.Entry<String, Building> e : s.buildings.entrySet()) {
            Building b = e.getValue();
            BuildingCfg bCfg = GameConfig.BUILDING_TYPES.get(b.type);
            if (bCfg == null || b.owner != playerIdx) continue;
            if (b.cd > 0) b.cd--;
            int maxHp = bCfg.hp();
            if ("farm".equals(b.type) && b.hp < maxHp) {
                b.hp = Math.min(maxHp, b.hp + 100);
            }
            if ("granary".equals(b.type) && b.hp < maxHp) {
                b.hp = Math.min(maxHp, b.hp + 200);
            }
        }

        s.currentPlayer = prev;
    }

    // ========== AI ==========

    // 建筑上限：AI 每回合都能造一栋，没有上限会在 30 回合内堆出 20+ 箭塔
    static final java.util.Map<String, Integer> AI_BUILD_CAP = java.util.Map.of(
            "farm", 4, "supply_barracks", 1, "granary", 2,
            "infantry_barracks", 2, "archer_barracks", 2, "lc_barracks", 1, "hc_barracks", 1,
            "arrow_tower", 5, "watchtower", 2, "wall", 6
    );

    static String diffOf(GameState s) {
        return s.difficulty == null ? "easy" : s.difficulty;
    }

    static int produceThreshold(GameState s) {
        switch (diffOf(s)) {
            case "normal": return 900;
            case "hard": return 600;
            case "extreme": return 400;
            default: return 1200;
        }
    }

    static int buildThreshold(GameState s) {
        switch (diffOf(s)) {
            case "normal": return 1200;
            case "hard": return 900;
            case "extreme": return 700;
            default: return 1500;
        }
    }

    static int aiBuildRadius(GameState s) {
        switch (diffOf(s)) {
            case "normal": return 5;
            case "hard": return 7;
            case "extreme": return 9;
            default: return 3;
        }
    }

    static int countBuildings(GameState s, int playerIdx, String type) {
        int n = 0;
        for (Building b : s.buildings.values()) {
            if (b.owner == playerIdx && type.equals(b.type)) n++;
        }
        return n;
    }

    static boolean underCap(GameState s, int playerIdx, String type) {
        return countBuildings(s, playerIdx, type) < AI_BUILD_CAP.getOrDefault(type, 1);
    }

    // 经济优先级：2 农田 → 后勤营 → 粮仓 → 第 3 农田 → 兵营 → 按上限补
    static String aiNextBuild(GameState s, int playerIdx, DoubleSupplier rand) {
        if (countBuildings(s, playerIdx, "farm") < 2 && underCap(s, playerIdx, "farm")) return "farm";
        if (underCap(s, playerIdx, "supply_barracks")) return "supply_barracks";
        if (underCap(s, playerIdx, "granary")) return "granary";
        if (countBuildings(s, playerIdx, "farm") < 3 && underCap(s, playerIdx, "farm")) return "farm";
        if (underCap(s, playerIdx, "infantry_barracks")) return "infantry_barracks";
        if (underCap(s, playerIdx, "archer_barracks")) return "archer_barracks";

        List<String> pool = new ArrayList<>();
        if (underCap(s, playerIdx, "arrow_tower")) { pool.add("arrow_tower"); pool.add("arrow_tower"); }
        if (underCap(s, playerIdx, "infantry_barracks")) pool.add("infantry_barracks");
        if (underCap(s, playerIdx, "archer_barracks")) pool.add("archer_barracks");
        if (underCap(s, playerIdx, "lc_barracks")) pool.add("lc_barracks");
        if (underCap(s, playerIdx, "hc_barracks")) pool.add("hc_barracks");
        if (underCap(s, playerIdx, "watchtower")) pool.add("watchtower");
        if (underCap(s, playerIdx, "wall")) pool.add("wall");
        if (underCap(s, playerIdx, "farm")) pool.add("farm");
        if (pool.isEmpty()) return null;
        return pool.get((int) (rand.getAsDouble() * pool.size()));
    }

    static void aiTurn(GameState s, DoubleSupplier rand) {
        int playerIdx = s.currentPlayer;
        Player player = s.players.get(playerIdx);
        if (player == null || !player.alive) return;

        String nextBuild = aiNextBuild(s, playerIdx, rand);
        aiProduceUnits(s, playerIdx, nextBuild);
        aiBuildStructures(s, playerIdx, rand, nextBuild);
        aiMoveAndAttack(s, playerIdx);
        aiLogistics(s, playerIdx);
    }

    private static void aiProduceUnits(GameState s, int playerIdx, String nextBuild) {
        Player player = s.players.get(playerIdx);
        String[] priority = {"infantry", "archer", "light_cavalry", "supply", "heavy_cavalry"};
        int combatCount = 0, supplyCount = 0;
        for (Unit u : s.units) {
            if (u.owner != playerIdx) continue;
            if ("supply".equals(u.type)) supplyCount++; else combatCount++;
        }
        // 补给兵上限：每 3 个战斗单位配 1 个补给兵
        int supplyCap = Math.max(1, (combatCount + 2) / 3);
        int reserve = 0;
        if (nextBuild != null) {
            BuildingCfg nb = GameConfig.BUILDING_TYPES.get(nextBuild);
            if (nb != null) reserve = nb.buildCost();
        }

        // 后勤闸门（与前端 ai.js 一致）：过半部队缺粮，或全军维持需求超过农田产出，
        // 就停止扩军——只看粮草余额是错的，余额反映"这阵子没花完"，不反映"养不养得起"
        int lowCount = 0;
        for (Unit u : s.units) {
            if (u.owner != playerIdx || "supply".equals(u.type)) continue;
            UnitCfg uc = GameConfig.UNIT_TYPES.get(u.type);
            if (uc != null && uc.foodCap() > 0 && u.supplies < uc.foodCap() * 0.4) lowCount++;
        }
        int income = estimateFarmIncome(s, playerIdx);
        int upkeep = estimateArmyUpkeep(s, playerIdx);
        boolean overCapacity = combatCount > 0 && upkeep > income;
        boolean starving = combatCount > 0 && (lowCount * 2 > combatCount || overCapacity);

        for (Map.Entry<String, Building> e : s.buildings.entrySet()) {
            Building b = e.getValue();
            if (b.owner != playerIdx) continue;
            String bType = canProduce(s, playerIdx, e.getKey());
            if (bType == null) continue;

            for (String utype : priority) {
                UnitCfg cfg = GameConfig.UNIT_TYPES.get(utype);
                String produced = GameConfig.BARRACKS_TYPE_MAP.get(bType);
                if (produced == null || !produced.equals(utype)) continue;
                if ("supply".equals(utype) && supplyCount >= supplyCap) break;
                if (!"supply".equals(utype) && starving) break;
                if (player.food >= cfg.buildCost() + produceThreshold(s) + reserve) {
                    produceUnit(s, playerIdx, e.getKey(), utype);
                    break;
                }
            }
        }
    }

    private static void aiBuildStructures(GameState s, int playerIdx, DoubleSupplier rand, String buildOrder) {
        if (buildOrder == null) return;
        Player player = s.players.get(playerIdx);
        if (player.food < buildThreshold(s)) return;

        int hqX = player.hqX, hqY = player.hqY;
        int buildR = aiBuildRadius(s);
        List<int[]> candidates = new ArrayList<>();
        for (int dy = -buildR; dy <= buildR; dy++) {
            for (int dx = -buildR; dx <= buildR; dx++) {
                int x = hqX + dx, y = hqY + dy;
                if (canBuildOn(s, x, y, playerIdx)) candidates.add(new int[]{x, y});
            }
        }
        if (candidates.isEmpty()) return;

        int[] pos = candidates.get((int) (rand.getAsDouble() * candidates.size()));
        BuildingCfg cfg = GameConfig.BUILDING_TYPES.get(buildOrder);
        if (cfg != null && cfg.buildable() && player.food >= cfg.buildCost() + buildThreshold(s) / 2) {
            buildStructure(s, playerIdx, pos[0], pos[1], buildOrder);
        }
    }

    private static void aiMoveAndAttack(GameState s, int playerIdx) {
        List<Unit> myUnits = new ArrayList<>();
        List<Unit> enemies = new ArrayList<>();
        List<Unit> supplyUnits = new ArrayList<>();
        for (Unit u : s.units) {
            if (u.owner == playerIdx && !u.moved && !"supply".equals(u.type)) myUnits.add(u);
            if (u.owner != playerIdx) enemies.add(u);
            if (u.owner == playerIdx && "supply".equals(u.type) && !u.moved) supplyUnits.add(u);
        }

        // 战斗单位
        for (Unit u : myUnits) {
            if (u.moved) continue;
            UnitCfg cfg = GameConfig.UNIT_TYPES.get(u.type);

            // 先攻击
            boolean attacked = false;
            for (Unit enemy : enemies) {
                if (!s.units.contains(enemy)) continue;
                if (canAttack(s, u, enemy)) {
                    resolveCombat(s, u, enemy);
                    attacked = true;
                    break;
                }
            }
            if (attacked) continue;

            // 移动
            if (!enemies.isEmpty() && cfg.move() >= 1) {
                LinkedHashMap<Long, Integer> reachable = getReachableTiles(s, u, playerIdx);
                if (reachable.size() > 1) {
                    int bestX = 0, bestY = 0;
                    long bestDist = Long.MAX_VALUE;
                    for (Unit enemy : enemies) {
                        for (long rk : reachable.keySet()) {
                            int rx = unpackX(rk), ry = unpackY(rk);
                            if (rx == u.x && ry == u.y) continue;
                            long d = dist(rx, ry, enemy.x, enemy.y);
                            if (d < bestDist) {
                                bestDist = d;
                                bestX = rx;
                                bestY = ry;
                            }
                        }
                    }
                    for (Player ep : s.players) {
                        if (ep.index == playerIdx || !ep.alive) continue;
                        for (long rk : reachable.keySet()) {
                            int rx = unpackX(rk), ry = unpackY(rk);
                            if (rx == u.x && ry == u.y) continue;
                            long d = dist(rx, ry, ep.hqX, ep.hqY);
                            if (d < bestDist) {
                                bestDist = d;
                                bestX = rx;
                                bestY = ry;
                            }
                        }
                    }
                    if (bestDist != Long.MAX_VALUE) moveUnit(s, u, bestX, bestY);
                }
            }

            // 移动后攻击
            if (!u.attacked && cfg.atkRange() > 0) {
                for (Unit enemy : enemies) {
                    if (!s.units.contains(enemy)) continue;
                    if (canAttack(s, u, enemy)) {
                        resolveCombat(s, u, enemy);
                        break;
                    }
                }
                // 无单位可打时，攻击范围内敌方建筑
                if (!u.attacked) {
                    String[] prio = isSmart(s)
                            ? new String[]{"hq", "farm", "granary", "arrow_tower",
                                    "infantry_barracks", "archer_barracks", "lc_barracks", "hc_barracks",
                                    "supply_barracks", "wall", "watchtower"}
                            : new String[]{"farm", "granary", "arrow_tower", "hq",
                                    "infantry_barracks", "archer_barracks", "lc_barracks", "hc_barracks",
                                    "supply_barracks", "wall", "watchtower"};
                    for (String ptype : prio) {
                        for (Map.Entry<String, Building> e : s.buildings.entrySet()) {
                            Building b = e.getValue();
                            if (!ptype.equals(b.type) || b.owner == playerIdx) continue;
                            String[] p = e.getKey().split(",");
                            int bx = Integer.parseInt(p[0]);
                            int by = Integer.parseInt(p[1]);
                            if (canAttackBuilding(s, u, bx, by)) {
                                resolveBuildingCombat(s, u, bx, by);
                                break;
                            }
                        }
                        if (u.attacked) break;
                    }
                }
            }
        }

        // 补给兵调度交给 aiLogistics
    }

    static boolean isSmart(GameState s) {
        String d = diffOf(s);
        return "normal".equals(d) || "hard".equals(d) || "extreme".equals(d);
    }

    // AI 后勤：向储备低于 60% 的友军靠拢；全员充足时回己方粮仓补货
    static void aiLogistics(GameState s, int playerIdx) {
        List<Unit> supplies = new ArrayList<>();
        for (Unit u : s.units) {
            if (u.owner == playerIdx && "supply".equals(u.type) && !u.moved && u.moveCD == 0 && u.riverDelay == 0) {
                supplies.add(u);
            }
        }
        if (supplies.isEmpty()) return;

        String granaryKey = null;
        for (Map.Entry<String, Building> e : s.buildings.entrySet()) {
            Building b = e.getValue();
            if (b.owner == playerIdx && "granary".equals(b.type)) { granaryKey = e.getKey(); break; }
        }

        for (Unit su : supplies) {
            List<Unit> needy = new ArrayList<>();
            for (Unit u : s.units) {
                if (u.owner != playerIdx || u.id == su.id) continue;
                UnitCfg c = GameConfig.UNIT_TYPES.get(u.type);
                if (c.foodCap() > 0 && u.supplies < c.foodCap() * 0.6) needy.add(u);
            }
            needy.sort((a, b) -> Integer.compare(dist(su.x, su.y, a.x, a.y), dist(su.x, su.y, b.x, b.y)));

            int tx = -1, ty = -1;
            if (!needy.isEmpty()) {
                tx = needy.get(0).x;
                ty = needy.get(0).y;
            } else if (granaryKey != null) {
                String[] p = granaryKey.split(",");
                int gx = Integer.parseInt(p[0]), gy = Integer.parseInt(p[1]);
                if (su.x == gx && su.y == gy) continue;
                tx = gx;
                ty = gy;
            }
            if (tx < 0) continue;
            if (su.x == tx && su.y == ty) continue;

            LinkedHashMap<Long, Integer> reachable = getReachableTiles(s, su, playerIdx);
            int bestX = su.x, bestY = su.y;
            int bestDist = dist(su.x, su.y, tx, ty);
            for (long rk : reachable.keySet()) {
                int rx = unpackX(rk), ry = unpackY(rk);
                if (rx == su.x && ry == su.y) continue;
                int d = dist(rx, ry, tx, ty);
                if (d < bestDist) {
                    bestDist = d;
                    bestX = rx;
                    bestY = ry;
                }
            }
            if (bestX != su.x || bestY != su.y) moveUnit(s, su, bestX, bestY);
        }
    }
}
