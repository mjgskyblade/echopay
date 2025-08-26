const logger = require('../utils/logger');

class HumanitarianFraudDetection {
  constructor() {
    this.fraudPatterns = {
      // Patterns specific to humanitarian aid fraud
      duplicateRecipient: {
        weight: 0.8,
        description: 'Same recipient receiving aid multiple times'
      },
      unusualDistributionPattern: {
        weight: 0.6,
        description: 'Distribution pattern inconsistent with organization history'
      },
      locationMismatch: {
        weight: 0.7,
        description: 'Distribution location inconsistent with declared operations'
      },
      amountAnomaly: {
        weight: 0.5,
        description: 'Distribution amount significantly different from typical amounts'
      },
      rapidSuccessiveDistributions: {
        weight: 0.6,
        description: 'Multiple distributions to same area in short time period'
      },
      unverifiedOrganization: {
        weight: 0.9,
        description: 'Distribution from unverified humanitarian organization'
      },
      lowTransparencyScore: {
        weight: 0.4,
        description: 'Distribution has unusually low transparency score'
      }
    };

    this.contextualFactors = {
      emergencyResponse: {
        modifier: -0.2, // Reduce fraud score during emergencies
        description: 'Emergency response context allows for faster distributions'
      },
      establishedOrganization: {
        modifier: -0.3,
        description: 'Well-established organization with good track record'
      },
      highTransparencyLevel: {
        modifier: -0.2,
        description: 'Organization operates with enhanced transparency'
      },
      thirdPartyVerification: {
        modifier: -0.3,
        description: 'Distribution verified by third party'
      }
    };
  }

  /**
   * Analyze humanitarian aid distribution for fraud patterns
   */
  async analyzeDistribution(distribution, organizationData, historicalData = []) {
    const analysis = {
      distributionId: distribution.id,
      organizationId: distribution.organizationId,
      riskScore: 0,
      detectedPatterns: [],
      contextualFactors: [],
      recommendations: [],
      analysisTimestamp: new Date()
    };

    try {
      // Check for fraud patterns
      await this.checkDuplicateRecipient(distribution, historicalData, analysis);
      await this.checkDistributionPattern(distribution, organizationData, historicalData, analysis);
      await this.checkLocationConsistency(distribution, organizationData, analysis);
      await this.checkAmountAnomaly(distribution, historicalData, analysis);
      await this.checkRapidDistributions(distribution, historicalData, analysis);
      await this.checkOrganizationVerification(organizationData, analysis);
      await this.checkTransparencyScore(distribution, analysis);

      // Apply contextual factors
      await this.applyContextualFactors(distribution, organizationData, analysis);

      // Generate recommendations
      this.generateRecommendations(analysis);

      // Ensure risk score is between 0 and 1
      analysis.riskScore = Math.max(0, Math.min(1, analysis.riskScore));

      logger.info('Humanitarian fraud analysis completed', {
        distributionId: distribution.id,
        riskScore: analysis.riskScore,
        patternsDetected: analysis.detectedPatterns.length
      });

      return analysis;

    } catch (error) {
      logger.error('Error in humanitarian fraud analysis', {
        distributionId: distribution.id,
        error: error.message
      });
      
      // Return safe default analysis
      analysis.riskScore = 0.5; // Medium risk when analysis fails
      analysis.recommendations.push('Manual review required due to analysis error');
      return analysis;
    }
  }

  /**
   * Check for duplicate recipient fraud
   */
  async checkDuplicateRecipient(distribution, historicalData, analysis) {
    if (!distribution.recipientId) return;

    const recentDistributions = historicalData.filter(d => 
      d.recipientId === distribution.recipientId &&
      d.id !== distribution.id &&
      this.isWithinTimeWindow(d.createdAt, 30) // 30 days
    );

    if (recentDistributions.length > 0) {
      const pattern = this.fraudPatterns.duplicateRecipient;
      analysis.riskScore += pattern.weight;
      analysis.detectedPatterns.push({
        type: 'duplicateRecipient',
        description: pattern.description,
        severity: 'high',
        details: {
          duplicateCount: recentDistributions.length,
          recentDistributions: recentDistributions.map(d => ({
            id: d.id,
            amount: d.amount,
            date: d.createdAt
          }))
        }
      });
    }
  }

  /**
   * Check distribution pattern consistency
   */
  async checkDistributionPattern(distribution, organizationData, historicalData, analysis) {
    const orgDistributions = historicalData.filter(d => 
      d.organizationId === distribution.organizationId &&
      this.isWithinTimeWindow(d.createdAt, 90) // 90 days
    );

    if (orgDistributions.length < 5) return; // Need sufficient history

    // Check category consistency
    const categoryFrequency = {};
    orgDistributions.forEach(d => {
      categoryFrequency[d.category] = (categoryFrequency[d.category] || 0) + 1;
    });

    const totalDistributions = orgDistributions.length;
    const currentCategoryFreq = categoryFrequency[distribution.category] || 0;
    const categoryPercentage = currentCategoryFreq / totalDistributions;

    // Flag if current category is very unusual for this organization
    if (categoryPercentage < 0.1 && currentCategoryFreq < 2) {
      const pattern = this.fraudPatterns.unusualDistributionPattern;
      analysis.riskScore += pattern.weight * 0.5; // Reduced weight for category mismatch
      analysis.detectedPatterns.push({
        type: 'unusualDistributionPattern',
        description: 'Distribution category unusual for this organization',
        severity: 'medium',
        details: {
          currentCategory: distribution.category,
          organizationCategoryHistory: categoryFrequency
        }
      });
    }
  }

  /**
   * Check location consistency
   */
  async checkLocationConsistency(distribution, organizationData, analysis) {
    if (!distribution.location || !organizationData.publicProfile.operatingRegions) return;

    const operatingRegions = organizationData.publicProfile.operatingRegions || [];
    const distributionLocation = distribution.location.toLowerCase();

    const isInOperatingRegion = operatingRegions.some(region => 
      distributionLocation.includes(region.toLowerCase()) ||
      region.toLowerCase().includes(distributionLocation)
    );

    if (!isInOperatingRegion && operatingRegions.length > 0) {
      const pattern = this.fraudPatterns.locationMismatch;
      analysis.riskScore += pattern.weight;
      analysis.detectedPatterns.push({
        type: 'locationMismatch',
        description: pattern.description,
        severity: 'high',
        details: {
          distributionLocation: distribution.location,
          declaredOperatingRegions: operatingRegions
        }
      });
    }
  }

  /**
   * Check for amount anomalies
   */
  async checkAmountAnomaly(distribution, historicalData, analysis) {
    const similarDistributions = historicalData.filter(d => 
      d.organizationId === distribution.organizationId &&
      d.category === distribution.category &&
      this.isWithinTimeWindow(d.createdAt, 180) // 6 months
    );

    if (similarDistributions.length < 3) return;

    const amounts = similarDistributions.map(d => d.amount);
    const mean = amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length;
    const stdDev = Math.sqrt(
      amounts.reduce((sum, amount) => sum + Math.pow(amount - mean, 2), 0) / amounts.length
    );

    // Flag if amount is more than 3 standard deviations from mean
    const zScore = Math.abs((distribution.amount - mean) / stdDev);
    if (zScore > 3) {
      const pattern = this.fraudPatterns.amountAnomaly;
      analysis.riskScore += pattern.weight * Math.min(zScore / 3, 1);
      analysis.detectedPatterns.push({
        type: 'amountAnomaly',
        description: pattern.description,
        severity: zScore > 5 ? 'high' : 'medium',
        details: {
          distributionAmount: distribution.amount,
          historicalMean: Math.round(mean),
          standardDeviation: Math.round(stdDev),
          zScore: Math.round(zScore * 100) / 100
        }
      });
    }
  }

  /**
   * Check for rapid successive distributions
   */
  async checkRapidDistributions(distribution, historicalData, analysis) {
    if (!distribution.location) return;

    const recentNearbyDistributions = historicalData.filter(d => 
      d.organizationId === distribution.organizationId &&
      d.location === distribution.location &&
      d.id !== distribution.id &&
      this.isWithinTimeWindow(d.createdAt, 7) // 7 days
    );

    if (recentNearbyDistributions.length >= 3) {
      const pattern = this.fraudPatterns.rapidSuccessiveDistributions;
      analysis.riskScore += pattern.weight;
      analysis.detectedPatterns.push({
        type: 'rapidSuccessiveDistributions',
        description: pattern.description,
        severity: 'medium',
        details: {
          location: distribution.location,
          recentDistributionCount: recentNearbyDistributions.length,
          timeWindow: '7 days'
        }
      });
    }
  }

  /**
   * Check organization verification status
   */
  async checkOrganizationVerification(organizationData, analysis) {
    if (!organizationData.isVerified()) {
      const pattern = this.fraudPatterns.unverifiedOrganization;
      analysis.riskScore += pattern.weight;
      analysis.detectedPatterns.push({
        type: 'unverifiedOrganization',
        description: pattern.description,
        severity: 'high',
        details: {
          verificationStatus: organizationData.verificationStatus,
          organizationType: organizationData.organizationType
        }
      });
    }
  }

  /**
   * Check transparency score
   */
  async checkTransparencyScore(distribution, analysis) {
    const transparencyScore = distribution.getTransparencyScore();
    
    if (transparencyScore < 40) {
      const pattern = this.fraudPatterns.lowTransparencyScore;
      const scoreMultiplier = (40 - transparencyScore) / 40;
      analysis.riskScore += pattern.weight * scoreMultiplier;
      analysis.detectedPatterns.push({
        type: 'lowTransparencyScore',
        description: pattern.description,
        severity: transparencyScore < 20 ? 'high' : 'medium',
        details: {
          transparencyScore,
          threshold: 40
        }
      });
    }
  }

  /**
   * Apply contextual factors that may reduce fraud risk
   */
  async applyContextualFactors(distribution, organizationData, analysis) {
    // Emergency response context
    if (distribution.category === 'emergency') {
      const factor = this.contextualFactors.emergencyResponse;
      analysis.riskScore += factor.modifier;
      analysis.contextualFactors.push({
        type: 'emergencyResponse',
        description: factor.description,
        impact: factor.modifier
      });
    }

    // Established organization
    if (organizationData.isVerified() && organizationData.organizationType === 'un_agency') {
      const factor = this.contextualFactors.establishedOrganization;
      analysis.riskScore += factor.modifier;
      analysis.contextualFactors.push({
        type: 'establishedOrganization',
        description: factor.description,
        impact: factor.modifier
      });
    }

    // High transparency level
    if (organizationData.requiresEnhancedTransparency()) {
      const factor = this.contextualFactors.highTransparencyLevel;
      analysis.riskScore += factor.modifier;
      analysis.contextualFactors.push({
        type: 'highTransparencyLevel',
        description: factor.description,
        impact: factor.modifier
      });
    }

    // Third party verification
    if (distribution.verificationData.thirdPartyVerified) {
      const factor = this.contextualFactors.thirdPartyVerification;
      analysis.riskScore += factor.modifier;
      analysis.contextualFactors.push({
        type: 'thirdPartyVerification',
        description: factor.description,
        impact: factor.modifier
      });
    }
  }

  /**
   * Generate recommendations based on analysis
   */
  generateRecommendations(analysis) {
    if (analysis.riskScore > 0.8) {
      analysis.recommendations.push('HIGH RISK: Block distribution and require manual investigation');
      analysis.recommendations.push('Verify organization credentials and distribution details');
    } else if (analysis.riskScore > 0.6) {
      analysis.recommendations.push('MEDIUM RISK: Flag for enhanced monitoring');
      analysis.recommendations.push('Request additional transparency documentation');
    } else if (analysis.riskScore > 0.4) {
      analysis.recommendations.push('LOW RISK: Monitor for patterns');
    } else {
      analysis.recommendations.push('MINIMAL RISK: Proceed with standard monitoring');
    }

    // Specific recommendations based on detected patterns
    analysis.detectedPatterns.forEach(pattern => {
      switch (pattern.type) {
        case 'duplicateRecipient':
          analysis.recommendations.push('Verify recipient identity and need for additional aid');
          break;
        case 'locationMismatch':
          analysis.recommendations.push('Confirm organization authorization to operate in this location');
          break;
        case 'unverifiedOrganization':
          analysis.recommendations.push('Complete organization verification before processing');
          break;
        case 'lowTransparencyScore':
          analysis.recommendations.push('Request additional transparency documentation');
          break;
      }
    });
  }

  /**
   * Check if date is within specified time window (days)
   */
  isWithinTimeWindow(date, days) {
    const now = new Date();
    const targetDate = new Date(date);
    const diffTime = Math.abs(now - targetDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays <= days;
  }

  /**
   * Get fraud detection statistics for an organization
   */
  getOrganizationFraudStats(analyses) {
    const stats = {
      totalAnalyses: analyses.length,
      averageRiskScore: 0,
      highRiskCount: 0,
      mediumRiskCount: 0,
      lowRiskCount: 0,
      commonPatterns: {},
      riskTrend: 'stable'
    };

    if (analyses.length === 0) return stats;

    let totalRiskScore = 0;
    const patternCounts = {};

    analyses.forEach(analysis => {
      totalRiskScore += analysis.riskScore;

      if (analysis.riskScore > 0.6) stats.highRiskCount++;
      else if (analysis.riskScore > 0.3) stats.mediumRiskCount++;
      else stats.lowRiskCount++;

      analysis.detectedPatterns.forEach(pattern => {
        patternCounts[pattern.type] = (patternCounts[pattern.type] || 0) + 1;
      });
    });

    stats.averageRiskScore = Math.round((totalRiskScore / analyses.length) * 100) / 100;
    stats.commonPatterns = patternCounts;

    return stats;
  }

  /**
   * Update fraud detection patterns based on confirmed fraud cases
   * Implements requirement 2.6: Update ML models to prevent similar future attacks
   */
  updateFraudPatterns(confirmedFraudCase, distributionData) {
    const patternUpdate = {
      caseId: confirmedFraudCase.id,
      updateTimestamp: new Date(),
      patternType: this.identifyFraudPatternType(confirmedFraudCase, distributionData),
      updatedWeights: {},
      newPatterns: []
    };

    try {
      // Analyze the confirmed fraud case to identify patterns
      const fraudCharacteristics = this.extractFraudCharacteristics(
        confirmedFraudCase, 
        distributionData
      );

      // Update existing pattern weights based on confirmed fraud
      this.adjustPatternWeights(fraudCharacteristics, patternUpdate);

      // Identify new patterns if this is a novel fraud type
      this.identifyNewPatterns(fraudCharacteristics, patternUpdate);

      logger.info('Fraud patterns updated based on confirmed case', {
        caseId: confirmedFraudCase.id,
        patternType: patternUpdate.patternType,
        updatedWeights: Object.keys(patternUpdate.updatedWeights).length,
        newPatterns: patternUpdate.newPatterns.length
      });

      return patternUpdate;

    } catch (error) {
      logger.error('Error updating fraud patterns', {
        caseId: confirmedFraudCase.id,
        error: error.message
      });
      return patternUpdate;
    }
  }

  /**
   * Extract fraud characteristics without storing personal data
   * Implements requirement 7.2: Analyze patterns without storing personal behavioral data
   */
  extractFraudCharacteristics(fraudCase, distributionData) {
    // Extract only non-personal pattern characteristics
    const characteristics = {
      amountRange: this.categorizeAmount(distributionData.amount),
      locationPattern: this.categorizeLocation(distributionData.location),
      categoryPattern: distributionData.category,
      timingPattern: this.categorizeTimingPattern(distributionData.createdAt),
      organizationTypePattern: fraudCase.organizationType,
      transparencyScoreRange: this.categorizeTransparencyScore(
        distributionData.getTransparencyScore()
      ),
      verificationPattern: this.categorizeVerificationLevel(distributionData.verificationData),
      distributionMethodPattern: distributionData.distributionMethod,
      fraudType: fraudCase.fraudType || 'unknown'
    };

    return characteristics;
  }

  /**
   * Categorize amount into ranges to avoid storing exact personal transaction data
   */
  categorizeAmount(amount) {
    if (amount < 100) return 'micro';
    if (amount < 1000) return 'small';
    if (amount < 10000) return 'medium';
    if (amount < 100000) return 'large';
    return 'very_large';
  }

  /**
   * Categorize location into regions to avoid storing exact personal location data
   */
  categorizeLocation(location) {
    if (!location) return 'unknown';
    
    // Simple region categorization (in real implementation, use proper geocoding)
    const locationLower = location.toLowerCase();
    
    if (locationLower.includes('haiti') || locationLower.includes('dominican')) {
      return 'caribbean';
    }
    if (locationLower.includes('syria') || locationLower.includes('jordan') || 
        locationLower.includes('lebanon')) {
      return 'middle_east';
    }
    if (locationLower.includes('africa')) {
      return 'africa';
    }
    if (locationLower.includes('asia')) {
      return 'asia';
    }
    
    return 'other';
  }

  /**
   * Categorize timing patterns without storing exact timestamps
   */
  categorizeTimingPattern(timestamp) {
    const hour = new Date(timestamp).getHours();
    const dayOfWeek = new Date(timestamp).getDay();
    
    let timeCategory = 'business_hours';
    if (hour < 6 || hour > 22) timeCategory = 'off_hours';
    if (hour >= 22 || hour < 2) timeCategory = 'late_night';
    
    let dayCategory = 'weekday';
    if (dayOfWeek === 0 || dayOfWeek === 6) dayCategory = 'weekend';
    
    return `${timeCategory}_${dayCategory}`;
  }

  /**
   * Categorize transparency score into ranges
   */
  categorizeTransparencyScore(score) {
    if (score < 20) return 'very_low';
    if (score < 40) return 'low';
    if (score < 60) return 'medium';
    if (score < 80) return 'high';
    return 'very_high';
  }

  /**
   * Categorize verification level
   */
  categorizeVerificationLevel(verificationData) {
    const verificationCount = Object.keys(verificationData).filter(
      key => verificationData[key]
    ).length;
    
    if (verificationCount === 0) return 'none';
    if (verificationCount === 1) return 'basic';
    if (verificationCount <= 3) return 'standard';
    return 'comprehensive';
  }

  /**
   * Identify the primary fraud pattern type from a confirmed case
   */
  identifyFraudPatternType(fraudCase, distributionData) {
    // Analyze the case to determine the primary fraud pattern
    if (fraudCase.fraudType) {
      return fraudCase.fraudType;
    }

    // Infer from case characteristics
    if (fraudCase.description && fraudCase.description.includes('duplicate')) {
      return 'duplicateRecipient';
    }
    if (fraudCase.description && fraudCase.description.includes('location')) {
      return 'locationMismatch';
    }
    if (fraudCase.description && fraudCase.description.includes('amount')) {
      return 'amountAnomaly';
    }
    if (fraudCase.description && fraudCase.description.includes('organization')) {
      return 'unverifiedOrganization';
    }

    return 'unknown';
  }

  /**
   * Adjust existing pattern weights based on confirmed fraud
   */
  adjustPatternWeights(characteristics, patternUpdate) {
    // Increase weights for patterns that should have caught this fraud
    Object.keys(this.fraudPatterns).forEach(patternType => {
      const shouldHaveDetected = this.shouldPatternHaveDetected(
        patternType, 
        characteristics
      );
      
      if (shouldHaveDetected) {
        const currentWeight = this.fraudPatterns[patternType].weight;
        const adjustment = Math.min(0.1, (1.0 - currentWeight) * 0.2); // Max 10% increase
        const newWeight = Math.min(1.0, currentWeight + adjustment);
        
        this.fraudPatterns[patternType].weight = newWeight;
        patternUpdate.updatedWeights[patternType] = {
          oldWeight: currentWeight,
          newWeight: newWeight,
          adjustment: adjustment
        };
      }
    });
  }

  /**
   * Determine if a pattern should have detected the fraud
   */
  shouldPatternHaveDetected(patternType, characteristics) {
    switch (patternType) {
      case 'duplicateRecipient':
        return characteristics.fraudType === 'duplicate_recipient';
      
      case 'locationMismatch':
        return characteristics.fraudType === 'location_fraud' ||
               characteristics.locationPattern === 'unknown';
      
      case 'amountAnomaly':
        return characteristics.fraudType === 'amount_fraud' ||
               characteristics.amountRange === 'very_large';
      
      case 'unverifiedOrganization':
        return characteristics.organizationTypePattern === 'unverified';
      
      case 'lowTransparencyScore':
        return characteristics.transparencyScoreRange === 'very_low' ||
               characteristics.transparencyScoreRange === 'low';
      
      case 'rapidSuccessiveDistributions':
        return characteristics.fraudType === 'rapid_distribution';
      
      default:
        return false;
    }
  }

  /**
   * Identify new fraud patterns from confirmed cases
   */
  identifyNewPatterns(characteristics, patternUpdate) {
    // Look for novel combinations of characteristics that might indicate new fraud types
    const novelPatterns = [];

    // Check for new timing-based patterns
    if (characteristics.timingPattern === 'late_night_weekend' && 
        characteristics.verificationPattern === 'none') {
      novelPatterns.push({
        type: 'suspiciousTimingLowVerification',
        weight: 0.3,
        description: 'Distribution at unusual time with low verification',
        characteristics: {
          timing: characteristics.timingPattern,
          verification: characteristics.verificationPattern
        }
      });
    }

    // Check for new location-amount combinations
    if (characteristics.locationPattern === 'other' && 
        characteristics.amountRange === 'very_large') {
      novelPatterns.push({
        type: 'unknownLocationLargeAmount',
        weight: 0.4,
        description: 'Large distribution in unrecognized location pattern',
        characteristics: {
          location: characteristics.locationPattern,
          amount: characteristics.amountRange
        }
      });
    }

    // Check for new transparency-verification combinations
    if (characteristics.transparencyScoreRange === 'very_low' && 
        characteristics.verificationPattern === 'comprehensive') {
      novelPatterns.push({
        type: 'lowTransparencyHighVerification',
        weight: 0.2,
        description: 'Inconsistent transparency and verification levels',
        characteristics: {
          transparency: characteristics.transparencyScoreRange,
          verification: characteristics.verificationPattern
        }
      });
    }

    patternUpdate.newPatterns = novelPatterns;

    // Add new patterns to the fraud patterns (in a real system, this would be more sophisticated)
    novelPatterns.forEach(pattern => {
      if (!this.fraudPatterns[pattern.type]) {
        this.fraudPatterns[pattern.type] = {
          weight: pattern.weight,
          description: pattern.description
        };
      }
    });
  }

  /**
   * Generate privacy-preserving fraud analytics
   * Implements requirement 7.2: Analyze patterns without storing personal behavioral data
   */
  generatePrivacyPreservingAnalytics(analyses) {
    const analytics = {
      totalAnalyses: analyses.length,
      patternDistribution: {},
      riskScoreDistribution: {
        'low': 0,
        'medium': 0,
        'high': 0
      },
      temporalPatterns: {},
      geographicPatterns: {},
      organizationalPatterns: {},
      generatedAt: new Date()
    };

    analyses.forEach(analysis => {
      // Pattern distribution
      analysis.detectedPatterns.forEach(pattern => {
        analytics.patternDistribution[pattern.type] = 
          (analytics.patternDistribution[pattern.type] || 0) + 1;
      });

      // Risk score distribution
      if (analysis.riskScore < 0.3) analytics.riskScoreDistribution.low++;
      else if (analysis.riskScore < 0.7) analytics.riskScoreDistribution.medium++;
      else analytics.riskScoreDistribution.high++;

      // Temporal patterns (without storing exact timestamps)
      const hour = new Date(analysis.analysisTimestamp).getHours();
      const timeCategory = hour < 6 || hour > 22 ? 'off_hours' : 'business_hours';
      analytics.temporalPatterns[timeCategory] = 
        (analytics.temporalPatterns[timeCategory] || 0) + 1;

      // Geographic patterns (aggregated regions only)
      // This would be extracted from the analysis context without storing personal location data
      const region = 'aggregated_region'; // Placeholder for privacy-preserving region categorization
      analytics.geographicPatterns[region] = 
        (analytics.geographicPatterns[region] || 0) + 1;

      // Organizational patterns (by type, not specific organizations)
      const orgType = 'humanitarian_org'; // Generalized organization type
      analytics.organizationalPatterns[orgType] = 
        (analytics.organizationalPatterns[orgType] || 0) + 1;
    });

    return analytics;
  }

  /**
   * Context-aware fraud detection for humanitarian aid flows
   * Implements requirement 2.6: Specialized fraud protection for humanitarian aid flows
   */
  async analyzeHumanitarianContext(distribution, organizationData, contextData = {}) {
    const contextAnalysis = {
      distributionId: distribution.id,
      contextType: 'humanitarian_aid',
      contextFactors: [],
      riskAdjustments: [],
      specialConsiderations: [],
      recommendedActions: [],
      analysisTimestamp: new Date()
    };

    try {
      // Analyze emergency response context
      await this.analyzeEmergencyContext(distribution, contextData, contextAnalysis);

      // Analyze vulnerable population context
      await this.analyzeVulnerablePopulationContext(distribution, contextData, contextAnalysis);

      // Analyze cross-border humanitarian operations
      await this.analyzeCrossBorderContext(distribution, organizationData, contextAnalysis);

      // Analyze donor-recipient relationship context
      await this.analyzeDonorRecipientContext(distribution, contextData, contextAnalysis);

      // Analyze seasonal and environmental context
      await this.analyzeSeasonalContext(distribution, contextData, contextAnalysis);

      // Generate context-specific recommendations
      this.generateContextualRecommendations(contextAnalysis);

      logger.info('Humanitarian context analysis completed', {
        distributionId: distribution.id,
        contextFactors: contextAnalysis.contextFactors.length,
        riskAdjustments: contextAnalysis.riskAdjustments.length
      });

      return contextAnalysis;

    } catch (error) {
      logger.error('Error in humanitarian context analysis', {
        distributionId: distribution.id,
        error: error.message
      });
      
      contextAnalysis.specialConsiderations.push('Context analysis error - manual review recommended');
      return contextAnalysis;
    }
  }

  /**
   * Analyze emergency response context
   */
  async analyzeEmergencyContext(distribution, contextData, contextAnalysis) {
    const emergencyIndicators = {
      isEmergencyCategory: distribution.category === 'emergency',
      hasUrgencyFlag: distribution.transparencyData.urgencyLevel === 'high',
      isDisasterResponse: contextData.disasterType !== undefined,
      isRapidResponse: contextData.responseTimeHours && contextData.responseTimeHours < 24,
      hasEmergencyFunding: contextData.fundingSource === 'emergency_fund'
    };

    const emergencyScore = Object.values(emergencyIndicators).filter(Boolean).length;

    if (emergencyScore >= 2) {
      contextAnalysis.contextFactors.push({
        type: 'emergency_response',
        description: 'Distribution is part of emergency response',
        impact: 'reduce_fraud_scrutiny',
        confidence: emergencyScore / 5
      });

      contextAnalysis.riskAdjustments.push({
        type: 'emergency_tolerance',
        adjustment: -0.2, // Reduce fraud risk score
        reason: 'Emergency context allows for expedited processes'
      });

      contextAnalysis.specialConsiderations.push(
        'Emergency response - prioritize speed over extensive verification'
      );

      // Additional emergency-specific checks
      if (contextData.disasterType) {
        contextAnalysis.contextFactors.push({
          type: 'disaster_response',
          description: `Response to ${contextData.disasterType}`,
          impact: 'specialized_monitoring',
          disasterType: contextData.disasterType
        });
      }
    }
  }

  /**
   * Analyze vulnerable population context
   */
  async analyzeVulnerablePopulationContext(distribution, contextData, contextAnalysis) {
    const vulnerabilityIndicators = {
      isRefugeePopulation: contextData.populationType === 'refugees',
      isChildrenFocused: distribution.category === 'education' || 
                        distribution.purpose.toLowerCase().includes('children'),
      isElderlyFocused: distribution.purpose.toLowerCase().includes('elderly'),
      isDisabledFocused: distribution.purpose.toLowerCase().includes('disabled'),
      isGenderBasedViolenceSurvivors: contextData.specialNeeds === 'gbv_survivors',
      isInternallyDisplaced: contextData.populationType === 'idp'
    };

    const vulnerabilityScore = Object.values(vulnerabilityIndicators).filter(Boolean).length;

    if (vulnerabilityScore >= 1) {
      contextAnalysis.contextFactors.push({
        type: 'vulnerable_population',
        description: 'Distribution targets vulnerable populations',
        impact: 'enhanced_protection_required',
        vulnerabilityTypes: Object.keys(vulnerabilityIndicators).filter(
          key => vulnerabilityIndicators[key]
        )
      });

      contextAnalysis.riskAdjustments.push({
        type: 'vulnerable_population_protection',
        adjustment: 0.1, // Slightly increase scrutiny
        reason: 'Vulnerable populations require enhanced protection from fraud'
      });

      contextAnalysis.specialConsiderations.push(
        'Vulnerable population - ensure additional safeguards and verification'
      );

      // Special handling for different vulnerability types
      if (vulnerabilityIndicators.isRefugeePopulation) {
        contextAnalysis.recommendedActions.push(
          'Verify refugee status through UNHCR or local authorities'
        );
      }

      if (vulnerabilityIndicators.isChildrenFocused) {
        contextAnalysis.recommendedActions.push(
          'Implement child protection protocols and guardian verification'
        );
      }
    }
  }

  /**
   * Analyze cross-border humanitarian operations
   */
  async analyzeCrossBorderContext(distribution, organizationData, contextAnalysis) {
    const crossBorderIndicators = {
      isInternationalOrg: organizationData.organizationType === 'un_agency' ||
                         organizationData.country !== this.extractCountryFromLocation(distribution.location),
      hasMultipleCountries: organizationData.publicProfile.operatingRegions &&
                           organizationData.publicProfile.operatingRegions.length > 1,
      isConflictZone: this.isConflictZone(distribution.location),
      isBorderArea: this.isBorderArea(distribution.location),
      requiresSpecialPermits: this.requiresSpecialPermits(distribution.location)
    };

    const crossBorderScore = Object.values(crossBorderIndicators).filter(Boolean).length;

    if (crossBorderScore >= 2) {
      contextAnalysis.contextFactors.push({
        type: 'cross_border_operations',
        description: 'Distribution involves cross-border humanitarian operations',
        impact: 'enhanced_compliance_required',
        riskFactors: Object.keys(crossBorderIndicators).filter(
          key => crossBorderIndicators[key]
        )
      });

      contextAnalysis.riskAdjustments.push({
        type: 'cross_border_complexity',
        adjustment: 0.15, // Increase scrutiny for cross-border operations
        reason: 'Cross-border operations have additional compliance requirements'
      });

      contextAnalysis.specialConsiderations.push(
        'Cross-border operation - verify international compliance and permits'
      );

      if (crossBorderIndicators.isConflictZone) {
        contextAnalysis.recommendedActions.push(
          'Implement conflict-sensitive programming and security protocols'
        );
        
        contextAnalysis.riskAdjustments.push({
          type: 'conflict_zone_risk',
          adjustment: 0.2,
          reason: 'Conflict zones have elevated fraud and diversion risks'
        });
      }
    }
  }

  /**
   * Analyze donor-recipient relationship context
   */
  async analyzeDonorRecipientContext(distribution, contextData, contextAnalysis) {
    const relationshipIndicators = {
      isDirectDonation: distribution.donorId !== undefined,
      isEarmarkedFunding: contextData.fundingType === 'earmarked',
      isMultilateralFunding: contextData.fundingType === 'multilateral',
      hasSpecificDonorRequirements: contextData.donorRequirements !== undefined,
      isPublicFunding: contextData.fundingSource === 'government',
      isPrivateFunding: contextData.fundingSource === 'private'
    };

    const relationshipComplexity = Object.values(relationshipIndicators).filter(Boolean).length;

    if (relationshipComplexity >= 2) {
      contextAnalysis.contextFactors.push({
        type: 'donor_recipient_relationship',
        description: 'Complex donor-recipient relationship requires special handling',
        impact: 'enhanced_transparency_required',
        relationshipType: contextData.fundingType || 'standard'
      });

      if (relationshipIndicators.isEarmarkedFunding) {
        contextAnalysis.specialConsiderations.push(
          'Earmarked funding - ensure compliance with donor-specific requirements'
        );
        
        contextAnalysis.recommendedActions.push(
          'Verify distribution aligns with earmarked funding purposes'
        );
      }

      if (relationshipIndicators.hasSpecificDonorRequirements) {
        contextAnalysis.riskAdjustments.push({
          type: 'donor_compliance',
          adjustment: 0.1,
          reason: 'Specific donor requirements increase compliance complexity'
        });
      }
    }
  }

  /**
   * Analyze seasonal and environmental context
   */
  async analyzeSeasonalContext(distribution, contextData, contextAnalysis) {
    const currentMonth = new Date().getMonth() + 1; // 1-12
    const seasonalFactors = {
      isHurricaneSeason: currentMonth >= 6 && currentMonth <= 11 && 
                        this.isHurricaneProneRegion(distribution.location),
      isDrySeason: contextData.season === 'dry' || 
                  (currentMonth >= 12 || currentMonth <= 5),
      isHarvestSeason: contextData.season === 'harvest' ||
                      (currentMonth >= 9 && currentMonth <= 11),
      isFloodSeason: contextData.season === 'flood' ||
                    this.isFloodProneRegion(distribution.location),
      isWinterEmergency: currentMonth >= 11 || currentMonth <= 2
    };

    const seasonalRisk = Object.values(seasonalFactors).filter(Boolean).length;

    if (seasonalRisk >= 1) {
      contextAnalysis.contextFactors.push({
        type: 'seasonal_environmental',
        description: 'Seasonal or environmental factors affect distribution',
        impact: 'context_sensitive_monitoring',
        activeFactors: Object.keys(seasonalFactors).filter(
          key => seasonalFactors[key]
        )
      });

      if (seasonalFactors.isHurricaneSeason || seasonalFactors.isFloodSeason) {
        contextAnalysis.riskAdjustments.push({
          type: 'natural_disaster_preparedness',
          adjustment: -0.1, // Reduce fraud scrutiny during disaster preparedness
          reason: 'Natural disaster preparedness requires expedited distributions'
        });

        contextAnalysis.specialConsiderations.push(
          'Natural disaster season - monitor for legitimate emergency distributions'
        );
      }

      if (seasonalFactors.isDrySeason && distribution.category === 'food') {
        contextAnalysis.contextFactors.push({
          type: 'food_security_seasonal',
          description: 'Food distribution during dry season - higher legitimate need',
          impact: 'reduced_fraud_suspicion'
        });
      }
    }
  }

  /**
   * Generate contextual recommendations based on analysis
   */
  generateContextualRecommendations(contextAnalysis) {
    const contextTypes = contextAnalysis.contextFactors.map(f => f.type);
    
    // Emergency response recommendations
    if (contextTypes.includes('emergency_response')) {
      contextAnalysis.recommendedActions.push(
        'Implement rapid verification protocols suitable for emergency context'
      );
      contextAnalysis.recommendedActions.push(
        'Establish post-distribution monitoring to verify emergency aid reached intended recipients'
      );
    }

    // Vulnerable population recommendations
    if (contextTypes.includes('vulnerable_population')) {
      contextAnalysis.recommendedActions.push(
        'Use culturally appropriate verification methods'
      );
      contextAnalysis.recommendedActions.push(
        'Implement feedback mechanisms accessible to vulnerable populations'
      );
    }

    // Cross-border recommendations
    if (contextTypes.includes('cross_border_operations')) {
      contextAnalysis.recommendedActions.push(
        'Coordinate with local authorities and international partners'
      );
      contextAnalysis.recommendedActions.push(
        'Ensure compliance with both origin and destination country regulations'
      );
    }

    // Seasonal recommendations
    if (contextTypes.includes('seasonal_environmental')) {
      contextAnalysis.recommendedActions.push(
        'Adjust monitoring frequency based on seasonal risk patterns'
      );
      contextAnalysis.recommendedActions.push(
        'Prepare contingency plans for weather-related distribution disruptions'
      );
    }

    // General humanitarian recommendations
    contextAnalysis.recommendedActions.push(
      'Maintain "do no harm" principles throughout fraud detection processes'
    );
    contextAnalysis.recommendedActions.push(
      'Balance fraud prevention with humanitarian access and dignity'
    );
  }

  /**
   * Helper methods for context analysis
   */
  extractCountryFromLocation(location) {
    if (!location) return 'unknown';
    
    // Simple country extraction (in real implementation, use proper geocoding)
    const locationLower = location.toLowerCase();
    if (locationLower.includes('haiti')) return 'haiti';
    if (locationLower.includes('syria')) return 'syria';
    if (locationLower.includes('jordan')) return 'jordan';
    if (locationLower.includes('lebanon')) return 'lebanon';
    if (locationLower.includes('turkey')) return 'turkey';
    
    return 'unknown';
  }

  isConflictZone(location) {
    if (!location) return false;
    
    const conflictZones = ['syria', 'yemen', 'afghanistan', 'somalia', 'south sudan'];
    const locationLower = location.toLowerCase();
    
    return conflictZones.some(zone => locationLower.includes(zone));
  }

  isBorderArea(location) {
    if (!location) return false;
    
    const borderKeywords = ['border', 'frontier', 'crossing', 'refugee camp'];
    const locationLower = location.toLowerCase();
    
    return borderKeywords.some(keyword => locationLower.includes(keyword));
  }

  requiresSpecialPermits(location) {
    // Simplified logic - in real implementation, check against regulatory database
    return this.isConflictZone(location) || this.isBorderArea(location);
  }

  isHurricaneProneRegion(location) {
    if (!location) return false;
    
    const hurricaneRegions = ['haiti', 'dominican republic', 'cuba', 'jamaica', 'bahamas'];
    const locationLower = location.toLowerCase();
    
    return hurricaneRegions.some(region => locationLower.includes(region));
  }

  isFloodProneRegion(location) {
    if (!location) return false;
    
    const floodRegions = ['bangladesh', 'pakistan', 'philippines', 'vietnam'];
    const locationLower = location.toLowerCase();
    
    return floodRegions.some(region => locationLower.includes(region));
  }

  /**
   * Generate humanitarian aid fraud prevention guidelines
   * Implements requirement 2.6: Context-aware detection for humanitarian aid flows
   */
  generateHumanitarianFraudPreventionGuidelines(organizationData, historicalAnalyses = []) {
    const guidelines = {
      organizationId: organizationData.id,
      organizationType: organizationData.organizationType,
      generatedAt: new Date(),
      riskProfile: this.calculateOrganizationRiskProfile(organizationData, historicalAnalyses),
      preventionStrategies: [],
      monitoringRecommendations: [],
      complianceRequirements: [],
      emergencyProtocols: [],
      vulnerablePopulationProtections: []
    };

    // Generate prevention strategies based on organization type and risk profile
    this.generatePreventionStrategies(guidelines);
    
    // Generate monitoring recommendations
    this.generateMonitoringRecommendations(guidelines);
    
    // Generate compliance requirements
    this.generateComplianceRequirements(guidelines);
    
    // Generate emergency protocols
    this.generateEmergencyProtocols(guidelines);
    
    // Generate vulnerable population protections
    this.generateVulnerablePopulationProtections(guidelines);

    return guidelines;
  }

  /**
   * Calculate organization risk profile for humanitarian operations
   */
  calculateOrganizationRiskProfile(organizationData, historicalAnalyses) {
    const profile = {
      overallRisk: 'medium',
      riskFactors: [],
      mitigatingFactors: [],
      riskScore: 0.5
    };

    // Risk factors
    if (!organizationData.isVerified()) {
      profile.riskFactors.push('Organization not verified');
      profile.riskScore += 0.2;
    }

    if (organizationData.transparencyLevel === 'standard') {
      profile.riskFactors.push('Standard transparency level');
      profile.riskScore += 0.1;
    }

    if (organizationData.organizationType === 'charity' || 
        organizationData.organizationType === 'ngo') {
      profile.riskFactors.push('Higher risk organization type');
      profile.riskScore += 0.1;
    }

    // Mitigating factors
    if (organizationData.organizationType === 'un_agency') {
      profile.mitigatingFactors.push('UN agency - established protocols');
      profile.riskScore -= 0.2;
    }

    if (organizationData.transparencyLevel === 'full_public') {
      profile.mitigatingFactors.push('Full public transparency');
      profile.riskScore -= 0.2;
    }

    if (historicalAnalyses.length > 0) {
      const avgHistoricalRisk = historicalAnalyses.reduce(
        (sum, analysis) => sum + analysis.riskScore, 0
      ) / historicalAnalyses.length;
      
      if (avgHistoricalRisk < 0.3) {
        profile.mitigatingFactors.push('Low historical fraud risk');
        profile.riskScore -= 0.1;
      } else if (avgHistoricalRisk > 0.7) {
        profile.riskFactors.push('High historical fraud risk');
        profile.riskScore += 0.2;
      }
    }

    // Normalize risk score
    profile.riskScore = Math.max(0, Math.min(1, profile.riskScore));

    // Determine overall risk level
    if (profile.riskScore < 0.3) profile.overallRisk = 'low';
    else if (profile.riskScore > 0.7) profile.overallRisk = 'high';
    else profile.overallRisk = 'medium';

    return profile;
  }

  /**
   * Generate prevention strategies
   */
  generatePreventionStrategies(guidelines) {
    const baseStrategies = [
      'Implement robust beneficiary registration and verification systems',
      'Use biometric identification where culturally appropriate and technically feasible',
      'Establish clear distribution protocols with multiple verification points',
      'Create feedback mechanisms for beneficiaries to report issues',
      'Implement segregation of duties in distribution processes'
    ];

    guidelines.preventionStrategies = [...baseStrategies];

    // Add risk-specific strategies
    if (guidelines.riskProfile.overallRisk === 'high') {
      guidelines.preventionStrategies.push(
        'Require third-party verification for all distributions above threshold amounts'
      );
      guidelines.preventionStrategies.push(
        'Implement real-time monitoring with GPS tracking and photo verification'
      );
    }

    // Add organization-type specific strategies
    if (guidelines.organizationType === 'ngo' || guidelines.organizationType === 'charity') {
      guidelines.preventionStrategies.push(
        'Partner with established organizations for verification and oversight'
      );
      guidelines.preventionStrategies.push(
        'Participate in humanitarian coordination mechanisms'
      );
    }
  }

  /**
   * Generate monitoring recommendations
   */
  generateMonitoringRecommendations(guidelines) {
    const baseRecommendations = [
      'Conduct regular post-distribution monitoring surveys',
      'Implement random verification visits to distribution sites',
      'Monitor for duplicate beneficiaries across programs',
      'Track distribution efficiency and beneficiary satisfaction metrics',
      'Establish early warning indicators for potential fraud'
    ];

    guidelines.monitoringRecommendations = [...baseRecommendations];

    // Add context-specific recommendations
    if (guidelines.riskProfile.riskFactors.includes('Higher risk organization type')) {
      guidelines.monitoringRecommendations.push(
        'Increase monitoring frequency during initial operations'
      );
      guidelines.monitoringRecommendations.push(
        'Implement peer review mechanisms with other humanitarian organizations'
      );
    }
  }

  /**
   * Generate compliance requirements
   */
  generateComplianceRequirements(guidelines) {
    const baseRequirements = [
      'Maintain detailed records of all distributions and beneficiaries',
      'Ensure compliance with local laws and regulations',
      'Implement data protection measures for beneficiary information',
      'Provide regular reporting to donors and oversight bodies',
      'Maintain audit trails for all financial transactions'
    ];

    guidelines.complianceRequirements = [...baseRequirements];

    // Add organization-specific requirements
    if (guidelines.organizationType === 'un_agency') {
      guidelines.complianceRequirements.push(
        'Comply with UN humanitarian principles and standards'
      );
      guidelines.complianceRequirements.push(
        'Participate in UN coordination mechanisms'
      );
    }
  }

  /**
   * Generate emergency protocols
   */
  generateEmergencyProtocols(guidelines) {
    guidelines.emergencyProtocols = [
      'Establish rapid response procedures for emergency distributions',
      'Pre-position verification systems for quick deployment',
      'Create emergency contact networks with local authorities',
      'Develop simplified verification procedures for life-saving interventions',
      'Implement post-emergency verification and reconciliation processes',
      'Maintain emergency communication channels with beneficiaries',
      'Establish clear escalation procedures for fraud detection during emergencies'
    ];
  }

  /**
   * Generate vulnerable population protections
   */
  generateVulnerablePopulationProtections(guidelines) {
    guidelines.vulnerablePopulationProtections = [
      'Implement age, gender, and diversity-sensitive distribution methods',
      'Provide multiple channels for feedback and complaints',
      'Use culturally appropriate communication methods',
      'Ensure accessibility for persons with disabilities',
      'Implement child protection protocols for distributions involving minors',
      'Provide safe and dignified distribution environments',
      'Train staff on protection principles and fraud prevention',
      'Establish referral mechanisms for protection concerns',
      'Monitor for protection risks and unintended consequences of fraud prevention measures'
    ];
  }
}

module.exports = HumanitarianFraudDetection;