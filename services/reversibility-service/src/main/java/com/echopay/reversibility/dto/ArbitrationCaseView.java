package com.echopay.reversibility.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.time.LocalDateTime;
import java.util.Map;
import java.util.UUID;

/**
 * DTO for presenting fraud case information to arbitrators with transaction context.
 */
public class ArbitrationCaseView {
    
    @JsonProperty("caseId")
    private UUID caseId;
    
    @JsonProperty("transactionId")
    private UUID transactionId;
    
    @JsonProperty("reporterId")
    private UUID reporterId;
    
    @JsonProperty("caseType")
    private String caseType;
    
    @JsonProperty("priority")
    private String priority;
    
    @JsonProperty("status")
    private String status;
    
    @JsonProperty("createdAt")
    @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")
    private LocalDateTime createdAt;
    
    @JsonProperty("assignedArbitratorId")
    private UUID assignedArbitratorId;
    
    @JsonProperty("assignedAt")
    @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")
    private LocalDateTime assignedAt;
    
    @JsonProperty("timeRemaining")
    private String timeRemaining;
    
    @JsonProperty("evidence")
    private Map<String, Object> evidence;
    
    @JsonProperty("transactionContext")
    private TransactionContext transactionContext;
    
    @JsonProperty("userBehaviorAnalysis")
    private Map<String, Object> userBehaviorAnalysis;
    
    @JsonProperty("fraudRiskScore")
    private Double fraudRiskScore;
    
    public ArbitrationCaseView() {}
    
    // Getters and Setters
    public UUID getCaseId() {
        return caseId;
    }
    
    public void setCaseId(UUID caseId) {
        this.caseId = caseId;
    }
    
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
    
    public String getCaseType() {
        return caseType;
    }
    
    public void setCaseType(String caseType) {
        this.caseType = caseType;
    }
    
    public String getPriority() {
        return priority;
    }
    
    public void setPriority(String priority) {
        this.priority = priority;
    }
    
    public String getStatus() {
        return status;
    }
    
    public void setStatus(String status) {
        this.status = status;
    }
    
    public LocalDateTime getCreatedAt() {
        return createdAt;
    }
    
    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }
    
    public UUID getAssignedArbitratorId() {
        return assignedArbitratorId;
    }
    
    public void setAssignedArbitratorId(UUID assignedArbitratorId) {
        this.assignedArbitratorId = assignedArbitratorId;
    }
    
    public LocalDateTime getAssignedAt() {
        return assignedAt;
    }
    
    public void setAssignedAt(LocalDateTime assignedAt) {
        this.assignedAt = assignedAt;
    }
    
    public String getTimeRemaining() {
        return timeRemaining;
    }
    
    public void setTimeRemaining(String timeRemaining) {
        this.timeRemaining = timeRemaining;
    }
    
    public Map<String, Object> getEvidence() {
        return evidence;
    }
    
    public void setEvidence(Map<String, Object> evidence) {
        this.evidence = evidence;
    }
    
    public TransactionContext getTransactionContext() {
        return transactionContext;
    }
    
    public void setTransactionContext(TransactionContext transactionContext) {
        this.transactionContext = transactionContext;
    }
    
    public Map<String, Object> getUserBehaviorAnalysis() {
        return userBehaviorAnalysis;
    }
    
    public void setUserBehaviorAnalysis(Map<String, Object> userBehaviorAnalysis) {
        this.userBehaviorAnalysis = userBehaviorAnalysis;
    }
    
    public Double getFraudRiskScore() {
        return fraudRiskScore;
    }
    
    public void setFraudRiskScore(Double fraudRiskScore) {
        this.fraudRiskScore = fraudRiskScore;
    }
    
    /**
     * Nested class for transaction context information.
     */
    public static class TransactionContext {
        @JsonProperty("amount")
        private Double amount;
        
        @JsonProperty("currency")
        private String currency;
        
        @JsonProperty("timestamp")
        @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")
        private LocalDateTime timestamp;
        
        @JsonProperty("fromWallet")
        private String fromWallet;
        
        @JsonProperty("toWallet")
        private String toWallet;
        
        @JsonProperty("deviceInfo")
        private Map<String, Object> deviceInfo;
        
        @JsonProperty("locationInfo")
        private Map<String, Object> locationInfo;
        
        @JsonProperty("relatedTransactions")
        private java.util.List<Map<String, Object>> relatedTransactions;
        
        public TransactionContext() {}
        
        // Getters and Setters
        public Double getAmount() {
            return amount;
        }
        
        public void setAmount(Double amount) {
            this.amount = amount;
        }
        
        public String getCurrency() {
            return currency;
        }
        
        public void setCurrency(String currency) {
            this.currency = currency;
        }
        
        public LocalDateTime getTimestamp() {
            return timestamp;
        }
        
        public void setTimestamp(LocalDateTime timestamp) {
            this.timestamp = timestamp;
        }
        
        public String getFromWallet() {
            return fromWallet;
        }
        
        public void setFromWallet(String fromWallet) {
            this.fromWallet = fromWallet;
        }
        
        public String getToWallet() {
            return toWallet;
        }
        
        public void setToWallet(String toWallet) {
            this.toWallet = toWallet;
        }
        
        public Map<String, Object> getDeviceInfo() {
            return deviceInfo;
        }
        
        public void setDeviceInfo(Map<String, Object> deviceInfo) {
            this.deviceInfo = deviceInfo;
        }
        
        public Map<String, Object> getLocationInfo() {
            return locationInfo;
        }
        
        public void setLocationInfo(Map<String, Object> locationInfo) {
            this.locationInfo = locationInfo;
        }
        
        public java.util.List<Map<String, Object>> getRelatedTransactions() {
            return relatedTransactions;
        }
        
        public void setRelatedTransactions(java.util.List<Map<String, Object>> relatedTransactions) {
            this.relatedTransactions = relatedTransactions;
        }
    }
}