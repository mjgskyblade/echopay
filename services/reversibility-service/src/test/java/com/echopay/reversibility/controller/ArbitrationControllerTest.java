package com.echopay.reversibility.controller;

import com.echopay.reversibility.dto.ArbitrationAssignmentRequest;
import com.echopay.reversibility.dto.ArbitrationCaseView;
import com.echopay.reversibility.dto.ArbitrationDecisionRequest;
import com.echopay.reversibility.model.FraudCase;
import com.echopay.reversibility.service.ArbitrationService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.time.LocalDateTime;
import java.util.*;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Unit tests for ArbitrationController.
 * Tests REST API endpoints for arbitration functionality.
 */
@WebMvcTest(ArbitrationController.class)
class ArbitrationControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private ArbitrationService arbitrationService;

    @Autowired
    private ObjectMapper objectMapper;

    private UUID caseId;
    private UUID arbitratorId;
    private UUID transactionId;
    private UUID reporterId;
    private FraudCase testFraudCase;

    @BeforeEach
    void setUp() {
        caseId = UUID.randomUUID();
        arbitratorId = UUID.randomUUID();
        transactionId = UUID.randomUUID();
        reporterId = UUID.randomUUID();

        testFraudCase = new FraudCase(
            transactionId,
            reporterId,
            FraudCase.CaseType.UNAUTHORIZED_TRANSACTION,
            FraudCase.Priority.HIGH
        );
        testFraudCase.setCaseId(caseId);
        testFraudCase.transitionTo(FraudCase.Status.INVESTIGATING);
        testFraudCase.assignToArbitrator(arbitratorId);
    }

    @Test
    void testAssignCase_Success() throws Exception {
        // Arrange
        ArbitrationAssignmentRequest request = new ArbitrationAssignmentRequest(
            caseId, arbitratorId, "High priority case"
        );

        when(arbitrationService.assignCaseToArbitrator(any(ArbitrationAssignmentRequest.class)))
            .thenReturn(testFraudCase);

        // Act & Assert
        mockMvc.perform(post("/api/v1/arbitration/assign")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.caseId").value(caseId.toString()))
                .andExpect(jsonPath("$.assignedArbitratorId").value(arbitratorId.toString()))
                .andExpect(jsonPath("$.status").value("INVESTIGATING"));

        verify(arbitrationService).assignCaseToArbitrator(any(ArbitrationAssignmentRequest.class));
    }

    @Test
    void testAssignCase_IllegalState() throws Exception {
        // Arrange
        ArbitrationAssignmentRequest request = new ArbitrationAssignmentRequest(
            caseId, arbitratorId, "Test case"
        );

        when(arbitrationService.assignCaseToArbitrator(any(ArbitrationAssignmentRequest.class)))
            .thenThrow(new IllegalStateException("Case already assigned"));

        // Act & Assert
        mockMvc.perform(post("/api/v1/arbitration/assign")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest());

        verify(arbitrationService).assignCaseToArbitrator(any(ArbitrationAssignmentRequest.class));
    }

    @Test
    void testGetCaseForArbitration_Success() throws Exception {
        // Arrange
        ArbitrationCaseView caseView = createMockCaseView();

        when(arbitrationService.getCaseForArbitration(caseId)).thenReturn(caseView);

        // Act & Assert
        mockMvc.perform(get("/api/v1/arbitration/cases/{caseId}", caseId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.caseId").value(caseId.toString()))
                .andExpect(jsonPath("$.transactionId").value(transactionId.toString()))
                .andExpect(jsonPath("$.caseType").value("unauthorized_transaction"))
                .andExpect(jsonPath("$.priority").value("high"))
                .andExpect(jsonPath("$.assignedArbitratorId").value(arbitratorId.toString()))
                .andExpect(jsonPath("$.timeRemaining").value("48 hours remaining"))
                .andExpect(jsonPath("$.fraudRiskScore").value(0.75))
                .andExpect(jsonPath("$.transactionContext").exists())
                .andExpect(jsonPath("$.evidence").exists());

        verify(arbitrationService).getCaseForArbitration(caseId);
    }

    @Test
    void testGetCaseForArbitration_NotFound() throws Exception {
        // Arrange
        when(arbitrationService.getCaseForArbitration(caseId))
            .thenThrow(new RuntimeException("Case not found"));

        // Act & Assert
        mockMvc.perform(get("/api/v1/arbitration/cases/{caseId}", caseId))
                .andExpect(status().isNotFound());

        verify(arbitrationService).getCaseForArbitration(caseId);
    }

    @Test
    void testProcessDecision_FraudConfirmed() throws Exception {
        // Arrange
        ArbitrationDecisionRequest request = new ArbitrationDecisionRequest(
            caseId, "fraud_confirmed", "Clear evidence of fraud"
        );

        testFraudCase.resolve(FraudCase.Resolution.FRAUD_CONFIRMED);
        testFraudCase.setResolutionReasoning(request.getReasoning());

        when(arbitrationService.processArbitrationDecision(any(ArbitrationDecisionRequest.class)))
            .thenReturn(testFraudCase);

        // Act & Assert
        mockMvc.perform(post("/api/v1/arbitration/decide")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.caseId").value(caseId.toString()))
                .andExpect(jsonPath("$.status").value("RESOLVED"))
                .andExpect(jsonPath("$.resolution").value("FRAUD_CONFIRMED"))
                .andExpect(jsonPath("$.resolutionReasoning").value("Clear evidence of fraud"));

        verify(arbitrationService).processArbitrationDecision(any(ArbitrationDecisionRequest.class));
    }

    @Test
    void testProcessDecision_IllegalState() throws Exception {
        // Arrange
        ArbitrationDecisionRequest request = new ArbitrationDecisionRequest(
            caseId, "fraud_confirmed", "Test reasoning"
        );

        when(arbitrationService.processArbitrationDecision(any(ArbitrationDecisionRequest.class)))
            .thenThrow(new IllegalStateException("Case not assigned"));

        // Act & Assert
        mockMvc.perform(post("/api/v1/arbitration/decide")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest());

        verify(arbitrationService).processArbitrationDecision(any(ArbitrationDecisionRequest.class));
    }

    @Test
    void testGetCasesForArbitrator() throws Exception {
        // Arrange
        List<ArbitrationCaseView> cases = Arrays.asList(createMockCaseView());

        when(arbitrationService.getCasesForArbitrator(arbitratorId)).thenReturn(cases);

        // Act & Assert
        mockMvc.perform(get("/api/v1/arbitration/arbitrators/{arbitratorId}/cases", arbitratorId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray())
                .andExpect(jsonPath("$[0].caseId").value(caseId.toString()))
                .andExpect(jsonPath("$[0].assignedArbitratorId").value(arbitratorId.toString()));

        verify(arbitrationService).getCasesForArbitrator(arbitratorId);
    }

    @Test
    void testGetUnassignedCases() throws Exception {
        // Arrange
        ArbitrationCaseView unassignedCase = createMockCaseView();
        unassignedCase.setAssignedArbitratorId(null);
        List<ArbitrationCaseView> cases = Arrays.asList(unassignedCase);

        when(arbitrationService.getUnassignedCases()).thenReturn(cases);

        // Act & Assert
        mockMvc.perform(get("/api/v1/arbitration/cases/unassigned"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray())
                .andExpect(jsonPath("$[0].caseId").value(caseId.toString()))
                .andExpect(jsonPath("$[0].assignedArbitratorId").doesNotExist());

        verify(arbitrationService).getUnassignedCases();
    }

    @Test
    void testGetStatistics() throws Exception {
        // Arrange
        Map<String, Object> stats = new HashMap<>();
        stats.put("totalActiveCases", 10);
        stats.put("assignedCases", 7L);
        stats.put("unassignedCases", 3L);
        stats.put("overdueCases", 1L);
        
        Map<String, Long> casesByPriority = new HashMap<>();
        casesByPriority.put("high", 3L);
        casesByPriority.put("medium", 5L);
        casesByPriority.put("low", 2L);
        stats.put("casesByPriority", casesByPriority);
        
        Map<String, Long> arbitratorWorkload = new HashMap<>();
        arbitratorWorkload.put(arbitratorId.toString(), 4L);
        stats.put("arbitratorWorkload", arbitratorWorkload);

        when(arbitrationService.getArbitrationStatistics()).thenReturn(stats);

        // Act & Assert
        mockMvc.perform(get("/api/v1/arbitration/statistics"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalActiveCases").value(10))
                .andExpect(jsonPath("$.assignedCases").value(7))
                .andExpect(jsonPath("$.unassignedCases").value(3))
                .andExpect(jsonPath("$.overdueCases").value(1))
                .andExpect(jsonPath("$.casesByPriority.high").value(3))
                .andExpect(jsonPath("$.casesByPriority.medium").value(5))
                .andExpect(jsonPath("$.casesByPriority.low").value(2))
                .andExpect(jsonPath("$.arbitratorWorkload").exists());

        verify(arbitrationService).getArbitrationStatistics();
    }

    @Test
    void testHealthCheck() throws Exception {
        mockMvc.perform(get("/api/v1/arbitration/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("healthy"))
                .andExpect(jsonPath("$.service").value("arbitration"))
                .andExpect(jsonPath("$.timestamp").exists());
    }

    @Test
    void testInvalidRequestBody() throws Exception {
        // Test with invalid JSON
        mockMvc.perform(post("/api/v1/arbitration/assign")
                .contentType(MediaType.APPLICATION_JSON)
                .content("invalid json"))
                .andExpect(status().isBadRequest());

        // Test with missing required fields
        ArbitrationAssignmentRequest invalidRequest = new ArbitrationAssignmentRequest();
        // Missing caseId and arbitratorId

        mockMvc.perform(post("/api/v1/arbitration/assign")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(invalidRequest)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void testServiceExceptions() throws Exception {
        // Test internal server error handling
        ArbitrationAssignmentRequest request = new ArbitrationAssignmentRequest(
            caseId, arbitratorId, "Test case"
        );

        when(arbitrationService.assignCaseToArbitrator(any(ArbitrationAssignmentRequest.class)))
            .thenThrow(new RuntimeException("Database connection failed"));

        mockMvc.perform(post("/api/v1/arbitration/assign")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isInternalServerError());
    }

    private ArbitrationCaseView createMockCaseView() {
        ArbitrationCaseView caseView = new ArbitrationCaseView();
        caseView.setCaseId(caseId);
        caseView.setTransactionId(transactionId);
        caseView.setReporterId(reporterId);
        caseView.setCaseType("unauthorized_transaction");
        caseView.setPriority("high");
        caseView.setStatus("investigating");
        caseView.setCreatedAt(LocalDateTime.now().minusHours(24));
        caseView.setAssignedArbitratorId(arbitratorId);
        caseView.setAssignedAt(LocalDateTime.now().minusHours(1));
        caseView.setTimeRemaining("48 hours remaining");
        caseView.setFraudRiskScore(0.75);

        // Mock evidence
        Map<String, Object> evidence = new HashMap<>();
        evidence.put("userReport", "Unauthorized transaction");
        evidence.put("screenshots", Arrays.asList("screenshot1.png"));
        caseView.setEvidence(evidence);

        // Mock transaction context
        ArbitrationCaseView.TransactionContext context = new ArbitrationCaseView.TransactionContext();
        context.setAmount(1500.0);
        context.setCurrency("USD-CBDC");
        context.setFromWallet("wallet-12345");
        context.setToWallet("wallet-67890");
        context.setTimestamp(LocalDateTime.now().minusHours(25));
        caseView.setTransactionContext(context);

        // Mock user behavior analysis
        Map<String, Object> behaviorAnalysis = new HashMap<>();
        behaviorAnalysis.put("normalSpendingPattern", false);
        behaviorAnalysis.put("unusualTimeTransaction", true);
        behaviorAnalysis.put("deviceConsistency", false);
        caseView.setUserBehaviorAnalysis(behaviorAnalysis);

        return caseView;
    }
}