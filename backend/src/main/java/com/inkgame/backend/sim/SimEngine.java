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

    static boolean canAttack(GameState s, Unit attacker, Unit defender) {
        if (attacker.id == defender.id) return false;
        if (attacker.owner == defender.owner) return false;
        if (attacker.attacked) return false;
        UnitCfg cfg = GameConfig.UNIT_TYPES.get(attacker.type);
        if (cfg.atkRange() == 0) return false;
        return dist(attacker.x, attacker.y, defender.x, defender.y) <= cfg.atkRange();
    }

    static void resolveCombat(GameState s, Unit attacker, Unit defender) {
        UnitCfg atkCfg = GameConfig.UNIT_TYPES.get(attacker.type);
        UnitCfg defCfg = GameConfig.UNIT_TYPES.get(defender.type);
        int atkPower = attacker.troops * atkCfg.atkPerTroop();
        int defHP = defender.troops * defCfg.hpPerTroop();
        int damage = atkPower;
        int remainingHP = Math.max(0, defHP - damage);
        int remainingTroops = (remainingHP + defCfg.hpPerTroop() - 1) / defCfg.hpPerTroop();

        defender.troops = remainingTroops;
        attacker.attacked = true;

        s.actionMsg.setLength(0);
        s.actionMsg.append(atkCfg.name()).append("攻击").append(defCfg.name())
                .append("，造成").append(damage).append("伤害！");

        // 击杀后勤补给兵奖励
        if (defender.troops <= 0 && "supply".equals(defender.type)) {
            Player killer = s.players.get(attacker.owner);
            killer.food += atkCfg.foodCap() * 5;
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
        return dist(attacker.x, attacker.y, x, y) <= cfg.atkRange();
    }

    static boolean resolveBuildingCombat(GameState s, Unit attacker, int x, int y) {
        Building b = s.buildings.get(key(x, y));
        if (b == null) return false;
        UnitCfg atkCfg = GameConfig.UNIT_TYPES.get(attacker.type);
        BuildingCfg bCfg = GameConfig.BUILDING_TYPES.get(b.type);
        int damage = attacker.troops * atkCfg.atkPerTroop();
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
        int collected = 0;
        for (Map.Entry<String, Building> e : s.buildings.entrySet()) {
            Building b = e.getValue();
            if (b.owner == s.currentPlayer && "farm".equals(b.type)) {
                String[] p = e.getKey().split(",");
                int bx = Integer.parseInt(p[0]);
                int by = Integer.parseInt(p[1]);
                int amount = GameConfig.FARM_FOOD_PER_TURN;
                if (getTerrain(s, bx, by) == GameConfig.FERTILE) amount *= 2;
                collected += amount;
            }
        }
        player.food += collected;
        return collected;
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
        return true;
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
            int give = Math.min(needed, player.food);
            unit.supplies += give;
            player.food -= give;
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
            if (b.owner == playerIdx && "farm".equals(b.type) && b.hp < 1000) {
                b.hp = Math.min(1000, b.hp + 100);
            }
            if (b.owner == playerIdx && "granary".equals(b.type) && b.hp < 2000) {
                b.hp = Math.min(2000, b.hp + 200);
            }
        }

        s.currentPlayer = prev;
    }

    // ========== AI ==========

    static void aiTurn(GameState s, DoubleSupplier rand) {
        int playerIdx = s.currentPlayer;
        Player player = s.players.get(playerIdx);
        if (player == null || !player.alive) return;

        aiProduceUnits(s, playerIdx);
        aiBuildStructures(s, playerIdx, rand);
        aiMoveAndAttack(s, playerIdx);
    }

    private static void aiProduceUnits(GameState s, int playerIdx) {
        Player player = s.players.get(playerIdx);
        String[] priority = {"infantry", "archer", "light_cavalry", "supply", "heavy_cavalry"};

        for (Map.Entry<String, Building> e : s.buildings.entrySet()) {
            Building b = e.getValue();
            if (b.owner != playerIdx) continue;
            String bType = canProduce(s, playerIdx, e.getKey());
            if (bType == null) continue;

            for (String utype : priority) {
                UnitCfg cfg = GameConfig.UNIT_TYPES.get(utype);
                String produced = GameConfig.BARRACKS_TYPE_MAP.get(bType);
                if (produced == null || !produced.equals(utype)) continue;
                if (player.food >= cfg.buildCost() + 3000) {
                    produceUnit(s, playerIdx, e.getKey(), utype);
                    break;
                }
            }
        }
    }

    private static void aiBuildStructures(GameState s, int playerIdx, DoubleSupplier rand) {
        Player player = s.players.get(playerIdx);
        if (player.food < 3000) return;

        int hqX = player.hqX, hqY = player.hqY;
        List<int[]> candidates = new ArrayList<>();
        for (int dy = -3; dy <= 3; dy++) {
            for (int dx = -3; dx <= 3; dx++) {
                int x = hqX + dx, y = hqY + dy;
                if (canBuildOn(s, x, y, playerIdx)) candidates.add(new int[]{x, y});
            }
        }
        if (candidates.isEmpty()) return;

        int[] pos = candidates.get((int) (rand.getAsDouble() * candidates.size()));
        long hasFarms = s.buildings.values().stream()
                .filter(b -> b.owner == playerIdx && "farm".equals(b.type)).count();
        String buildOrder;
        if (hasFarms < 2) {
            buildOrder = "farm";
        } else if (rand.getAsDouble() < 0.4) {
            buildOrder = "arrow_tower";
        } else if (rand.getAsDouble() < 0.5) {
            buildOrder = "infantry_barracks";
        } else {
            buildOrder = "archer_barracks";
        }

        BuildingCfg cfg = GameConfig.BUILDING_TYPES.get(buildOrder);
        if (cfg.buildable() && player.food >= cfg.buildCost() + 2000) {
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
                    String[] prio = {"farm", "granary", "arrow_tower", "hq",
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

        // 补给兵跟随
        for (Unit su : supplyUnits) {
            if (su.moved) continue;
            List<Unit> myCombat = new ArrayList<>();
            for (Unit u : s.units) {
                if (u.owner == playerIdx && !"supply".equals(u.type) && u.moved) myCombat.add(u);
            }
            if (!myCombat.isEmpty()) {
                LinkedHashMap<Long, Integer> reachable = getReachableTiles(s, su, playerIdx);
                int bestX = 0, bestY = 0;
                long bestDist = Long.MAX_VALUE;
                for (Unit combat : myCombat) {
                    for (long rk : reachable.keySet()) {
                        int rx = unpackX(rk), ry = unpackY(rk);
                        if (rx == su.x && ry == su.y) continue;
                        long d = dist(rx, ry, combat.x, combat.y);
                        if (d < bestDist) {
                            bestDist = d;
                            bestX = rx;
                            bestY = ry;
                        }
                    }
                }
                if (bestDist != Long.MAX_VALUE) moveUnit(s, su, bestX, bestY);
            }
        }
    }
}
