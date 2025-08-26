package com.echopay.reversibility.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.Size;

import java.util.List;

/**
 * Data Transfer Object for evidence data in fraud reports.
 */
public class EvidenceData {

    @JsonProperty("screenshots")
    private List<String> screenshots;

    @JsonProperty("additionalInfo")
    @Size(max = 1000, message = "Additional info cannot exceed 1000 characters")
    private String additionalInfo;

    // Constructors
    public EvidenceData() {}

    public EvidenceData(List<String> screenshots, String additionalInfo) {
        this.screenshots = screenshots;
        this.additionalInfo = additionalInfo;
    }

    // Getters and Setters
    public List<String> getScreenshots() {
        return screenshots;
    }

    public void setScreenshots(List<String> screenshots) {
        this.screenshots = screenshots;
    }

    public String getAdditionalInfo() {
        return additionalInfo;
    }

    public void setAdditionalInfo(String additionalInfo) {
        this.additionalInfo = additionalInfo;
    }

    @Override
    public String toString() {
        return String.format(
            "EvidenceData{screenshots=%d items, additionalInfo='%s'}",
            screenshots != null ? screenshots.size() : 0,
            additionalInfo != null ? additionalInfo.substring(0, Math.min(50, additionalInfo.length())) : "null"
        );
    }
}