package com.inkgame.backend.map;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 地图地形 API：生成、查询、上传地形数据。
 */
@RestController
@RequestMapping("/api/map")
public class MapController {

    private final MapService mapService;

    public MapController(MapService mapService) {
        this.mapService = mapService;
    }

    /**
     * 生成新地图并返回地形 base64。
     * POST /api/map/generate
     * body: { gameId, width, height, seed }
     */
    @PostMapping("/generate")
    public ResponseEntity<Map<String, Object>> generate(@RequestBody Map<String, Object> body) {
        String gameId = (String) body.get("gameId");
        int width = body.containsKey("width") ? ((Number) body.get("width")).intValue() : 500;
        int height = body.containsKey("height") ? ((Number) body.get("height")).intValue() : 500;
        long seed = body.containsKey("seed") ? ((Number) body.get("seed")).longValue() : System.currentTimeMillis();

        String terrainBase64 = mapService.generateMap(gameId, width, height, seed);
        return ResponseEntity.ok(Map.of(
                "gameId", gameId,
                "width", width,
                "height", height,
                "terrain", terrainBase64
        ));
    }

    /**
     * 获取地形 base64。
     * GET /api/map/{gameId}
     */
    @GetMapping("/{gameId}")
    public ResponseEntity<Map<String, Object>> getMap(@PathVariable String gameId) {
        MapService.MapData md = mapService.getMapData(gameId);
        if (md == null) return ResponseEntity.notFound().build();
        String terrainBase64 = mapService.getTerrainBase64(gameId);
        return ResponseEntity.ok(Map.of(
                "gameId", gameId,
                "width", md.width(),
                "height", md.height(),
                "terrain", terrainBase64
        ));
    }

    /**
     * 上传已有地形（用于加载旧存档）。
     * POST /api/map/{gameId}/upload
     * body: { width, height, terrain }
     */
    @PostMapping("/{gameId}/upload")
    public ResponseEntity<Map<String, Object>> uploadMap(
            @PathVariable String gameId,
            @RequestBody Map<String, Object> body) {
        int width = ((Number) body.get("width")).intValue();
        int height = ((Number) body.get("height")).intValue();
        String terrainBase64 = (String) body.get("terrain");
        byte[] terrain = java.util.Base64.getDecoder().decode(terrainBase64);
        mapService.putTerrain(gameId, width, height, terrain);
        return ResponseEntity.ok(Map.of("gameId", gameId, "ok", true));
    }

    /**
     * 检查地形是否存在。
     * GET /api/map/{gameId}/exists
     */
    @GetMapping("/{gameId}/exists")
    public ResponseEntity<Map<String, Object>> exists(@PathVariable String gameId) {
        return ResponseEntity.ok(Map.of("exists", mapService.hasMap(gameId)));
    }
}
