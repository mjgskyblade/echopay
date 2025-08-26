package com.echopay.reversibility.controller;

import com.echopay.reversibility.dto.ArbitrationAssignmentRequest;
import com.echopay.reversibility.dto.ArbitrationCaseView;
import com.echopay.reversibility.dto.ArbitrationDecisionRequest;
import com.echopay.reversibility.model.FraudCase;
import com.echopay.reversibility.service.ArbitrationService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * REST controller for arbitration system endpoints.
 * Provides APIs for human arbitration workflow and case management.
 */
@RestController
@RequestMapping("/api/v1/arbitration")
@CrossOrigin(origins = "*")
public class ArbitrationController {

    private final ArbitrationService arbitrationService;

    @Autowired
    public ArbitrationController(ArbitrationService arbitrationService) {
        this.arbitrationService = arbitrationService;
    }

    /**
     * Assign a fraud case to an arbitrator.
     * POST /api/v1/arbitration/assign
     */
    @PostMapping("/assign")
    public ResponseEntity<FraudCase> assignCase(@Valid @RequestBody ArbitrationAssignmentRequest request) {
        try {
            FraudCase assignedCase = arbitrationService.assignCaseToArbitrator(request);
            return ResponseEntity.ok(assignedCase);
        } catch (IllegalStateException e) {
            return ResponseEntity.badRequest().build();
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    /**
     * Get detailed case view for arbitration.
     * GET /api/v1/arbitration/cases/{caseId}
     */
    @GetMapping("/cases/{caseId}")
    public ResponseEntity<ArbitrationCaseView> getCaseForArbitration(@PathVariable UUID caseId) {
        try {
            ArbitrationCaseView caseView = arbitrationService.getCaseForArbitration(caseId);
            return ResponseEntity.ok(caseView);
        } catch (Exception e) {
            return ResponseEntity.notFound().build();
        }
    }

    /**
     * Process arbitrator decision on a case.
     * POST /api/v1/arbitration/decide
     */
    @PostMapping("/decide")
    public ResponseEntity<FraudCase> processDecision(@Valid @RequestBody ArbitrationDecisionRequest request) {
        try {
            FraudCase resolvedCase = arbitrationService.processArbitrationDecision(request);
            return ResponseEntity.ok(resolvedCase);
        } catch (IllegalStateException e) {
            return ResponseEntity.badRequest().build();
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    /**
     * Get cases assigned to a specific arbitrator.
     * GET /api/v1/arbitration/arbitrators/{arbitratorId}/cases
     */
    @GetMapping("/arbitrators/{arbitratorId}/cases")
    public ResponseEntity<List<ArbitrationCaseView>> getCasesForArbitrator(@PathVariable UUID arbitratorId) {
        try {
            List<ArbitrationCaseView> cases = arbitrationService.getCasesForArbitrator(arbitratorId);
            return ResponseEntity.ok(cases);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    /**
     * Get unassigned cases that need arbitration.
     * GET /api/v1/arbitration/cases/unassigned
     */
    @GetMapping("/cases/unassigned")
    public ResponseEntity<List<ArbitrationCaseView>> getUnassignedCases() {
        try {
            List<ArbitrationCaseView> cases = arbitrationService.getUnassignedCases();
            return ResponseEntity.ok(cases);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    /**
     * Get arbitration system statistics.
     * GET /api/v1/arbitration/statistics
     */
    @GetMapping("/statistics")
    public ResponseEntity<Map<String, Object>> getStatistics() {
        try {
            Map<String, Object> stats = arbitrationService.getArbitrationStatistics();
            return ResponseEntity.ok(stats);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    /**
     * Health check endpoint for arbitration service.
     * GET /api/v1/arbitration/health
     */
    @GetMapping("/health")
    public ResponseEntity<Map<String, String>> healthCheck() {
        return ResponseEntity.ok(Map.of(
            "status", "healthy",
            "service", "arbitration",
            "timestamp", java.time.LocalDateTime.now().toString()
        ));
    }
}