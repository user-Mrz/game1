package com.inkgame.backend.save;

import java.time.LocalDateTime;

public class SaveDetail {

    private Long id;
    private String gameId;
    private String slotName;
    private Integer mapSize;
    private Integer turn;
    private String phase;
    private String stateJson;
    private LocalDateTime updatedAt;

    public static SaveDetail from(SaveSlot slot) {
        SaveDetail d = new SaveDetail();
        d.setId(slot.getId());
        d.setGameId(slot.getGameId());
        d.setSlotName(slot.getSlotName());
        d.setMapSize(slot.getMapSize());
        d.setTurn(slot.getTurn());
        d.setPhase(slot.getPhase());
        d.setStateJson(slot.getStateJson());
        d.setUpdatedAt(slot.getUpdatedAt());
        return d;
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getGameId() {
        return gameId;
    }

    public void setGameId(String gameId) {
        this.gameId = gameId;
    }

    public String getSlotName() {
        return slotName;
    }

    public void setSlotName(String slotName) {
        this.slotName = slotName;
    }

    public Integer getMapSize() {
        return mapSize;
    }

    public void setMapSize(Integer mapSize) {
        this.mapSize = mapSize;
    }

    public Integer getTurn() {
        return turn;
    }

    public void setTurn(Integer turn) {
        this.turn = turn;
    }

    public String getPhase() {
        return phase;
    }

    public void setPhase(String phase) {
        this.phase = phase;
    }

    public String getStateJson() {
        return stateJson;
    }

    public void setStateJson(String stateJson) {
        this.stateJson = stateJson;
    }

    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(LocalDateTime updatedAt) {
        this.updatedAt = updatedAt;
    }
}
