package com.echopay.reversibility.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Data Transfer Object for reversal responses.
 */
public class ReversalResponse {

    @JsonProperty("reversalId")
    private UUID reversalId;

    @JsonProperty("transactionId")
    private UUID transactionId;

    @JsonProperty("caseId")
    private UUID caseId;

    @JsonProperty("reversedAmount")
    private double reversedAmount;

    @JsonProperty("newTokenBatch")
    private UUID newTokenBatch;

    @JsonProperty("reversalTimestamp")
    @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")
    private LocalDateTime reversalTimestamp;

    @JsonProperty("message")
    private String message;

    // Constructors
    public ReversalResponse() {}

    public ReversalResponse(UUID reversalId, UUID transactionId, UUID caseId, 
                           double reversedAmount, UUID newTokenBatch, 
                           LocalDateTime reversalTimestamp, String message) {
        this.reversalId = reversalId;
        this.transactionId = transactionId;
        this.caseId = caseId;
        this.reversedAmount = reversedAmount;
        this.newTokenBatch = newTokenBatch;
        this.reversalTimestamp = reversalTimestamp;
        this.message = message;
    }

    // Getters and Setters
    public UUID getReversalId() {
        return reversalId;
    }

    public void setReversalId(UUID reversalId) {
        this.reversalId = reversalId;
    }

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

    public double getReversedAmount() {
        return reversedAmount;
    }

    public void setReversedAmount(double reversedAmount) {
        this.reversedAmount = reversedAmount;
    }

    public UUID getNewTokenBatch() {
        return newTokenBatch;
    }

    public void setNewTokenBatch(UUID newTokenBatch) {
        this.newTokenBatch = newTokenBatch;
    }

    public LocalDateTime getReversalTimestamp() {
        return reversalTimestamp;
    }

    public void setReversalTimestamp(LocalDateTime reversalTimestamp) {
        this.reversalTimestamp = reversalTimestamp;
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
            "ReversalResponse{reversalId=%s, transactionId=%s, reversedAmount=%.2f}",
            reversalId, transactionId, reversedAmount
        );
    }
}