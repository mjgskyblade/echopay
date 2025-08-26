package com.echopay.reversibility.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotNull;

import java.util.Map;
import java.util.UUID;

/**
 * Request DTO for arbitrator decision on a fraud case.
 */
public class ArbitrationDecisionRequest {
    
    @JsonProperty("caseId")
    @NotNull
    private UUID caseId;
    
    @JsonProperty("decision")
    @NotNull
    private String decision; // fraud_confirmed, fraud_denied, insufficient_evidence
    
    @JsonProperty("reasoning")
    @NotNull
    private String reasoning;
    
    @JsonProperty("additionalEvidence")
    private Map<String, Object> additionalEvidence;
    
    public ArbitrationDecisionRequest() {}
    
    public ArbitrationDecisionRequest(UUID caseId, String decision, String reasoning) {
        this.caseId = caseId;
        this.decision = decision;
        this.reasoning = reasoning;
    }
    
    public UUID getCaseId() {
        return caseId;
    }
    
    public void setCaseId(UUID caseId) {
        this.caseId = caseId;
    }
    
    public String getDecision() {
        return decision;
    }
    
    public void setDecision(String decision) {
        this.decision = decision;
    }
    
    public String getReasoning() {
        return reasoning;
    }
    
    public void setReasoning(String reasoning) {
        this.reasoning = reasoning;
    }
    
    public Map<String, Object> getAdditionalEvidence() {
        return additionalEvidence;
    }
    
    public void setAdditionalEvidence(Map<String, Object> additionalEvidence) {
        this.additionalEvidence = additionalEvidence;
    }
}