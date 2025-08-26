const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

class DonationTrackingService {
  constructor() {
    this.trackingChains = new Map(); // In-memory storage for demo
  }

  /**
   * Create a new donation tracking chain
   */
  async createTrackingChain(donationData) {
    const trackingChain = {
      id: uuidv4(),
      donorId: donationData.donorId,
      initialAmount: donationData.amount,
      currency: donationData.currency,
      purpose: donationData.purpose,
      targetOrganizationId: donationData.organizationId,
      status: 'initiated',
      stages: [],
      currentStage: 0,
      endToEndVisibility: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Add initial donation stage
    trackingChain.stages.push({
      stageId: uuidv4(),
      type: 'donation',
      description: 'Initial donation received',
      amount: donationData.amount,
      currency: donationData.currency,
      timestamp: new Date(),
      location: 'donor_wallet',
      status: 'completed',
      verificationData: {
        transactionId: donationData.transactionId,
        verified: true
      }
    });

    this.trackingChains.set(trackingChain.id, trackingChain);

    logger.info('Donation tracking chain created', {
      trackingChainId: trackingChain.id,
      donorId: donationData.donorId,
      amount: donationData.amount
    });

    return trackingChain;
  }

  /**
   * Add a distribution stage to the tracking chain
   */
  async addDistributionStage(trackingChainId, distributionData) {
    const trackingChain = this.trackingChains.get(trackingChainId);
    if (!trackingChain) {
      throw new Error(`Tracking chain not found: ${trackingChainId}`);
    }

    const distributionStage = {
      stageId: uuidv4(),
      type: 'distribution',
      description: distributionData.purpose || 'Aid distribution',
      amount: distributionData.amount,
      currency: distributionData.currency,
      timestamp: new Date(),
      location: distributionData.location,
      status: distributionData.status || 'pending',
      distributionId: distributionData.id,
      recipientInfo: {
        recipientId: distributionData.recipientId,
        beneficiaryCount: distributionData.transparencyData?.beneficiaryCount
      },
      transparencyData: distributionData.transparencyData || {},
      verificationData: distributionData.verificationData || {}
    };

    trackingChain.stages.push(distributionStage);
    trackingChain.currentStage = trackingChain.stages.length - 1;
    trackingChain.updatedAt = new Date();

    // Update overall status based on distribution status
    if (distributionData.status === 'completed') {
      trackingChain.status = 'distributed';
    } else if (distributionData.status === 'failed') {
      trackingChain.status = 'failed';
    }

    this.trackingChains.set(trackingChainId, trackingChain);

    logger.info('Distribution stage added to tracking chain', {
      trackingChainId,
      distributionId: distributionData.id,
      amount: distributionData.amount
    });

    return trackingChain;
  }

  /**
   * Add verification stage to the tracking chain
   */
  async addVerificationStage(trackingChainId, verificationData) {
    const trackingChain = this.trackingChains.get(trackingChainId);
    if (!trackingChain) {
      throw new Error(`Tracking chain not found: ${trackingChainId}`);
    }

    const verificationStage = {
      stageId: uuidv4(),
      type: 'verification',
      description: 'Third-party verification of aid distribution',
      timestamp: new Date(),
      location: verificationData.location,
      status: 'completed',
      verifierInfo: {
        verifierId: verificationData.verifierId,
        verifierType: verificationData.verifierType, // 'local_partner', 'un_agency', 'government'
        verifierName: verificationData.verifierName
      },
      verificationResults: {
        distributionConfirmed: verificationData.distributionConfirmed,
        beneficiariesReached: verificationData.beneficiariesReached,
        impactAssessment: verificationData.impactAssessment,
        photos: verificationData.photos || [],
        gpsCoordinates: verificationData.gpsCoordinates
      }
    };

    trackingChain.stages.push(verificationStage);
    trackingChain.currentStage = trackingChain.stages.length - 1;
    trackingChain.status = 'verified';
    trackingChain.updatedAt = new Date();

    this.trackingChains.set(trackingChainId, trackingChain);

    logger.info('Verification stage added to tracking chain', {
      trackingChainId,
      verifierId: verificationData.verifierId,
      distributionConfirmed: verificationData.distributionConfirmed
    });

    return trackingChain;
  }

  /**
   * Get complete tracking chain with end-to-end visibility
   */
  async getTrackingChain(trackingChainId, requesterId = null) {
    const trackingChain = this.trackingChains.get(trackingChainId);
    if (!trackingChain) {
      throw new Error(`Tracking chain not found: ${trackingChainId}`);
    }

    // Create public view of tracking chain
    const publicView = {
      id: trackingChain.id,
      initialAmount: trackingChain.initialAmount,
      currency: trackingChain.currency,
      purpose: trackingChain.purpose,
      status: trackingChain.status,
      currentStage: trackingChain.currentStage,
      totalStages: trackingChain.stages.length,
      createdAt: trackingChain.createdAt,
      updatedAt: trackingChain.updatedAt,
      stages: trackingChain.stages.map(stage => this.createPublicStageView(stage)),
      summary: this.generateTrackingSummary(trackingChain)
    };

    // Add donor-specific information if requester is the donor
    if (requesterId === trackingChain.donorId) {
      publicView.donorView = {
        totalDistributed: this.calculateTotalDistributed(trackingChain),
        beneficiariesReached: this.calculateBeneficiariesReached(trackingChain),
        verificationStatus: this.getVerificationStatus(trackingChain),
        impactMetrics: this.generateImpactMetrics(trackingChain)
      };
    }

    return publicView;
  }

  /**
   * Create public view of a tracking stage
   */
  createPublicStageView(stage) {
    const publicStage = {
      stageId: stage.stageId,
      type: stage.type,
      description: stage.description,
      timestamp: stage.timestamp,
      location: stage.location,
      status: stage.status
    };

    // Add type-specific public information
    switch (stage.type) {
      case 'donation':
        publicStage.amount = stage.amount;
        publicStage.currency = stage.currency;
        publicStage.verified = stage.verificationData?.verified || false;
        break;

      case 'distribution':
        publicStage.amount = stage.amount;
        publicStage.currency = stage.currency;
        publicStage.beneficiaryCount = stage.recipientInfo?.beneficiaryCount;
        publicStage.transparencyScore = this.calculateStageTransparencyScore(stage);
        if (stage.transparencyData?.photos) {
          publicStage.hasPhotos = true;
        }
        if (stage.transparencyData?.gpsCoordinates) {
          publicStage.hasGpsVerification = true;
        }
        break;

      case 'verification':
        publicStage.verifierType = stage.verifierInfo?.verifierType;
        publicStage.distributionConfirmed = stage.verificationResults?.distributionConfirmed;
        publicStage.beneficiariesReached = stage.verificationResults?.beneficiariesReached;
        publicStage.hasImpactAssessment = !!stage.verificationResults?.impactAssessment;
        break;
    }

    return publicStage;
  }

  /**
   * Generate tracking summary
   */
  generateTrackingSummary(trackingChain) {
    const summary = {
      totalAmount: trackingChain.initialAmount,
      currency: trackingChain.currency,
      distributionCount: 0,
      verificationCount: 0,
      totalBeneficiaries: 0,
      averageTransparencyScore: 0,
      isFullyVerified: false,
      completionPercentage: 0
    };

    let totalTransparencyScore = 0;
    let distributionStages = 0;

    trackingChain.stages.forEach(stage => {
      switch (stage.type) {
        case 'distribution':
          summary.distributionCount++;
          distributionStages++;
          if (stage.recipientInfo?.beneficiaryCount) {
            summary.totalBeneficiaries += stage.recipientInfo.beneficiaryCount;
          }
          totalTransparencyScore += this.calculateStageTransparencyScore(stage);
          break;

        case 'verification':
          summary.verificationCount++;
          break;
      }
    });

    if (distributionStages > 0) {
      summary.averageTransparencyScore = Math.round(totalTransparencyScore / distributionStages);
    }

    summary.isFullyVerified = summary.verificationCount > 0 && 
                             summary.verificationCount >= summary.distributionCount;

    // Calculate completion percentage based on status
    switch (trackingChain.status) {
      case 'initiated':
        summary.completionPercentage = 10;
        break;
      case 'distributed':
        summary.completionPercentage = 70;
        break;
      case 'verified':
        summary.completionPercentage = 100;
        break;
      case 'failed':
        summary.completionPercentage = 0;
        break;
      default:
        summary.completionPercentage = 50;
    }

    return summary;
  }

  /**
   * Calculate transparency score for a stage
   */
  calculateStageTransparencyScore(stage) {
    if (stage.type !== 'distribution') return 0;

    let score = 0;
    
    // Basic information
    if (stage.description) score += 20;
    if (stage.location) score += 20;
    if (stage.amount) score += 10;

    // Transparency data
    if (stage.transparencyData?.beneficiaryCount) score += 15;
    if (stage.transparencyData?.photos) score += 15;
    if (stage.transparencyData?.gpsCoordinates) score += 10;

    // Verification data
    if (stage.verificationData && Object.keys(stage.verificationData).length > 0) score += 10;

    return Math.min(score, 100);
  }

  /**
   * Calculate total amount distributed
   */
  calculateTotalDistributed(trackingChain) {
    return trackingChain.stages
      .filter(stage => stage.type === 'distribution' && stage.status === 'completed')
      .reduce((total, stage) => total + (stage.amount || 0), 0);
  }

  /**
   * Calculate total beneficiaries reached
   */
  calculateBeneficiariesReached(trackingChain) {
    return trackingChain.stages
      .filter(stage => stage.type === 'distribution')
      .reduce((total, stage) => total + (stage.recipientInfo?.beneficiaryCount || 0), 0);
  }

  /**
   * Get verification status
   */
  getVerificationStatus(trackingChain) {
    const distributionStages = trackingChain.stages.filter(stage => stage.type === 'distribution');
    const verificationStages = trackingChain.stages.filter(stage => stage.type === 'verification');

    if (verificationStages.length === 0) {
      return 'unverified';
    } else if (verificationStages.length >= distributionStages.length) {
      return 'fully_verified';
    } else {
      return 'partially_verified';
    }
  }

  /**
   * Generate impact metrics
   */
  generateImpactMetrics(trackingChain) {
    const metrics = {
      totalBeneficiaries: this.calculateBeneficiariesReached(trackingChain),
      distributionEfficiency: 0,
      transparencyRating: 0,
      verificationCoverage: 0,
      impactCategories: {}
    };

    const distributionStages = trackingChain.stages.filter(stage => stage.type === 'distribution');
    const verificationStages = trackingChain.stages.filter(stage => stage.type === 'verification');

    if (distributionStages.length > 0) {
      // Calculate distribution efficiency (percentage of initial amount distributed)
      const totalDistributed = this.calculateTotalDistributed(trackingChain);
      metrics.distributionEfficiency = Math.round((totalDistributed / trackingChain.initialAmount) * 100);

      // Calculate average transparency rating
      const totalTransparencyScore = distributionStages.reduce(
        (sum, stage) => sum + this.calculateStageTransparencyScore(stage), 0
      );
      metrics.transparencyRating = Math.round(totalTransparencyScore / distributionStages.length);

      // Calculate verification coverage
      metrics.verificationCoverage = Math.round((verificationStages.length / distributionStages.length) * 100);

      // Categorize impact by distribution type
      distributionStages.forEach(stage => {
        // This would typically come from distribution metadata
        const category = 'humanitarian_aid'; // Simplified for demo
        if (!metrics.impactCategories[category]) {
          metrics.impactCategories[category] = {
            amount: 0,
            beneficiaries: 0,
            distributions: 0
          };
        }
        metrics.impactCategories[category].amount += stage.amount || 0;
        metrics.impactCategories[category].beneficiaries += stage.recipientInfo?.beneficiaryCount || 0;
        metrics.impactCategories[category].distributions++;
      });
    }

    return metrics;
  }

  /**
   * Search tracking chains by criteria
   */
  async searchTrackingChains(criteria) {
    const results = [];
    
    for (const [id, chain] of this.trackingChains) {
      let matches = true;

      if (criteria.donorId && chain.donorId !== criteria.donorId) {
        matches = false;
      }

      if (criteria.organizationId && chain.targetOrganizationId !== criteria.organizationId) {
        matches = false;
      }

      if (criteria.status && chain.status !== criteria.status) {
        matches = false;
      }

      if (criteria.minAmount && chain.initialAmount < criteria.minAmount) {
        matches = false;
      }

      if (criteria.maxAmount && chain.initialAmount > criteria.maxAmount) {
        matches = false;
      }

      if (criteria.dateFrom && chain.createdAt < new Date(criteria.dateFrom)) {
        matches = false;
      }

      if (criteria.dateTo && chain.createdAt > new Date(criteria.dateTo)) {
        matches = false;
      }

      if (matches) {
        results.push(await this.getTrackingChain(id));
      }
    }

    return results;
  }

  /**
   * Get tracking statistics
   */
  async getTrackingStatistics() {
    const stats = {
      totalChains: this.trackingChains.size,
      totalDonationAmount: 0,
      totalDistributed: 0,
      totalBeneficiaries: 0,
      averageTransparencyScore: 0,
      verificationRate: 0,
      statusBreakdown: {},
      currencyBreakdown: {}
    };

    let totalTransparencyScore = 0;
    let distributionCount = 0;
    let verifiedChains = 0;

    for (const [id, chain] of this.trackingChains) {
      stats.totalDonationAmount += chain.initialAmount;
      stats.totalDistributed += this.calculateTotalDistributed(chain);
      stats.totalBeneficiaries += this.calculateBeneficiariesReached(chain);

      // Status breakdown
      stats.statusBreakdown[chain.status] = (stats.statusBreakdown[chain.status] || 0) + 1;

      // Currency breakdown
      stats.currencyBreakdown[chain.currency] = (stats.currencyBreakdown[chain.currency] || 0) + 1;

      // Transparency and verification metrics
      const distributionStages = chain.stages.filter(stage => stage.type === 'distribution');
      if (distributionStages.length > 0) {
        distributionCount++;
        const chainTransparencyScore = distributionStages.reduce(
          (sum, stage) => sum + this.calculateStageTransparencyScore(stage), 0
        ) / distributionStages.length;
        totalTransparencyScore += chainTransparencyScore;
      }

      if (this.getVerificationStatus(chain) !== 'unverified') {
        verifiedChains++;
      }
    }

    if (distributionCount > 0) {
      stats.averageTransparencyScore = Math.round(totalTransparencyScore / distributionCount);
    }

    if (this.trackingChains.size > 0) {
      stats.verificationRate = Math.round((verifiedChains / this.trackingChains.size) * 100);
    }

    return stats;
  }

  /**
   * Generate comprehensive end-to-end visibility report
   * Implements requirement 8.3: Enhanced transparency and accountability
   */
  async generateEndToEndVisibilityReport(trackingChainId) {
    const trackingChain = this.trackingChains.get(trackingChainId);
    if (!trackingChain) {
      throw new Error(`Tracking chain not found: ${trackingChainId}`);
    }

    const report = {
      trackingChainId,
      reportTimestamp: new Date(),
      donationJourney: {
        initialDonation: this.extractDonationDetails(trackingChain),
        distributionPath: this.mapDistributionPath(trackingChain),
        verificationTrail: this.extractVerificationTrail(trackingChain),
        impactRealization: this.calculateImpactRealization(trackingChain)
      },
      transparencyMetrics: {
        overallTransparencyScore: trackingChain.summary?.averageTransparencyScore || 0,
        dataCompleteness: this.calculateDataCompleteness(trackingChain),
        verificationCoverage: this.calculateVerificationCoverage(trackingChain),
        auditTrailIntegrity: this.validateAuditTrailIntegrity(trackingChain)
      },
      stakeholderVisibility: {
        donorView: this.generateDonorVisibilityReport(trackingChain),
        recipientView: this.generateRecipientVisibilityReport(trackingChain),
        publicView: this.generatePublicVisibilityReport(trackingChain),
        regulatorView: this.generateRegulatorVisibilityReport(trackingChain)
      },
      riskAssessment: {
        fraudRiskScore: this.calculateChainFraudRisk(trackingChain),
        complianceScore: this.calculateChainComplianceScore(trackingChain),
        reputationRisk: this.calculateReputationRisk(trackingChain)
      }
    };

    return report;
  }

  /**
   * Extract donation details for visibility report
   */
  extractDonationDetails(trackingChain) {
    const donationStage = trackingChain.stages.find(stage => stage.type === 'donation');
    
    return {
      amount: trackingChain.initialAmount,
      currency: trackingChain.currency,
      purpose: trackingChain.purpose,
      timestamp: donationStage?.timestamp || trackingChain.createdAt,
      verified: donationStage?.verificationData?.verified || false,
      transactionId: donationStage?.verificationData?.transactionId
    };
  }

  /**
   * Map the complete distribution path
   */
  mapDistributionPath(trackingChain) {
    const distributionStages = trackingChain.stages.filter(stage => stage.type === 'distribution');
    
    return distributionStages.map((stage, index) => ({
      sequenceNumber: index + 1,
      distributionId: stage.distributionId,
      amount: stage.amount,
      currency: stage.currency,
      location: stage.location,
      beneficiaryCount: stage.recipientInfo?.beneficiaryCount,
      timestamp: stage.timestamp,
      status: stage.status,
      transparencyScore: this.calculateStageTransparencyScore(stage),
      verificationLevel: this.calculateStageVerificationLevel(stage),
      geographicCoordinates: stage.transparencyData?.gpsCoordinates,
      photosAvailable: !!stage.transparencyData?.photos,
      impactMetrics: stage.impactMetrics || {}
    }));
  }

  /**
   * Extract verification trail
   */
  extractVerificationTrail(trackingChain) {
    const verificationStages = trackingChain.stages.filter(stage => stage.type === 'verification');
    
    return verificationStages.map(stage => ({
      verifierId: stage.verifierInfo?.verifierId,
      verifierType: stage.verifierInfo?.verifierType,
      verifierName: stage.verifierInfo?.verifierName,
      timestamp: stage.timestamp,
      location: stage.location,
      distributionConfirmed: stage.verificationResults?.distributionConfirmed,
      beneficiariesReached: stage.verificationResults?.beneficiariesReached,
      impactAssessment: stage.verificationResults?.impactAssessment,
      evidenceProvided: {
        photos: !!stage.verificationResults?.photos?.length,
        gpsCoordinates: !!stage.verificationResults?.gpsCoordinates,
        witnessStatements: !!stage.verificationResults?.witnessStatements,
        officialDocuments: !!stage.verificationResults?.officialDocuments
      }
    }));
  }

  /**
   * Calculate impact realization
   */
  calculateImpactRealization(trackingChain) {
    const distributionStages = trackingChain.stages.filter(stage => stage.type === 'distribution');
    const verificationStages = trackingChain.stages.filter(stage => stage.type === 'verification');
    
    const totalBeneficiariesPlanned = distributionStages.reduce(
      (sum, stage) => sum + (stage.recipientInfo?.beneficiaryCount || 0), 0
    );
    
    const totalBeneficiariesVerified = verificationStages.reduce(
      (sum, stage) => sum + (stage.verificationResults?.beneficiariesReached || 0), 0
    );
    
    const totalAmountDistributed = distributionStages.reduce(
      (sum, stage) => sum + (stage.status === 'completed' ? stage.amount : 0), 0
    );

    return {
      plannedBeneficiaries: totalBeneficiariesPlanned,
      verifiedBeneficiaries: totalBeneficiariesVerified,
      beneficiaryRealizationRate: totalBeneficiariesPlanned > 0 ? 
        Math.round((totalBeneficiariesVerified / totalBeneficiariesPlanned) * 100) : 0,
      amountDistributed: totalAmountDistributed,
      distributionEfficiency: Math.round((totalAmountDistributed / trackingChain.initialAmount) * 100),
      averageDistributionTime: this.calculateAverageDistributionTime(distributionStages),
      geographicReach: this.calculateGeographicReach(distributionStages)
    };
  }

  /**
   * Calculate data completeness score
   */
  calculateDataCompleteness(trackingChain) {
    const requiredFields = [
      'initialAmount', 'currency', 'purpose', 'targetOrganizationId'
    ];
    
    let completenessScore = 0;
    const maxScore = 100;
    
    // Check basic chain data (25 points)
    const basicDataScore = requiredFields.reduce((score, field) => {
      return score + (trackingChain[field] ? 6.25 : 0);
    }, 0);
    completenessScore += basicDataScore;
    
    // Check distribution stages data (50 points)
    const distributionStages = trackingChain.stages.filter(stage => stage.type === 'distribution');
    if (distributionStages.length > 0) {
      const avgDistributionCompleteness = distributionStages.reduce((sum, stage) => {
        let stageScore = 0;
        if (stage.amount) stageScore += 10;
        if (stage.location) stageScore += 10;
        if (stage.recipientInfo?.beneficiaryCount) stageScore += 10;
        if (stage.transparencyData?.photos) stageScore += 10;
        if (stage.transparencyData?.gpsCoordinates) stageScore += 10;
        return sum + stageScore;
      }, 0) / distributionStages.length;
      
      completenessScore += avgDistributionCompleteness;
    }
    
    // Check verification data (25 points)
    const verificationStages = trackingChain.stages.filter(stage => stage.type === 'verification');
    if (verificationStages.length > 0) {
      const avgVerificationCompleteness = verificationStages.reduce((sum, stage) => {
        let stageScore = 0;
        if (stage.verifierInfo?.verifierId) stageScore += 8.33;
        if (stage.verificationResults?.distributionConfirmed !== undefined) stageScore += 8.33;
        if (stage.verificationResults?.beneficiariesReached) stageScore += 8.34;
        return sum + stageScore;
      }, 0) / verificationStages.length;
      
      completenessScore += avgVerificationCompleteness;
    }
    
    return Math.min(Math.round(completenessScore), maxScore);
  }

  /**
   * Calculate verification coverage
   */
  calculateVerificationCoverage(trackingChain) {
    const distributionStages = trackingChain.stages.filter(stage => stage.type === 'distribution');
    const verificationStages = trackingChain.stages.filter(stage => stage.type === 'verification');
    
    if (distributionStages.length === 0) return 0;
    
    return Math.round((verificationStages.length / distributionStages.length) * 100);
  }

  /**
   * Generate comprehensive impact assessment for humanitarian aid tracking
   * Implements requirement 8.3: Enhanced transparency and accountability
   */
  async generateHumanitarianImpactAssessment(trackingChainId, assessmentCriteria = {}) {
    const trackingChain = this.trackingChains.get(trackingChainId);
    if (!trackingChain) {
      throw new Error(`Tracking chain not found: ${trackingChainId}`);
    }

    const assessment = {
      trackingChainId,
      assessmentTimestamp: new Date(),
      overallImpactScore: 0,
      impactDimensions: {
        reach: this.assessReachImpact(trackingChain),
        effectiveness: this.assessEffectivenessImpact(trackingChain),
        efficiency: this.assessEfficiencyImpact(trackingChain),
        sustainability: this.assessSustainabilityImpact(trackingChain),
        accountability: this.assessAccountabilityImpact(trackingChain)
      },
      beneficiaryOutcomes: this.assessBeneficiaryOutcomes(trackingChain),
      systemicImpact: this.assessSystemicImpact(trackingChain),
      lessonsLearned: this.extractLessonsLearned(trackingChain),
      recommendations: this.generateImpactRecommendations(trackingChain),
      comparativeBenchmarks: await this.generateComparativeBenchmarks(trackingChain, assessmentCriteria)
    };

    // Calculate overall impact score
    const dimensionScores = Object.values(assessment.impactDimensions).map(d => d.score);
    assessment.overallImpactScore = Math.round(
      dimensionScores.reduce((sum, score) => sum + score, 0) / dimensionScores.length
    );

    return assessment;
  }

  /**
   * Assess reach impact dimension
   */
  assessReachImpact(trackingChain) {
    const distributionStages = trackingChain.stages.filter(stage => stage.type === 'distribution');
    
    const reach = {
      score: 0,
      metrics: {
        totalBeneficiaries: this.calculateBeneficiariesReached(trackingChain),
        geographicCoverage: this.calculateGeographicReach(distributionStages),
        demographicDiversity: this.calculateDemographicDiversity(distributionStages),
        accessibilityScore: this.calculateAccessibilityScore(distributionStages)
      },
      strengths: [],
      challenges: []
    };

    // Calculate reach score based on metrics
    let score = 0;
    
    // Beneficiary count (30 points)
    if (reach.metrics.totalBeneficiaries > 1000) score += 30;
    else if (reach.metrics.totalBeneficiaries > 500) score += 20;
    else if (reach.metrics.totalBeneficiaries > 100) score += 15;
    else score += 10;

    // Geographic coverage (25 points)
    score += Math.min(25, reach.metrics.geographicCoverage.uniqueLocations * 5);

    // Demographic diversity (25 points)
    score += reach.metrics.demographicDiversity;

    // Accessibility (20 points)
    score += reach.metrics.accessibilityScore;

    reach.score = Math.min(100, score);

    // Identify strengths and challenges
    if (reach.metrics.totalBeneficiaries > 500) {
      reach.strengths.push('High beneficiary reach achieved');
    }
    if (reach.metrics.geographicCoverage.uniqueLocations > 3) {
      reach.strengths.push('Good geographic coverage');
    }
    if (reach.metrics.accessibilityScore > 15) {
      reach.strengths.push('Good accessibility for vulnerable populations');
    }

    if (reach.metrics.totalBeneficiaries < 100) {
      reach.challenges.push('Limited beneficiary reach');
    }
    if (reach.metrics.geographicCoverage.uniqueLocations < 2) {
      reach.challenges.push('Limited geographic coverage');
    }

    return reach;
  }

  /**
   * Assess effectiveness impact dimension
   */
  assessEffectivenessImpact(trackingChain) {
    const distributionStages = trackingChain.stages.filter(stage => stage.type === 'distribution');
    const verificationStages = trackingChain.stages.filter(stage => stage.type === 'verification');
    
    const effectiveness = {
      score: 0,
      metrics: {
        completionRate: this.calculateCompletionRate(distributionStages),
        verificationRate: verificationStages.length / Math.max(distributionStages.length, 1) * 100,
        qualityScore: this.calculateQualityScore(distributionStages, verificationStages),
        targetingAccuracy: this.calculateTargetingAccuracy(distributionStages)
      },
      strengths: [],
      challenges: []
    };

    // Calculate effectiveness score
    let score = 0;
    score += effectiveness.metrics.completionRate * 0.3;
    score += effectiveness.metrics.verificationRate * 0.3;
    score += effectiveness.metrics.qualityScore * 0.2;
    score += effectiveness.metrics.targetingAccuracy * 0.2;

    effectiveness.score = Math.round(score);

    // Identify strengths and challenges
    if (effectiveness.metrics.completionRate > 80) {
      effectiveness.strengths.push('High completion rate');
    }
    if (effectiveness.metrics.verificationRate > 70) {
      effectiveness.strengths.push('Good verification coverage');
    }
    if (effectiveness.metrics.qualityScore > 75) {
      effectiveness.strengths.push('High quality distributions');
    }

    if (effectiveness.metrics.completionRate < 60) {
      effectiveness.challenges.push('Low completion rate needs improvement');
    }
    if (effectiveness.metrics.verificationRate < 50) {
      effectiveness.challenges.push('Insufficient verification coverage');
    }

    return effectiveness;
  }

  /**
   * Assess efficiency impact dimension
   */
  assessEfficiencyImpact(trackingChain) {
    const distributionStages = trackingChain.stages.filter(stage => stage.type === 'distribution');
    
    const efficiency = {
      score: 0,
      metrics: {
        costPerBeneficiary: this.calculateCostPerBeneficiary(trackingChain),
        timeToDistribution: this.calculateAverageDistributionTime(distributionStages),
        administrativeOverhead: this.calculateAdministrativeOverhead(trackingChain),
        resourceUtilization: this.calculateResourceUtilization(trackingChain)
      },
      strengths: [],
      challenges: []
    };

    // Calculate efficiency score (lower costs and times are better)
    let score = 0;
    
    // Cost efficiency (40 points)
    if (efficiency.metrics.costPerBeneficiary < 50) score += 40;
    else if (efficiency.metrics.costPerBeneficiary < 100) score += 30;
    else if (efficiency.metrics.costPerBeneficiary < 200) score += 20;
    else score += 10;

    // Time efficiency (30 points)
    if (efficiency.metrics.timeToDistribution < 24) score += 30;
    else if (efficiency.metrics.timeToDistribution < 72) score += 20;
    else if (efficiency.metrics.timeToDistribution < 168) score += 15;
    else score += 10;

    // Administrative efficiency (30 points)
    score += Math.max(0, 30 - efficiency.metrics.administrativeOverhead);

    efficiency.score = Math.min(100, score);

    // Identify strengths and challenges
    if (efficiency.metrics.costPerBeneficiary < 100) {
      efficiency.strengths.push('Cost-effective distribution');
    }
    if (efficiency.metrics.timeToDistribution < 48) {
      efficiency.strengths.push('Rapid distribution timeline');
    }
    if (efficiency.metrics.administrativeOverhead < 15) {
      efficiency.strengths.push('Low administrative overhead');
    }

    if (efficiency.metrics.costPerBeneficiary > 200) {
      efficiency.challenges.push('High cost per beneficiary');
    }
    if (efficiency.metrics.timeToDistribution > 168) {
      efficiency.challenges.push('Slow distribution process');
    }

    return efficiency;
  }

  /**
   * Assess sustainability impact dimension
   */
  assessSustainabilityImpact(trackingChain) {
    const sustainability = {
      score: 0,
      metrics: {
        localCapacityBuilding: this.assessLocalCapacityBuilding(trackingChain),
        environmentalImpact: this.assessEnvironmentalImpact(trackingChain),
        communityOwnership: this.assessCommunityOwnership(trackingChain),
        systemStrengthening: this.assessSystemStrengthening(trackingChain)
      },
      strengths: [],
      challenges: []
    };

    // Calculate sustainability score
    let score = 0;
    score += sustainability.metrics.localCapacityBuilding * 0.3;
    score += sustainability.metrics.environmentalImpact * 0.2;
    score += sustainability.metrics.communityOwnership * 0.3;
    score += sustainability.metrics.systemStrengthening * 0.2;

    sustainability.score = Math.round(score);

    // Identify strengths and challenges based on metrics
    if (sustainability.metrics.localCapacityBuilding > 70) {
      sustainability.strengths.push('Strong local capacity building');
    }
    if (sustainability.metrics.communityOwnership > 70) {
      sustainability.strengths.push('Good community ownership');
    }

    if (sustainability.metrics.localCapacityBuilding < 40) {
      sustainability.challenges.push('Limited local capacity building');
    }
    if (sustainability.metrics.environmentalImpact < 60) {
      sustainability.challenges.push('Environmental impact concerns');
    }

    return sustainability;
  }

  /**
   * Assess accountability impact dimension
   */
  assessAccountabilityImpact(trackingChain) {
    const accountability = {
      score: 0,
      metrics: {
        transparencyScore: this.calculateChainTransparencyScore(trackingChain),
        feedbackMechanisms: this.assessFeedbackMechanisms(trackingChain),
        complaintHandling: this.assessComplaintHandling(trackingChain),
        participatoryApproaches: this.assessParticipatoryApproaches(trackingChain)
      },
      strengths: [],
      challenges: []
    };

    // Calculate accountability score
    let score = 0;
    score += accountability.metrics.transparencyScore * 0.4;
    score += accountability.metrics.feedbackMechanisms * 0.2;
    score += accountability.metrics.complaintHandling * 0.2;
    score += accountability.metrics.participatoryApproaches * 0.2;

    accountability.score = Math.round(score);

    // Identify strengths and challenges
    if (accountability.metrics.transparencyScore > 80) {
      accountability.strengths.push('High transparency standards');
    }
    if (accountability.metrics.feedbackMechanisms > 70) {
      accountability.strengths.push('Effective feedback mechanisms');
    }

    if (accountability.metrics.transparencyScore < 60) {
      accountability.challenges.push('Transparency needs improvement');
    }
    if (accountability.metrics.feedbackMechanisms < 50) {
      accountability.challenges.push('Limited feedback mechanisms');
    }

    return accountability;
  }

  /**
   * Assess beneficiary outcomes
   */
  assessBeneficiaryOutcomes(trackingChain) {
    const verificationStages = trackingChain.stages.filter(stage => stage.type === 'verification');
    
    const outcomes = {
      immediateOutcomes: {
        needsMet: this.calculateNeedsMet(verificationStages),
        satisfactionLevel: this.calculateSatisfactionLevel(verificationStages),
        accessImprovement: this.calculateAccessImprovement(verificationStages)
      },
      intermediateOutcomes: {
        capacityImprovement: this.calculateCapacityImprovement(verificationStages),
        resilience: this.calculateResilienceImprovement(verificationStages),
        socialCohesion: this.calculateSocialCohesionImpact(verificationStages)
      },
      longTermOutcomes: {
        sustainableChange: this.calculateSustainableChange(verificationStages),
        systemicImpact: this.calculateBeneficiarySystemicImpact(verificationStages)
      }
    };

    return outcomes;
  }

  /**
   * Assess systemic impact
   */
  assessSystemicImpact(trackingChain) {
    return {
      marketImpact: this.assessMarketImpact(trackingChain),
      institutionalStrengthening: this.assessInstitutionalStrengthening(trackingChain),
      policyInfluence: this.assessPolicyInfluence(trackingChain),
      sectorCoordination: this.assessSectorCoordination(trackingChain),
      innovationContribution: this.assessInnovationContribution(trackingChain)
    };
  }

  /**
   * Extract lessons learned from tracking chain
   */
  extractLessonsLearned(trackingChain) {
    const lessons = {
      successes: [],
      challenges: [],
      innovations: [],
      recommendations: []
    };

    // Analyze distribution patterns for lessons
    const distributionStages = trackingChain.stages.filter(stage => stage.type === 'distribution');
    const verificationStages = trackingChain.stages.filter(stage => stage.type === 'verification');

    // Success patterns
    if (this.calculateCompletionRate(distributionStages) > 90) {
      lessons.successes.push('Achieved high completion rate through effective planning');
    }

    if (verificationStages.length / distributionStages.length > 0.8) {
      lessons.successes.push('Strong verification coverage ensured accountability');
    }

    // Challenge patterns
    const avgDistributionTime = this.calculateAverageDistributionTime(distributionStages);
    if (avgDistributionTime > 168) { // More than a week
      lessons.challenges.push('Distribution timeline exceeded optimal timeframe');
      lessons.recommendations.push('Streamline distribution processes to reduce delays');
    }

    // Innovation patterns
    const hasGPSVerification = distributionStages.some(stage => 
      stage.transparencyData?.gpsCoordinates
    );
    if (hasGPSVerification) {
      lessons.innovations.push('GPS verification enhanced transparency and accountability');
    }

    const hasPhotoVerification = distributionStages.some(stage => 
      stage.transparencyData?.photos
    );
    if (hasPhotoVerification) {
      lessons.innovations.push('Photo documentation improved verification quality');
    }

    return lessons;
  }

  /**
   * Generate impact-based recommendations
   */
  generateImpactRecommendations(trackingChain) {
    const recommendations = [];
    
    const distributionStages = trackingChain.stages.filter(stage => stage.type === 'distribution');
    const verificationStages = trackingChain.stages.filter(stage => stage.type === 'verification');

    // Reach recommendations
    const totalBeneficiaries = this.calculateBeneficiariesReached(trackingChain);
    if (totalBeneficiaries < 100) {
      recommendations.push({
        category: 'reach',
        priority: 'high',
        recommendation: 'Expand outreach strategies to reach more beneficiaries',
        expectedImpact: 'Increased beneficiary coverage and program effectiveness'
      });
    }

    // Effectiveness recommendations
    const completionRate = this.calculateCompletionRate(distributionStages);
    if (completionRate < 80) {
      recommendations.push({
        category: 'effectiveness',
        priority: 'high',
        recommendation: 'Improve distribution completion rates through better planning and monitoring',
        expectedImpact: 'Higher program effectiveness and beneficiary satisfaction'
      });
    }

    // Efficiency recommendations
    const costPerBeneficiary = this.calculateCostPerBeneficiary(trackingChain);
    if (costPerBeneficiary > 200) {
      recommendations.push({
        category: 'efficiency',
        priority: 'medium',
        recommendation: 'Optimize distribution costs through economies of scale and process improvements',
        expectedImpact: 'Reduced cost per beneficiary and improved resource utilization'
      });
    }

    // Accountability recommendations
    const verificationRate = (verificationStages.length / distributionStages.length) * 100;
    if (verificationRate < 70) {
      recommendations.push({
        category: 'accountability',
        priority: 'high',
        recommendation: 'Increase third-party verification coverage for better accountability',
        expectedImpact: 'Enhanced transparency and stakeholder confidence'
      });
    }

    return recommendations;
  }

  /**
   * Generate comparative benchmarks
   */
  async generateComparativeBenchmarks(trackingChain, assessmentCriteria) {
    // In a real implementation, this would compare against sector benchmarks
    const benchmarks = {
      sectorAverages: {
        costPerBeneficiary: 150,
        completionRate: 75,
        verificationRate: 60,
        transparencyScore: 65
      },
      peerComparison: {
        betterThanPeers: [],
        worseeThanPeers: [],
        similarToPeers: []
      },
      bestPractices: [
        'Use of GPS verification for enhanced transparency',
        'Multi-stage verification process',
        'Real-time beneficiary feedback collection',
        'Integration with local coordination mechanisms'
      ]
    };

    // Compare current performance against benchmarks
    const currentMetrics = {
      costPerBeneficiary: this.calculateCostPerBeneficiary(trackingChain),
      completionRate: this.calculateCompletionRate(
        trackingChain.stages.filter(stage => stage.type === 'distribution')
      ),
      verificationRate: this.calculateVerificationCoverage(trackingChain),
      transparencyScore: this.calculateChainTransparencyScore(trackingChain)
    };

    Object.keys(currentMetrics).forEach(metric => {
      const current = currentMetrics[metric];
      const benchmark = benchmarks.sectorAverages[metric];
      
      if (current > benchmark * 1.1) {
        benchmarks.peerComparison.betterThanPeers.push({
          metric,
          current,
          benchmark,
          difference: Math.round(((current - benchmark) / benchmark) * 100)
        });
      } else if (current < benchmark * 0.9) {
        benchmarks.peerComparison.worseeThanPeers.push({
          metric,
          current,
          benchmark,
          difference: Math.round(((benchmark - current) / benchmark) * 100)
        });
      } else {
        benchmarks.peerComparison.similarToPeers.push({
          metric,
          current,
          benchmark
        });
      }
    });

    return benchmarks;
  }

  /**
   * Helper methods for impact assessment calculations
   */
  calculateGeographicReach(distributionStages) {
    const locations = new Set(distributionStages.map(stage => stage.location));
    return {
      uniqueLocations: locations.size,
      locations: Array.from(locations)
    };
  }

  calculateDemographicDiversity(distributionStages) {
    // Simplified demographic diversity calculation
    // In real implementation, would analyze actual demographic data
    let diversityScore = 0;
    
    const categories = new Set(distributionStages.map(stage => stage.category));
    diversityScore += Math.min(20, categories.size * 5); // Up to 20 points for category diversity
    
    const hasChildrenFocus = distributionStages.some(stage => 
      stage.description?.toLowerCase().includes('children')
    );
    if (hasChildrenFocus) diversityScore += 5;
    
    return Math.min(25, diversityScore);
  }

  calculateAccessibilityScore(distributionStages) {
    let accessibilityScore = 0;
    
    distributionStages.forEach(stage => {
      if (stage.distributionMethod === 'direct') accessibilityScore += 2;
      if (stage.transparencyData?.accessibilityFeatures) accessibilityScore += 3;
      if (stage.location?.toLowerCase().includes('remote')) accessibilityScore += 2;
    });
    
    return Math.min(20, accessibilityScore);
  }

  calculateCompletionRate(distributionStages) {
    if (distributionStages.length === 0) return 0;
    
    const completedStages = distributionStages.filter(stage => 
      stage.status === 'completed'
    );
    
    return Math.round((completedStages.length / distributionStages.length) * 100);
  }

  calculateQualityScore(distributionStages, verificationStages) {
    let qualityScore = 0;
    
    // Base quality from transparency
    const avgTransparency = distributionStages.reduce((sum, stage) => 
      sum + this.calculateStageTransparencyScore(stage), 0
    ) / Math.max(distributionStages.length, 1);
    
    qualityScore += avgTransparency * 0.6;
    
    // Quality from verification
    const verificationQuality = verificationStages.reduce((sum, stage) => {
      let stageQuality = 0;
      if (stage.verificationResults?.distributionConfirmed) stageQuality += 20;
      if (stage.verificationResults?.beneficiariesReached) stageQuality += 15;
      if (stage.verificationResults?.impactAssessment) stageQuality += 15;
      return sum + stageQuality;
    }, 0) / Math.max(verificationStages.length, 1);
    
    qualityScore += verificationQuality * 0.4;
    
    return Math.round(qualityScore);
  }

  calculateTargetingAccuracy(distributionStages) {
    // Simplified targeting accuracy calculation
    // In real implementation, would compare against targeting criteria
    let accuracyScore = 70; // Base score
    
    const hasTargetingData = distributionStages.some(stage => 
      stage.transparencyData?.targetingCriteria
    );
    if (hasTargetingData) accuracyScore += 20;
    
    const hasVulnerabilityAssessment = distributionStages.some(stage => 
      stage.transparencyData?.vulnerabilityAssessment
    );
    if (hasVulnerabilityAssessment) accuracyScore += 10;
    
    return Math.min(100, accuracyScore);
  }

  calculateAverageDistributionTime(distributionStages) {
    const completedStages = distributionStages.filter(stage => 
      stage.status === 'completed' && stage.timestamp
    );
    
    if (completedStages.length === 0) return 0;
    
    // Calculate average time from creation to completion (in hours)
    const totalTime = completedStages.reduce((sum, stage) => {
      const creationTime = new Date(stage.timestamp);
      const completionTime = new Date(); // Simplified - would use actual completion time
      return sum + (completionTime - creationTime) / (1000 * 60 * 60);
    }, 0);
    
    return Math.round(totalTime / completedStages.length);
  }

  calculateAdministrativeOverhead(trackingChain) {
    // Simplified calculation - in real implementation would analyze actual overhead costs
    const totalStages = trackingChain.stages.length;
    const verificationStages = trackingChain.stages.filter(stage => stage.type === 'verification').length;
    
    // Higher verification ratio indicates higher administrative overhead
    const verificationRatio = verificationStages / Math.max(totalStages, 1);
    return Math.round(verificationRatio * 30); // Convert to percentage
  }

  calculateResourceUtilization(trackingChain) {
    const totalAmount = trackingChain.initialAmount;
    const distributedAmount = this.calculateTotalDistributed(trackingChain);
    
    return Math.round((distributedAmount / totalAmount) * 100);
  }

  // Additional helper methods for sustainability and accountability assessments
  assessLocalCapacityBuilding(trackingChain) {
    // Simplified assessment - in real implementation would analyze capacity building activities
    return 60; // Base score
  }

  assessEnvironmentalImpact(trackingChain) {
    // Simplified assessment - in real implementation would analyze environmental factors
    return 70; // Base score
  }

  assessCommunityOwnership(trackingChain) {
    // Simplified assessment - in real implementation would analyze community participation
    return 65; // Base score
  }

  assessSystemStrengthening(trackingChain) {
    // Simplified assessment - in real implementation would analyze system strengthening activities
    return 55; // Base score
  }

  calculateChainTransparencyScore(trackingChain) {
    const distributionStages = trackingChain.stages.filter(stage => stage.type === 'distribution');
    
    if (distributionStages.length === 0) return 0;
    
    const totalScore = distributionStages.reduce((sum, stage) => 
      sum + this.calculateStageTransparencyScore(stage), 0
    );
    
    return Math.round(totalScore / distributionStages.length);
  }

  assessFeedbackMechanisms(trackingChain) {
    // Simplified assessment - in real implementation would analyze feedback systems
    return 60; // Base score
  }

  assessComplaintHandling(trackingChain) {
    // Simplified assessment - in real implementation would analyze complaint handling
    return 65; // Base score
  }

  assessParticipatoryApproaches(trackingChain) {
    // Simplified assessment - in real implementation would analyze participatory methods
    return 55; // Base score
  }

  // Additional outcome assessment methods
  calculateNeedsMet(verificationStages) {
    return verificationStages.length > 0 ? 75 : 50; // Simplified
  }

  calculateSatisfactionLevel(verificationStages) {
    return verificationStages.length > 0 ? 80 : 60; // Simplified
  }

  calculateAccessImprovement(verificationStages) {
    return verificationStages.length > 0 ? 70 : 50; // Simplified
  }

  calculateCapacityImprovement(verificationStages) {
    return 60; // Simplified
  }

  calculateResilienceImprovement(verificationStages) {
    return 65; // Simplified
  }

  calculateSocialCohesionImpact(verificationStages) {
    return 55; // Simplified
  }

  calculateSustainableChange(verificationStages) {
    return 50; // Simplified
  }

  calculateBeneficiarySystemicImpact(verificationStages) {
    return 45; // Simplified
  }

  // Systemic impact assessment methods
  assessMarketImpact(trackingChain) {
    return 40; // Simplified
  }

  assessInstitutionalStrengthening(trackingChain) {
    return 55; // Simplified
  }

  assessPolicyInfluence(trackingChain) {
    return 30; // Simplified
  }

  assessSectorCoordination(trackingChain) {
    return 60; // Simplified
  }

  assessInnovationContribution(trackingChain) {
    return 70; // Simplified
  }

  /**
   * Validate audit trail integrity
   */
  validateAuditTrailIntegrity(trackingChain) {
    const integrity = {
      isValid: true,
      issues: [],
      score: 100
    };
    
    // Check chronological order
    const stages = trackingChain.stages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    for (let i = 1; i < stages.length; i++) {
      if (new Date(stages[i].timestamp) < new Date(stages[i-1].timestamp)) {
        integrity.issues.push('Chronological order violation detected');
        integrity.score -= 20;
        break;
      }
    }
    
    // Check for missing critical stages
    const hasInitialDonation = stages.some(stage => stage.type === 'donation');
    if (!hasInitialDonation) {
      integrity.issues.push('Missing initial donation stage');
      integrity.score -= 30;
    }
    
    // Check amount consistency
    const donationStage = stages.find(stage => stage.type === 'donation');
    const distributionStages = stages.filter(stage => stage.type === 'distribution');
    const totalDistributed = distributionStages.reduce((sum, stage) => sum + stage.amount, 0);
    
    if (donationStage && totalDistributed > donationStage.amount * 1.01) { // Allow 1% tolerance
      integrity.issues.push('Total distributed amount exceeds donation amount');
      integrity.score -= 25;
    }
    
    // Check for gaps in tracking
    const timeGaps = [];
    for (let i = 1; i < stages.length; i++) {
      const timeDiff = new Date(stages[i].timestamp) - new Date(stages[i-1].timestamp);
      const daysDiff = timeDiff / (1000 * 60 * 60 * 24);
      if (daysDiff > 30) { // More than 30 days gap
        timeGaps.push(daysDiff);
      }
    }
    
    if (timeGaps.length > 0) {
      integrity.issues.push(`${timeGaps.length} significant time gaps in tracking`);
      integrity.score -= Math.min(15, timeGaps.length * 5);
    }
    
    integrity.isValid = integrity.score >= 70;
    integrity.score = Math.max(0, integrity.score);
    
    return integrity;
  }

  /**
   * Generate donor-specific visibility report
   */
  generateDonorVisibilityReport(trackingChain) {
    return {
      donationImpact: this.calculateImpactRealization(trackingChain),
      transparencyLevel: 'full', // Donors get full visibility
      fundUtilization: {
        totalDonated: trackingChain.initialAmount,
        totalDistributed: this.calculateTotalDistributed(trackingChain),
        utilizationRate: Math.round((this.calculateTotalDistributed(trackingChain) / trackingChain.initialAmount) * 100),
        remainingFunds: trackingChain.initialAmount - this.calculateTotalDistributed(trackingChain)
      },
      beneficiaryReach: {
        totalBeneficiaries: this.calculateBeneficiariesReached(trackingChain),
        verifiedBeneficiaries: this.calculateVerifiedBeneficiaries(trackingChain),
        costPerBeneficiary: this.calculateCostPerBeneficiary(trackingChain)
      },
      verificationStatus: this.getVerificationStatus(trackingChain)
    };
  }

  /**
   * Generate recipient-specific visibility report
   */
  generateRecipientVisibilityReport(trackingChain) {
    const distributionStages = trackingChain.stages.filter(stage => stage.type === 'distribution');
    
    return {
      transparencyLevel: 'recipient_focused',
      distributionsReceived: distributionStages.map(stage => ({
        amount: stage.amount,
        currency: stage.currency,
        purpose: stage.description,
        timestamp: stage.timestamp,
        location: stage.location,
        status: stage.status
      })),
      totalReceived: distributionStages.reduce((sum, stage) => sum + stage.amount, 0),
      verificationParticipation: distributionStages.filter(stage => 
        stage.verificationData && Object.keys(stage.verificationData).length > 0
      ).length
    };
  }

  /**
   * Generate public visibility report
   */
  generatePublicVisibilityReport(trackingChain) {
    return {
      transparencyLevel: 'public_summary',
      donationSummary: {
        totalAmount: trackingChain.initialAmount,
        currency: trackingChain.currency,
        purpose: trackingChain.purpose,
        status: trackingChain.status
      },
      impactSummary: {
        beneficiariesReached: this.calculateBeneficiariesReached(trackingChain),
        distributionCount: trackingChain.stages.filter(stage => stage.type === 'distribution').length,
        verificationCount: trackingChain.stages.filter(stage => stage.type === 'verification').length,
        geographicReach: this.calculateGeographicReach(trackingChain.stages.filter(stage => stage.type === 'distribution'))
      },
      transparencyScore: trackingChain.summary?.averageTransparencyScore || 0,
      lastUpdated: trackingChain.updatedAt
    };
  }

  /**
   * Generate regulator-specific visibility report
   */
  generateRegulatorVisibilityReport(trackingChain) {
    return {
      transparencyLevel: 'regulatory_compliance',
      complianceMetrics: {
        auditTrailIntegrity: this.validateAuditTrailIntegrity(trackingChain),
        verificationCoverage: this.calculateVerificationCoverage(trackingChain),
        dataCompleteness: this.calculateDataCompleteness(trackingChain),
        fraudRiskScore: this.calculateChainFraudRisk(trackingChain)
      },
      organizationCompliance: {
        organizationId: trackingChain.targetOrganizationId,
        verificationRequired: true,
        reportingCompliance: 'compliant' // This would be determined by actual compliance checks
      },
      auditEvents: trackingChain.stages.map(stage => ({
        stageId: stage.stageId,
        type: stage.type,
        timestamp: stage.timestamp,
        amount: stage.amount,
        location: stage.location,
        verificationLevel: this.calculateStageVerificationLevel(stage)
      }))
    };
  }

  /**
   * Calculate various helper metrics
   */
  calculateStageVerificationLevel(stage) {
    if (!stage.verificationData) return 'none';
    
    const verificationCount = Object.keys(stage.verificationData).filter(
      key => stage.verificationData[key]
    ).length;
    
    if (verificationCount === 0) return 'none';
    if (verificationCount <= 2) return 'basic';
    if (verificationCount <= 4) return 'standard';
    return 'comprehensive';
  }

  calculateAverageDistributionTime(distributionStages) {
    const completedStages = distributionStages.filter(stage => stage.status === 'completed');
    if (completedStages.length === 0) return 0;
    
    // This would calculate based on creation to completion time in a real implementation
    return 24; // Placeholder: 24 hours average
  }

  calculateGeographicReach(distributionStages) {
    const locations = new Set();
    distributionStages.forEach(stage => {
      if (stage.location) locations.add(stage.location);
    });
    return locations.size;
  }

  calculateVerifiedBeneficiaries(trackingChain) {
    const verificationStages = trackingChain.stages.filter(stage => stage.type === 'verification');
    return verificationStages.reduce(
      (sum, stage) => sum + (stage.verificationResults?.beneficiariesReached || 0), 0
    );
  }

  calculateCostPerBeneficiary(trackingChain) {
    const totalBeneficiaries = this.calculateBeneficiariesReached(trackingChain);
    return totalBeneficiaries > 0 ? 
      Math.round(trackingChain.initialAmount / totalBeneficiaries) : 0;
  }

  calculateChainFraudRisk(trackingChain) {
    // This would integrate with the fraud detection service in a real implementation
    return 0.1; // Placeholder: low risk
  }

  calculateChainComplianceScore(trackingChain) {
    const auditIntegrity = this.validateAuditTrailIntegrity(trackingChain);
    const verificationCoverage = this.calculateVerificationCoverage(trackingChain);
    const dataCompleteness = this.calculateDataCompleteness(trackingChain);
    
    return Math.round((auditIntegrity.score + verificationCoverage + dataCompleteness) / 3);
  }

  calculateReputationRisk(trackingChain) {
    const transparencyScore = trackingChain.summary?.averageTransparencyScore || 0;
    const verificationRate = this.calculateVerificationCoverage(trackingChain);
    const completionRate = trackingChain.status === 'verified' ? 100 : 50;
    
    const reputationScore = (transparencyScore + verificationRate + completionRate) / 3;
    return Math.max(0, 100 - reputationScore); // Higher score = higher risk
  }
}

module.exports = DonationTrackingService;