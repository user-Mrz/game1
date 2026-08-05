package com.inkgame.backend.save;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public class SaveRequest {

    @NotBlank(message = "stateJson 不能为空")
    private String stateJson;

    @Size(max = 64, message = "存档名称最长 64 字符")
    private String slotName;

    private Integer mapSize;

    private Integer turn;

    private String phase;

    public String getStateJson() {
        return stateJson;
    }

    public void setStateJson(String stateJson) {
        this.stateJson = stateJson;
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
}
