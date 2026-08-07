package com.inkgame.backend.save;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface SaveSlotRepository extends JpaRepository<SaveSlot, Long> {

    List<SaveSlot> findAllByOrderByUpdatedAtDesc();

    java.util.Optional<SaveSlot> findByGameId(String gameId);
}
