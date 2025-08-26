package com.echopay.reversibility.service;

import com.echopay.reversibility.model.FraudCase;
import com.echopay.reversibility.repository.FraudCaseRepository;
import com.echopay.reversibility.dto.FraudReportRequest;
import com.echopay.reversibility.dto.FraudReportResponse;
import com.echopay.reversibility.exception.FraudCaseNotFoundException;
import com.echopay.reversibility.exception.InvalidFraudReportException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.Optional;

/**
 * Service for handling fraud report submissions and case management.
 * Implements the core business logic for fraud case lifecycle management.
 */
@Service
@Transactional
public class FraudReportService {

    private final FraudCaseRepository fraudCaseRepository;
    private final EvidenceCollectionService evidenceCollectionService;
    private final NotificationService notificationService;
    private final TransactionService transactionService;

    @Autowired
    public FraudReportService(
            FraudCaseRepository fraudCaseRepository,
            EvidenceCollectionService evidenceCollectionService,
            NotificationService notificationService,
            TransactionService transactionService) {
        this.fraudCaseRepository = fraudCaseRepository;
        this.evidenceCollectionService = evidenceCollectionService;
        this.notificationService = notificationService;
        this.transactionService = transactionService;
    }

    /**
     * Submit a new fraud report and create a fraud case.
     * Implements requirement 3.1: Immediate token freezing and investigation initiation.
     */
    public FraudReportResponse submitFraudReport(FraudReportRequest request) {
        // Validate the fraud report
        validateFraudReport(request);

        // Verify transaction exists and is valid for fraud reporting
        if (!transactionService.isValidForFraudReport(request.getTransactionId())) {
            throw new InvalidFraudReportException("Transaction is not valid for fraud reporting");
        }

        // Check if there's already an active case for this transaction
        Optional<FraudCase> existingCase = fraudCaseRepository.findActiveByTransactionId(request.getTransactionId());
        if (existingCase.isPresent()) {
            throw new InvalidFraudReportException("Active fraud case already exists for this transaction");
        }

        // Determine case priority based on transaction amount and fraud type
        FraudCase.Priority priority = determinePriority(request);

        // Create new fraud case
        FraudCase fraudCase = new FraudCase(
            request.getTransactionId(),
            request.getReporterId(),
            FraudCase.CaseType.fromString(request.getFraudType()),
            priority
        );

        // Set initial evidence from user report
        Map<String, Object> evidence = Map.of(
            "userReport", request.getDescription(),
            "screenshots", request.getEvidence() != null ? request.getEvidence().getScreenshots() : List.of(),
            "additionalInfo", request.getEvidence() != null ? request.getEvidence().getAdditionalInfo() : "",
            "reportTimestamp", LocalDateTime.now().toString()
        );
        fraudCase.setEvidence(evidence);

        // Save the fraud case
        FraudCase savedCase = fraudCaseRepository.save(fraudCase);

        // Immediately freeze disputed tokens (requirement 3.1)
        transactionService.freezeTransactionTokens(request.getTransactionId(), savedCase.getCaseId());

        // Start automated evidence collection
        evidenceCollectionService.startEvidenceCollection(savedCase.getCaseId());

        // Transition case to investigating status
        savedCase.transitionTo(FraudCase.Status.INVESTIGATING);
        fraudCaseRepository.save(savedCase);

        // Send notification to user
        notificationService.sendFraudReportConfirmation(request.getReporterId(), savedCase.getCaseId());

        // Estimate resolution time based on priority
        String estimatedResolution = getEstimatedResolutionTime(priority);

        return new FraudReportResponse(
            savedCase.getCaseId(),
            savedCase.getStatus().getValue(),
            estimatedResolution,
            "Fraud report submitted successfully. Disputed tokens have been frozen."
        );
    }

    /**
     * Retrieve fraud case details by case ID.
     */
    public FraudCase getFraudCase(UUID caseId) {
        return fraudCaseRepository.findById(caseId)
            .orElseThrow(() -> new FraudCaseNotFoundException("Fraud case not found: " + caseId));
    }

    /**
     * Get all fraud cases for a specific user.
     */
    public List<FraudCase> getFraudCasesByReporter(UUID reporterId) {
        return fraudCaseRepository.findByReporterId(reporterId);
    }

    /**
     * Get all active fraud cases (for admin/arbitrator view).
     */
    public List<FraudCase> getActiveFraudCases() {
        return fraudCaseRepository.findByStatusIn(List.of(
            FraudCase.Status.OPEN,
            FraudCase.Status.INVESTIGATING
        ));
    }

    /**
     * Update fraud case status with validation.
     */
    public FraudCase updateCaseStatus(UUID caseId, FraudCase.Status newStatus) {
        FraudCase fraudCase = getFraudCase(caseId);
        
        if (!fraudCase.canTransitionTo(newStatus)) {
            throw new IllegalStateException(
                String.format("Cannot transition case %s from %s to %s", 
                    caseId, fraudCase.getStatus(), newStatus)
            );
        }

        fraudCase.transitionTo(newStatus);
        FraudCase updatedCase = fraudCaseRepository.save(fraudCase);

        // Send status update notification
        notificationService.sendCaseStatusUpdate(
            fraudCase.getReporterId(), 
            caseId, 
            newStatus.getValue()
        );

        return updatedCase;
    }

    /**
     * Add evidence to an existing fraud case.
     */
    public FraudCase addEvidence(UUID caseId, Map<String, Object> newEvidence) {
        FraudCase fraudCase = getFraudCase(caseId);
        
        if (!fraudCase.isActive()) {
            throw new IllegalStateException("Cannot add evidence to inactive case");
        }

        // Merge new evidence with existing evidence
        Map<String, Object> currentEvidence = fraudCase.getEvidence();
        if (currentEvidence == null) {
            fraudCase.setEvidence(new HashMap<>(newEvidence));
        } else {
            // Create a new mutable map if the current one is immutable
            Map<String, Object> mutableEvidence = new HashMap<>(currentEvidence);
            mutableEvidence.putAll(newEvidence);
            fraudCase.setEvidence(mutableEvidence);
        }

        return fraudCaseRepository.save(fraudCase);
    }

    private void validateFraudReport(FraudReportRequest request) {
        if (request.getTransactionId() == null) {
            throw new InvalidFraudReportException("Transaction ID is required");
        }
        if (request.getReporterId() == null) {
            throw new InvalidFraudReportException("Reporter ID is required");
        }
        if (request.getFraudType() == null || request.getFraudType().trim().isEmpty()) {
            throw new InvalidFraudReportException("Fraud type is required");
        }
        if (request.getDescription() == null || request.getDescription().trim().isEmpty()) {
            throw new InvalidFraudReportException("Description is required");
        }
        if (request.getDescription().length() > 2000) {
            throw new InvalidFraudReportException("Description cannot exceed 2000 characters");
        }

        // Validate fraud type
        try {
            FraudCase.CaseType.fromString(request.getFraudType());
        } catch (IllegalArgumentException e) {
            throw new InvalidFraudReportException("Invalid fraud type: " + request.getFraudType());
        }
    }

    private FraudCase.Priority determinePriority(FraudReportRequest request) {
        // Get transaction amount to help determine priority
        double transactionAmount = transactionService.getTransactionAmount(request.getTransactionId());
        
        // High-value transactions get higher priority
        if (transactionAmount > 10000) {
            return FraudCase.Priority.CRITICAL;
        } else if (transactionAmount > 1000) {
            return FraudCase.Priority.HIGH;
        }

        // Account takeover and technical fraud are high priority
        if ("account_takeover".equals(request.getFraudType()) || 
            "technical_fraud".equals(request.getFraudType())) {
            return FraudCase.Priority.HIGH;
        }

        return FraudCase.Priority.MEDIUM;
    }

    private String getEstimatedResolutionTime(FraudCase.Priority priority) {
        switch (priority) {
            case CRITICAL:
                return "24 hours";
            case HIGH:
                return "48 hours";
            case MEDIUM:
                return "72 hours";
            case LOW:
                return "5 business days";
            default:
                return "72 hours";
        }
    }
}