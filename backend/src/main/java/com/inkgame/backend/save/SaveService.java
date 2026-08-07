package com.inkgame.backend.save;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;

@Service
public class SaveService {

    private static final DateTimeFormatter NAME_FMT = DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss");

    private final SaveSlotRepository repository;

    public SaveService(SaveSlotRepository repository) {
        this.repository = repository;
    }

    @Transactional(readOnly = true)
    public List<SaveSummary> list() {
        return repository.findAllByOrderByUpdatedAtDesc().stream().map(SaveSummary::from).toList();
    }

    @Transactional(readOnly = true)
    public SaveDetail get(Long id) {
        return SaveDetail.from(findOr404(id));
    }

    @Transactional
    public SaveDetail create(SaveRequest request) {
        // 一局游戏只保留一个存档：按 gameId 查找，存在则更新，不存在则新建
        SaveSlot slot = repository.findByGameId(request.getGameId())
                .orElseGet(SaveSlot::new);
        boolean isNew = slot.getId() == null;
        apply(slot, request, isNew);
        return SaveDetail.from(repository.save(slot));
    }

    @Transactional
    public SaveDetail update(Long id, SaveRequest request) {
        SaveSlot slot = findOr404(id);
        apply(slot, request, false);
        return SaveDetail.from(repository.save(slot));
    }

    @Transactional
    public void delete(Long id) {
        SaveSlot slot = findOr404(id);
        repository.delete(slot);
    }

    private SaveSlot findOr404(Long id) {
        return repository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "存档不存在"));
    }

    private void apply(SaveSlot slot, SaveRequest request, boolean isNew) {
        slot.setGameId(request.getGameId());
        if (request.getSlotName() == null || request.getSlotName().isBlank()) {
            if (isNew) {
                slot.setSlotName("存档-" + LocalDateTime.now().format(NAME_FMT));
            }
        } else {
            slot.setSlotName(request.getSlotName().trim());
        }
        slot.setMapSize(request.getMapSize() == null ? 0 : request.getMapSize());
        slot.setTurn(request.getTurn() == null ? 0 : request.getTurn());
        slot.setPhase(request.getPhase() == null || request.getPhase().isBlank() ? "playing" : request.getPhase());
        slot.setStateJson(request.getStateJson());
    }
}
