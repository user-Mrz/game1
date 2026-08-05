package com.inkgame.backend.sim;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/sim")
public class SimController {

    private final SimService simService;

    public SimController(SimService simService) {
        this.simService = simService;
    }

    /**
     * 回合结算：执行所有存活 AI 行动并返回结算后状态。
     */
    @PostMapping("/end-turn")
    public SimResult endTurn(@RequestBody SimRequest request) {
        return simService.endTurn(request);
    }
}
