package com.inkgame.backend.save;

import java.time.LocalDateTime;

public class SaveSummary {

    private Long id;
    private String slotName;
    private Integer mapSize;
    private Integer turn;
    private String phase;
    private LocalDateTime updatedAt;

    public static SaveSummary from(SaveSlot slot) {
        SaveSummary s = new SaveSummary();
        s.setId(slot.getId());
        s.setSlotName(slot.getSlotName());
        s.setMapSize(slot.getMapSize());
        s.setTurn(slot.getTurn());
        s.setPhase(slot.getPhase());
        s.setUpdatedAt(slot.getUpdatedAt());
        return s;
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
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

    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(LocalDateTime updatedAt) {
        this.updatedAt = updatedAt;
    }
}
