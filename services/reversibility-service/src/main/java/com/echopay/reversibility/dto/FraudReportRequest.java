package com.echopay.reversibility.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.UUID;

/**
 * Data Transfer Object for fraud report submission requests.
 */
public class FraudReportRequest {

    @JsonProperty("transactionId")
    @NotNull(message = "Transaction ID is required")
    private UUID transactionId;

    @JsonProperty("reporterId")
    @NotNull(message = "Reporter ID is required")
    private UUID reporterId;

    @JsonProperty("fraudType")
    @NotNull(message = "Fraud type is required")
    private String fraudType;

    @JsonProperty("description")
    @NotNull(message = "Description is required")
    @Size(min = 10, max = 2000, message = "Description must be between 10 and 2000 characters")
    private String description;

    @JsonProperty("evidence")
    private EvidenceData evidence;

    // Constructors
    public FraudReportRequest() {}

    public FraudReportRequest(UUID transactionId, UUID reporterId, String fraudType, String description) {
        this.transactionId = transactionId;
        this.reporterId = reporterId;
        this.fraudType = fraudType;
        this.description = description;
    }

    // Getters and Setters
    public UUID getTransactionId() {
        return transactionId;
    }

    public void setTransactionId(UUID transactionId) {
        this.transactionId = transactionId;
    }

    public UUID getReporterId() {
        return reporterId;
    }

    public void setReporterId(UUID reporterId) {
        this.reporterId = reporterId;
    }

    public String getFraudType() {
        return fraudType;
    }

    public void setFraudType(String fraudType) {
        this.fraudType = fraudType;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public EvidenceData getEvidence() {
        return evidence;
    }

    public void setEvidence(EvidenceData evidence) {
        this.evidence = evidence;
    }

    @Override
    public String toString() {
        return String.format(
            "FraudReportRequest{transactionId=%s, reporterId=%s, fraudType='%s'}",
            transactionId, reporterId, fraudType
        );
    }
}