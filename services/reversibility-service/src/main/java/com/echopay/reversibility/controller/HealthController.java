package com.echopay.reversibility.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.Map;

@RestController
public class HealthController {

    @GetMapping("/health")
    public Map<String, String> health() {
        return Map.of(
            "service", "reversibility-service",
            "status", "healthy",
            "timestamp", Instant.now().toString()
        );
    }
}