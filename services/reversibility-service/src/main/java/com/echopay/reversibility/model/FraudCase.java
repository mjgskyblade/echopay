package com.echopay.reversibility.model;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.persistence.*;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import org.hibernate.annotations.Type;

import java.time.LocalDateTime;
import java.util.Map;
import java.util.UUID;

/**
 * FraudCase represents a fraud dispute case in the EchoPay system.
 * This model handles the complete lifecycle of fraud reports from initial
 * submission through investigation to final resolution.
 */
@Entity
@Table(name = "fraud_cases")
public class FraudCase {
    
    public enum Status {
        OPEN("open"),
        INVESTIGATING("investigating"), 
        RESOLVED("resolved"),
        CLOSED("closed");
        
        private final String value;
        
        Status(String value) {
            this.value = value;
        }
        
        public String getValue() {
            return value;
        }
        
        public static Status fromString(String value) {
            for (Status status : Status.values()) {
                if (status.value.equals(value)) {
                    return status;
                }
            }
            throw new IllegalArgumentException("Invalid status: " + value);
        }
    }
    
    public enum CaseType {
        UNAUTHORIZED_TRANSACTION("unauthorized_transaction"),
        ACCOUNT_TAKEOVER("account_takeover"),
        PHISHING("phishing"),
        SOCIAL_ENGINEERING("social_engineering"),
        TECHNICAL_FRAUD("technical_fraud");
        
        private final String value;
        
        CaseType(String value) {
            this.value = value;
        }
        
        public String getValue() {
            return value;
        }
        
        public static CaseType fromString(String value) {
            for (CaseType type : CaseType.values()) {
                if (type.value.equals(value)) {
                    return type;
                }
            }
            throw new IllegalArgumentException("Invalid case type: " + value);
        }
    }
    
    public enum Priority {
        LOW("low"),
        MEDIUM("medium"),
        HIGH("high"),
        CRITICAL("critical");
        
        private final String value;
        
        Priority(String value) {
            this.value = value;
        }
        
        public String getValue() {
            return value;
        }
        
        public static Priority fromString(String value) {
            for (Priority priority : Priority.values()) {
                if (priority.value.equals(value)) {
                    return priority;
                }
            }
            throw new IllegalArgumentException("Invalid priority: " + value);
        }
    }
    
    public enum Resolution {
        FRAUD_CONFIRMED("fraud_confirmed"),
        FRAUD_DENIED("fraud_denied"),
        INSUFFICIENT_EVIDENCE("insufficient_evidence");
        
        private final String value;
        
        Resolution(String value) {
            this.value = value;
        }
        
        public String getValue() {
            return value;
        }
        
        public static Resolution fromString(String value) {
            for (Resolution resolution : Resolution.values()) {
                if (resolution.value.equals(value)) {
                    return resolution;
                }
            }
            throw new IllegalArgumentException("Invalid resolution: " + value);
        }
    }
    
    @Id
    @JsonProperty("caseId")
    @NotNull
    @Column(name = "case_id")
    private UUID caseId;
    
    @JsonProperty("transactionId")
    @NotNull
    @Column(name = "transaction_id")
    private UUID transactionId;
    
    @JsonProperty("reporterId")
    @NotNull
    @Column(name = "reporter_id")
    private UUID reporterId;
    
    @JsonProperty("caseType")
    @NotNull
    @Enumerated(EnumType.STRING)
    @Column(name = "case_type")
    private CaseType caseType;
    
    @JsonProperty("status")
    @NotNull
    @Enumerated(EnumType.STRING)
    @Column(name = "status")
    private Status status;
    
    @JsonProperty("priority")
    @NotNull
    @Enumerated(EnumType.STRING)
    @Column(name = "priority")
    private Priority priority;
    
    @JsonProperty("createdAt")
    @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")
    @NotNull
    @Column(name = "created_at")
    private LocalDateTime createdAt;
    
    @JsonProperty("resolvedAt")
    @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")
    @Column(name = "resolved_at")
    private LocalDateTime resolvedAt;
    
    @JsonProperty("resolution")
    @Enumerated(EnumType.STRING)
    @Column(name = "resolution")
    private Resolution resolution;
    
    @JsonProperty("evidence")
    @Column(name = "evidence", columnDefinition = "jsonb")
    private Map<String, Object> evidence;
    
    @JsonProperty("assignedArbitratorId")
    @Column(name = "assigned_arbitrator_id")
    private UUID assignedArbitratorId;
    
    @JsonProperty("assignedAt")
    @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")
    @Column(name = "assigned_at")
    private LocalDateTime assignedAt;
    
    @JsonProperty("escalatedAt")
    @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")
    @Column(name = "escalated_at")
    private LocalDateTime escalatedAt;
    
    @JsonProperty("resolutionReasoning")
    @Column(name = "resolution_reasoning", columnDefinition = "text")
    private String resolutionReasoning;
    
    // Constructors
    public FraudCase() {
        this.caseId = UUID.randomUUID();
        this.status = Status.OPEN;
        this.createdAt = LocalDateTime.now();
    }
    
    public FraudCase(UUID transactionId, UUID reporterId, CaseType caseType, Priority priority) {
        this();
        this.transactionId = transactionId;
        this.reporterId = reporterId;
        this.caseType = caseType;
        this.priority = priority;
    }
    
    // State machine validation methods
    public boolean canTransitionTo(Status newStatus) {
        if (this.status == newStatus) {
            return false; // No transition needed
        }
        
        switch (this.status) {
            case OPEN:
                return newStatus == Status.INVESTIGATING || newStatus == Status.CLOSED;
            case INVESTIGATING:
                return newStatus == Status.RESOLVED || newStatus == Status.CLOSED;
            case RESOLVED:
                return newStatus == Status.CLOSED;
            case CLOSED:
                return false; // Terminal state
            default:
                return false;
        }
    }
    
    public void transitionTo(Status newStatus) {
        if (!canTransitionTo(newStatus)) {
            throw new IllegalStateException(
                String.format("Invalid state transition from %s to %s", this.status, newStatus)
            );
        }
        
        this.status = newStatus;
        
        if (newStatus == Status.RESOLVED && this.resolvedAt == null) {
            this.resolvedAt = LocalDateTime.now();
        }
    }
    
    public void resolve(Resolution resolution) {
        if (this.status != Status.INVESTIGATING) {
            throw new IllegalStateException("Can only resolve cases that are under investigation");
        }
        
        this.resolution = resolution;
        transitionTo(Status.RESOLVED);
    }
    
    public boolean isActive() {
        return this.status == Status.OPEN || this.status == Status.INVESTIGATING;
    }
    
    public boolean isResolved() {
        return this.status == Status.RESOLVED || this.status == Status.CLOSED;
    }
    
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
    
    public CaseType getCaseType() {
        return caseType;
    }
    
    public void setCaseType(CaseType caseType) {
        this.caseType = caseType;
    }
    
    public Status getStatus() {
        return status;
    }
    
    public void setStatus(Status status) {
        this.status = status;
    }
    
    public Priority getPriority() {
        return priority;
    }
    
    public void setPriority(Priority priority) {
        this.priority = priority;
    }
    
    public LocalDateTime getCreatedAt() {
        return createdAt;
    }
    
    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }
    
    public LocalDateTime getResolvedAt() {
        return resolvedAt;
    }
    
    public void setResolvedAt(LocalDateTime resolvedAt) {
        this.resolvedAt = resolvedAt;
    }
    
    public Resolution getResolution() {
        return resolution;
    }
    
    public void setResolution(Resolution resolution) {
        this.resolution = resolution;
    }
    
    public Map<String, Object> getEvidence() {
        return evidence;
    }
    
    public void setEvidence(Map<String, Object> evidence) {
        this.evidence = evidence;
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
    
    public LocalDateTime getEscalatedAt() {
        return escalatedAt;
    }
    
    public void setEscalatedAt(LocalDateTime escalatedAt) {
        this.escalatedAt = escalatedAt;
    }
    
    public String getResolutionReasoning() {
        return resolutionReasoning;
    }
    
    public void setResolutionReasoning(String resolutionReasoning) {
        this.resolutionReasoning = resolutionReasoning;
    }
    
    /**
     * Assign case to an arbitrator.
     */
    public void assignToArbitrator(UUID arbitratorId) {
        if (this.status != Status.INVESTIGATING) {
            throw new IllegalStateException("Can only assign cases that are under investigation");
        }
        
        this.assignedArbitratorId = arbitratorId;
        this.assignedAt = LocalDateTime.now();
    }
    
    /**
     * Mark case as escalated due to timeout.
     */
    public void escalate() {
        if (this.status != Status.INVESTIGATING) {
            throw new IllegalStateException("Can only escalate cases that are under investigation");
        }
        
        this.escalatedAt = LocalDateTime.now();
    }
    
    /**
     * Check if case is overdue (more than 72 hours since creation).
     */
    public boolean isOverdue() {
        return this.status == Status.INVESTIGATING && 
               this.createdAt.isBefore(LocalDateTime.now().minusHours(72));
    }
    
    /**
     * Check if case is assigned to an arbitrator.
     */
    public boolean isAssigned() {
        return this.assignedArbitratorId != null;
    }
    
    /**
     * Get time remaining for resolution (in hours).
     */
    public long getTimeRemainingHours() {
        if (this.status != Status.INVESTIGATING) {
            return 0;
        }
        
        LocalDateTime deadline = this.createdAt.plusHours(72);
        LocalDateTime now = LocalDateTime.now();
        
        if (now.isAfter(deadline)) {
            return 0; // Overdue
        }
        
        return java.time.Duration.between(now, deadline).toHours();
    }
    
    @Override
    public String toString() {
        return String.format(
            "FraudCase{caseId=%s, transactionId=%s, status=%s, caseType=%s, priority=%s}",
            caseId, transactionId, status, caseType, priority
        );
    }
    
    @Override
    public boolean equals(Object obj) {
        if (this == obj) return true;
        if (obj == null || getClass() != obj.getClass()) return false;
        
        FraudCase fraudCase = (FraudCase) obj;
        return caseId != null ? caseId.equals(fraudCase.caseId) : fraudCase.caseId == null;
    }
    
    @Override
    public int hashCode() {
        return caseId != null ? caseId.hashCode() : 0;
    }
}