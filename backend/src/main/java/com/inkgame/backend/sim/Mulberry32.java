package com.inkgame.backend.sim;

import java.util.function.DoubleSupplier;

/**
 * mulberry32 PRNG — 与前端 AI 使用的种子随机数完全一致，用于 JS/Java 结算一致性验证。
 */
public class Mulberry32 implements DoubleSupplier {
    private int a;

    public Mulberry32(int seed) {
        this.a = seed;
    }

    @Override
    public double getAsDouble() {
        a += 0x6D2B79F5;
        int t = a;
        t = (t ^ (t >>> 15)) * (t | 1);
        t = t + ((t ^ (t >>> 7)) * (t | 61)) ^ t;
        t = t ^ (t >>> 14);
        return (t & 0xFFFFFFFFL) / 4294967296.0;
    }
}
