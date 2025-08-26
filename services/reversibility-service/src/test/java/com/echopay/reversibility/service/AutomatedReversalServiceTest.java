package com.echopay.reversibility.service;

import com.echopay.reversibility.dto.ReversalRequest;
import com.echopay.reversibility.dto.ReversalResponse;
import com.echopay.reversibility.exception.ReversalException;
import com.echopay.reversibility.model.FraudCase;
import com.echopay.reversibility.repository.FraudCaseRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * Unit tests for AutomatedReversalService.
 * Tests automated reversal logic and token reissuance.
 */
@ExtendWith(MockitoExtension.class)
class AutomatedReversalServiceTest {

    @Mock
    private FraudCaseRepository fraudCaseRepository;

    @Mock
    private FraudDetectionService fraudDetectionService;

    @Mock
    private TokenReissuanceService tokenReissuanceService;

    @Mock
    private TransactionService transactionService;

    @Mock
    private NotificationService notificationService;

    @Mock
    private ReversalTimeTracker reversalTimeTracker;

    @InjectMocks
    private AutomatedReversalService automatedReversalService;

    private UUID transactionId;
    private UUID caseId;
    private UUID reporterId;
    private FraudCase fraudCase;
    private ReversalRequest reversalRequest;

    @BeforeEach
    void setUp() {
        transactionId = UUID.randomUUID();
        caseId = UUID.randomUUID();
        reporterId = UUID.randomUUID();

        fraudCase = new FraudCase(transactionId, reporterId, 
            FraudCase.CaseType.UNAUTHORIZED_TRANSACTION, FraudCase.Priority.HIGH);
        fraudCase.transitionTo(FraudCase.Status.INVESTIGATING);

        reversalRequest = new ReversalRequest(
            transactionId,
            caseId,
            "Automated reversal - high fraud confidence",
            ReversalRequest.ReversalType.AUTOMATED_FRAUD
        );
    }

    @Test
    void executeReversal_ValidRequest_ShouldCompleteSuccessfully() {
        // Arrange
        Map<String, Object> transactionDetails = new HashMap<>();
        transactionDetails.put("amount", 1500.0);
        transactionDetails.put("fromWallet", UUID.randomUUID());
        transactionDetails.put("toWallet", UUID.randomUUID());

        when(transactionService.isEligibleForReversal(transactionId)).thenReturn(true);
        when(fraudCaseRepository.findById(caseId)).thenReturn(Optional.of(fraudCase));
        when(transactionService.getTransactionDetails(transactionId)).thenReturn(transactionDetails);
        
        UUID newTokenBatch = UUID.randomUUID();
        when(tokenReissuanceService.reissueCleanTokens(any(), eq(1500.0), eq(caseId)))
            .thenReturn(newTokenBatch);

        // Act
        ReversalResponse response = automatedReversalService.executeReversal(reversalRequest);

        // Assert
        assertNotNull(response);
        assertEquals(transactionId, response.getTransactionId());
        assertEquals(caseId, response.getCaseId());
        assertEquals(1500.0, response.getReversedAmount());
        assertEquals(newTokenBatch, response.getNewTokenBatch());
        assertNotNull(response.getReversalId());
        assertNotNull(response.getReversalTimestamp());

        // Verify interactions
        verify(tokenReissuanceService).invalidateFraudulentTokens(transactionId);
        verify(tokenReissuanceService).reissueCleanTokens(any(), eq(1500.0), eq(caseId));
        verify(transactionService).markTransactionReversed(transactionId, caseId);
    }

    @Test
    void executeReversal_NullTransactionId_ShouldThrowException() {
        // Arrange
        reversalRequest.setTransactionId(null);

        // Act & Assert
        ReversalException exception = assertThrows(
            ReversalException.class,
            () -> automatedReversalService.executeReversal(reversalRequest)
        );

        assertEquals("Transaction ID is required for reversal", exception.getMessage());
    }

    @Test
    void executeReversal_NullCaseId_ShouldThrowException() {
        // Arrange
        reversalRequest.setCaseId(null);

        // Act & Assert
        ReversalException exception = assertThrows(
            ReversalException.class,
            () -> automatedReversalService.executeReversal(reversalRequest)
        );

        assertEquals("Case ID is required for reversal", exception.getMessage());
    }

    @Test
    void executeReversal_TransactionNotEligible_ShouldThrowException() {
        // Arrange
        when(transactionService.isEligibleForReversal(transactionId)).thenReturn(false);

        // Act & Assert
        ReversalException exception = assertThrows(
            ReversalException.class,
            () -> automatedReversalService.executeReversal(reversalRequest)
        );

        assertEquals("Transaction is not eligible for reversal", exception.getMessage());
    }

    @Test
    void executeReversal_CaseNotFound_ShouldThrowException() {
        // Arrange
        when(transactionService.isEligibleForReversal(transactionId)).thenReturn(true);
        when(fraudCaseRepository.findById(caseId)).thenReturn(Optional.empty());

        // Act & Assert
        ReversalException exception = assertThrows(
            ReversalException.class,
            () -> automatedReversalService.executeReversal(reversalRequest)
        );

        assertTrue(exception.getMessage().contains("Fraud case not found"));
    }

    @Test
    void executeReversal_InactiveCase_ShouldThrowException() {
        // Arrange
        fraudCase.transitionTo(FraudCase.Status.RESOLVED); // Make case inactive
        
        when(transactionService.isEligibleForReversal(transactionId)).thenReturn(true);
        when(fraudCaseRepository.findById(caseId)).thenReturn(Optional.of(fraudCase));

        // Act & Assert
        ReversalException exception = assertThrows(
            ReversalException.class,
            () -> automatedReversalService.executeReversal(reversalRequest)
        );

        assertEquals("Cannot reverse inactive fraud case", exception.getMessage());
    }

    @Test
    void processAutomatedReversals_HighConfidenceCase_ShouldExecuteReversal() {
        // Arrange
        List<FraudCase> candidateCases = List.of(fraudCase);
        when(fraudCaseRepository.findCasesForAutomatedResolution(any())).thenReturn(candidateCases);
        when(fraudDetectionService.getFraudConfidence(fraudCase.getCaseId())).thenReturn(0.85);

        Map<String, Object> transactionDetails = new HashMap<>();
        transactionDetails.put("amount", 1000.0);
        transactionDetails.put("fromWallet", UUID.randomUUID());
        transactionDetails.put("toWallet", UUID.randomUUID());

        when(transactionService.isEligibleForReversal(transactionId)).thenReturn(true);
        when(fraudCaseRepository.findById(fraudCase.getCaseId())).thenReturn(Optional.of(fraudCase));
        when(transactionService.getTransactionDetails(transactionId)).thenReturn(transactionDetails);
        when(tokenReissuanceService.reissueCleanTokens(any(), eq(1000.0), eq(fraudCase.getCaseId())))
            .thenReturn(UUID.randomUUID());
        when(fraudCaseRepository.save(any(FraudCase.class))).thenReturn(fraudCase);

        // Act
        automatedReversalService.processAutomatedReversals();

        // Assert
        verify(fraudDetectionService).getFraudConfidence(fraudCase.getCaseId());
        verify(reversalTimeTracker).startReversal(fraudCase.getCaseId());
        verify(reversalTimeTracker).completeReversal(fraudCase.getCaseId());
        verify(notificationService).sendReversalCompletion(eq(reporterId), eq(fraudCase.getCaseId()), eq(1000.0));
        verify(fraudCaseRepository).save(argThat(savedCase -> 
            savedCase.getResolution() == FraudCase.Resolution.FRAUD_CONFIRMED
        ));
    }

    @Test
    void processAutomatedReversals_LowConfidenceCase_ShouldEscalateToArbitration() {
        // Arrange
        List<FraudCase> candidateCases = List.of(fraudCase);
        when(fraudCaseRepository.findCasesForAutomatedResolution(any())).thenReturn(candidateCases);
        when(fraudDetectionService.getFraudConfidence(fraudCase.getCaseId())).thenReturn(0.65); // Below threshold

        // Act
        automatedReversalService.processAutomatedReversals();

        // Assert
        verify(fraudDetectionService).getFraudConfidence(fraudCase.getCaseId());
        // Should not execute reversal for low confidence
        verify(reversalTimeTracker, never()).startReversal(any());
        verify(tokenReissuanceService, never()).invalidateFraudulentTokens(any());
    }

    @Test
    void executeManualReversal_ValidRequest_ShouldCompleteWithArbitratorInfo() {
        // Arrange
        UUID arbitratorId = UUID.randomUUID();
        
        Map<String, Object> transactionDetails = new HashMap<>();
        transactionDetails.put("amount", 2000.0);
        transactionDetails.put("fromWallet", UUID.randomUUID());
        transactionDetails.put("toWallet", UUID.randomUUID());

        when(transactionService.isEligibleForReversal(transactionId)).thenReturn(true);
        when(fraudCaseRepository.findById(caseId)).thenReturn(Optional.of(fraudCase));
        when(transactionService.getTransactionDetails(transactionId)).thenReturn(transactionDetails);
        
        UUID newTokenBatch = UUID.randomUUID();
        when(tokenReissuanceService.reissueCleanTokens(any(), eq(2000.0), eq(caseId)))
            .thenReturn(newTokenBatch);

        // Act
        ReversalResponse response = automatedReversalService.executeManualReversal(reversalRequest, arbitratorId);

        // Assert
        assertNotNull(response);
        assertEquals(2000.0, response.getReversedAmount());
        
        // Verify reversal time tracking
        verify(reversalTimeTracker).startReversal(caseId);
        verify(reversalTimeTracker).completeReversal(caseId);
    }

    @Test
    void getReversalStatistics_ShouldReturnStatistics() {
        // Arrange
        when(reversalTimeTracker.getTotalReversals()).thenReturn(50);
        when(reversalTimeTracker.getAverageReversalTime()).thenReturn(35.5);
        when(reversalTimeTracker.getReversalsWithinOneHour()).thenReturn(48L);
        when(reversalTimeTracker.getAutomatedReversalRate()).thenReturn(75.0);

        // Act
        Map<String, Object> stats = automatedReversalService.getReversalStatistics();

        // Assert
        assertEquals(50, stats.get("totalReversals"));
        assertEquals(35.5, stats.get("averageReversalTime"));
        assertEquals(48L, stats.get("reversalsWithinOneHour"));
        assertEquals(75.0, stats.get("automatedReversalRate"));
    }

    @Test
    void executeReversal_TokenReissuanceFailure_ShouldThrowException() {
        // Arrange
        Map<String, Object> transactionDetails = new HashMap<>();
        transactionDetails.put("amount", 1500.0);
        transactionDetails.put("fromWallet", UUID.randomUUID());
        transactionDetails.put("toWallet", UUID.randomUUID());

        when(transactionService.isEligibleForReversal(transactionId)).thenReturn(true);
        when(fraudCaseRepository.findById(caseId)).thenReturn(Optional.of(fraudCase));
        when(transactionService.getTransactionDetails(transactionId)).thenReturn(transactionDetails);
        
        // Simulate token reissuance failure
        when(tokenReissuanceService.reissueCleanTokens(any(), eq(1500.0), eq(caseId)))
            .thenThrow(new RuntimeException("Token service unavailable"));

        // Act & Assert
        assertThrows(RuntimeException.class, () -> {
            automatedReversalService.executeReversal(reversalRequest);
        });

        // Verify that invalidation was attempted but reissuance failed
        verify(tokenReissuanceService).invalidateFraudulentTokens(transactionId);
        verify(tokenReissuanceService).reissueCleanTokens(any(), eq(1500.0), eq(caseId));
        // Transaction should not be marked as reversed if token reissuance fails
        verify(transactionService, never()).markTransactionReversed(any(), any());
    }

    @Test
    void executeReversal_DifferentReversalTypes_ShouldHandleCorrectly() {
        // Test different reversal types
        ReversalRequest.ReversalType[] types = {
            ReversalRequest.ReversalType.AUTOMATED_FRAUD,
            ReversalRequest.ReversalType.MANUAL_ARBITRATION,
            ReversalRequest.ReversalType.USER_REQUESTED
        };

        for (ReversalRequest.ReversalType type : types) {
            // Arrange
            ReversalRequest request = new ReversalRequest(
                UUID.randomUUID(),
                UUID.randomUUID(),
                "Test reversal for type: " + type,
                type
            );

            FraudCase testCase = new FraudCase(request.getTransactionId(), reporterId, 
                FraudCase.CaseType.UNAUTHORIZED_TRANSACTION, FraudCase.Priority.HIGH);
            testCase.transitionTo(FraudCase.Status.INVESTIGATING);

            Map<String, Object> transactionDetails = new HashMap<>();
            transactionDetails.put("amount", 500.0);
            transactionDetails.put("fromWallet", UUID.randomUUID());
            transactionDetails.put("toWallet", UUID.randomUUID());

            when(transactionService.isEligibleForReversal(request.getTransactionId())).thenReturn(true);
            when(fraudCaseRepository.findById(request.getCaseId())).thenReturn(Optional.of(testCase));
            when(transactionService.getTransactionDetails(request.getTransactionId())).thenReturn(transactionDetails);
            when(tokenReissuanceService.reissueCleanTokens(any(), eq(500.0), eq(request.getCaseId())))
                .thenReturn(UUID.randomUUID());

            // Act
            ReversalResponse response = automatedReversalService.executeReversal(request);

            // Assert
            assertNotNull(response);
            assertEquals(500.0, response.getReversedAmount());
        }
    }
}