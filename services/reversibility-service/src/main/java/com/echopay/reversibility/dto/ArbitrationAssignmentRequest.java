package com.echopay.reversibility.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotNull;

import java.util.UUID;

/**
 * Request DTO for assigning a fraud case to an arbitrator.
 */
public class ArbitrationAssignmentRequest {
    
    @JsonProperty("caseId")
    @NotNull
    private UUID caseId;
    
    @JsonProperty("arbitratorId")
    @NotNull
    private UUID arbitratorId;
    
    @JsonProperty("notes")
    private String notes;
    
    public ArbitrationAssignmentRequest() {}
    
    public ArbitrationAssignmentRequest(UUID caseId, UUID arbitratorId, String notes) {
        this.caseId = caseId;
        this.arbitratorId = arbitratorId;
        this.notes = notes;
    }
    
    public UUID getCaseId() {
        return caseId;
    }
    
    public void setCaseId(UUID caseId) {
        this.caseId = caseId;
    }
    
    public UUID getArbitratorId() {
        return arbitratorId;
    }
    
    public void setArbitratorId(UUID arbitratorId) {
        this.arbitratorId = arbitratorId;
    }
    
    public String getNotes() {
        return notes;
    }
    
    public void setNotes(String notes) {
        this.notes = notes;
    }
}