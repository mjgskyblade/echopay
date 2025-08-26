package com.echopay.reversibility.service;

import com.echopay.reversibility.dto.ArbitrationAssignmentRequest;
import com.echopay.reversibility.dto.ArbitrationCaseView;
import com.echopay.reversibility.dto.ArbitrationDecisionRequest;
import com.echopay.reversibility.dto.ReversalRequest;
import com.echopay.reversibility.exception.FraudCaseNotFoundException;
import com.echopay.reversibility.exception.InvalidFraudReportException;
import com.echopay.reversibility.model.FraudCase;
import com.echopay.reversibility.repository.FraudCaseRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Service for managing human arbitration workflow for complex fraud disputes.
 * Implements requirements 3.3, 3.4, and 4.3 for arbitration system.
 */
@Service
@Transactional
public class ArbitrationService {

    private final FraudCaseRepository fraudCaseRepository;
    private final TransactionService transactionService;
    private final UserBehaviorService userBehaviorService;
    private final FraudDetectionService fraudDetectionService;
    private final NotificationService notificationService;
    private final SystemLogService systemLogService;
    private final AutomatedReversalService automatedReversalService;

    @Autowired
    public ArbitrationService(
            FraudCaseRepository fraudCaseRepository,
            TransactionService transactionService,
            UserBehaviorService userBehaviorService,
            FraudDetectionService fraudDetectionService,
            NotificationService notificationService,
            SystemLogService systemLogService,
            AutomatedReversalService automatedReversalService) {
        this.fraudCaseRepository = fraudCaseRepository;
        this.transactionService = transactionService;
        this.userBehaviorService = userBehaviorService;
        this.fraudDetectionService = fraudDetectionService;
        this.notificationService = notificationService;
        this.systemLogService = systemLogService;
        this.automatedReversalService = automatedReversalService;
    }

    /**
     * Assign a fraud case to an arbitrator for human review.
     * Implements requirement 3.3: Human arbitration workflow with case assignment.
     */
    public FraudCase assignCaseToArbitrator(ArbitrationAssignmentRequest request) {
        FraudCase fraudCase = fraudCaseRepository.findById(request.getCaseId())
            .orElseThrow(() -> new FraudCaseNotFoundException("Fraud case not found: " + request.getCaseId()));

        if (fraudCase.getStatus() != FraudCase.Status.INVESTIGATING) {
            throw new IllegalStateException("Can only assign cases that are under investigation");
        }

        if (fraudCase.isAssigned()) {
            throw new IllegalStateException("Case is already assigned to an arbitrator");
        }

        // Assign the case
        fraudCase.assignToArbitrator(request.getArbitratorId());
        FraudCase savedCase = fraudCaseRepository.save(fraudCase);

        // Log the assignment
        systemLogService.logArbitrationAssignment(
            request.getCaseId(),
            request.getArbitratorId(),
            request.getNotes()
        );

        // Notify arbitrator
        notificationService.sendArbitrationAssignment(
            request.getArbitratorId(),
            request.getCaseId(),
            fraudCase.getPriority().getValue()
        );

        // Notify reporter about assignment
        notificationService.sendCaseStatusUpdate(
            fraudCase.getReporterId(),
            request.getCaseId(),
            "assigned_to_arbitrator"
        );

        return savedCase;
    }

    /**
     * Get detailed case view for arbitrators with transaction context.
     * Implements requirement 3.3: Evidence presentation system for arbitrators.
     */
    public ArbitrationCaseView getCaseForArbitration(UUID caseId) {
        FraudCase fraudCase = fraudCaseRepository.findById(caseId)
            .orElseThrow(() -> new FraudCaseNotFoundException("Fraud case not found: " + caseId));

        ArbitrationCaseView caseView = new ArbitrationCaseView();
        caseView.setCaseId(fraudCase.getCaseId());
        caseView.setTransactionId(fraudCase.getTransactionId());
        caseView.setReporterId(fraudCase.getReporterId());
        caseView.setCaseType(fraudCase.getCaseType().getValue());
        caseView.setPriority(fraudCase.getPriority().getValue());
        caseView.setStatus(fraudCase.getStatus().getValue());
        caseView.setCreatedAt(fraudCase.getCreatedAt());
        caseView.setAssignedArbitratorId(fraudCase.getAssignedArbitratorId());
        caseView.setAssignedAt(fraudCase.getAssignedAt());
        caseView.setEvidence(fraudCase.getEvidence());

        // Calculate time remaining
        long hoursRemaining = fraudCase.getTimeRemainingHours();
        if (hoursRemaining > 0) {
            caseView.setTimeRemaining(hoursRemaining + " hours remaining");
        } else {
            caseView.setTimeRemaining("OVERDUE");
        }

        // Get transaction context
        ArbitrationCaseView.TransactionContext transactionContext = buildTransactionContext(fraudCase.getTransactionId());
        caseView.setTransactionContext(transactionContext);

        // Get user behavior analysis
        Map<String, Object> behaviorAnalysis = userBehaviorService.analyzeDeviation(fraudCase.getReporterId(), fraudCase.getTransactionId());
        caseView.setUserBehaviorAnalysis(behaviorAnalysis);

        // Get fraud risk score
        Double fraudScore = fraudDetectionService.calculateFraudScore(fraudCase.getTransactionId());
        caseView.setFraudRiskScore(fraudScore);

        return caseView;
    }

    /**
     * Process arbitrator decision on a fraud case.
     * Implements requirement 3.4: 72-hour resolution tracking.
     */
    public FraudCase processArbitrationDecision(ArbitrationDecisionRequest request) {
        FraudCase fraudCase = fraudCaseRepository.findById(request.getCaseId())
            .orElseThrow(() -> new FraudCaseNotFoundException("Fraud case not found: " + request.getCaseId()));

        if (fraudCase.getStatus() != FraudCase.Status.INVESTIGATING) {
            throw new IllegalStateException("Can only make decisions on investigating cases");
        }

        if (!fraudCase.isAssigned()) {
            throw new IllegalStateException("Case must be assigned to an arbitrator");
        }

        // Validate decision
        FraudCase.Resolution resolution;
        try {
            resolution = FraudCase.Resolution.fromString(request.getDecision());
        } catch (IllegalArgumentException e) {
            throw new InvalidFraudReportException("Invalid decision: " + request.getDecision());
        }

        // Add arbitrator's additional evidence if provided
        if (request.getAdditionalEvidence() != null && !request.getAdditionalEvidence().isEmpty()) {
            Map<String, Object> currentEvidence = fraudCase.getEvidence();
            if (currentEvidence == null) {
                currentEvidence = new HashMap<>();
            } else {
                currentEvidence = new HashMap<>(currentEvidence);
            }
            
            currentEvidence.put("arbitratorEvidence", request.getAdditionalEvidence());
            currentEvidence.put("arbitratorDecisionTimestamp", LocalDateTime.now().toString());
            fraudCase.setEvidence(currentEvidence);
        }

        // Set resolution reasoning
        fraudCase.setResolutionReasoning(request.getReasoning());

        // Resolve the case
        fraudCase.resolve(resolution);
        FraudCase resolvedCase = fraudCaseRepository.save(fraudCase);

        // Execute reversal if fraud confirmed
        if (resolution == FraudCase.Resolution.FRAUD_CONFIRMED) {
            ReversalRequest reversalRequest = new ReversalRequest(
                fraudCase.getTransactionId(),
                fraudCase.getCaseId(),
                request.getReasoning(),
                ReversalRequest.ReversalType.MANUAL_ARBITRATION
            );
            automatedReversalService.executeManualReversal(reversalRequest, fraudCase.getAssignedArbitratorId());
        } else {
            // Unfreeze tokens if fraud denied or insufficient evidence
            transactionService.unfreezeTransactionTokens(fraudCase.getTransactionId(), fraudCase.getCaseId());
        }

        // Log the decision
        systemLogService.logArbitrationDecision(
            request.getCaseId(),
            fraudCase.getAssignedArbitratorId(),
            request.getDecision(),
            request.getReasoning()
        );

        // Notify reporter of decision
        notificationService.sendArbitrationDecision(
            fraudCase.getReporterId(),
            request.getCaseId(),
            request.getDecision(),
            request.getReasoning()
        );

        return resolvedCase;
    }

    /**
     * Get all cases assigned to a specific arbitrator.
     */
    public List<ArbitrationCaseView> getCasesForArbitrator(UUID arbitratorId) {
        List<FraudCase> cases = fraudCaseRepository.findByAssignedArbitratorId(arbitratorId);
        
        return cases.stream()
            .filter(fraudCase -> fraudCase.getStatus() == FraudCase.Status.INVESTIGATING)
            .map(fraudCase -> {
                ArbitrationCaseView view = new ArbitrationCaseView();
                view.setCaseId(fraudCase.getCaseId());
                view.setTransactionId(fraudCase.getTransactionId());
                view.setCaseType(fraudCase.getCaseType().getValue());
                view.setPriority(fraudCase.getPriority().getValue());
                view.setCreatedAt(fraudCase.getCreatedAt());
                view.setAssignedAt(fraudCase.getAssignedAt());
                
                long hoursRemaining = fraudCase.getTimeRemainingHours();
                if (hoursRemaining > 0) {
                    view.setTimeRemaining(hoursRemaining + " hours remaining");
                } else {
                    view.setTimeRemaining("OVERDUE");
                }
                
                return view;
            })
            .collect(Collectors.toList());
    }

    /**
     * Get unassigned cases that need arbitration.
     */
    public List<ArbitrationCaseView> getUnassignedCases() {
        List<FraudCase> cases = fraudCaseRepository.findUnassignedInvestigatingCases();
        
        return cases.stream()
            .map(fraudCase -> {
                ArbitrationCaseView view = new ArbitrationCaseView();
                view.setCaseId(fraudCase.getCaseId());
                view.setTransactionId(fraudCase.getTransactionId());
                view.setCaseType(fraudCase.getCaseType().getValue());
                view.setPriority(fraudCase.getPriority().getValue());
                view.setCreatedAt(fraudCase.getCreatedAt());
                
                long hoursRemaining = fraudCase.getTimeRemainingHours();
                if (hoursRemaining > 0) {
                    view.setTimeRemaining(hoursRemaining + " hours remaining");
                } else {
                    view.setTimeRemaining("OVERDUE");
                }
                
                return view;
            })
            .collect(Collectors.toList());
    }

    /**
     * Scheduled task to check for overdue cases and escalate them.
     * Implements requirement 3.4: Automated escalation for overdue cases.
     */
    @Scheduled(fixedRate = 3600000) // Run every hour
    public void checkForOverdueCases() {
        LocalDateTime seventyTwoHoursAgo = LocalDateTime.now().minusHours(72);
        List<FraudCase> overdueCases = fraudCaseRepository.findCasesNeedingEscalation(seventyTwoHoursAgo);

        for (FraudCase fraudCase : overdueCases) {
            escalateCase(fraudCase);
        }

        if (!overdueCases.isEmpty()) {
            systemLogService.logEscalationBatch(overdueCases.size());
        }
    }

    /**
     * Escalate an overdue case.
     */
    private void escalateCase(FraudCase fraudCase) {
        fraudCase.escalate();
        fraudCaseRepository.save(fraudCase);

        // Log escalation
        systemLogService.logCaseEscalation(
            fraudCase.getCaseId(),
            fraudCase.getAssignedArbitratorId(),
            "Case exceeded 72-hour resolution deadline"
        );

        // Notify management about escalation
        notificationService.sendEscalationAlert(
            fraudCase.getCaseId(),
            fraudCase.getAssignedArbitratorId(),
            fraudCase.getPriority().getValue()
        );

        // Notify reporter about escalation
        notificationService.sendCaseStatusUpdate(
            fraudCase.getReporterId(),
            fraudCase.getCaseId(),
            "escalated"
        );
    }

    /**
     * Get arbitration workload statistics.
     */
    public Map<String, Object> getArbitrationStatistics() {
        Map<String, Object> stats = new HashMap<>();
        
        // Count cases by status
        List<FraudCase> activeCases = fraudCaseRepository.findByStatusIn(List.of(
            FraudCase.Status.INVESTIGATING
        ));
        
        long assignedCases = activeCases.stream().filter(FraudCase::isAssigned).count();
        long unassignedCases = activeCases.stream().filter(fc -> !fc.isAssigned()).count();
        long overdueCases = activeCases.stream().filter(FraudCase::isOverdue).count();
        
        stats.put("totalActiveCases", activeCases.size());
        stats.put("assignedCases", assignedCases);
        stats.put("unassignedCases", unassignedCases);
        stats.put("overdueCases", overdueCases);
        
        // Cases by priority
        Map<String, Long> casesByPriority = activeCases.stream()
            .collect(Collectors.groupingBy(
                fc -> fc.getPriority().getValue(),
                Collectors.counting()
            ));
        stats.put("casesByPriority", casesByPriority);
        
        // Arbitrator workload
        List<Object[]> arbitratorWorkload = fraudCaseRepository.countActiveCasesByArbitrator();
        Map<String, Long> workloadMap = arbitratorWorkload.stream()
            .collect(Collectors.toMap(
                row -> row[0].toString(),
                row -> (Long) row[1]
            ));
        stats.put("arbitratorWorkload", workloadMap);
        
        return stats;
    }

    /**
     * Build transaction context for arbitration view.
     */
    private ArbitrationCaseView.TransactionContext buildTransactionContext(UUID transactionId) {
        ArbitrationCaseView.TransactionContext context = new ArbitrationCaseView.TransactionContext();
        
        // Get transaction details from transaction service
        Map<String, Object> transactionDetails = transactionService.getTransactionDetails(transactionId);
        
        if (transactionDetails != null) {
            context.setAmount((Double) transactionDetails.get("amount"));
            context.setCurrency((String) transactionDetails.get("currency"));
            context.setFromWallet((String) transactionDetails.get("fromWallet"));
            context.setToWallet((String) transactionDetails.get("toWallet"));
            
            // Parse timestamp
            String timestampStr = (String) transactionDetails.get("timestamp");
            if (timestampStr != null) {
                context.setTimestamp(LocalDateTime.parse(timestampStr, DateTimeFormatter.ISO_LOCAL_DATE_TIME));
            }
            
            // Get device and location info
            context.setDeviceInfo((Map<String, Object>) transactionDetails.get("deviceInfo"));
            context.setLocationInfo((Map<String, Object>) transactionDetails.get("locationInfo"));
            
            // Get related transactions
            context.setRelatedTransactions((List<Map<String, Object>>) transactionDetails.get("relatedTransactions"));
        }
        
        return context;
    }
}