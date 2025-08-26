package com.echopay.reversibility.controller;

import com.echopay.reversibility.dto.FraudReportRequest;
import com.echopay.reversibility.dto.FraudReportResponse;
import com.echopay.reversibility.exception.FraudCaseNotFoundException;
import com.echopay.reversibility.exception.InvalidFraudReportException;
import com.echopay.reversibility.model.FraudCase;
import com.echopay.reversibility.service.FraudReportService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Unit tests for FraudReportController.
 * Tests REST API endpoints for fraud reporting and case management.
 */
@WebMvcTest(FraudReportController.class)
class FraudReportControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private FraudReportService fraudReportService;

    @Autowired
    private ObjectMapper objectMapper;

    private UUID transactionId;
    private UUID reporterId;
    private UUID caseId;
    private FraudReportRequest validRequest;
    private FraudCase fraudCase;

    @BeforeEach
    void setUp() {
        transactionId = UUID.randomUUID();
        reporterId = UUID.randomUUID();
        caseId = UUID.randomUUID();
        
        validRequest = new FraudReportRequest(
            transactionId,
            reporterId,
            "unauthorized_transaction",
            "Someone used my account to make this transaction without my permission."
        );

        fraudCase = new FraudCase(transactionId, reporterId, 
            FraudCase.CaseType.UNAUTHORIZED_TRANSACTION, FraudCase.Priority.MEDIUM);
    }

    @Test
    void submitFraudReport_ValidRequest_ShouldReturn201() throws Exception {
        // Arrange
        FraudReportResponse response = new FraudReportResponse(
            caseId, "investigating", "72 hours", 
            "Fraud report submitted successfully. Disputed tokens have been frozen."
        );
        when(fraudReportService.submitFraudReport(any(FraudReportRequest.class))).thenReturn(response);

        // Act & Assert
        mockMvc.perform(post("/api/v1/fraud-reports")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(validRequest)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.caseId").value(caseId.toString()))
                .andExpect(jsonPath("$.status").value("investigating"))
                .andExpect(jsonPath("$.estimatedResolution").value("72 hours"))
                .andExpect(jsonPath("$.message").value("Fraud report submitted successfully. Disputed tokens have been frozen."));
    }

    @Test
    void submitFraudReport_InvalidRequest_ShouldReturn400() throws Exception {
        // Arrange
        when(fraudReportService.submitFraudReport(any(FraudReportRequest.class)))
            .thenThrow(new InvalidFraudReportException("Transaction ID is required"));

        // Act & Assert
        mockMvc.perform(post("/api/v1/fraud-reports")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(validRequest)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value("error"))
                .andExpect(jsonPath("$.message").value("Transaction ID is required"));
    }

    @Test
    void submitFraudReport_MissingTransactionId_ShouldReturn400() throws Exception {
        // Arrange
        validRequest.setTransactionId(null);

        // Act & Assert
        mockMvc.perform(post("/api/v1/fraud-reports")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(validRequest)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void submitFraudReport_EmptyDescription_ShouldReturn400() throws Exception {
        // Arrange
        validRequest.setDescription("");

        // Act & Assert
        mockMvc.perform(post("/api/v1/fraud-reports")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(validRequest)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void getFraudCase_ExistingCase_ShouldReturn200() throws Exception {
        // Arrange
        when(fraudReportService.getFraudCase(caseId)).thenReturn(fraudCase);

        // Act & Assert
        mockMvc.perform(get("/api/v1/fraud-cases/{caseId}", caseId.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.caseId").value(fraudCase.getCaseId().toString()))
                .andExpect(jsonPath("$.transactionId").value(fraudCase.getTransactionId().toString()))
                .andExpect(jsonPath("$.reporterId").value(fraudCase.getReporterId().toString()))
                .andExpect(jsonPath("$.status").value("OPEN"));
    }

    @Test
    void getFraudCase_NonExistentCase_ShouldReturn404() throws Exception {
        // Arrange
        when(fraudReportService.getFraudCase(caseId))
            .thenThrow(new FraudCaseNotFoundException("Fraud case not found"));

        // Act & Assert
        mockMvc.perform(get("/api/v1/fraud-cases/{caseId}", caseId.toString()))
                .andExpect(status().isNotFound());
    }

    @Test
    void getFraudCase_InvalidCaseId_ShouldReturn400() throws Exception {
        // Act & Assert
        mockMvc.perform(get("/api/v1/fraud-cases/{caseId}", "invalid-uuid"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void getFraudCasesByReporter_ValidReporterId_ShouldReturn200() throws Exception {
        // Arrange
        List<FraudCase> cases = List.of(fraudCase);
        when(fraudReportService.getFraudCasesByReporter(reporterId)).thenReturn(cases);

        // Act & Assert
        mockMvc.perform(get("/api/v1/fraud-cases")
                .param("reporterId", reporterId.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray())
                .andExpect(jsonPath("$[0].caseId").value(fraudCase.getCaseId().toString()));
    }

    @Test
    void getFraudCasesByReporter_InvalidReporterId_ShouldReturn400() throws Exception {
        // Act & Assert
        mockMvc.perform(get("/api/v1/fraud-cases")
                .param("reporterId", "invalid-uuid"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void getActiveFraudCases_ShouldReturn200() throws Exception {
        // Arrange
        List<FraudCase> activeCases = List.of(fraudCase);
        when(fraudReportService.getActiveFraudCases()).thenReturn(activeCases);

        // Act & Assert
        mockMvc.perform(get("/api/v1/fraud-cases/active"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray())
                .andExpect(jsonPath("$[0].caseId").value(fraudCase.getCaseId().toString()));
    }

    @Test
    void updateCaseStatus_ValidTransition_ShouldReturn200() throws Exception {
        // Arrange
        fraudCase.transitionTo(FraudCase.Status.INVESTIGATING);
        when(fraudReportService.updateCaseStatus(eq(caseId), eq(FraudCase.Status.RESOLVED)))
            .thenReturn(fraudCase);

        // Act & Assert
        mockMvc.perform(put("/api/v1/fraud-cases/{caseId}/status", caseId.toString())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\": \"resolved\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.caseId").value(fraudCase.getCaseId().toString()));
    }

    @Test
    void updateCaseStatus_InvalidTransition_ShouldReturn409() throws Exception {
        // Arrange
        when(fraudReportService.updateCaseStatus(eq(caseId), any()))
            .thenThrow(new IllegalStateException("Invalid state transition"));

        // Act & Assert
        mockMvc.perform(put("/api/v1/fraud-cases/{caseId}/status", caseId.toString())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\": \"resolved\"}"))
                .andExpect(status().isConflict());
    }

    @Test
    void updateCaseStatus_InvalidStatus_ShouldReturn400() throws Exception {
        // Act & Assert
        mockMvc.perform(put("/api/v1/fraud-cases/{caseId}/status", caseId.toString())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\": \"invalid_status\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void addEvidence_ValidEvidence_ShouldReturn200() throws Exception {
        // Arrange
        when(fraudReportService.addEvidence(eq(caseId), any())).thenReturn(fraudCase);

        // Act & Assert
        mockMvc.perform(post("/api/v1/fraud-cases/{caseId}/evidence", caseId.toString())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"additionalInfo\": \"New evidence\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.caseId").value(fraudCase.getCaseId().toString()));
    }

    @Test
    void addEvidence_InactiveCase_ShouldReturn409() throws Exception {
        // Arrange
        when(fraudReportService.addEvidence(eq(caseId), any()))
            .thenThrow(new IllegalStateException("Cannot add evidence to inactive case"));

        // Act & Assert
        mockMvc.perform(post("/api/v1/fraud-cases/{caseId}/evidence", caseId.toString())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"additionalInfo\": \"New evidence\"}"))
                .andExpect(status().isConflict());
    }

    @Test
    void addEvidence_NonExistentCase_ShouldReturn404() throws Exception {
        // Arrange
        when(fraudReportService.addEvidence(eq(caseId), any()))
            .thenThrow(new FraudCaseNotFoundException("Fraud case not found"));

        // Act & Assert
        mockMvc.perform(post("/api/v1/fraud-cases/{caseId}/evidence", caseId.toString())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"additionalInfo\": \"New evidence\"}"))
                .andExpect(status().isNotFound());
    }

    @Test
    void resolveFraudCase_ShouldReturnPlaceholderMessage() throws Exception {
        // Act & Assert
        mockMvc.perform(post("/api/v1/fraud-cases/{caseId}/resolve", caseId.toString())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"resolution\": \"fraud_confirmed\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Case resolution will be implemented in arbitration system"));
    }

    @Test
    void executeReversal_ShouldReturnPlaceholderMessage() throws Exception {
        // Act & Assert
        mockMvc.perform(post("/api/v1/reversals")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"transactionId\": \"" + transactionId.toString() + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Reversal execution will be implemented in automated reversal system"));
    }
}