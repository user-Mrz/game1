package com.inkgame.backend.map;

import org.springframework.stereotype.Service;

import java.util.Base64;
import java.util.Random;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 地图地形服务：生成、存储、查询地形数据。
 * 地形数据以 gameId 为 key 存储在内存中，前端不再持有完整地形。
 */
@Service
public class MapService {

    private static final int PLAIN = 0;
    private static final int FOREST = 1;
    private static final int MOUNTAIN = 2;
    private static final int RIVER = 3;
    private static final int FERTILE = 4;

    /** gameId → 地形字节数组 */
    private final ConcurrentHashMap<String, MapData> maps = new ConcurrentHashMap<>();

    public record MapData(int width, int height, byte[] terrain) {}

    /**
     * 生成地形并存储，返回 base64 编码的地形数据。
     * 算法与前端 terrain.js 保持一致。
     */
    public String generateMap(String gameId, int w, int h, long seed) {
        Random rng = new Random(seed);
        byte[] terrain = new byte[w * h];

        // 种子点
        int[][] seeds = new int[12][3];
        for (int i = 0; i < 12; i++) {
            seeds[i][0] = rng.nextInt(w);
            seeds[i][1] = rng.nextInt(h);
            seeds[i][2] = (int)(w * 0.08 + rng.nextDouble() * w * 0.15);
        }

        // 全部初始化为平原
        for (int i = 0; i < terrain.length; i++) terrain[i] = PLAIN;

        // 山脉群（前5个种子）
        for (int s = 0; s < 5; s++) {
            int sx = seeds[s][0], sy = seeds[s][1], sr = seeds[s][2];
            for (int dy = -sr; dy <= sr; dy++) {
                for (int dx = -sr; dx <= sr; dx++) {
                    int x = sx + dx, y = sy + dy;
                    if (x < 0 || y < 0 || x >= w || y >= h) continue;
                    if (dx * dx + dy * dy < sr * sr * (0.4 + rng.nextDouble() * 0.6)) {
                        terrain[y * w + x] = rng.nextDouble() < 0.85 ? (byte) MOUNTAIN : (byte) FOREST;
                    }
                }
            }
        }

        // 河流（3条）
        for (int r = 0; r < 3; r++) {
            int rx = rng.nextInt(w), ry = rng.nextInt(h);
            int len = (int)((w + h) * 0.3 + rng.nextDouble() * (w + h) * 0.4);
            for (int i = 0; i < len; i++) {
                if (rx >= 0 && ry >= 0 && rx < w && ry < h) {
                    if (terrain[ry * w + rx] != MOUNTAIN) terrain[ry * w + rx] = RIVER;
                    int[][] dirs = {{1, 0}, {-1, 0}, {0, 1}, {0, -1}};
                    for (int[] d : dirs) {
                        int nx = rx + d[0], ny = ry + d[1];
                        if (nx >= 0 && ny >= 0 && nx < w && ny < h
                                && terrain[ny * w + nx] != MOUNTAIN && rng.nextDouble() < 0.3) {
                            terrain[ny * w + nx] = RIVER;
                        }
                    }
                }
                if (rng.nextDouble() < 0.5) {
                    rx += rng.nextDouble() < 0.5 ? 1 : -1;
                } else {
                    ry += rng.nextDouble() < 0.5 ? 1 : -1;
                }
            }
        }

        // 森林（种子5-8）
        for (int s = 5; s < 9; s++) {
            int sx = seeds[s][0], sy = seeds[s][1], sr = seeds[s][2];
            for (int dy = -sr; dy <= sr; dy++) {
                for (int dx = -sr; dx <= sr; dx++) {
                    int x = sx + dx, y = sy + dy;
                    if (x < 0 || y < 0 || x >= w || y >= h) continue;
                    if (dx * dx + dy * dy < sr * sr * 0.5 && terrain[y * w + x] == PLAIN) {
                        terrain[y * w + x] = FOREST;
                    }
                }
            }
        }

        // 沃土（种子9-11）
        for (int s = 9; s < 12; s++) {
            int sx = seeds[s][0], sy = seeds[s][1], sr = seeds[s][2];
            int halfR = sr / 2;
            for (int dy = -halfR; dy <= halfR; dy++) {
                for (int dx = -halfR; dx <= halfR; dx++) {
                    int x = sx + dx, y = sy + dy;
                    if (x < 0 || y < 0 || x >= w || y >= h) continue;
                    if (terrain[y * w + x] == PLAIN && rng.nextDouble() < 0.5) {
                        terrain[y * w + x] = FERTILE;
                    }
                }
            }
        }

        maps.put(gameId, new MapData(w, h, terrain));
        return Base64.getEncoder().encodeToString(terrain);
    }

    /** 获取地形 base64 */
    public String getTerrainBase64(String gameId) {
        MapData md = maps.get(gameId);
        if (md == null) return null;
        return Base64.getEncoder().encodeToString(md.terrain);
    }

    /** 获取地形原始字节数组（供 SimService 使用） */
    public byte[] getTerrain(String gameId) {
        MapData md = maps.get(gameId);
        return md != null ? md.terrain : null;
    }

    /** 获取地图尺寸 */
    public MapData getMapData(String gameId) {
        return maps.get(gameId);
    }

    /** 存入已有地形（用于加载旧存档） */
    public void putTerrain(String gameId, int w, int h, byte[] terrain) {
        maps.put(gameId, new MapData(w, h, terrain));
    }

    /** 检查地形是否存在 */
    public boolean hasMap(String gameId) {
        return maps.containsKey(gameId);
    }
}
