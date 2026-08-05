package com.inkgame.backend.sim;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;

/**
 * 结算用游戏状态。buildings 用 LinkedHashMap 保持插入顺序，units 用 List 保持数组顺序，
 * 与前端 JS Map/Array 语义一致（保证同种子下结算结果逐位一致）。
 */
public class GameState {
    public int mapW;
    public int mapH;
    public byte[] terrain;
    public List<Player> players = new ArrayList<>();
    public List<Unit> units = new ArrayList<>();
    public LinkedHashMap<String, Building> buildings = new LinkedHashMap<>();
    public int currentPlayer;
    public int turn;
    public int nextUnitId;
    public String phase = "playing";
    public Integer winner = null;
    public boolean tutorialMode = false;
    public StringBuilder actionMsg = new StringBuilder();
}
