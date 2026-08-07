package com.inkgame.backend.sim;

import java.util.List;

/**
 * POST /api/sim/end-turn 请求体。
 * gameId 用于从 MapService 查找地形数据；seed 可选，用于复现 AI 决策。
 */
public class SimRequest {
    public String gameId;
    public int mapW;
    public int mapH;
    public String terrain; // 可选：若 MapService 中无此 gameId 的地形，则使用此字段
    public List<Player> players;
    public List<Unit> units;
    public List<SimBuildingEntry> buildings;
    public int currentPlayer;
    public int turn;
    public int nextUnitId;
    public Integer seed;
    public Boolean tutorialMode;
}
