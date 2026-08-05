package com.inkgame.backend.save;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/saves")
public class SaveController {

    private final SaveService saveService;

    public SaveController(SaveService saveService) {
        this.saveService = saveService;
    }

    @GetMapping
    public List<SaveSummary> list() {
        return saveService.list();
    }

    @GetMapping("/{id}")
    public SaveDetail get(@PathVariable Long id) {
        return saveService.get(id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public SaveDetail create(@Valid @RequestBody SaveRequest request) {
        return saveService.create(request);
    }

    @PutMapping("/{id}")
    public SaveDetail update(@PathVariable Long id, @Valid @RequestBody SaveRequest request) {
        return saveService.update(id, request);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) {
        saveService.delete(id);
    }
}
