package com.echopay.reversibility.service;

import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Service for analyzing user behavior patterns for fraud detection.
 * This is a stub implementation that would integrate with the fraud detection service.
 */
@Service
public class UserBehaviorService {

    /**
     * Get user's typical transaction patterns.
     */
    public Map<String, Object> getTypicalPatterns(UUID userId) {
        Map<String, Object> patterns = new HashMap<>();
        patterns.put("averageTransactionAmount", 250.0);
        patterns.put("typicalTransactionTimes", new String[]{"09:00-12:00", "18:00-21:00"});
        patterns.put("frequentMerchants", new String[]{"grocery", "gas_station", "restaurant"});
        patterns.put("averageTransactionsPerDay", 3.2);
        patterns.put("typicalDaysOfWeek", new String[]{"Monday", "Wednesday", "Friday"});
        return patterns;
    }

    /**
     * Analyze deviation from normal behavior.
     */
    public Map<String, Object> analyzeDeviation(UUID userId, UUID transactionId) {
        Map<String, Object> deviation = new HashMap<>();
        deviation.put("amountDeviation", 0.8); // 80% higher than typical
        deviation.put("timeDeviation", 0.2); // 20% deviation from typical time
        deviation.put("locationDeviation", 0.1); // 10% deviation from typical location
        deviation.put("overallDeviationScore", 0.37); // Combined deviation score
        deviation.put("isSignificantDeviation", false);
        return deviation;
    }

    /**
     * Get recent account activity.
     */
    public Map<String, Object> getRecentActivity(UUID userId, int days) {
        Map<String, Object> activity = new HashMap<>();
        activity.put("transactionCount", 15);
        activity.put("totalAmount", 3750.0);
        activity.put("uniqueMerchants", 8);
        activity.put("loginCount", 12);
        activity.put("passwordChanges", 0);
        activity.put("deviceChanges", 0);
        activity.put("suspiciousActivity", false);
        return activity;
    }
}