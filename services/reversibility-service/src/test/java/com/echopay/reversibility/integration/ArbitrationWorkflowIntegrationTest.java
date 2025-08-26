package com.echopay.reversibility.integration;

import com.echopay.reversibility.dto.*;
import com.echopay.reversibility.model.FraudCase;
import com.echopay.reversibility.repository.FraudCaseRepository;
import com.echopay.reversibility.service.ArbitrationService;
import com.echopay.reversibility.service.FraudReportService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureWebMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.WebApplicationContext;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Integration tests for the complete arbitration workflow.
 * Tests the end-to-end process from fraud report to arbitration resolution.
 */
@SpringBootTest
@AutoConfigureWebMvc
@ActiveProfiles("test")
@Transactional
class ArbitrationWorkflowIntegrationTest {

    @Autowired
    private WebApplicationContext webApplicationContext;

    @Autowired
    private FraudReportService fraudReportService;

    @Autowired
    private ArbitrationService arbitrationService;

    @Autowired
    private FraudCaseRepository fraudCaseRepository;

    @Autowired
    private ObjectMapper objectMapper;

    private MockMvc mockMvc;
    private UUID transactionId;
    private UUID reporterId;
    private UUID arbitratorId;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.webAppContextSetup(webApplicationContext).build();
        transactionId = UUID.randomUUID();
        reporterId = UUID.randomUUID();
        arbitratorId = UUID.randomUUID();
    }

    @Test
    void testCompleteArbitrationWorkflow_FraudConfirmed() throws Exception {
        // Step 1: Submit fraud report
        FraudReportRequest fraudReport = createFraudReportRequest();
        FraudReportResponse reportResponse = fraudReportService.submitFraudReport(fraudReport);
        
        assertNotNull(reportResponse);
        assertNotNull(reportResponse.getCaseId());
        assertEquals("investigating", reportResponse.getStatus());

        UUID caseId = reportResponse.getCaseId();

        // Step 2: Verify case is in investigating status and unassigned
        List<ArbitrationCaseView> unassignedCases = arbitrationService.getUnassignedCases();
        assertTrue(unassignedCases.stream().anyMatch(c -> c.getCaseId().equals(caseId)));

        // Step 3: Assign case to arbitrator via REST API
        ArbitrationAssignmentRequest assignmentRequest = new ArbitrationAssignmentRequest(
            caseId, arbitratorId, "Assigning high-priority fraud case for review"
        );

        mockMvc.perform(post("/api/v1/arbitration/assign")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(assignmentRequest)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.assignedArbitratorId").value(arbitratorId.toString()))
                .andExpect(jsonPath("$.assignedAt").exists());

        // Step 4: Verify case is assigned
        FraudCase assignedCase = fraudCaseRepository.findById(caseId).orElseThrow();
        assertTrue(assignedCase.isAssigned());
        assertEquals(arbitratorId, assignedCase.getAssignedArbitratorId());

        // Step 5: Get case details for arbitration via REST API
        mockMvc.perform(get("/api/v1/arbitration/cases/{caseId}", caseId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.caseId").value(caseId.toString()))
                .andExpect(jsonPath("$.assignedArbitratorId").value(arbitratorId.toString()))
                .andExpect(jsonPath("$.transactionContext").exists())
                .andExpect(jsonPath("$.evidence").exists())
                .andExpect(jsonPath("$.fraudRiskScore").exists())
                .andExpect(jsonPath("$.timeRemaining").exists());

        // Step 6: Verify arbitrator can see their assigned cases
        mockMvc.perform(get("/api/v1/arbitration/arbitrators/{arbitratorId}/cases", arbitratorId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray())
                .andExpect(jsonPath("$[0].caseId").value(caseId.toString()));

        // Step 7: Process arbitration decision - fraud confirmed
        ArbitrationDecisionRequest decisionRequest = new ArbitrationDecisionRequest(
            caseId,
            "fraud_confirmed",
            "Clear evidence of unauthorized transaction. Device fingerprint mismatch and unusual location detected."
        );

        mockMvc.perform(post("/api/v1/arbitration/decide")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(decisionRequest)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("resolved"))
                .andExpect(jsonPath("$.resolution").value("fraud_confirmed"))
                .andExpect(jsonPath("$.resolutionReasoning").value(decisionRequest.getReasoning()))
                .andExpect(jsonPath("$.resolvedAt").exists());

        // Step 8: Verify case is resolved
        FraudCase resolvedCase = fraudCaseRepository.findById(caseId).orElseThrow();
        assertEquals(FraudCase.Status.RESOLVED, resolvedCase.getStatus());
        assertEquals(FraudCase.Resolution.FRAUD_CONFIRMED, resolvedCase.getResolution());
        assertNotNull(resolvedCase.getResolvedAt());
        assertEquals(decisionRequest.getReasoning(), resolvedCase.getResolutionReasoning());

        // Step 9: Verify case no longer appears in active cases
        List<ArbitrationCaseView> activeCases = arbitrationService.getCasesForArbitrator(arbitratorId);
        assertFalse(activeCases.stream().anyMatch(c -> c.getCaseId().equals(caseId)));
    }

    @Test
    void testCompleteArbitrationWorkflow_FraudDenied() throws Exception {
        // Step 1: Submit fraud report
        FraudReportRequest fraudReport = createFraudReportRequest();
        FraudReportResponse reportResponse = fraudReportService.submitFraudReport(fraudReport);
        UUID caseId = reportResponse.getCaseId();

        // Step 2: Assign case to arbitrator
        ArbitrationAssignmentRequest assignmentRequest = new ArbitrationAssignmentRequest(
            caseId, arbitratorId, "Standard fraud case assignment"
        );
        arbitrationService.assignCaseToArbitrator(assignmentRequest);

        // Step 3: Process arbitration decision - fraud denied
        ArbitrationDecisionRequest decisionRequest = new ArbitrationDecisionRequest(
            caseId,
            "fraud_denied",
            "Transaction appears legitimate. User behavior patterns are consistent with normal usage."
        );

        mockMvc.perform(post("/api/v1/arbitration/decide")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(decisionRequest)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("resolved"))
                .andExpect(jsonPath("$.resolution").value("fraud_denied"));

        // Step 4: Verify case is resolved with fraud denied
        FraudCase resolvedCase = fraudCaseRepository.findById(caseId).orElseThrow();
        assertEquals(FraudCase.Status.RESOLVED, resolvedCase.getStatus());
        assertEquals(FraudCase.Resolution.FRAUD_DENIED, resolvedCase.getResolution());
    }

    @Test
    void testArbitrationStatistics() throws Exception {
        // Create multiple test cases in different states
        createTestCasesForStatistics();

        // Get arbitration statistics via REST API
        mockMvc.perform(get("/api/v1/arbitration/statistics"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalActiveCases").exists())
                .andExpect(jsonPath("$.assignedCases").exists())
                .andExpect(jsonPath("$.unassignedCases").exists())
                .andExpect(jsonPath("$.overdueCases").exists())
                .andExpect(jsonPath("$.casesByPriority").exists())
                .andExpect(jsonPath("$.arbitratorWorkload").exists());
    }

    @Test
    void testOverdueEscalation() throws Exception {
        // Step 1: Create a case that would be overdue
        FraudReportRequest fraudReport = createFraudReportRequest();
        FraudReportResponse reportResponse = fraudReportService.submitFraudReport(fraudReport);
        UUID caseId = reportResponse.getCaseId();

        // Step 2: Manually set creation time to make it overdue
        FraudCase fraudCase = fraudCaseRepository.findById(caseId).orElseThrow();
        fraudCase.setCreatedAt(java.time.LocalDateTime.now().minusHours(75)); // 75 hours ago
        fraudCaseRepository.save(fraudCase);

        // Step 3: Assign to arbitrator
        ArbitrationAssignmentRequest assignmentRequest = new ArbitrationAssignmentRequest(
            caseId, arbitratorId, "Test overdue case"
        );
        arbitrationService.assignCaseToArbitrator(assignmentRequest);

        // Step 4: Trigger escalation check
        arbitrationService.checkForOverdueCases();

        // Step 5: Verify case was escalated
        FraudCase escalatedCase = fraudCaseRepository.findById(caseId).orElseThrow();
        assertNotNull(escalatedCase.getEscalatedAt());
        assertTrue(escalatedCase.isOverdue());
    }

    @Test
    void testArbitrationHealthCheck() throws Exception {
        mockMvc.perform(get("/api/v1/arbitration/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("healthy"))
                .andExpect(jsonPath("$.service").value("arbitration"))
                .andExpect(jsonPath("$.timestamp").exists());
    }

    @Test
    void testInvalidArbitrationRequests() throws Exception {
        UUID nonExistentCaseId = UUID.randomUUID();

        // Test assigning non-existent case
        ArbitrationAssignmentRequest invalidAssignment = new ArbitrationAssignmentRequest(
            nonExistentCaseId, arbitratorId, "Invalid case"
        );

        mockMvc.perform(post("/api/v1/arbitration/assign")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(invalidAssignment)))
                .andExpect(status().isBadRequest());

        // Test getting non-existent case
        mockMvc.perform(get("/api/v1/arbitration/cases/{caseId}", nonExistentCaseId))
                .andExpect(status().isNotFound());

        // Test deciding on non-existent case
        ArbitrationDecisionRequest invalidDecision = new ArbitrationDecisionRequest(
            nonExistentCaseId, "fraud_confirmed", "Invalid case decision"
        );

        mockMvc.perform(post("/api/v1/arbitration/decide")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(invalidDecision)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void testTimeRemainingCalculation() throws Exception {
        // Create a recent case
        FraudReportRequest fraudReport = createFraudReportRequest();
        FraudReportResponse reportResponse = fraudReportService.submitFraudReport(fraudReport);
        UUID caseId = reportResponse.getCaseId();

        // Assign to arbitrator
        ArbitrationAssignmentRequest assignmentRequest = new ArbitrationAssignmentRequest(
            caseId, arbitratorId, "Time remaining test"
        );
        arbitrationService.assignCaseToArbitrator(assignmentRequest);

        // Get case details and verify time remaining is calculated
        ArbitrationCaseView caseView = arbitrationService.getCaseForArbitration(caseId);
        assertNotNull(caseView.getTimeRemaining());
        assertTrue(caseView.getTimeRemaining().contains("hours remaining") || 
                  caseView.getTimeRemaining().equals("OVERDUE"));

        // Verify time remaining is positive for recent case
        FraudCase fraudCase = fraudCaseRepository.findById(caseId).orElseThrow();
        long timeRemaining = fraudCase.getTimeRemainingHours();
        assertTrue(timeRemaining > 0 && timeRemaining <= 72);
    }

    private FraudReportRequest createFraudReportRequest() {
        FraudReportRequest request = new FraudReportRequest();
        request.setTransactionId(transactionId);
        request.setReporterId(reporterId);
        request.setFraudType("unauthorized_transaction");
        request.setDescription("I did not authorize this transaction. It occurred while I was sleeping and from an unknown device.");
        
        EvidenceData evidence = new EvidenceData();
        evidence.setScreenshots(List.of("screenshot1.png", "screenshot2.png"));
        evidence.setAdditionalInfo("Transaction occurred at 3 AM from a device I don't recognize");
        request.setEvidence(evidence);
        
        return request;
    }

    private void createTestCasesForStatistics() {
        // Create unassigned case
        FraudReportRequest unassignedReport = createFraudReportRequest();
        unassignedReport.setTransactionId(UUID.randomUUID());
        fraudReportService.submitFraudReport(unassignedReport);

        // Create assigned case
        FraudReportRequest assignedReport = createFraudReportRequest();
        assignedReport.setTransactionId(UUID.randomUUID());
        FraudReportResponse assignedResponse = fraudReportService.submitFraudReport(assignedReport);
        
        ArbitrationAssignmentRequest assignment = new ArbitrationAssignmentRequest(
            assignedResponse.getCaseId(), arbitratorId, "Statistics test case"
        );
        arbitrationService.assignCaseToArbitrator(assignment);
    }
}