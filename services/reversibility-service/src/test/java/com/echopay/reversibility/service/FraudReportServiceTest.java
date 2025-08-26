package com.echopay.reversibility.service;

import com.echopay.reversibility.dto.FraudReportRequest;
import com.echopay.reversibility.dto.FraudReportResponse;
import com.echopay.reversibility.dto.EvidenceData;
import com.echopay.reversibility.exception.FraudCaseNotFoundException;
import com.echopay.reversibility.exception.InvalidFraudReportException;
import com.echopay.reversibility.model.FraudCase;
import com.echopay.reversibility.repository.FraudCaseRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * Unit tests for FraudReportService.
 * Tests fraud reporting workflow and case state management.
 */
@ExtendWith(MockitoExtension.class)
class FraudReportServiceTest {

    @Mock
    private FraudCaseRepository fraudCaseRepository;

    @Mock
    private EvidenceCollectionService evidenceCollectionService;

    @Mock
    private NotificationService notificationService;

    @Mock
    private TransactionService transactionService;

    @InjectMocks
    private FraudReportService fraudReportService;

    private UUID transactionId;
    private UUID reporterId;
    private FraudReportRequest validRequest;

    @BeforeEach
    void setUp() {
        transactionId = UUID.randomUUID();
        reporterId = UUID.randomUUID();
        
        validRequest = new FraudReportRequest(
            transactionId,
            reporterId,
            "unauthorized_transaction",
            "Someone used my account to make this transaction without my permission."
        );
        
        EvidenceData evidence = new EvidenceData(
            List.of("screenshot1.png", "screenshot2.png"),
            "I was not near my phone when this transaction occurred."
        );
        validRequest.setEvidence(evidence);
    }

    @Test
    void submitFraudReport_ValidRequest_ShouldCreateFraudCase() {
        // Arrange
        when(transactionService.isValidForFraudReport(transactionId)).thenReturn(true);
        when(fraudCaseRepository.findActiveByTransactionId(transactionId)).thenReturn(Optional.empty());
        when(transactionService.getTransactionAmount(transactionId)).thenReturn(1500.0);
        
        FraudCase savedCase = new FraudCase(transactionId, reporterId, 
            FraudCase.CaseType.UNAUTHORIZED_TRANSACTION, FraudCase.Priority.HIGH);
        when(fraudCaseRepository.save(any(FraudCase.class))).thenReturn(savedCase);

        // Act
        FraudReportResponse response = fraudReportService.submitFraudReport(validRequest);

        // Assert
        assertNotNull(response);
        assertEquals(savedCase.getCaseId(), response.getCaseId());
        assertEquals("investigating", response.getStatus());
        assertNotNull(response.getEstimatedResolution());
        assertTrue(response.getMessage().contains("frozen"));

        // Verify interactions
        verify(transactionService).freezeTransactionTokens(transactionId, savedCase.getCaseId());
        verify(evidenceCollectionService).startEvidenceCollection(savedCase.getCaseId());
        verify(notificationService).sendFraudReportConfirmation(reporterId, savedCase.getCaseId());
        verify(fraudCaseRepository, times(2)).save(any(FraudCase.class));
    }

    @Test
    void submitFraudReport_InvalidTransaction_ShouldThrowException() {
        // Arrange
        when(transactionService.isValidForFraudReport(transactionId)).thenReturn(false);

        // Act & Assert
        InvalidFraudReportException exception = assertThrows(
            InvalidFraudReportException.class,
            () -> fraudReportService.submitFraudReport(validRequest)
        );
        
        assertEquals("Transaction is not valid for fraud reporting", exception.getMessage());
        verify(fraudCaseRepository, never()).save(any());
    }

    @Test
    void submitFraudReport_ExistingActiveCase_ShouldThrowException() {
        // Arrange
        when(transactionService.isValidForFraudReport(transactionId)).thenReturn(true);
        FraudCase existingCase = new FraudCase(transactionId, reporterId, 
            FraudCase.CaseType.UNAUTHORIZED_TRANSACTION, FraudCase.Priority.MEDIUM);
        when(fraudCaseRepository.findActiveByTransactionId(transactionId))
            .thenReturn(Optional.of(existingCase));

        // Act & Assert
        InvalidFraudReportException exception = assertThrows(
            InvalidFraudReportException.class,
            () -> fraudReportService.submitFraudReport(validRequest)
        );
        
        assertEquals("Active fraud case already exists for this transaction", exception.getMessage());
    }

    @Test
    void submitFraudReport_NullTransactionId_ShouldThrowException() {
        // Arrange
        validRequest.setTransactionId(null);

        // Act & Assert
        InvalidFraudReportException exception = assertThrows(
            InvalidFraudReportException.class,
            () -> fraudReportService.submitFraudReport(validRequest)
        );
        
        assertEquals("Transaction ID is required", exception.getMessage());
    }

    @Test
    void submitFraudReport_EmptyDescription_ShouldThrowException() {
        // Arrange
        validRequest.setDescription("");

        // Act & Assert
        InvalidFraudReportException exception = assertThrows(
            InvalidFraudReportException.class,
            () -> fraudReportService.submitFraudReport(validRequest)
        );
        
        assertEquals("Description is required", exception.getMessage());
    }

    @Test
    void submitFraudReport_DescriptionTooLong_ShouldThrowException() {
        // Arrange
        String longDescription = "a".repeat(2001);
        validRequest.setDescription(longDescription);

        // Act & Assert
        InvalidFraudReportException exception = assertThrows(
            InvalidFraudReportException.class,
            () -> fraudReportService.submitFraudReport(validRequest)
        );
        
        assertEquals("Description cannot exceed 2000 characters", exception.getMessage());
    }

    @Test
    void submitFraudReport_InvalidFraudType_ShouldThrowException() {
        // Arrange
        validRequest.setFraudType("invalid_fraud_type");

        // Act & Assert
        InvalidFraudReportException exception = assertThrows(
            InvalidFraudReportException.class,
            () -> fraudReportService.submitFraudReport(validRequest)
        );
        
        assertTrue(exception.getMessage().contains("Invalid fraud type"));
    }

    @Test
    void determinePriority_HighValueTransaction_ShouldReturnCritical() {
        // Arrange
        when(transactionService.isValidForFraudReport(transactionId)).thenReturn(true);
        when(fraudCaseRepository.findActiveByTransactionId(transactionId)).thenReturn(Optional.empty());
        when(transactionService.getTransactionAmount(transactionId)).thenReturn(15000.0);
        
        FraudCase savedCase = new FraudCase(transactionId, reporterId, 
            FraudCase.CaseType.UNAUTHORIZED_TRANSACTION, FraudCase.Priority.CRITICAL);
        when(fraudCaseRepository.save(any(FraudCase.class))).thenReturn(savedCase);

        // Act
        FraudReportResponse response = fraudReportService.submitFraudReport(validRequest);

        // Assert
        assertEquals("24 hours", response.getEstimatedResolution());
    }

    @Test
    void determinePriority_AccountTakeover_ShouldReturnHigh() {
        // Arrange
        validRequest.setFraudType("account_takeover");
        when(transactionService.isValidForFraudReport(transactionId)).thenReturn(true);
        when(fraudCaseRepository.findActiveByTransactionId(transactionId)).thenReturn(Optional.empty());
        when(transactionService.getTransactionAmount(transactionId)).thenReturn(500.0);
        
        FraudCase savedCase = new FraudCase(transactionId, reporterId, 
            FraudCase.CaseType.ACCOUNT_TAKEOVER, FraudCase.Priority.HIGH);
        when(fraudCaseRepository.save(any(FraudCase.class))).thenReturn(savedCase);

        // Act
        FraudReportResponse response = fraudReportService.submitFraudReport(validRequest);

        // Assert
        assertEquals("48 hours", response.getEstimatedResolution());
    }

    @Test
    void getFraudCase_ExistingCase_ShouldReturnCase() {
        // Arrange
        UUID caseId = UUID.randomUUID();
        FraudCase fraudCase = new FraudCase(transactionId, reporterId, 
            FraudCase.CaseType.UNAUTHORIZED_TRANSACTION, FraudCase.Priority.MEDIUM);
        when(fraudCaseRepository.findById(caseId)).thenReturn(Optional.of(fraudCase));

        // Act
        FraudCase result = fraudReportService.getFraudCase(caseId);

        // Assert
        assertNotNull(result);
        assertEquals(fraudCase, result);
    }

    @Test
    void getFraudCase_NonExistentCase_ShouldThrowException() {
        // Arrange
        UUID caseId = UUID.randomUUID();
        when(fraudCaseRepository.findById(caseId)).thenReturn(Optional.empty());

        // Act & Assert
        FraudCaseNotFoundException exception = assertThrows(
            FraudCaseNotFoundException.class,
            () -> fraudReportService.getFraudCase(caseId)
        );
        
        assertTrue(exception.getMessage().contains(caseId.toString()));
    }

    @Test
    void updateCaseStatus_ValidTransition_ShouldUpdateStatus() {
        // Arrange
        UUID caseId = UUID.randomUUID();
        FraudCase fraudCase = new FraudCase(transactionId, reporterId, 
            FraudCase.CaseType.UNAUTHORIZED_TRANSACTION, FraudCase.Priority.MEDIUM);
        fraudCase.transitionTo(FraudCase.Status.INVESTIGATING);
        
        when(fraudCaseRepository.findById(caseId)).thenReturn(Optional.of(fraudCase));
        when(fraudCaseRepository.save(any(FraudCase.class))).thenReturn(fraudCase);

        // Act
        FraudCase result = fraudReportService.updateCaseStatus(caseId, FraudCase.Status.RESOLVED);

        // Assert
        assertEquals(FraudCase.Status.RESOLVED, result.getStatus());
        verify(notificationService).sendCaseStatusUpdate(reporterId, caseId, "resolved");
    }

    @Test
    void updateCaseStatus_InvalidTransition_ShouldThrowException() {
        // Arrange
        UUID caseId = UUID.randomUUID();
        FraudCase fraudCase = new FraudCase(transactionId, reporterId, 
            FraudCase.CaseType.UNAUTHORIZED_TRANSACTION, FraudCase.Priority.MEDIUM);
        fraudCase.transitionTo(FraudCase.Status.INVESTIGATING);
        fraudCase.transitionTo(FraudCase.Status.RESOLVED); // Already resolved
        
        when(fraudCaseRepository.findById(caseId)).thenReturn(Optional.of(fraudCase));

        // Act & Assert
        IllegalStateException exception = assertThrows(
            IllegalStateException.class,
            () -> fraudReportService.updateCaseStatus(caseId, FraudCase.Status.INVESTIGATING)
        );
        
        assertTrue(exception.getMessage().contains("Cannot transition"));
    }

    @Test
    void addEvidence_ActiveCase_ShouldAddEvidence() {
        // Arrange
        UUID caseId = UUID.randomUUID();
        FraudCase fraudCase = new FraudCase(transactionId, reporterId, 
            FraudCase.CaseType.UNAUTHORIZED_TRANSACTION, FraudCase.Priority.MEDIUM);
        fraudCase.transitionTo(FraudCase.Status.INVESTIGATING);
        
        Map<String, Object> initialEvidence = new HashMap<>();
        initialEvidence.put("userReport", "Initial report");
        fraudCase.setEvidence(initialEvidence);
        
        when(fraudCaseRepository.findById(caseId)).thenReturn(Optional.of(fraudCase));
        when(fraudCaseRepository.save(any(FraudCase.class))).thenReturn(fraudCase);

        Map<String, Object> newEvidence = Map.of("additionalInfo", "New evidence");

        // Act
        FraudCase result = fraudReportService.addEvidence(caseId, newEvidence);

        // Assert
        assertTrue(result.getEvidence().containsKey("userReport"));
        assertTrue(result.getEvidence().containsKey("additionalInfo"));
        assertEquals("New evidence", result.getEvidence().get("additionalInfo"));
    }

    @Test
    void addEvidence_InactiveCase_ShouldThrowException() {
        // Arrange
        UUID caseId = UUID.randomUUID();
        FraudCase fraudCase = new FraudCase(transactionId, reporterId, 
            FraudCase.CaseType.UNAUTHORIZED_TRANSACTION, FraudCase.Priority.MEDIUM);
        fraudCase.transitionTo(FraudCase.Status.INVESTIGATING);
        fraudCase.transitionTo(FraudCase.Status.RESOLVED); // Make inactive
        
        when(fraudCaseRepository.findById(caseId)).thenReturn(Optional.of(fraudCase));

        Map<String, Object> newEvidence = Map.of("additionalInfo", "New evidence");

        // Act & Assert
        IllegalStateException exception = assertThrows(
            IllegalStateException.class,
            () -> fraudReportService.addEvidence(caseId, newEvidence)
        );
        
        assertEquals("Cannot add evidence to inactive case", exception.getMessage());
    }

    @Test
    void getFraudCasesByReporter_ShouldReturnUserCases() {
        // Arrange
        List<FraudCase> expectedCases = List.of(
            new FraudCase(UUID.randomUUID(), reporterId, 
                FraudCase.CaseType.UNAUTHORIZED_TRANSACTION, FraudCase.Priority.MEDIUM),
            new FraudCase(UUID.randomUUID(), reporterId, 
                FraudCase.CaseType.PHISHING, FraudCase.Priority.HIGH)
        );
        when(fraudCaseRepository.findByReporterId(reporterId)).thenReturn(expectedCases);

        // Act
        List<FraudCase> result = fraudReportService.getFraudCasesByReporter(reporterId);

        // Assert
        assertEquals(2, result.size());
        assertEquals(expectedCases, result);
    }

    @Test
    void getActiveFraudCases_ShouldReturnActiveCases() {
        // Arrange
        List<FraudCase> expectedCases = List.of(
            new FraudCase(UUID.randomUUID(), reporterId, 
                FraudCase.CaseType.UNAUTHORIZED_TRANSACTION, FraudCase.Priority.MEDIUM)
        );
        when(fraudCaseRepository.findByStatusIn(anyList())).thenReturn(expectedCases);

        // Act
        List<FraudCase> result = fraudReportService.getActiveFraudCases();

        // Assert
        assertEquals(1, result.size());
        assertEquals(expectedCases, result);
    }
}