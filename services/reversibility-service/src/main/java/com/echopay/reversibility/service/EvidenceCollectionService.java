package com.echopay.reversibility.service;

import com.echopay.reversibility.model.FraudCase;
import com.echopay.reversibility.repository.FraudCaseRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.scheduling.annotation.Async;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;

/**
 * Service for automated evidence collection during fraud investigations.
 * Gathers transaction context, user behavior patterns, and system logs.
 */
@Service
public class EvidenceCollectionService {

    private final FraudCaseRepository fraudCaseRepository;
    private final TransactionService transactionService;
    private final UserBehaviorService userBehaviorService;
    private final SystemLogService systemLogService;

    @Autowired
    public EvidenceCollectionService(
            FraudCaseRepository fraudCaseRepository,
            TransactionService transactionService,
            UserBehaviorService userBehaviorService,
            SystemLogService systemLogService) {
        this.fraudCaseRepository = fraudCaseRepository;
        this.transactionService = transactionService;
        this.userBehaviorService = userBehaviorService;
        this.systemLogService = systemLogService;
    }

    /**
     * Start automated evidence collection for a fraud case.
     * This runs asynchronously to avoid blocking the fraud report submission.
     */
    @Async
    public CompletableFuture<Void> startEvidenceCollection(UUID caseId) {
        try {
            FraudCase fraudCase = fraudCaseRepository.findById(caseId)
                .orElseThrow(() -> new IllegalArgumentException("Fraud case not found: " + caseId));

            Map<String, Object> automatedEvidence = new HashMap<>();

            // Collect transaction context
            Map<String, Object> transactionContext = collectTransactionContext(fraudCase.getTransactionId());
            automatedEvidence.put("transactionContext", transactionContext);

            // Collect user behavior analysis
            Map<String, Object> behaviorAnalysis = collectBehaviorAnalysis(
                fraudCase.getReporterId(), 
                fraudCase.getTransactionId()
            );
            automatedEvidence.put("behaviorAnalysis", behaviorAnalysis);

            // Collect system logs
            Map<String, Object> systemLogs = collectSystemLogs(
                fraudCase.getTransactionId(),
                fraudCase.getCreatedAt()
            );
            automatedEvidence.put("systemLogs", systemLogs);

            // Collect device and location information
            Map<String, Object> deviceInfo = collectDeviceInformation(fraudCase.getTransactionId());
            automatedEvidence.put("deviceInfo", deviceInfo);

            // Merge with existing evidence
            Map<String, Object> existingEvidence = fraudCase.getEvidence();
            if (existingEvidence != null) {
                existingEvidence.putAll(automatedEvidence);
            } else {
                fraudCase.setEvidence(automatedEvidence);
            }

            // Add evidence collection timestamp
            fraudCase.getEvidence().put("evidenceCollectedAt", LocalDateTime.now().toString());

            // Save updated fraud case
            fraudCaseRepository.save(fraudCase);

        } catch (Exception e) {
            // Log error but don't fail the fraud case
            System.err.println("Error collecting evidence for case " + caseId + ": " + e.getMessage());
        }

        return CompletableFuture.completedFuture(null);
    }

    private Map<String, Object> collectTransactionContext(UUID transactionId) {
        Map<String, Object> context = new HashMap<>();
        
        try {
            // Get transaction details
            Map<String, Object> transactionDetails = transactionService.getTransactionDetails(transactionId);
            context.put("transactionDetails", transactionDetails);

            // Get related transactions (same user, similar amounts, time proximity)
            Map<String, Object> relatedTransactions = transactionService.getRelatedTransactions(transactionId);
            context.put("relatedTransactions", relatedTransactions);

            // Get fraud risk score if available
            Double fraudScore = transactionService.getFraudScore(transactionId);
            if (fraudScore != null) {
                context.put("fraudScore", fraudScore);
            }

            // Get transaction timing analysis
            Map<String, Object> timingAnalysis = analyzeTransactionTiming(transactionId);
            context.put("timingAnalysis", timingAnalysis);

        } catch (Exception e) {
            context.put("error", "Failed to collect transaction context: " + e.getMessage());
        }

        return context;
    }

    private Map<String, Object> collectBehaviorAnalysis(UUID userId, UUID transactionId) {
        Map<String, Object> analysis = new HashMap<>();
        
        try {
            // Get user's typical transaction patterns
            Map<String, Object> typicalPatterns = userBehaviorService.getTypicalPatterns(userId);
            analysis.put("typicalPatterns", typicalPatterns);

            // Analyze deviation from normal behavior
            Map<String, Object> deviationAnalysis = userBehaviorService.analyzeDeviation(userId, transactionId);
            analysis.put("deviationAnalysis", deviationAnalysis);

            // Get recent account activity
            Map<String, Object> recentActivity = userBehaviorService.getRecentActivity(userId, 7); // Last 7 days
            analysis.put("recentActivity", recentActivity);

        } catch (Exception e) {
            analysis.put("error", "Failed to collect behavior analysis: " + e.getMessage());
        }

        return analysis;
    }

    private Map<String, Object> collectSystemLogs(UUID transactionId, LocalDateTime caseCreatedAt) {
        Map<String, Object> logs = new HashMap<>();
        
        try {
            // Get authentication logs around transaction time
            Map<String, Object> authLogs = systemLogService.getAuthenticationLogs(
                transactionId, 
                caseCreatedAt.minusHours(1), 
                caseCreatedAt.plusHours(1)
            );
            logs.put("authenticationLogs", authLogs);

            // Get API access logs
            Map<String, Object> apiLogs = systemLogService.getApiAccessLogs(
                transactionId,
                caseCreatedAt.minusHours(1),
                caseCreatedAt.plusHours(1)
            );
            logs.put("apiAccessLogs", apiLogs);

            // Get error logs if any
            Map<String, Object> errorLogs = systemLogService.getErrorLogs(
                transactionId,
                caseCreatedAt.minusHours(1),
                caseCreatedAt.plusHours(1)
            );
            logs.put("errorLogs", errorLogs);

        } catch (Exception e) {
            logs.put("error", "Failed to collect system logs: " + e.getMessage());
        }

        return logs;
    }

    private Map<String, Object> collectDeviceInformation(UUID transactionId) {
        Map<String, Object> deviceInfo = new HashMap<>();
        
        try {
            // Get device fingerprint information
            Map<String, Object> deviceFingerprint = transactionService.getDeviceFingerprint(transactionId);
            deviceInfo.put("deviceFingerprint", deviceFingerprint);

            // Get location information
            Map<String, Object> locationInfo = transactionService.getLocationInfo(transactionId);
            deviceInfo.put("locationInfo", locationInfo);

            // Get session information
            Map<String, Object> sessionInfo = transactionService.getSessionInfo(transactionId);
            deviceInfo.put("sessionInfo", sessionInfo);

        } catch (Exception e) {
            deviceInfo.put("error", "Failed to collect device information: " + e.getMessage());
        }

        return deviceInfo;
    }

    private Map<String, Object> analyzeTransactionTiming(UUID transactionId) {
        Map<String, Object> timing = new HashMap<>();
        
        try {
            // Analyze if transaction occurred at unusual time
            boolean unusualTime = transactionService.isUnusualTransactionTime(transactionId);
            timing.put("unusualTime", unusualTime);

            // Check for rapid successive transactions
            boolean rapidSuccession = transactionService.hasRapidSuccessiveTransactions(transactionId);
            timing.put("rapidSuccession", rapidSuccession);

            // Get transaction processing time
            Long processingTime = transactionService.getProcessingTime(transactionId);
            timing.put("processingTimeMs", processingTime);

        } catch (Exception e) {
            timing.put("error", "Failed to analyze transaction timing: " + e.getMessage());
        }

        return timing;
    }
}