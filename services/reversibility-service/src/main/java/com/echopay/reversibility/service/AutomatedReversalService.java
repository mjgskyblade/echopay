package com.echopay.reversibility.service;

import com.echopay.reversibility.model.FraudCase;
import com.echopay.reversibility.repository.FraudCaseRepository;
import com.echopay.reversibility.dto.ReversalRequest;
import com.echopay.reversibility.dto.ReversalResponse;
import com.echopay.reversibility.exception.ReversalException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import java.util.Map;

/**
 * Service for automated reversal of clear fraud cases.
 * Implements requirement 3.2: Automated reversal within 1 hour for clear cases.
 * Implements requirement 3.5: Token reissuance system.
 * Implements requirement 3.6: Reversal time tracking.
 */
@Service
@Transactional
public class AutomatedReversalService {

    private final FraudCaseRepository fraudCaseRepository;
    private final FraudDetectionService fraudDetectionService;
    private final TokenReissuanceService tokenReissuanceService;
    private final TransactionService transactionService;
    private final NotificationService notificationService;
    private final ReversalTimeTracker reversalTimeTracker;

    // Fraud confidence threshold for automated reversal (0.8 = 80% confidence)
    private static final double AUTO_REVERSAL_THRESHOLD = 0.8;

    @Autowired
    public AutomatedReversalService(
            FraudCaseRepository fraudCaseRepository,
            FraudDetectionService fraudDetectionService,
            TokenReissuanceService tokenReissuanceService,
            TransactionService transactionService,
            NotificationService notificationService,
            ReversalTimeTracker reversalTimeTracker) {
        this.fraudCaseRepository = fraudCaseRepository;
        this.fraudDetectionService = fraudDetectionService;
        this.tokenReissuanceService = tokenReissuanceService;
        this.transactionService = transactionService;
        this.notificationService = notificationService;
        this.reversalTimeTracker = reversalTimeTracker;
    }

    /**
     * Scheduled task to check for cases eligible for automated reversal.
     * Runs every 5 minutes to ensure timely processing.
     */
    @Scheduled(fixedRate = 300000) // 5 minutes
    public void processAutomatedReversals() {
        LocalDateTime oneHourAgo = LocalDateTime.now().minusHours(1);
        List<FraudCase> candidateCases = fraudCaseRepository.findCasesForAutomatedResolution(oneHourAgo);

        for (FraudCase fraudCase : candidateCases) {
            try {
                processAutomatedReversal(fraudCase);
            } catch (Exception e) {
                System.err.println("Error processing automated reversal for case " + 
                    fraudCase.getCaseId() + ": " + e.getMessage());
            }
        }
    }

    /**
     * Process a single fraud case for automated reversal.
     */
    private void processAutomatedReversal(FraudCase fraudCase) {
        // Get fraud confidence score from ML analysis
        double fraudConfidence = fraudDetectionService.getFraudConfidence(fraudCase.getCaseId());
        
        if (fraudConfidence >= AUTO_REVERSAL_THRESHOLD) {
            // High confidence fraud - proceed with automated reversal
            executeAutomatedReversal(fraudCase, fraudConfidence);
        } else {
            // Low confidence - escalate to human arbitration
            escalateToArbitration(fraudCase, fraudConfidence);
        }
    }

    /**
     * Execute automated reversal for high-confidence fraud cases.
     * Implements requirement 3.2: Clear fraud reversal within 1 hour.
     */
    private void executeAutomatedReversal(FraudCase fraudCase, double fraudConfidence) {
        try {
            // Start reversal time tracking
            reversalTimeTracker.startReversal(fraudCase.getCaseId());

            // Create reversal request
            ReversalRequest reversalRequest = new ReversalRequest(
                fraudCase.getTransactionId(),
                fraudCase.getCaseId(),
                "Automated reversal - high fraud confidence: " + String.format("%.2f", fraudConfidence),
                ReversalRequest.ReversalType.AUTOMATED_FRAUD
            );

            // Execute the reversal
            ReversalResponse reversalResponse = executeReversal(reversalRequest);

            // Update fraud case status
            fraudCase.resolve(FraudCase.Resolution.FRAUD_CONFIRMED);
            fraudCaseRepository.save(fraudCase);

            // Complete reversal time tracking
            reversalTimeTracker.completeReversal(fraudCase.getCaseId());

            // Send notifications
            notificationService.sendReversalCompletion(
                fraudCase.getReporterId(), 
                fraudCase.getCaseId(), 
                reversalResponse.getReversedAmount()
            );

            System.out.println(String.format(
                "Automated reversal completed for case %s (confidence: %.2f)", 
                fraudCase.getCaseId(), fraudConfidence
            ));

        } catch (Exception e) {
            // Mark reversal as failed and escalate
            reversalTimeTracker.failReversal(fraudCase.getCaseId(), e.getMessage());
            escalateToArbitration(fraudCase, fraudConfidence);
            throw new ReversalException("Automated reversal failed for case " + fraudCase.getCaseId(), e);
        }
    }

    /**
     * Execute the actual transaction reversal.
     * Implements requirement 3.5: Token reissuance system.
     */
    public ReversalResponse executeReversal(ReversalRequest request) {
        // Validate reversal request
        validateReversalRequest(request);

        // Get transaction details
        Map<String, Object> transactionDetails = transactionService.getTransactionDetails(request.getTransactionId());
        double transactionAmount = (Double) transactionDetails.get("amount");
        UUID fromWallet = (UUID) transactionDetails.get("fromWallet");
        UUID toWallet = (UUID) transactionDetails.get("toWallet");

        // Step 1: Mark fraudulent tokens as invalid
        tokenReissuanceService.invalidateFraudulentTokens(request.getTransactionId());

        // Step 2: Reissue clean tokens to the victim
        UUID newTokenBatch = tokenReissuanceService.reissueCleanTokens(
            fromWallet, // Original sender (victim)
            transactionAmount,
            request.getCaseId()
        );

        // Step 3: Update transaction status to reversed
        transactionService.markTransactionReversed(request.getTransactionId(), request.getCaseId());

        // Step 4: Record reversal in audit trail
        UUID reversalId = recordReversalAuditTrail(request, transactionAmount, newTokenBatch);

        return new ReversalResponse(
            reversalId,
            request.getTransactionId(),
            request.getCaseId(),
            transactionAmount,
            newTokenBatch,
            LocalDateTime.now(),
            "Reversal completed successfully"
        );
    }

    /**
     * Escalate case to human arbitration when automated reversal is not appropriate.
     */
    private void escalateToArbitration(FraudCase fraudCase, double fraudConfidence) {
        // This will be implemented in task 6.3
        System.out.println(String.format(
            "Case %s escalated to arbitration (confidence: %.2f)", 
            fraudCase.getCaseId(), fraudConfidence
        ));
        
        // For now, just log the escalation
        // In task 6.3, this will assign to an arbitrator
    }

    /**
     * Validate reversal request before processing.
     */
    private void validateReversalRequest(ReversalRequest request) {
        if (request.getTransactionId() == null) {
            throw new ReversalException("Transaction ID is required for reversal");
        }
        if (request.getCaseId() == null) {
            throw new ReversalException("Case ID is required for reversal");
        }

        // Check if transaction is eligible for reversal
        if (!transactionService.isEligibleForReversal(request.getTransactionId())) {
            throw new ReversalException("Transaction is not eligible for reversal");
        }

        // Check if case is in correct state
        FraudCase fraudCase = fraudCaseRepository.findById(request.getCaseId())
            .orElseThrow(() -> new ReversalException("Fraud case not found: " + request.getCaseId()));

        if (!fraudCase.isActive()) {
            throw new ReversalException("Cannot reverse inactive fraud case");
        }
    }

    /**
     * Record reversal in audit trail for compliance.
     */
    private UUID recordReversalAuditTrail(ReversalRequest request, double amount, UUID newTokenBatch) {
        UUID reversalId = UUID.randomUUID();
        
        // In a real implementation, this would write to an immutable audit log
        Map<String, Object> auditRecord = Map.of(
            "reversalId", reversalId,
            "transactionId", request.getTransactionId(),
            "caseId", request.getCaseId(),
            "amount", amount,
            "newTokenBatch", newTokenBatch,
            "reason", request.getReason(),
            "reversalType", request.getReversalType().toString(),
            "timestamp", LocalDateTime.now().toString(),
            "executedBy", "AUTOMATED_SYSTEM"
        );

        System.out.println("Audit record created: " + auditRecord);
        return reversalId;
    }

    /**
     * Get reversal statistics for monitoring.
     */
    public Map<String, Object> getReversalStatistics() {
        return Map.of(
            "totalReversals", reversalTimeTracker.getTotalReversals(),
            "averageReversalTime", reversalTimeTracker.getAverageReversalTime(),
            "reversalsWithinOneHour", reversalTimeTracker.getReversalsWithinOneHour(),
            "automatedReversalRate", reversalTimeTracker.getAutomatedReversalRate()
        );
    }

    /**
     * Manual reversal execution (for arbitrator decisions).
     */
    public ReversalResponse executeManualReversal(ReversalRequest request, UUID arbitratorId) {
        // Start reversal time tracking
        reversalTimeTracker.startReversal(request.getCaseId());

        // Execute the reversal
        ReversalResponse response = executeReversal(request);

        // Update audit record with arbitrator information
        Map<String, Object> manualReversalAudit = Map.of(
            "reversalId", response.getReversalId(),
            "arbitratorId", arbitratorId,
            "reversalType", "MANUAL_ARBITRATION",
            "timestamp", LocalDateTime.now().toString()
        );

        System.out.println("Manual reversal audit: " + manualReversalAudit);

        // Complete reversal time tracking
        reversalTimeTracker.completeReversal(request.getCaseId());

        return response;
    }
}