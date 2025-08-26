package com.echopay.reversibility.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.UUID;

/**
 * Data Transfer Object for fraud report submission responses.
 */
public class FraudReportResponse {

    @JsonProperty("caseId")
    private UUID caseId;

    @JsonProperty("status")
    private String status;

    @JsonProperty("estimatedResolution")
    private String estimatedResolution;

    @JsonProperty("message")
    private String message;

    // Constructors
    public FraudReportResponse() {}

    public FraudReportResponse(UUID caseId, String status, String estimatedResolution, String message) {
        this.caseId = caseId;
        this.status = status;
        this.estimatedResolution = estimatedResolution;
        this.message = message;
    }

    // Getters and Setters
    public UUID getCaseId() {
        return caseId;
    }

    public void setCaseId(UUID caseId) {
        this.caseId = caseId;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getEstimatedResolution() {
        return estimatedResolution;
    }

    public void setEstimatedResolution(String estimatedResolution) {
        this.estimatedResolution = estimatedResolution;
    }

    public String getMessage() {
        return message;
    }

    public void setMessage(String message) {
        this.message = message;
    }

    @Override
    public String toString() {
        return String.format(
            "FraudReportResponse{caseId=%s, status='%s', estimatedResolution='%s'}",
            caseId, status, estimatedResolution
        );
    }
}