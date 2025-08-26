package com.echopay.reversibility.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;

/**
 * Configuration for asynchronous processing.
 * Enables async methods for evidence collection and notifications.
 */
@Configuration
@EnableAsync
public class AsyncConfig {
    // Spring Boot's default async configuration is sufficient for our needs
}