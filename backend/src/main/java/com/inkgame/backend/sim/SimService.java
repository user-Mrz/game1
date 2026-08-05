package com.inkgame.backend.sim;

import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.DoubleSupplier;

/**
 * 后端回合结算服务：接收前端状态，静默结算所有 AI 行动，返回结算后状态。
 * 无状态设计：不持有会话，AI 探索视野不维护（前端已不保留 AI explored）。
 */
@Service
public class SimService {

    public SimResult endTurn(SimRequest request) {
        GameState state = toState(request);
        runEndTurn(state, request);
        return toResult(state);
    }

    private GameState toState(SimRequest req) {
        GameState s = new GameState();
        s.mapW = req.mapW;
        s.mapH = req.mapH;
        s.terrain = Base64.getDecoder().decode(req.terrain);
        s.players = new ArrayList<>(req.players == null ? List.of() : req.players);
        s.units = new ArrayList<>(req.units == null ? List.of() : req.units);
        s.buildings = new LinkedHashMap<>();
        if (req.buildings != null) {
            for (SimBuildingEntry e : req.buildings) {
                Building b = new Building();
                b.type = e.type;
                b.owner = e.owner;
                b.hp = e.hp;
                b.lastHitBy = e.lastHitBy;
                s.buildings.put(e.key, b);
            }
        }
        s.currentPlayer = req.currentPlayer;
        s.turn = req.turn;
        s.nextUnitId = req.nextUnitId;
        s.tutorialMode = req.tutorialMode != null && req.tutorialMode;
        return s;
    }

    /**
     * 与前端 state.js endTurn 的结算流程对齐（省略 AI explored 更新与渲染/相机）。
     */
    private void runEndTurn(GameState s, SimRequest req) {
        SimEngine.checkBuildingDestroyed(s);

        Player humanPlayer = findHuman(s);
        if (humanPlayer != null && !humanPlayer.alive) {
            s.phase = "over";
            s.winner = null;
            return;
        }

        long aliveCount = s.players.stream().filter(p -> p.alive).count();
        if (aliveCount <= 1) {
            s.phase = "over";
            s.winner = firstAliveIndex(s);
            return;
        }

        // 同一回合内静默结算所有存活AI；教学关卡无 AI
        List<Player> ais = s.tutorialMode
                ? List.of()
                : s.players.stream().filter(p -> p.alive && !p.isHuman).toList();
        DoubleSupplier rand = req.seed != null ? new Mulberry32(req.seed) : Math::random;

        for (Player ai : ais) {
            s.currentPlayer = ai.index;
            SimEngine.preparePlayerTurn(s, ai.index);
            SimEngine.aiTurn(s, rand);
            SimEngine.checkBuildingDestroyed(s);

            boolean hpAlive = s.players.stream().anyMatch(p -> p.isHuman && p.alive);
            long aliveNow = s.players.stream().filter(p -> p.alive).count();
            if (!hpAlive) {
                s.phase = "over";
                s.winner = null;
                return;
            }
            if (aliveNow <= 1) {
                s.phase = "over";
                s.winner = firstAliveIndex(s);
                return;
            }
        }

        // 进入下一回合：currentPlayer 切回人类，回合数 +1；
        // 人类回合准备/视野更新/相机仍由前端 startTurn 完成（与原来一致）
        s.currentPlayer = humanPlayer != null ? humanPlayer.index : 0;
        s.turn++;
        s.phase = "playing";
        s.winner = null;
        s.actionMsg.setLength(0);
    }

    private Player findHuman(GameState s) {
        for (Player p : s.players) {
            if (p.isHuman) return p;
        }
        return null;
    }

    private Integer firstAliveIndex(GameState s) {
        for (Player p : s.players) {
            if (p.alive) return p.index;
        }
        return null;
    }

    private SimResult toResult(GameState s) {
        SimResult r = new SimResult();
        r.players = s.players;
        r.units = s.units;
        r.buildings = new ArrayList<>();
        for (Map.Entry<String, Building> e : s.buildings.entrySet()) {
            Building b = e.getValue();
            SimBuildingEntry be = new SimBuildingEntry();
            be.key = e.getKey();
            be.type = b.type;
            be.owner = b.owner;
            be.hp = b.hp;
            be.lastHitBy = b.lastHitBy;
            r.buildings.add(be);
        }
        r.currentPlayer = s.currentPlayer;
        r.turn = s.turn;
        r.nextUnitId = s.nextUnitId;
        r.phase = s.phase;
        r.winner = s.winner;
        r.actionMsg = s.actionMsg.toString();
        return r;
    }
}
