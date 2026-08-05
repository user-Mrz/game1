package com.inkgame.backend.sim;

/**
 * 单位 — 字段与前端 state.units 元素一致。
 */
public class Unit {
    public int id;
    public String type;
    public int owner;
    public int x;
    public int y;
    public int troops;
    public int supplies;
    public boolean moved;
    public boolean attacked;
    public int moveCD;
    public int riverDelay;
}
