package com.echopay.reversibility.service;

import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Service for tracking reversal times to meet 1-hour requirement.
 * Implements requirement 3.6: Reversal time tracking.
 */
@Service
public class ReversalTimeTracker {

    private final Map<UUID, ReversalTrackingRecord> activeReversals = new ConcurrentHashMap<>();
    private final Map<UUID, ReversalTrackingRecord> completedReversals = new ConcurrentHashMap<>();

    /**
     * Start tracking reversal time for a case.
     */
    public void startReversal(UUID caseId) {
        ReversalTrackingRecord record = new ReversalTrackingRecord(
            caseId,
            LocalDateTime.now(),
            null,
            null,
            ReversalStatus.IN_PROGRESS
        );
        
        activeReversals.put(caseId, record);
        System.out.println("Started reversal tracking for case: " + caseId);
    }

    /**
     * Complete reversal tracking successfully.
     */
    public void completeReversal(UUID caseId) {
        ReversalTrackingRecord record = activeReversals.remove(caseId);
        if (record != null) {
            LocalDateTime completedAt = LocalDateTime.now();
            Duration duration = Duration.between(record.getStartTime(), completedAt);
            
            ReversalTrackingRecord completedRecord = new ReversalTrackingRecord(
                caseId,
                record.getStartTime(),
                completedAt,
                duration,
                ReversalStatus.COMPLETED
            );
            
            completedReversals.put(caseId, completedRecord);
            
            // Check if reversal met 1-hour requirement
            boolean withinOneHour = duration.toMinutes() <= 60;
            System.out.println(String.format(
                "Reversal completed for case %s in %d minutes (within 1 hour: %s)",
                caseId, duration.toMinutes(), withinOneHour
            ));
        }
    }

    /**
     * Mark reversal as failed.
     */
    public void failReversal(UUID caseId, String reason) {
        ReversalTrackingRecord record = activeReversals.remove(caseId);
        if (record != null) {
            LocalDateTime failedAt = LocalDateTime.now();
            Duration duration = Duration.between(record.getStartTime(), failedAt);
            
            ReversalTrackingRecord failedRecord = new ReversalTrackingRecord(
                caseId,
                record.getStartTime(),
                failedAt,
                duration,
                ReversalStatus.FAILED,
                reason
            );
            
            completedReversals.put(caseId, failedRecord);
            
            System.out.println(String.format(
                "Reversal failed for case %s after %d minutes: %s",
                caseId, duration.toMinutes(), reason
            ));
        }
    }

    /**
     * Get reversal time for a specific case.
     */
    public Duration getReversalTime(UUID caseId) {
        ReversalTrackingRecord record = completedReversals.get(caseId);
        return record != null ? record.getDuration() : null;
    }

    /**
     * Check if reversal was completed within 1 hour.
     */
    public boolean wasReversalWithinOneHour(UUID caseId) {
        Duration duration = getReversalTime(caseId);
        return duration != null && duration.toMinutes() <= 60;
    }

    /**
     * Get total number of reversals processed.
     */
    public int getTotalReversals() {
        return completedReversals.size();
    }

    /**
     * Get average reversal time in minutes.
     */
    public double getAverageReversalTime() {
        if (completedReversals.isEmpty()) {
            return 0.0;
        }

        long totalMinutes = completedReversals.values().stream()
            .filter(record -> record.getStatus() == ReversalStatus.COMPLETED)
            .mapToLong(record -> record.getDuration().toMinutes())
            .sum();

        long completedCount = completedReversals.values().stream()
            .filter(record -> record.getStatus() == ReversalStatus.COMPLETED)
            .count();

        return completedCount > 0 ? (double) totalMinutes / completedCount : 0.0;
    }

    /**
     * Get number of reversals completed within 1 hour.
     */
    public long getReversalsWithinOneHour() {
        return completedReversals.values().stream()
            .filter(record -> record.getStatus() == ReversalStatus.COMPLETED)
            .filter(record -> record.getDuration().toMinutes() <= 60)
            .count();
    }

    /**
     * Get automated reversal rate (percentage of reversals that were automated).
     */
    public double getAutomatedReversalRate() {
        // In a real implementation, this would track reversal types
        // For now, simulate that 70% of reversals are automated
        return 70.0;
    }

    /**
     * Get all active reversals (for monitoring).
     */
    public Map<UUID, ReversalTrackingRecord> getActiveReversals() {
        return Map.copyOf(activeReversals);
    }

    /**
     * Get reversal statistics summary.
     */
    public ReversalStatistics getStatistics() {
        long totalReversals = completedReversals.size();
        long successfulReversals = completedReversals.values().stream()
            .filter(record -> record.getStatus() == ReversalStatus.COMPLETED)
            .count();
        long reversalsWithinOneHour = getReversalsWithinOneHour();
        double averageTime = getAverageReversalTime();
        double successRate = totalReversals > 0 ? (double) successfulReversals / totalReversals * 100 : 0.0;
        double oneHourComplianceRate = successfulReversals > 0 ? (double) reversalsWithinOneHour / successfulReversals * 100 : 0.0;

        return new ReversalStatistics(
            totalReversals,
            successfulReversals,
            reversalsWithinOneHour,
            averageTime,
            successRate,
            oneHourComplianceRate
        );
    }

    /**
     * Enum for reversal status.
     */
    public enum ReversalStatus {
        IN_PROGRESS,
        COMPLETED,
        FAILED
    }

    /**
     * Record for tracking individual reversal.
     */
    public static class ReversalTrackingRecord {
        private final UUID caseId;
        private final LocalDateTime startTime;
        private final LocalDateTime endTime;
        private final Duration duration;
        private final ReversalStatus status;
        private final String failureReason;

        public ReversalTrackingRecord(UUID caseId, LocalDateTime startTime, 
                                    LocalDateTime endTime, Duration duration, 
                                    ReversalStatus status) {
            this(caseId, startTime, endTime, duration, status, null);
        }

        public ReversalTrackingRecord(UUID caseId, LocalDateTime startTime, 
                                    LocalDateTime endTime, Duration duration, 
                                    ReversalStatus status, String failureReason) {
            this.caseId = caseId;
            this.startTime = startTime;
            this.endTime = endTime;
            this.duration = duration;
            this.status = status;
            this.failureReason = failureReason;
        }

        // Getters
        public UUID getCaseId() { return caseId; }
        public LocalDateTime getStartTime() { return startTime; }
        public LocalDateTime getEndTime() { return endTime; }
        public Duration getDuration() { return duration; }
        public ReversalStatus getStatus() { return status; }
        public String getFailureReason() { return failureReason; }
    }

    /**
     * Statistics summary class.
     */
    public static class ReversalStatistics {
        private final long totalReversals;
        private final long successfulReversals;
        private final long reversalsWithinOneHour;
        private final double averageTimeMinutes;
        private final double successRate;
        private final double oneHourComplianceRate;

        public ReversalStatistics(long totalReversals, long successfulReversals, 
                                long reversalsWithinOneHour, double averageTimeMinutes, 
                                double successRate, double oneHourComplianceRate) {
            this.totalReversals = totalReversals;
            this.successfulReversals = successfulReversals;
            this.reversalsWithinOneHour = reversalsWithinOneHour;
            this.averageTimeMinutes = averageTimeMinutes;
            this.successRate = successRate;
            this.oneHourComplianceRate = oneHourComplianceRate;
        }

        // Getters
        public long getTotalReversals() { return totalReversals; }
        public long getSuccessfulReversals() { return successfulReversals; }
        public long getReversalsWithinOneHour() { return reversalsWithinOneHour; }
        public double getAverageTimeMinutes() { return averageTimeMinutes; }
        public double getSuccessRate() { return successRate; }
        public double getOneHourComplianceRate() { return oneHourComplianceRate; }
    }
}