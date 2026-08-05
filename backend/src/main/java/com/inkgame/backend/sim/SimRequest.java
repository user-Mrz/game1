package com.inkgame.backend.sim;

import java.util.List;

/**
 * POST /api/sim/end-turn 请求体。
 * terrain 为 base64 编码的地形字节；seed 可选，用于复现 AI 决策。
 */
public class SimRequest {
    public int mapW;
    public int mapH;
    public String terrain;
    public List<Player> players;
    public List<Unit> units;
    public List<SimBuildingEntry> buildings;
    public int currentPlayer;
    public int turn;
    public int nextUnitId;
    public Integer seed;
    public Boolean tutorialMode;
}
