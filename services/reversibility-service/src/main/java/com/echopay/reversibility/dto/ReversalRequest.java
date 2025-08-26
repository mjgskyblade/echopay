package com.echopay.reversibility.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotNull;

import java.util.UUID;

/**
 * Data Transfer Object for reversal requests.
 */
public class ReversalRequest {

    public enum ReversalType {
        AUTOMATED_FRAUD("automated_fraud"),
        MANUAL_ARBITRATION("manual_arbitration"),
        USER_REQUESTED("user_requested");

        private final String value;

        ReversalType(String value) {
            this.value = value;
        }

        public String getValue() {
            return value;
        }

        @Override
        public String toString() {
            return value;
        }
    }

    @JsonProperty("transactionId")
    @NotNull(message = "Transaction ID is required")
    private UUID transactionId;

    @JsonProperty("caseId")
    @NotNull(message = "Case ID is required")
    private UUID caseId;

    @JsonProperty("reason")
    @NotNull(message = "Reason is required")
    private String reason;

    @JsonProperty("reversalType")
    @NotNull(message = "Reversal type is required")
    private ReversalType reversalType;

    // Constructors
    public ReversalRequest() {}

    public ReversalRequest(UUID transactionId, UUID caseId, String reason, ReversalType reversalType) {
        this.transactionId = transactionId;
        this.caseId = caseId;
        this.reason = reason;
        this.reversalType = reversalType;
    }

    // Getters and Setters
    public UUID getTransactionId() {
        return transactionId;
    }

    public void setTransactionId(UUID transactionId) {
        this.transactionId = transactionId;
    }

    public UUID getCaseId() {
        return caseId;
    }

    public void setCaseId(UUID caseId) {
        this.caseId = caseId;
    }

    public String getReason() {
        return reason;
    }

    public void setReason(String reason) {
        this.reason = reason;
    }

    public ReversalType getReversalType() {
        return reversalType;
    }

    public void setReversalType(ReversalType reversalType) {
        this.reversalType = reversalType;
    }

    @Override
    public String toString() {
        return String.format(
            "ReversalRequest{transactionId=%s, caseId=%s, reversalType=%s}",
            transactionId, caseId, reversalType
        );
    }
}