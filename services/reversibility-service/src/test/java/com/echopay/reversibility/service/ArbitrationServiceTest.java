package com.echopay.reversibility.service;

import com.echopay.reversibility.dto.ArbitrationAssignmentRequest;
import com.echopay.reversibility.dto.ArbitrationCaseView;
import com.echopay.reversibility.dto.ArbitrationDecisionRequest;
import com.echopay.reversibility.model.FraudCase;
import com.echopay.reversibility.repository.FraudCaseRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/**
 * Unit tests for ArbitrationService.
 * Tests the complete arbitration workflow from case assignment to resolution.
 */
@ExtendWith(MockitoExtension.class)
class ArbitrationServiceTest {

    @Mock
    private FraudCaseRepository fraudCaseRepository;

    @Mock
    private TransactionService transactionService;

    @Mock
    private UserBehaviorService userBehaviorService;

    @Mock
    private FraudDetectionService fraudDetectionService;

    @Mock
    private NotificationService notificationService;

    @Mock
    private SystemLogService systemLogService;

    @Mock
    private AutomatedReversalService automatedReversalService;

    @InjectMocks
    private ArbitrationService arbitrationService;

    private FraudCase testFraudCase;
    private UUID caseId;
    private UUID transactionId;
    private UUID reporterId;
    private UUID arbitratorId;

    @BeforeEach
    void setUp() {
        caseId = UUID.randomUUID();
        transactionId = UUID.randomUUID();
        reporterId = UUID.randomUUID();
        arbitratorId = UUID.randomUUID();

        testFraudCase = new FraudCase(
            transactionId,
            reporterId,
            FraudCase.CaseType.UNAUTHORIZED_TRANSACTION,
            FraudCase.Priority.HIGH
        );
        testFraudCase.setCaseId(caseId);
        testFraudCase.transitionTo(FraudCase.Status.INVESTIGATING);
    }

    @Test
    void testAssignCaseToArbitrator_Success() {
        // Arrange
        ArbitrationAssignmentRequest request = new ArbitrationAssignmentRequest(
            caseId, arbitratorId, "High priority case requiring immediate attention"
        );

        when(fraudCaseRepository.findById(caseId)).thenReturn(Optional.of(testFraudCase));
        when(fraudCaseRepository.save(any(FraudCase.class))).thenReturn(testFraudCase);

        // Act
        FraudCase result = arbitrationService.assignCaseToArbitrator(request);

        // Assert
        assertNotNull(result);
        assertEquals(arbitratorId, result.getAssignedArbitratorId());
        assertNotNull(result.getAssignedAt());
        assertTrue(result.isAssigned());

        verify(fraudCaseRepository).findById(caseId);
        verify(fraudCaseRepository).save(testFraudCase);
        verify(systemLogService).logArbitrationAssignment(eq(caseId), eq(arbitratorId), any());
        verify(notificationService).sendArbitrationAssignment(eq(arbitratorId), eq(caseId), any());
        verify(notificationService).sendCaseStatusUpdate(eq(reporterId), eq(caseId), eq("assigned_to_arbitrator"));
    }

    @Test
    void testAssignCaseToArbitrator_CaseNotFound() {
        // Arrange
        ArbitrationAssignmentRequest request = new ArbitrationAssignmentRequest(
            caseId, arbitratorId, "Test assignment"
        );

        when(fraudCaseRepository.findById(caseId)).thenReturn(Optional.empty());

        // Act & Assert
        assertThrows(Exception.class, () -> {
            arbitrationService.assignCaseToArbitrator(request);
        });

        verify(fraudCaseRepository).findById(caseId);
        verify(fraudCaseRepository, never()).save(any());
    }

    @Test
    void testAssignCaseToArbitrator_CaseNotInvestigating() {
        // Arrange
        testFraudCase.transitionTo(FraudCase.Status.RESOLVED);
        ArbitrationAssignmentRequest request = new ArbitrationAssignmentRequest(
            caseId, arbitratorId, "Test assignment"
        );

        when(fraudCaseRepository.findById(caseId)).thenReturn(Optional.of(testFraudCase));

        // Act & Assert
        assertThrows(IllegalStateException.class, () -> {
            arbitrationService.assignCaseToArbitrator(request);
        });

        verify(fraudCaseRepository).findById(caseId);
        verify(fraudCaseRepository, never()).save(any());
    }

    @Test
    void testAssignCaseToArbitrator_AlreadyAssigned() {
        // Arrange
        testFraudCase.assignToArbitrator(UUID.randomUUID()); // Assign to different arbitrator first
        ArbitrationAssignmentRequest request = new ArbitrationAssignmentRequest(
            caseId, arbitratorId, "Test assignment"
        );

        when(fraudCaseRepository.findById(caseId)).thenReturn(Optional.of(testFraudCase));

        // Act & Assert
        assertThrows(IllegalStateException.class, () -> {
            arbitrationService.assignCaseToArbitrator(request);
        });

        verify(fraudCaseRepository).findById(caseId);
        verify(fraudCaseRepository, never()).save(any());
    }

    @Test
    void testGetCaseForArbitration_Success() {
        // Arrange
        testFraudCase.assignToArbitrator(arbitratorId);
        
        Map<String, Object> evidence = Map.of(
            "userReport", "Unauthorized transaction",
            "screenshots", List.of("screenshot1.png"),
            "additionalInfo", "Transaction occurred while I was sleeping"
        );
        testFraudCase.setEvidence(evidence);

        Map<String, Object> transactionDetails = createMockTransactionDetails();
        Map<String, Object> behaviorAnalysis = Map.of(
            "normalSpendingPattern", true,
            "unusualTimeTransaction", false,
            "deviceConsistency", true
        );

        when(fraudCaseRepository.findById(caseId)).thenReturn(Optional.of(testFraudCase));
        when(transactionService.getTransactionDetails(transactionId)).thenReturn(transactionDetails);
        when(userBehaviorService.analyzeDeviation(reporterId, transactionId)).thenReturn(behaviorAnalysis);
        when(fraudDetectionService.calculateFraudScore(transactionId)).thenReturn(0.75);

        // Act
        ArbitrationCaseView result = arbitrationService.getCaseForArbitration(caseId);

        // Assert
        assertNotNull(result);
        assertEquals(caseId, result.getCaseId());
        assertEquals(transactionId, result.getTransactionId());
        assertEquals(reporterId, result.getReporterId());
        assertEquals("unauthorized_transaction", result.getCaseType());
        assertEquals("high", result.getPriority());
        assertEquals(arbitratorId, result.getAssignedArbitratorId());
        assertEquals(evidence, result.getEvidence());
        assertEquals(behaviorAnalysis, result.getUserBehaviorAnalysis());
        assertEquals(0.75, result.getFraudRiskScore());
        assertNotNull(result.getTransactionContext());
        assertTrue(result.getTimeRemaining().contains("hours remaining") || result.getTimeRemaining().equals("OVERDUE"));

        verify(fraudCaseRepository).findById(caseId);
        verify(transactionService).getTransactionDetails(transactionId);
        verify(userBehaviorService).analyzeDeviation(reporterId, transactionId);
        verify(fraudDetectionService).calculateFraudScore(transactionId);
    }

    @Test
    void testProcessArbitrationDecision_FraudConfirmed() {
        // Arrange
        testFraudCase.assignToArbitrator(arbitratorId);
        ArbitrationDecisionRequest request = new ArbitrationDecisionRequest(
            caseId, 
            "fraud_confirmed", 
            "Clear evidence of unauthorized access and fraudulent transaction"
        );

        when(fraudCaseRepository.findById(caseId)).thenReturn(Optional.of(testFraudCase));
        when(fraudCaseRepository.save(any(FraudCase.class))).thenReturn(testFraudCase);

        // Act
        FraudCase result = arbitrationService.processArbitrationDecision(request);

        // Assert
        assertNotNull(result);
        assertEquals(FraudCase.Status.RESOLVED, result.getStatus());
        assertEquals(FraudCase.Resolution.FRAUD_CONFIRMED, result.getResolution());
        assertEquals(request.getReasoning(), result.getResolutionReasoning());
        assertNotNull(result.getResolvedAt());

        verify(fraudCaseRepository).findById(caseId);
        verify(fraudCaseRepository).save(testFraudCase);
        verify(automatedReversalService).executeManualReversal(any(), eq(arbitratorId));
        verify(systemLogService).logArbitrationDecision(eq(caseId), eq(arbitratorId), eq("fraud_confirmed"), any());
        verify(notificationService).sendArbitrationDecision(eq(reporterId), eq(caseId), eq("fraud_confirmed"), any());
    }

    @Test
    void testProcessArbitrationDecision_FraudDenied() {
        // Arrange
        testFraudCase.assignToArbitrator(arbitratorId);
        ArbitrationDecisionRequest request = new ArbitrationDecisionRequest(
            caseId, 
            "fraud_denied", 
            "Transaction appears legitimate based on user behavior patterns"
        );

        when(fraudCaseRepository.findById(caseId)).thenReturn(Optional.of(testFraudCase));
        when(fraudCaseRepository.save(any(FraudCase.class))).thenReturn(testFraudCase);

        // Act
        FraudCase result = arbitrationService.processArbitrationDecision(request);

        // Assert
        assertNotNull(result);
        assertEquals(FraudCase.Status.RESOLVED, result.getStatus());
        assertEquals(FraudCase.Resolution.FRAUD_DENIED, result.getResolution());
        assertEquals(request.getReasoning(), result.getResolutionReasoning());

        verify(fraudCaseRepository).findById(caseId);
        verify(fraudCaseRepository).save(testFraudCase);
        verify(transactionService).unfreezeTransactionTokens(transactionId, caseId);
        verify(automatedReversalService, never()).executeManualReversal(any(), any());
        verify(systemLogService).logArbitrationDecision(eq(caseId), eq(arbitratorId), eq("fraud_denied"), any());
        verify(notificationService).sendArbitrationDecision(eq(reporterId), eq(caseId), eq("fraud_denied"), any());
    }

    @Test
    void testProcessArbitrationDecision_InsufficientEvidence() {
        // Arrange
        testFraudCase.assignToArbitrator(arbitratorId);
        ArbitrationDecisionRequest request = new ArbitrationDecisionRequest(
            caseId, 
            "insufficient_evidence", 
            "Not enough evidence to determine if fraud occurred"
        );

        when(fraudCaseRepository.findById(caseId)).thenReturn(Optional.of(testFraudCase));
        when(fraudCaseRepository.save(any(FraudCase.class))).thenReturn(testFraudCase);

        // Act
        FraudCase result = arbitrationService.processArbitrationDecision(request);

        // Assert
        assertNotNull(result);
        assertEquals(FraudCase.Status.RESOLVED, result.getStatus());
        assertEquals(FraudCase.Resolution.INSUFFICIENT_EVIDENCE, result.getResolution());

        verify(transactionService).unfreezeTransactionTokens(transactionId, caseId);
        verify(automatedReversalService, never()).executeManualReversal(any(), any());
    }

    @Test
    void testProcessArbitrationDecision_CaseNotAssigned() {
        // Arrange - case not assigned to arbitrator
        ArbitrationDecisionRequest request = new ArbitrationDecisionRequest(
            caseId, "fraud_confirmed", "Test reasoning"
        );

        when(fraudCaseRepository.findById(caseId)).thenReturn(Optional.of(testFraudCase));

        // Act & Assert
        assertThrows(IllegalStateException.class, () -> {
            arbitrationService.processArbitrationDecision(request);
        });

        verify(fraudCaseRepository).findById(caseId);
        verify(fraudCaseRepository, never()).save(any());
    }

    @Test
    void testGetCasesForArbitrator() {
        // Arrange
        List<FraudCase> assignedCases = Arrays.asList(testFraudCase);
        testFraudCase.assignToArbitrator(arbitratorId);

        when(fraudCaseRepository.findByAssignedArbitratorId(arbitratorId)).thenReturn(assignedCases);

        // Act
        List<ArbitrationCaseView> result = arbitrationService.getCasesForArbitrator(arbitratorId);

        // Assert
        assertNotNull(result);
        assertEquals(1, result.size());
        
        ArbitrationCaseView caseView = result.get(0);
        assertEquals(caseId, caseView.getCaseId());
        assertEquals(transactionId, caseView.getTransactionId());
        assertEquals("unauthorized_transaction", caseView.getCaseType());
        assertEquals("high", caseView.getPriority());

        verify(fraudCaseRepository).findByAssignedArbitratorId(arbitratorId);
    }

    @Test
    void testGetUnassignedCases() {
        // Arrange
        List<FraudCase> unassignedCases = Arrays.asList(testFraudCase);

        when(fraudCaseRepository.findUnassignedInvestigatingCases()).thenReturn(unassignedCases);

        // Act
        List<ArbitrationCaseView> result = arbitrationService.getUnassignedCases();

        // Assert
        assertNotNull(result);
        assertEquals(1, result.size());
        
        ArbitrationCaseView caseView = result.get(0);
        assertEquals(caseId, caseView.getCaseId());
        assertEquals(transactionId, caseView.getTransactionId());

        verify(fraudCaseRepository).findUnassignedInvestigatingCases();
    }

    @Test
    void testCheckForOverdueCases() {
        // Arrange
        FraudCase overdueCase = new FraudCase(
            UUID.randomUUID(),
            UUID.randomUUID(),
            FraudCase.CaseType.PHISHING,
            FraudCase.Priority.MEDIUM
        );
        overdueCase.transitionTo(FraudCase.Status.INVESTIGATING);
        overdueCase.setCreatedAt(LocalDateTime.now().minusHours(75)); // Overdue

        List<FraudCase> overdueCases = Arrays.asList(overdueCase);

        when(fraudCaseRepository.findCasesNeedingEscalation(any(LocalDateTime.class)))
            .thenReturn(overdueCases);
        when(fraudCaseRepository.save(any(FraudCase.class))).thenReturn(overdueCase);

        // Act
        arbitrationService.checkForOverdueCases();

        // Assert
        verify(fraudCaseRepository).findCasesNeedingEscalation(any(LocalDateTime.class));
        verify(fraudCaseRepository).save(overdueCase);
        verify(systemLogService).logCaseEscalation(eq(overdueCase.getCaseId()), any(), any());
        verify(systemLogService).logEscalationBatch(1);
        verify(notificationService).sendEscalationAlert(eq(overdueCase.getCaseId()), any(), any());
        verify(notificationService).sendCaseStatusUpdate(eq(overdueCase.getReporterId()), eq(overdueCase.getCaseId()), eq("escalated"));
    }

    @Test
    void testGetArbitrationStatistics() {
        // Arrange
        List<FraudCase> activeCases = Arrays.asList(
            createTestCase(FraudCase.Priority.HIGH, true),
            createTestCase(FraudCase.Priority.MEDIUM, false),
            createTestCase(FraudCase.Priority.LOW, true)
        );

        List<Object[]> arbitratorWorkload = Arrays.asList(
            new Object[]{arbitratorId, 2L},
            new Object[]{UUID.randomUUID(), 1L}
        );

        when(fraudCaseRepository.findByStatusIn(any())).thenReturn(activeCases);
        when(fraudCaseRepository.countActiveCasesByArbitrator()).thenReturn(arbitratorWorkload);

        // Act
        Map<String, Object> result = arbitrationService.getArbitrationStatistics();

        // Assert
        assertNotNull(result);
        assertEquals(3, result.get("totalActiveCases"));
        assertEquals(2L, result.get("assignedCases"));
        assertEquals(1L, result.get("unassignedCases"));
        assertEquals(0L, result.get("overdueCases"));
        
        @SuppressWarnings("unchecked")
        Map<String, Long> casesByPriority = (Map<String, Long>) result.get("casesByPriority");
        assertEquals(1L, casesByPriority.get("high"));
        assertEquals(1L, casesByPriority.get("medium"));
        assertEquals(1L, casesByPriority.get("low"));

        verify(fraudCaseRepository).findByStatusIn(any());
        verify(fraudCaseRepository).countActiveCasesByArbitrator();
    }

    private FraudCase createTestCase(FraudCase.Priority priority, boolean assigned) {
        FraudCase fraudCase = new FraudCase(
            UUID.randomUUID(),
            UUID.randomUUID(),
            FraudCase.CaseType.UNAUTHORIZED_TRANSACTION,
            priority
        );
        fraudCase.transitionTo(FraudCase.Status.INVESTIGATING);
        
        if (assigned) {
            fraudCase.assignToArbitrator(UUID.randomUUID());
        }
        
        return fraudCase;
    }

    private Map<String, Object> createMockTransactionDetails() {
        Map<String, Object> details = new HashMap<>();
        details.put("transactionId", transactionId);
        details.put("amount", 1500.0);
        details.put("currency", "USD-CBDC");
        details.put("fromWallet", "wallet-12345678");
        details.put("toWallet", "wallet-87654321");
        details.put("timestamp", "2025-01-08T10:00:00");
        details.put("status", "completed");
        
        Map<String, Object> deviceInfo = new HashMap<>();
        deviceInfo.put("deviceId", "device-123");
        deviceInfo.put("userAgent", "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)");
        deviceInfo.put("ipAddress", "192.168.1.100");
        deviceInfo.put("isNewDevice", false);
        details.put("deviceInfo", deviceInfo);
        
        Map<String, Object> locationInfo = new HashMap<>();
        locationInfo.put("country", "US");
        locationInfo.put("city", "New York");
        locationInfo.put("isUnusualLocation", false);
        details.put("locationInfo", locationInfo);
        
        details.put("relatedTransactions", new ArrayList<>());
        
        return details;
    }
}