package com.inkgame.backend.sim;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * 建筑传输对象：key 为 "x,y"，其余字段与前端建筑一致。
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class SimBuildingEntry {
    public String key;
    public String type;
    public int owner;
    public int hp;
    public Integer lastHitBy;
}
