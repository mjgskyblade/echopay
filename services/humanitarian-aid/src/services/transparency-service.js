const logger = require('../utils/logger');
const AidDistribution = require('../models/aid-distribution');

class TransparencyService {
  constructor() {
    this.transparencyLevels = {
      standard: {
        requiredFields: ['purpose', 'category', 'amount'],
        publicFields: ['purpose', 'category', 'amount', 'location']
      },
      enhanced: {
        requiredFields: ['purpose', 'category', 'amount', 'location', 'beneficiaryCount'],
        publicFields: ['purpose', 'category', 'amount', 'location', 'beneficiaryCount', 'photos']
      },
      full_public: {
        requiredFields: ['purpose', 'category', 'amount', 'location', 'beneficiaryCount', 'gpsCoordinates'],
        publicFields: ['*'] // All non-sensitive fields
      }
    };
  }

  /**
   * Validate transparency requirements for an aid distribution
   */
  validateTransparencyRequirements(distribution, organizationTransparencyLevel) {
    const requirements = this.transparencyLevels[organizationTransparencyLevel];
    if (!requirements) {
      throw new Error(`Invalid transparency level: ${organizationTransparencyLevel}`);
    }

    const missingFields = [];
    
    for (const field of requirements.requiredFields) {
      if (!this.hasRequiredField(distribution, field)) {
        missingFields.push(field);
      }
    }

    return {
      isValid: missingFields.length === 0,
      missingFields,
      transparencyLevel: organizationTransparencyLevel
    };
  }

  /**
   * Check if distribution has required field
   */
  hasRequiredField(distribution, field) {
    switch (field) {
      case 'purpose':
        return distribution.purpose && distribution.purpose.trim().length > 0;
      case 'category':
        return distribution.category && AidDistribution.validateCategory(distribution.category);
      case 'amount':
        return distribution.amount && distribution.amount > 0;
      case 'location':
        return distribution.location && distribution.location.trim().length > 0;
      case 'beneficiaryCount':
        return distribution.transparencyData.beneficiaryCount && 
               distribution.transparencyData.beneficiaryCount > 0;
      case 'gpsCoordinates':
        return distribution.transparencyData.gpsCoordinates &&
               distribution.transparencyData.gpsCoordinates.lat &&
               distribution.transparencyData.gpsCoordinates.lng;
      default:
        return false;
    }
  }

  /**
   * Generate public transparency report for a distribution
   */
  generatePublicReport(distribution, organizationTransparencyLevel) {
    const requirements = this.transparencyLevels[organizationTransparencyLevel];
    if (!requirements) {
      throw new Error(`Invalid transparency level: ${organizationTransparencyLevel}`);
    }

    const publicData = {};
    
    if (requirements.publicFields.includes('*')) {
      // Full public transparency - include all non-sensitive fields
      return distribution.toPublicJSON();
    }

    // Include only specified public fields
    for (const field of requirements.publicFields) {
      if (distribution[field] !== undefined) {
        publicData[field] = distribution[field];
      }
    }

    // Always include basic metadata
    publicData.id = distribution.id;
    publicData.organizationId = distribution.organizationId;
    publicData.status = distribution.status;
    publicData.transparencyScore = distribution.getTransparencyScore();
    publicData.createdAt = distribution.createdAt;

    return publicData;
  }

  /**
   * Generate transparency metrics for an organization
   */
  generateOrganizationTransparencyMetrics(distributions) {
    const metrics = {
      totalDistributions: distributions.length,
      averageTransparencyScore: 0,
      fullyTransparentCount: 0,
      categoryBreakdown: {},
      locationBreakdown: {},
      statusBreakdown: {}
    };

    if (distributions.length === 0) {
      return metrics;
    }

    let totalScore = 0;
    
    for (const distribution of distributions) {
      // Calculate average transparency score
      const score = distribution.getTransparencyScore();
      totalScore += score;
      
      if (distribution.isFullyTransparent()) {
        metrics.fullyTransparentCount++;
      }

      // Category breakdown
      const category = distribution.category || 'unknown';
      metrics.categoryBreakdown[category] = (metrics.categoryBreakdown[category] || 0) + 1;

      // Location breakdown
      const location = distribution.location || 'unknown';
      metrics.locationBreakdown[location] = (metrics.locationBreakdown[location] || 0) + 1;

      // Status breakdown
      const status = distribution.status || 'unknown';
      metrics.statusBreakdown[status] = (metrics.statusBreakdown[status] || 0) + 1;
    }

    metrics.averageTransparencyScore = Math.round(totalScore / distributions.length);
    metrics.transparencyRate = Math.round((metrics.fullyTransparentCount / distributions.length) * 100);

    return metrics;
  }

  /**
   * Generate donation tracking chain for end-to-end visibility
   */
  generateDonationTrackingChain(distributions) {
    const chain = [];
    
    // Group distributions by campaign
    const campaignGroups = {};
    for (const distribution of distributions) {
      const campaignId = distribution.campaignId || 'direct';
      if (!campaignGroups[campaignId]) {
        campaignGroups[campaignId] = [];
      }
      campaignGroups[campaignId].push(distribution);
    }

    // Create tracking chain for each campaign
    for (const [campaignId, campaignDistributions] of Object.entries(campaignGroups)) {
      const campaignChain = {
        campaignId,
        totalAmount: 0,
        currency: campaignDistributions[0]?.currency || 'USD',
        distributionCount: campaignDistributions.length,
        distributions: [],
        overallTransparencyScore: 0
      };

      let totalTransparencyScore = 0;

      for (const distribution of campaignDistributions) {
        campaignChain.totalAmount += distribution.amount;
        totalTransparencyScore += distribution.getTransparencyScore();
        
        campaignChain.distributions.push({
          id: distribution.id,
          amount: distribution.amount,
          purpose: distribution.purpose,
          location: distribution.location,
          status: distribution.status,
          transparencyScore: distribution.getTransparencyScore(),
          timestamp: distribution.createdAt
        });
      }

      campaignChain.overallTransparencyScore = Math.round(
        totalTransparencyScore / campaignDistributions.length
      );

      // Sort distributions by timestamp
      campaignChain.distributions.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

      chain.push(campaignChain);
    }

    return chain;
  }

  /**
   * Validate transparency data integrity
   */
  validateTransparencyDataIntegrity(distribution) {
    const issues = [];

    // Check for required transparency data consistency
    if (distribution.transparencyData.beneficiaryCount) {
      if (distribution.transparencyData.beneficiaryCount <= 0) {
        issues.push('Beneficiary count must be positive');
      }
    }

    if (distribution.transparencyData.gpsCoordinates) {
      const { lat, lng } = distribution.transparencyData.gpsCoordinates;
      if (!lat || !lng || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        issues.push('Invalid GPS coordinates');
      }
    }

    if (distribution.amount <= 0) {
      issues.push('Distribution amount must be positive');
    }

    if (distribution.purpose && distribution.purpose.length < 10) {
      issues.push('Purpose description should be at least 10 characters');
    }

    return {
      isValid: issues.length === 0,
      issues
    };
  }

  /**
   * Generate transparency audit trail
   */
  generateAuditTrail(distribution) {
    const auditTrail = {
      distributionId: distribution.id,
      organizationId: distribution.organizationId,
      transparencyScore: distribution.getTransparencyScore(),
      auditTimestamp: new Date(),
      dataIntegrity: this.validateTransparencyDataIntegrity(distribution),
      transparencyElements: {
        hasBasicInfo: !!(distribution.purpose && distribution.category),
        hasLocationData: !!distribution.location,
        hasImpactMetrics: Object.keys(distribution.impactMetrics).length > 0,
        hasVerificationData: Object.keys(distribution.verificationData).length > 0,
        hasPhotos: !!distribution.transparencyData.photos,
        hasGpsCoordinates: !!distribution.transparencyData.gpsCoordinates
      }
    };

    return auditTrail;
  }

  /**
   * Generate enhanced transparency report for humanitarian organizations
   * Implements requirement 8.3: Enhanced transparency and accountability
   */
  generateEnhancedTransparencyReport(distributions, organizationData) {
    const report = {
      organizationId: organizationData.id,
      organizationName: organizationData.name,
      reportTimestamp: new Date(),
      reportingPeriod: {
        startDate: distributions.length > 0 ? 
          new Date(Math.min(...distributions.map(d => d.createdAt))) : null,
        endDate: distributions.length > 0 ? 
          new Date(Math.max(...distributions.map(d => d.createdAt))) : null
      },
      transparencyMetrics: this.generateOrganizationTransparencyMetrics(distributions),
      impactSummary: this.generateImpactSummary(distributions),
      verificationStatus: this.generateVerificationStatus(distributions),
      complianceScore: this.calculateComplianceScore(distributions, organizationData),
      publicAccountability: {
        totalFundsDistributed: distributions.reduce((sum, d) => sum + d.amount, 0),
        beneficiariesReached: this.calculateTotalBeneficiaries(distributions),
        geographicCoverage: this.calculateGeographicCoverage(distributions),
        categoryBreakdown: this.generateCategoryBreakdown(distributions)
      },
      auditTrails: distributions.map(d => this.generateAuditTrail(d))
    };

    return report;
  }

  /**
   * Generate impact summary for humanitarian operations
   */
  generateImpactSummary(distributions) {
    const summary = {
      totalDistributions: distributions.length,
      completedDistributions: distributions.filter(d => d.status === 'completed').length,
      averageDistributionAmount: 0,
      impactCategories: {},
      timeToCompletion: {
        average: 0,
        median: 0,
        fastest: null,
        slowest: null
      }
    };

    if (distributions.length === 0) return summary;

    // Calculate average distribution amount
    summary.averageDistributionAmount = Math.round(
      distributions.reduce((sum, d) => sum + d.amount, 0) / distributions.length
    );

    // Analyze impact by category
    const categoryImpact = {};
    distributions.forEach(distribution => {
      const category = distribution.category || 'other';
      if (!categoryImpact[category]) {
        categoryImpact[category] = {
          count: 0,
          totalAmount: 0,
          beneficiaries: 0,
          averageTransparency: 0
        };
      }
      
      categoryImpact[category].count++;
      categoryImpact[category].totalAmount += distribution.amount;
      categoryImpact[category].beneficiaries += 
        distribution.transparencyData.beneficiaryCount || 0;
      categoryImpact[category].averageTransparency += distribution.getTransparencyScore();
    });

    // Finalize category impact calculations
    Object.keys(categoryImpact).forEach(category => {
      categoryImpact[category].averageTransparency = Math.round(
        categoryImpact[category].averageTransparency / categoryImpact[category].count
      );
    });

    summary.impactCategories = categoryImpact;

    // Calculate time to completion metrics
    const completedDistributions = distributions.filter(d => 
      d.status === 'completed' && d.updatedAt && d.createdAt
    );

    if (completedDistributions.length > 0) {
      const completionTimes = completedDistributions.map(d => 
        (new Date(d.updatedAt) - new Date(d.createdAt)) / (1000 * 60 * 60) // hours
      );

      summary.timeToCompletion.average = Math.round(
        completionTimes.reduce((sum, time) => sum + time, 0) / completionTimes.length
      );

      completionTimes.sort((a, b) => a - b);
      summary.timeToCompletion.median = Math.round(
        completionTimes[Math.floor(completionTimes.length / 2)]
      );
      summary.timeToCompletion.fastest = Math.round(Math.min(...completionTimes));
      summary.timeToCompletion.slowest = Math.round(Math.max(...completionTimes));
    }

    return summary;
  }

  /**
   * Generate verification status summary
   */
  generateVerificationStatus(distributions) {
    const status = {
      totalDistributions: distributions.length,
      verifiedDistributions: 0,
      thirdPartyVerified: 0,
      photoVerified: 0,
      gpsVerified: 0,
      verificationRate: 0,
      verificationMethods: {}
    };

    distributions.forEach(distribution => {
      if (distribution.verificationData.thirdPartyVerified) {
        status.verifiedDistributions++;
        status.thirdPartyVerified++;
      }

      if (distribution.transparencyData.photos) {
        status.photoVerified++;
      }

      if (distribution.transparencyData.gpsCoordinates) {
        status.gpsVerified++;
      }

      // Track verification methods
      Object.keys(distribution.verificationData).forEach(method => {
        if (distribution.verificationData[method]) {
          status.verificationMethods[method] = 
            (status.verificationMethods[method] || 0) + 1;
        }
      });
    });

    if (distributions.length > 0) {
      status.verificationRate = Math.round(
        (status.verifiedDistributions / distributions.length) * 100
      );
    }

    return status;
  }

  /**
   * Calculate compliance score for organization
   */
  calculateComplianceScore(distributions, organizationData) {
    let score = 0;
    const maxScore = 100;

    // Organization verification (30 points)
    if (organizationData.isVerified()) {
      score += 30;
    }

    // Transparency level (20 points)
    const transparencyPoints = {
      'standard': 10,
      'enhanced': 15,
      'full_public': 20
    };
    score += transparencyPoints[organizationData.transparencyLevel] || 0;

    // Average distribution transparency (30 points)
    if (distributions.length > 0) {
      const avgTransparency = distributions.reduce(
        (sum, d) => sum + d.getTransparencyScore(), 0
      ) / distributions.length;
      score += Math.round((avgTransparency / 100) * 30);
    }

    // Verification rate (20 points)
    const verificationStatus = this.generateVerificationStatus(distributions);
    score += Math.round((verificationStatus.verificationRate / 100) * 20);

    return Math.min(score, maxScore);
  }

  /**
   * Calculate total beneficiaries across all distributions
   */
  calculateTotalBeneficiaries(distributions) {
    return distributions.reduce((total, distribution) => {
      return total + (distribution.transparencyData.beneficiaryCount || 0);
    }, 0);
  }

  /**
   * Calculate geographic coverage
   */
  calculateGeographicCoverage(distributions) {
    const locations = new Set();
    const countries = new Set();
    
    distributions.forEach(distribution => {
      if (distribution.location) {
        locations.add(distribution.location.toLowerCase());
        
        // Simple country extraction (in real implementation, use proper geocoding)
        const locationParts = distribution.location.split(',');
        if (locationParts.length > 1) {
          countries.add(locationParts[locationParts.length - 1].trim().toLowerCase());
        }
      }
    });

    return {
      uniqueLocations: locations.size,
      estimatedCountries: countries.size,
      locations: Array.from(locations)
    };
  }

  /**
   * Generate category breakdown with detailed metrics
   */
  generateCategoryBreakdown(distributions) {
    const breakdown = {};
    
    distributions.forEach(distribution => {
      const category = distribution.category || 'other';
      if (!breakdown[category]) {
        breakdown[category] = {
          count: 0,
          totalAmount: 0,
          percentage: 0,
          averageAmount: 0,
          beneficiaries: 0,
          locations: new Set()
        };
      }
      
      breakdown[category].count++;
      breakdown[category].totalAmount += distribution.amount;
      breakdown[category].beneficiaries += 
        distribution.transparencyData.beneficiaryCount || 0;
      
      if (distribution.location) {
        breakdown[category].locations.add(distribution.location);
      }
    });

    // Calculate percentages and averages
    const totalAmount = distributions.reduce((sum, d) => sum + d.amount, 0);
    Object.keys(breakdown).forEach(category => {
      const categoryData = breakdown[category];
      categoryData.percentage = totalAmount > 0 ? 
        Math.round((categoryData.totalAmount / totalAmount) * 100) : 0;
      categoryData.averageAmount = Math.round(
        categoryData.totalAmount / categoryData.count
      );
      categoryData.uniqueLocations = categoryData.locations.size;
      categoryData.locations = Array.from(categoryData.locations);
    });

    return breakdown;
  }

  /**
   * Generate real-time transparency dashboard for humanitarian organizations
   * Implements requirement 8.3: Enhanced transparency and accountability
   */
  generateRealTimeTransparencyDashboard(distributions, organizationData) {
    const dashboard = {
      organizationId: organizationData.id,
      organizationName: organizationData.name,
      lastUpdated: new Date(),
      realTimeMetrics: {
        totalDistributions: distributions.length,
        totalFundsDistributed: distributions.reduce((sum, d) => sum + d.amount, 0),
        activeCampaigns: this.countActiveCampaigns(distributions),
        beneficiariesReached: this.calculateTotalBeneficiaries(distributions),
        averageTransparencyScore: this.calculateAverageTransparencyScore(distributions),
        verificationRate: this.calculateVerificationRate(distributions)
      },
      liveUpdates: {
        recentDistributions: this.getRecentDistributions(distributions, 24), // Last 24 hours
        pendingVerifications: this.getPendingVerifications(distributions),
        completedToday: this.getCompletedToday(distributions),
        emergencyDistributions: this.getEmergencyDistributions(distributions)
      },
      transparencyBreakdown: {
        fullyTransparent: distributions.filter(d => d.getTransparencyScore() >= 80).length,
        partiallyTransparent: distributions.filter(d => d.getTransparencyScore() >= 40 && d.getTransparencyScore() < 80).length,
        lowTransparency: distributions.filter(d => d.getTransparencyScore() < 40).length
      },
      geographicDistribution: this.generateGeographicDistribution(distributions),
      impactVisualization: this.generateImpactVisualization(distributions),
      complianceStatus: this.generateComplianceStatus(distributions, organizationData)
    };

    return dashboard;
  }

  /**
   * Count active campaigns
   */
  countActiveCampaigns(distributions) {
    const campaigns = new Set();
    distributions.forEach(d => {
      if (d.campaignId && d.status !== 'completed' && d.status !== 'failed') {
        campaigns.add(d.campaignId);
      }
    });
    return campaigns.size;
  }

  /**
   * Calculate average transparency score
   */
  calculateAverageTransparencyScore(distributions) {
    if (distributions.length === 0) return 0;
    const totalScore = distributions.reduce((sum, d) => sum + d.getTransparencyScore(), 0);
    return Math.round(totalScore / distributions.length);
  }

  /**
   * Calculate verification rate
   */
  calculateVerificationRate(distributions) {
    if (distributions.length === 0) return 0;
    const verifiedCount = distributions.filter(d => 
      d.verificationData.thirdPartyVerified || 
      Object.keys(d.verificationData).length > 0
    ).length;
    return Math.round((verifiedCount / distributions.length) * 100);
  }

  /**
   * Get recent distributions within specified hours
   */
  getRecentDistributions(distributions, hours) {
    const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
    return distributions
      .filter(d => new Date(d.createdAt) > cutoffTime)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 10) // Limit to 10 most recent
      .map(d => ({
        id: d.id,
        amount: d.amount,
        currency: d.currency,
        location: d.location,
        category: d.category,
        status: d.status,
        transparencyScore: d.getTransparencyScore(),
        createdAt: d.createdAt
      }));
  }

  /**
   * Get distributions pending verification
   */
  getPendingVerifications(distributions) {
    return distributions
      .filter(d => 
        d.status === 'distributed' && 
        !d.verificationData.thirdPartyVerified
      )
      .map(d => ({
        id: d.id,
        amount: d.amount,
        location: d.location,
        category: d.category,
        distributedAt: d.updatedAt,
        daysPending: Math.floor((Date.now() - new Date(d.updatedAt)) / (1000 * 60 * 60 * 24))
      }));
  }

  /**
   * Get distributions completed today
   */
  getCompletedToday(distributions) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    return distributions.filter(d => 
      d.status === 'completed' && 
      new Date(d.updatedAt) >= today
    ).length;
  }

  /**
   * Get emergency distributions
   */
  getEmergencyDistributions(distributions) {
    return distributions
      .filter(d => d.category === 'emergency')
      .map(d => ({
        id: d.id,
        amount: d.amount,
        location: d.location,
        purpose: d.purpose,
        status: d.status,
        urgencyLevel: d.transparencyData.urgencyLevel || 'standard',
        createdAt: d.createdAt
      }));
  }

  /**
   * Generate geographic distribution visualization data
   */
  generateGeographicDistribution(distributions) {
    const geographic = {};
    
    distributions.forEach(distribution => {
      const location = distribution.location || 'Unknown';
      if (!geographic[location]) {
        geographic[location] = {
          count: 0,
          totalAmount: 0,
          beneficiaries: 0,
          categories: new Set(),
          averageTransparency: 0,
          coordinates: distribution.transparencyData?.gpsCoordinates || null
        };
      }
      
      geographic[location].count++;
      geographic[location].totalAmount += distribution.amount;
      geographic[location].beneficiaries += distribution.transparencyData.beneficiaryCount || 0;
      geographic[location].categories.add(distribution.category);
      geographic[location].averageTransparency += distribution.getTransparencyScore();
    });

    // Finalize calculations
    Object.keys(geographic).forEach(location => {
      const data = geographic[location];
      data.averageTransparency = Math.round(data.averageTransparency / data.count);
      data.categories = Array.from(data.categories);
    });

    return geographic;
  }

  /**
   * Generate impact visualization data
   */
  generateImpactVisualization(distributions) {
    const visualization = {
      totalImpact: {
        fundsDistributed: distributions.reduce((sum, d) => sum + d.amount, 0),
        beneficiariesReached: this.calculateTotalBeneficiaries(distributions),
        locationsServed: new Set(distributions.map(d => d.location)).size,
        categoriesServed: new Set(distributions.map(d => d.category)).size
      },
      timelineData: this.generateTimelineData(distributions),
      categoryImpact: this.generateCategoryImpact(distributions),
      efficiencyMetrics: this.generateEfficiencyMetrics(distributions)
    };

    return visualization;
  }

  /**
   * Generate timeline data for impact visualization
   */
  generateTimelineData(distributions) {
    const timeline = {};
    
    distributions.forEach(distribution => {
      const date = new Date(distribution.createdAt).toISOString().split('T')[0]; // YYYY-MM-DD
      if (!timeline[date]) {
        timeline[date] = {
          distributions: 0,
          totalAmount: 0,
          beneficiaries: 0,
          averageTransparency: 0
        };
      }
      
      timeline[date].distributions++;
      timeline[date].totalAmount += distribution.amount;
      timeline[date].beneficiaries += distribution.transparencyData.beneficiaryCount || 0;
      timeline[date].averageTransparency += distribution.getTransparencyScore();
    });

    // Calculate averages
    Object.keys(timeline).forEach(date => {
      const data = timeline[date];
      data.averageTransparency = Math.round(data.averageTransparency / data.distributions);
    });

    return timeline;
  }

  /**
   * Generate category impact analysis
   */
  generateCategoryImpact(distributions) {
    const categoryImpact = {};
    
    distributions.forEach(distribution => {
      const category = distribution.category || 'other';
      if (!categoryImpact[category]) {
        categoryImpact[category] = {
          totalAmount: 0,
          beneficiaries: 0,
          distributions: 0,
          averageTransparency: 0,
          completionRate: 0,
          averageTimeToCompletion: 0,
          impactScore: 0
        };
      }
      
      const data = categoryImpact[category];
      data.totalAmount += distribution.amount;
      data.beneficiaries += distribution.transparencyData.beneficiaryCount || 0;
      data.distributions++;
      data.averageTransparency += distribution.getTransparencyScore();
      
      if (distribution.status === 'completed') {
        data.completionRate++;
        if (distribution.updatedAt && distribution.createdAt) {
          const completionTime = (new Date(distribution.updatedAt) - new Date(distribution.createdAt)) / (1000 * 60 * 60); // hours
          data.averageTimeToCompletion += completionTime;
        }
      }
    });

    // Finalize calculations
    Object.keys(categoryImpact).forEach(category => {
      const data = categoryImpact[category];
      data.averageTransparency = Math.round(data.averageTransparency / data.distributions);
      data.completionRate = Math.round((data.completionRate / data.distributions) * 100);
      data.averageTimeToCompletion = data.completionRate > 0 ? 
        Math.round(data.averageTimeToCompletion / (data.distributions * data.completionRate / 100)) : 0;
      
      // Calculate impact score based on multiple factors
      data.impactScore = Math.round(
        (data.averageTransparency * 0.3) + 
        (data.completionRate * 0.4) + 
        (Math.min(data.beneficiaries / data.distributions, 100) * 0.3)
      );
    });

    return categoryImpact;
  }

  /**
   * Generate efficiency metrics
   */
  generateEfficiencyMetrics(distributions) {
    const metrics = {
      costPerBeneficiary: 0,
      averageDistributionTime: 0,
      transparencyEfficiency: 0,
      verificationEfficiency: 0,
      geographicEfficiency: 0
    };

    if (distributions.length === 0) return metrics;

    const totalAmount = distributions.reduce((sum, d) => sum + d.amount, 0);
    const totalBeneficiaries = this.calculateTotalBeneficiaries(distributions);
    
    // Cost per beneficiary
    metrics.costPerBeneficiary = totalBeneficiaries > 0 ? 
      Math.round(totalAmount / totalBeneficiaries) : 0;

    // Average distribution time (from creation to completion)
    const completedDistributions = distributions.filter(d => 
      d.status === 'completed' && d.updatedAt && d.createdAt
    );
    
    if (completedDistributions.length > 0) {
      const totalTime = completedDistributions.reduce((sum, d) => {
        return sum + (new Date(d.updatedAt) - new Date(d.createdAt));
      }, 0);
      metrics.averageDistributionTime = Math.round(totalTime / completedDistributions.length / (1000 * 60 * 60)); // hours
    }

    // Transparency efficiency (high transparency with low effort)
    const avgTransparency = this.calculateAverageTransparencyScore(distributions);
    const avgDataFields = distributions.reduce((sum, d) => {
      return sum + Object.keys(d.transparencyData).length;
    }, 0) / distributions.length;
    
    metrics.transparencyEfficiency = avgDataFields > 0 ? 
      Math.round((avgTransparency / avgDataFields) * 10) : 0;

    // Verification efficiency
    const verifiedCount = distributions.filter(d => 
      d.verificationData.thirdPartyVerified
    ).length;
    metrics.verificationEfficiency = Math.round((verifiedCount / distributions.length) * 100);

    // Geographic efficiency (coverage vs. operational complexity)
    const uniqueLocations = new Set(distributions.map(d => d.location)).size;
    metrics.geographicEfficiency = uniqueLocations > 0 ? 
      Math.round(distributions.length / uniqueLocations) : 0;

    return metrics;
  }

  /**
   * Generate compliance status for humanitarian operations
   */
  generateComplianceStatus(distributions, organizationData) {
    const compliance = {
      overallScore: 0,
      organizationCompliance: {
        verified: organizationData.isVerified(),
        transparencyLevel: organizationData.transparencyLevel,
        registrationValid: !!organizationData.registrationNumber,
        score: 0
      },
      distributionCompliance: {
        averageTransparency: this.calculateAverageTransparencyScore(distributions),
        verificationRate: this.calculateVerificationRate(distributions),
        dataIntegrityScore: 0,
        score: 0
      },
      regulatoryCompliance: {
        reportingCompliance: this.calculateReportingCompliance(distributions),
        auditTrailCompleteness: this.calculateAuditTrailCompleteness(distributions),
        privacyCompliance: this.calculatePrivacyCompliance(distributions),
        score: 0
      }
    };

    // Calculate organization compliance score
    let orgScore = 0;
    if (compliance.organizationCompliance.verified) orgScore += 40;
    if (compliance.organizationCompliance.transparencyLevel === 'enhanced') orgScore += 20;
    else if (compliance.organizationCompliance.transparencyLevel === 'full_public') orgScore += 30;
    else orgScore += 10;
    if (compliance.organizationCompliance.registrationValid) orgScore += 30;
    compliance.organizationCompliance.score = orgScore;

    // Calculate distribution compliance score
    let distScore = 0;
    distScore += Math.round(compliance.distributionCompliance.averageTransparency * 0.4);
    distScore += Math.round(compliance.distributionCompliance.verificationRate * 0.3);
    
    // Data integrity score
    const integrityIssues = distributions.reduce((count, d) => {
      const integrity = this.validateTransparencyDataIntegrity(d);
      return count + (integrity.isValid ? 0 : 1);
    }, 0);
    const dataIntegrityScore = distributions.length > 0 ? 
      Math.round(((distributions.length - integrityIssues) / distributions.length) * 100) : 100;
    compliance.distributionCompliance.dataIntegrityScore = dataIntegrityScore;
    distScore += Math.round(dataIntegrityScore * 0.3);
    
    compliance.distributionCompliance.score = Math.min(distScore, 100);

    // Calculate regulatory compliance score
    let regScore = 0;
    regScore += Math.round(compliance.regulatoryCompliance.reportingCompliance * 0.4);
    regScore += Math.round(compliance.regulatoryCompliance.auditTrailCompleteness * 0.3);
    regScore += Math.round(compliance.regulatoryCompliance.privacyCompliance * 0.3);
    compliance.regulatoryCompliance.score = regScore;

    // Calculate overall compliance score
    compliance.overallScore = Math.round(
      (compliance.organizationCompliance.score * 0.3) +
      (compliance.distributionCompliance.score * 0.4) +
      (compliance.regulatoryCompliance.score * 0.3)
    );

    return compliance;
  }

  /**
   * Calculate reporting compliance score
   */
  calculateReportingCompliance(distributions) {
    if (distributions.length === 0) return 100;
    
    const requiredReports = distributions.filter(d => 
      d.status === 'completed' || d.status === 'verified'
    );
    
    const compliantReports = requiredReports.filter(d => 
      d.purpose && d.location && d.amount && 
      (d.transparencyData.beneficiaryCount || d.impactMetrics)
    );
    
    return Math.round((compliantReports.length / requiredReports.length) * 100);
  }

  /**
   * Calculate audit trail completeness
   */
  calculateAuditTrailCompleteness(distributions) {
    if (distributions.length === 0) return 100;
    
    const completeAuditTrails = distributions.filter(d => {
      const auditTrail = this.generateAuditTrail(d);
      return auditTrail.dataIntegrity.isValid && 
             auditTrail.transparencyElements.hasBasicInfo;
    });
    
    return Math.round((completeAuditTrails.length / distributions.length) * 100);
  }

  /**
   * Calculate privacy compliance score
   */
  calculatePrivacyCompliance(distributions) {
    // Check for proper anonymization and data protection
    let privacyScore = 100;
    
    distributions.forEach(distribution => {
      // Check if personal data is properly protected
      if (distribution.recipientId && distribution.recipientId.length < 10) {
        privacyScore -= 5; // Deduct for potentially exposed personal IDs
      }
      
      // Check if location data is appropriately generalized
      if (distribution.transparencyData.gpsCoordinates && 
          !distribution.transparencyData.locationGeneralized) {
        privacyScore -= 3; // Deduct for precise location without generalization flag
      }
    });
    
    return Math.max(0, privacyScore);
  }
}

module.exports = TransparencyService;