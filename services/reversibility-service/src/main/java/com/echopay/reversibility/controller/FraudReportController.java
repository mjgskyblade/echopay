package com.echopay.reversibility.controller;

import com.echopay.reversibility.dto.FraudReportRequest;
import com.echopay.reversibility.dto.FraudReportResponse;
import com.echopay.reversibility.dto.ReversalRequest;
import com.echopay.reversibility.dto.ReversalResponse;
import com.echopay.reversibility.model.FraudCase;
import com.echopay.reversibility.service.FraudReportService;
import com.echopay.reversibility.service.AutomatedReversalService;
import com.echopay.reversibility.exception.FraudCaseNotFoundException;
import com.echopay.reversibility.exception.InvalidFraudReportException;
import com.echopay.reversibility.exception.ReversalException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import jakarta.validation.Valid;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * REST controller for fraud reporting and case management.
 * Implements requirements 3.1, 3.2, 4.2, and 4.5.
 */
@RestController
@RequestMapping("/api/v1")
public class FraudReportController {

    private final FraudReportService fraudReportService;
    private final AutomatedReversalService automatedReversalService;

    @Autowired
    public FraudReportController(FraudReportService fraudReportService, 
                                AutomatedReversalService automatedReversalService) {
        this.fraudReportService = fraudReportService;
        this.automatedReversalService = automatedReversalService;
    }

    /**
     * Submit a new fraud report.
     * Implements requirement 3.1: Immediate token freezing and investigation initiation.
     */
    @PostMapping("/fraud-reports")
    public ResponseEntity<FraudReportResponse> submitFraudReport(
            @Valid @RequestBody FraudReportRequest request) {
        try {
            FraudReportResponse response = fraudReportService.submitFraudReport(request);
            return ResponseEntity.status(HttpStatus.CREATED).body(response);
        } catch (InvalidFraudReportException e) {
            return ResponseEntity.badRequest().body(
                new FraudReportResponse(null, "error", null, e.getMessage())
            );
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(
                new FraudReportResponse(null, "error", null, "Internal server error")
            );
        }
    }

    /**
     * Get fraud case details by case ID.
     * Implements requirement 4.2: Real-time status updates.
     */
    @GetMapping("/fraud-cases/{caseId}")
    public ResponseEntity<FraudCase> getFraudCase(@PathVariable String caseId) {
        try {
            UUID caseUuid = UUID.fromString(caseId);
            FraudCase fraudCase = fraudReportService.getFraudCase(caseUuid);
            return ResponseEntity.ok(fraudCase);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().build();
        } catch (FraudCaseNotFoundException e) {
            return ResponseEntity.notFound().build();
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    /**
     * Get all fraud cases for a specific user.
     */
    @GetMapping("/fraud-cases")
    public ResponseEntity<List<FraudCase>> getFraudCasesByReporter(
            @RequestParam("reporterId") String reporterId) {
        try {
            UUID reporterUuid = UUID.fromString(reporterId);
            List<FraudCase> cases = fraudReportService.getFraudCasesByReporter(reporterUuid);
            return ResponseEntity.ok(cases);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().build();
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    /**
     * Get all active fraud cases (for admin/arbitrator view).
     */
    @GetMapping("/fraud-cases/active")
    public ResponseEntity<List<FraudCase>> getActiveFraudCases() {
        try {
            List<FraudCase> activeCases = fraudReportService.getActiveFraudCases();
            return ResponseEntity.ok(activeCases);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    /**
     * Update fraud case status.
     */
    @PutMapping("/fraud-cases/{caseId}/status")
    public ResponseEntity<FraudCase> updateCaseStatus(
            @PathVariable String caseId,
            @RequestBody Map<String, String> request) {
        try {
            UUID caseUuid = UUID.fromString(caseId);
            String statusString = request.get("status");
            FraudCase.Status newStatus = FraudCase.Status.fromString(statusString);
            
            FraudCase updatedCase = fraudReportService.updateCaseStatus(caseUuid, newStatus);
            return ResponseEntity.ok(updatedCase);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().build();
        } catch (FraudCaseNotFoundException e) {
            return ResponseEntity.notFound().build();
        } catch (IllegalStateException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT).build();
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    /**
     * Add evidence to an existing fraud case.
     */
    @PostMapping("/fraud-cases/{caseId}/evidence")
    public ResponseEntity<FraudCase> addEvidence(
            @PathVariable String caseId,
            @RequestBody Map<String, Object> evidence) {
        try {
            UUID caseUuid = UUID.fromString(caseId);
            FraudCase updatedCase = fraudReportService.addEvidence(caseUuid, evidence);
            return ResponseEntity.ok(updatedCase);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().build();
        } catch (FraudCaseNotFoundException e) {
            return ResponseEntity.notFound().build();
        } catch (IllegalStateException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT).build();
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    /**
     * Resolve fraud case (placeholder for task 6.3).
     */
    @PostMapping("/fraud-cases/{caseId}/resolve")
    public ResponseEntity<Map<String, String>> resolveFraudCase(
            @PathVariable String caseId,
            @RequestBody Map<String, Object> request) {
        // This will be implemented in task 6.3 (arbitration system)
        return ResponseEntity.ok(Map.of(
            "message", "Case resolution will be implemented in arbitration system",
            "caseId", caseId
        ));
    }

    /**
     * Execute transaction reversal.
     * Implements requirement 3.2: Transaction reversal execution.
     */
    @PostMapping("/reversals")
    public ResponseEntity<?> executeReversal(@Valid @RequestBody ReversalRequest request) {
        try {
            ReversalResponse response = automatedReversalService.executeReversal(request);
            return ResponseEntity.ok(response);
        } catch (ReversalException e) {
            return ResponseEntity.badRequest().body(Map.of(
                "error", "Reversal failed",
                "message", e.getMessage()
            ));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(Map.of(
                "error", "Internal server error",
                "message", "An unexpected error occurred during reversal"
            ));
        }
    }
}