package com.inkgame.backend.sim;

import java.util.List;

/**
 * POST /api/sim/end-turn 响应体 — 结算后状态（不含 terrain/explored，前端保留本地副本）。
 */
public class SimResult {
    public List<Player> players;
    public List<Unit> units;
    public List<SimBuildingEntry> buildings;
    public int currentPlayer;
    public int turn;
    public int nextUnitId;
    public String phase;
    public Integer winner;
    public String actionMsg;
}
