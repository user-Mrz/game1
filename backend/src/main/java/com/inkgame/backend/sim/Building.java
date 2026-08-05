package com.inkgame.backend.sim;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * 建筑 — 字段与前端 state.buildings 值一致。
 * lastHitBy 为 null 时不输出，对应前端 undefined 语义。
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class Building {
    public String type;
    public int owner;
    public int hp;
    public Integer lastHitBy;
}
