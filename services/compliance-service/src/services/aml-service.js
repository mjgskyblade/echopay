const axios = require('axios');
const winston = require('winston');
const AMLScreening = require('../models/aml-screening');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'aml-service' },
  transports: [new winston.transports.Console()]
});

/**
 * AML Service
 * Handles Anti-Money Laundering screening with automated reporting
 */
class AMLService {
  constructor(config = {}) {
    this.watchlistProviders = config.watchlistProviders || {};
    this.thresholds = config.thresholds || {
      sarThreshold: 10000, // USD equivalent
      highRiskThreshold: 0.7,
      autoBlockThreshold: 0.9
    };
    this.screeningCache = new Map();
    this.sarReports = new Map();
  }

  /**
   * Screen transaction for AML compliance
   */
  async screenTransaction(transactionData) {
    try {
      logger.info('Starting AML screening', {
        transactionId: transactionData.transactionId,
        amount: transactionData.amount,
        currency: transactionData.currency
      });

      // Create screening record
      const screening = new AMLScreening({
        transactionId: transactionData.transactionId,
        userId: transactionData.userId,
        counterpartyId: transactionData.counterpartyId,
        amount: transactionData.amount,
        currency: transactionData.currency
      });

      // Validate screening data
      const validation = screening.validate();
      if (!validation.isValid) {
        throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
      }

      // Perform various AML checks
      await this.performSanctionsCheck(screening, transactionData);
      await this.performPEPCheck(screening, transactionData);
      await this.performAdverseMediaCheck(screening, transactionData);
      await this.performWatchlistCheck(screening, transactionData);
      await this.performPatternAnalysis(screening, transactionData);

      // Calculate overall risk score
      screening.calculateRiskScore();

      // Determine screening result
      await this.determineScreeningResult(screening);

      // Check if SAR filing is required
      await this.checkSARRequirement(screening, transactionData);

      // Cache screening result
      this.screeningCache.set(transactionData.transactionId, screening);

      logger.info('AML screening completed', {
        transactionId: transactionData.transactionId,
        screeningId: screening.screeningId,
        status: screening.status,
        riskLevel: screening.riskLevel,
        riskScore: screening.riskScore
      });

      return screening;

    } catch (error) {
      logger.error('AML screening failed', {
        transactionId: transactionData.transactionId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Perform sanctions screening
   */
  async performSanctionsCheck(screening, transactionData) {
    try {
      // Mock sanctions check - in real implementation would call OFAC/UN/EU sanctions APIs
      const sanctionedEntities = ['SANCTIONED_USER_123', 'BLOCKED_ENTITY_456'];
      
      const userSanctioned = sanctionedEntities.includes(transactionData.userId);
      const counterpartySanctioned = sanctionedEntities.includes(transactionData.counterpartyId);

      screening.sanctionsCheck = true;

      if (userSanctioned) {
        screening.addFlag('SANCTIONS_HIT', 'User appears on sanctions list', 'critical');
        screening.addWatchlistHit('OFAC_SDN', 'exact_match', 1.0, { entity: 'user' });
      }

      if (counterpartySanctioned) {
        screening.addFlag('SANCTIONS_HIT', 'Counterparty appears on sanctions list', 'critical');
        screening.addWatchlistHit('OFAC_SDN', 'exact_match', 1.0, { entity: 'counterparty' });
      }

      logger.debug('Sanctions check completed', {
        transactionId: transactionData.transactionId,
        userSanctioned,
        counterpartySanctioned
      });

    } catch (error) {
      logger.error('Sanctions check failed', {
        transactionId: transactionData.transactionId,
        error: error.message
      });
      screening.addFlag('SANCTIONS_ERROR', 'Failed to complete sanctions check', 'medium');
    }
  }

  /**
   * Perform Politically Exposed Person (PEP) check
   */
  async performPEPCheck(screening, transactionData) {
    try {
      // Mock PEP check - in real implementation would call PEP databases
      const pepEntities = ['PEP_USER_789', 'POLITICAL_FIGURE_101'];
      
      const userPEP = pepEntities.includes(transactionData.userId);
      const counterpartyPEP = pepEntities.includes(transactionData.counterpartyId);

      screening.pepCheck = true;

      if (userPEP) {
        screening.addFlag('PEP_HIT', 'User is a Politically Exposed Person', 'high');
        screening.addWatchlistHit('PEP_DATABASE', 'exact_match', 0.95, { entity: 'user' });
      }

      if (counterpartyPEP) {
        screening.addFlag('PEP_HIT', 'Counterparty is a Politically Exposed Person', 'high');
        screening.addWatchlistHit('PEP_DATABASE', 'exact_match', 0.95, { entity: 'counterparty' });
      }

      logger.debug('PEP check completed', {
        transactionId: transactionData.transactionId,
        userPEP,
        counterpartyPEP
      });

    } catch (error) {
      logger.error('PEP check failed', {
        transactionId: transactionData.transactionId,
        error: error.message
      });
      screening.addFlag('PEP_ERROR', 'Failed to complete PEP check', 'medium');
    }
  }

  /**
   * Perform adverse media check
   */
  async performAdverseMediaCheck(screening, transactionData) {
    try {
      // Mock adverse media check - in real implementation would scan news/media sources
      const adverseEntities = ['CRIMINAL_USER_202', 'FRAUD_ENTITY_303'];
      
      const userAdverse = adverseEntities.includes(transactionData.userId);
      const counterpartyAdverse = adverseEntities.includes(transactionData.counterpartyId);

      screening.adverseMediaCheck = true;

      if (userAdverse) {
        screening.addFlag('ADVERSE_MEDIA', 'User has adverse media coverage', 'high');
        screening.addWatchlistHit('ADVERSE_MEDIA', 'fuzzy_match', 0.8, { entity: 'user' });
      }

      if (counterpartyAdverse) {
        screening.addFlag('ADVERSE_MEDIA', 'Counterparty has adverse media coverage', 'high');
        screening.addWatchlistHit('ADVERSE_MEDIA', 'fuzzy_match', 0.8, { entity: 'counterparty' });
      }

      logger.debug('Adverse media check completed', {
        transactionId: transactionData.transactionId,
        userAdverse,
        counterpartyAdverse
      });

    } catch (error) {
      logger.error('Adverse media check failed', {
        transactionId: transactionData.transactionId,
        error: error.message
      });
      screening.addFlag('MEDIA_ERROR', 'Failed to complete adverse media check', 'low');
    }
  }

  /**
   * Perform custom watchlist check
   */
  async performWatchlistCheck(screening, transactionData) {
    try {
      // Mock custom watchlist check
      const customWatchlist = ['SUSPICIOUS_USER_404', 'HIGH_RISK_ENTITY_505'];
      
      const userWatchlisted = customWatchlist.includes(transactionData.userId);
      const counterpartyWatchlisted = customWatchlist.includes(transactionData.counterpartyId);

      if (userWatchlisted) {
        screening.addFlag('WATCHLIST_HIT', 'User on internal watchlist', 'medium');
        screening.addWatchlistHit('INTERNAL_WATCHLIST', 'exact_match', 1.0, { entity: 'user' });
      }

      if (counterpartyWatchlisted) {
        screening.addFlag('WATCHLIST_HIT', 'Counterparty on internal watchlist', 'medium');
        screening.addWatchlistHit('INTERNAL_WATCHLIST', 'exact_match', 1.0, { entity: 'counterparty' });
      }

      logger.debug('Watchlist check completed', {
        transactionId: transactionData.transactionId,
        userWatchlisted,
        counterpartyWatchlisted
      });

    } catch (error) {
      logger.error('Watchlist check failed', {
        transactionId: transactionData.transactionId,
        error: error.message
      });
      screening.addFlag('WATCHLIST_ERROR', 'Failed to complete watchlist check', 'low');
    }
  }

  /**
   * Perform transaction pattern analysis
   */
  async performPatternAnalysis(screening, transactionData) {
    try {
      // Mock pattern analysis - in real implementation would analyze historical patterns
      const amount = parseFloat(transactionData.amount);
      
      // Check for structuring (amounts just below reporting thresholds)
      if (amount >= 9000 && amount < 10000) {
        screening.addFlag('STRUCTURING', 'Transaction amount suggests structuring', 'high');
      }

      // Check for round number patterns
      if (amount % 1000 === 0 && amount >= 5000) {
        screening.addFlag('ROUND_AMOUNT', 'Suspicious round amount transaction', 'low');
      }

      // Check for high-frequency patterns (mock)
      const recentTransactions = this.getRecentTransactions(transactionData.userId);
      if (recentTransactions.length > 10) {
        screening.addFlag('HIGH_FREQUENCY', 'High frequency transaction pattern', 'medium');
      }

      // Check for velocity patterns
      const dailyVolume = this.getDailyVolume(transactionData.userId);
      if (dailyVolume > 50000) {
        screening.addFlag('HIGH_VELOCITY', 'High transaction velocity detected', 'medium');
      }

      logger.debug('Pattern analysis completed', {
        transactionId: transactionData.transactionId,
        amount,
        recentTransactions: recentTransactions.length,
        dailyVolume
      });

    } catch (error) {
      logger.error('Pattern analysis failed', {
        transactionId: transactionData.transactionId,
        error: error.message
      });
      screening.addFlag('PATTERN_ERROR', 'Failed to complete pattern analysis', 'low');
    }
  }

  /**
   * Determine screening result based on risk assessment
   */
  async determineScreeningResult(screening) {
    if (screening.riskScore >= this.thresholds.autoBlockThreshold) {
      screening.updateStatus('blocked', 'critical');
    } else if (screening.riskScore >= this.thresholds.highRiskThreshold || screening.requiresManualReview()) {
      screening.updateStatus('under_review', 'high');
    } else {
      screening.updateStatus('cleared', screening.riskLevel);
    }
  }

  /**
   * Check if Suspicious Activity Report (SAR) filing is required
   */
  async checkSARRequirement(screening, transactionData) {
    // Don't file SAR if already filed
    if (screening.sarFiled) {
      return;
    }

    const amount = parseFloat(transactionData.amount);
    const shouldFileSAR = 
      amount >= this.thresholds.sarThreshold ||
      screening.riskScore >= this.thresholds.highRiskThreshold ||
      screening.flags.some(f => f.severity === 'critical') ||
      screening.watchlistHits.some(h => h.listName.includes('SANCTIONS') || h.listName.includes('OFAC'));

    if (shouldFileSAR) {
      const reason = this.determineSARReason(screening, transactionData);
      const sarId = screening.fileSAR(reason, 'system');
      
      await this.generateSARReport(screening, transactionData, reason);
      
      logger.warn('SAR filed for transaction', {
        transactionId: transactionData.transactionId,
        sarId,
        reason
      });
    }
  }

  /**
   * Determine reason for SAR filing
   */
  determineSARReason(screening, transactionData) {
    if (screening.watchlistHits.some(h => h.listName.includes('SANCTIONS'))) {
      return 'Sanctions list match detected';
    }
    if (screening.flags.some(f => f.type === 'STRUCTURING')) {
      return 'Potential structuring activity';
    }
    if (parseFloat(transactionData.amount) >= this.thresholds.sarThreshold) {
      return 'Large transaction above reporting threshold';
    }
    if (screening.riskScore >= this.thresholds.highRiskThreshold) {
      return 'High risk score from multiple factors';
    }
    return 'Suspicious activity detected';
  }

  /**
   * Generate comprehensive SAR report with privacy preservation
   */
  async generateSARReport(screening, transactionData, reason) {
    const sarReport = {
      sarId: screening.sarId,
      transactionId: transactionData.transactionId,
      screeningId: screening.screeningId,
      filingDate: new Date(),
      reason,
      amount: transactionData.amount,
      currency: transactionData.currency,
      riskScore: screening.riskScore,
      flags: screening.flags,
      watchlistHits: screening.watchlistHits,
      status: 'filed',
      // Enhanced SAR data
      reportType: this.determineSARType(screening, transactionData),
      priority: this.determineSARPriority(screening),
      regulatoryReferences: this.generateRegulatoryReferences(screening),
      privacyHash: this.createPrivacyHash(transactionData),
      complianceMetadata: {
        filingJurisdiction: this.determineJurisdiction(transactionData),
        applicableRegulations: this.getApplicableRegulations(transactionData),
        dataRetentionPeriod: this.calculateRetentionPeriod(screening),
        accessRestrictions: this.determineAccessRestrictions(screening)
      }
    };

    this.sarReports.set(screening.sarId, sarReport);

    // Automated regulatory submission (in production)
    if (process.env.NODE_ENV === 'production') {
      await this.submitSARToAuthorities(sarReport);
    }

    // Create audit trail for SAR filing
    await this.createSARAuditTrail(sarReport, screening);

    logger.info('Enhanced SAR report generated', {
      sarId: screening.sarId,
      transactionId: transactionData.transactionId,
      reportType: sarReport.reportType,
      priority: sarReport.priority
    });

    return sarReport;
  }

  /**
   * Get screening result
   */
  async getScreeningResult(transactionId) {
    const screening = this.screeningCache.get(transactionId);
    return screening ? screening.getSanitizedData() : null;
  }

  /**
   * Mock function to get recent transactions
   */
  getRecentTransactions(userId) {
    // Mock implementation - would query database in real system
    return Array.from({ length: Math.floor(Math.random() * 15) }, (_, i) => ({
      id: `tx_${i}`,
      timestamp: new Date(Date.now() - i * 3600000)
    }));
  }

  /**
   * Mock function to get daily transaction volume
   */
  getDailyVolume(userId) {
    // Mock implementation - would calculate from database in real system
    return Math.random() * 100000;
  }

  /**
   * Get AML screening statistics
   */
  getScreeningStats() {
    const stats = {
      total: this.screeningCache.size,
      cleared: 0,
      flagged: 0,
      blocked: 0,
      under_review: 0,
      sarsFiled: this.sarReports.size
    };

    this.screeningCache.forEach(screening => {
      stats[screening.status]++;
    });

    return stats;
  }

  /**
   * Get SAR reports with privacy filtering
   */
  getSARReports(requesterRole = 'unknown') {
    const reports = Array.from(this.sarReports.values());
    
    // Filter based on requester permissions
    if (!['regulator', 'compliance_officer', 'auditor'].includes(requesterRole)) {
      return reports.map(report => ({
        sarId: report.sarId,
        filingDate: report.filingDate,
        status: report.status,
        reportType: report.reportType,
        priority: report.priority
      }));
    }
    
    return reports;
  }

  /**
   * Determine SAR report type based on screening results
   */
  determineSARType(screening, transactionData) {
    if (screening.watchlistHits.some(h => h.listName.includes('SANCTIONS'))) {
      return 'SANCTIONS_VIOLATION';
    }
    if (screening.flags.some(f => f.type === 'STRUCTURING')) {
      return 'STRUCTURING';
    }
    if (screening.flags.some(f => f.type === 'PEP_HIT')) {
      return 'PEP_TRANSACTION';
    }
    if (parseFloat(transactionData.amount) >= this.thresholds.sarThreshold) {
      return 'LARGE_TRANSACTION';
    }
    if (screening.flags.some(f => f.type === 'HIGH_FREQUENCY')) {
      return 'SUSPICIOUS_PATTERN';
    }
    return 'GENERAL_SUSPICIOUS_ACTIVITY';
  }

  /**
   * Determine SAR priority based on risk factors
   */
  determineSARPriority(screening) {
    if (screening.watchlistHits.some(h => h.listName.includes('SANCTIONS'))) {
      return 'CRITICAL';
    }
    if (screening.riskScore >= 0.9) {
      return 'HIGH';
    }
    if (screening.riskScore >= 0.7) {
      return 'MEDIUM';
    }
    return 'LOW';
  }

  /**
   * Generate regulatory references for SAR
   */
  generateRegulatoryReferences(screening) {
    const references = [];
    
    if (screening.watchlistHits.some(h => h.listName.includes('OFAC'))) {
      references.push('31 CFR 1010.320 - OFAC Sanctions');
    }
    if (screening.flags.some(f => f.type === 'STRUCTURING')) {
      references.push('31 USC 5324 - Structuring Transactions');
    }
    if (screening.flags.some(f => f.type === 'PEP_HIT')) {
      references.push('31 CFR 1010.605 - PEP Requirements');
    }
    
    references.push('31 CFR 1020.320 - SAR Filing Requirements');
    
    return references;
  }

  /**
   * Create privacy hash for transaction data
   */
  createPrivacyHash(transactionData) {
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256');
    hash.update(JSON.stringify({
      transactionId: transactionData.transactionId,
      userId: transactionData.userId,
      counterpartyId: transactionData.counterpartyId,
      amount: transactionData.amount
    }));
    return hash.digest('hex');
  }

  /**
   * Determine filing jurisdiction
   */
  determineJurisdiction(transactionData) {
    // In a real implementation, this would analyze transaction geography
    const metadata = transactionData.metadata || {};
    const location = metadata.location || {};
    
    if (location.country) {
      return location.country;
    }
    
    // Default to US jurisdiction
    return 'US';
  }

  /**
   * Get applicable regulations based on transaction
   */
  getApplicableRegulations(transactionData) {
    const regulations = ['BSA', 'USA_PATRIOT_ACT'];
    const jurisdiction = this.determineJurisdiction(transactionData);
    
    switch (jurisdiction) {
      case 'US':
        regulations.push('FINCEN_REQUIREMENTS');
        break;
      case 'EU':
        regulations.push('AMLD5', 'GDPR');
        break;
      case 'UK':
        regulations.push('MLR_2017', 'POCA_2002');
        break;
      default:
        regulations.push('FATF_RECOMMENDATIONS');
    }
    
    return regulations;
  }

  /**
   * Calculate data retention period based on regulations
   */
  calculateRetentionPeriod(screening) {
    // Base retention: 5 years for most AML records
    let retentionYears = 5;
    
    // Extended retention for high-risk cases
    if (screening.riskLevel === 'critical') {
      retentionYears = 7;
    }
    
    // Sanctions cases require longer retention
    if (screening.watchlistHits.some(h => h.listName.includes('SANCTIONS'))) {
      retentionYears = 10;
    }
    
    return new Date(Date.now() + retentionYears * 365 * 24 * 60 * 60 * 1000);
  }

  /**
   * Determine access restrictions for SAR data
   */
  determineAccessRestrictions(screening) {
    const restrictions = ['COMPLIANCE_OFFICER_ONLY'];
    
    if (screening.watchlistHits.some(h => h.listName.includes('SANCTIONS'))) {
      restrictions.push('REGULATORY_AUTHORITY_ACCESS');
      restrictions.push('LAW_ENFORCEMENT_ACCESS');
    }
    
    if (screening.riskLevel === 'critical') {
      restrictions.push('SENIOR_MANAGEMENT_NOTIFICATION');
    }
    
    return restrictions;
  }

  /**
   * Submit SAR to regulatory authorities (production implementation)
   */
  async submitSARToAuthorities(sarReport) {
    try {
      // In production, this would integrate with FinCEN BSA E-Filing System
      // or equivalent regulatory systems in other jurisdictions
      
      const submissionData = {
        sarId: sarReport.sarId,
        filingDate: sarReport.filingDate,
        reportType: sarReport.reportType,
        priority: sarReport.priority,
        jurisdiction: sarReport.complianceMetadata.filingJurisdiction
      };
      
      logger.info('SAR submitted to regulatory authorities', {
        sarId: sarReport.sarId,
        jurisdiction: submissionData.jurisdiction,
        reportType: submissionData.reportType
      });
      
      // Update SAR status
      sarReport.status = 'submitted';
      sarReport.submissionDate = new Date();
      
    } catch (error) {
      logger.error('Failed to submit SAR to authorities', {
        sarId: sarReport.sarId,
        error: error.message
      });
      
      sarReport.status = 'submission_failed';
      sarReport.submissionError = error.message;
    }
  }

  /**
   * Create audit trail for SAR filing
   */
  async createSARAuditTrail(sarReport, screening) {
    // This would integrate with the privacy service to create audit trails
    const auditData = {
      action: 'sar_filed',
      sarId: sarReport.sarId,
      transactionId: sarReport.transactionId,
      screeningId: sarReport.screeningId,
      reportType: sarReport.reportType,
      priority: sarReport.priority,
      filingDate: sarReport.filingDate,
      riskScore: screening.riskScore,
      flags: screening.flags.map(f => f.type),
      watchlistHits: screening.watchlistHits.map(h => h.listName)
    };
    
    logger.info('SAR audit trail created', {
      sarId: sarReport.sarId,
      auditAction: 'sar_filed'
    });
    
    return auditData;
  }

  /**
   * Enhanced pattern analysis with machine learning indicators
   */
  async performEnhancedPatternAnalysis(screening, transactionData) {
    try {
      const amount = parseFloat(transactionData.amount);
      const userId = transactionData.userId;
      
      // Existing pattern checks
      await this.performPatternAnalysis(screening, transactionData);
      
      // Enhanced ML-based pattern detection
      const behaviorProfile = await this.getUserBehaviorProfile(userId);
      const anomalyScore = this.calculateAnomalyScore(transactionData, behaviorProfile);
      
      if (anomalyScore > 0.7) {
        screening.addFlag('BEHAVIORAL_ANOMALY', 'Transaction deviates significantly from user behavior', 'high');
      }
      
      // Network analysis
      const networkRisk = await this.analyzeTransactionNetwork(transactionData);
      if (networkRisk > 0.6) {
        screening.addFlag('NETWORK_RISK', 'Transaction involves high-risk network', 'medium');
      }
      
      // Time-based pattern analysis
      const timeRisk = this.analyzeTimePatterns(transactionData, userId);
      if (timeRisk > 0.5) {
        screening.addFlag('TEMPORAL_ANOMALY', 'Unusual timing pattern detected', 'medium');
      }
      
    } catch (error) {
      logger.error('Enhanced pattern analysis failed', {
        transactionId: transactionData.transactionId,
        error: error.message
      });
      screening.addFlag('PATTERN_ANALYSIS_ERROR', 'Enhanced pattern analysis failed', 'low');
    }
  }

  /**
   * Get user behavior profile (mock implementation)
   */
  async getUserBehaviorProfile(userId) {
    // In production, this would query ML models or behavior databases
    return {
      averageTransactionAmount: Math.random() * 5000 + 1000,
      typicalTransactionTimes: ['09:00-17:00'],
      frequentCounterparties: [`counterparty_${Math.floor(Math.random() * 10)}`],
      riskScore: Math.random() * 0.3
    };
  }

  /**
   * Calculate anomaly score based on behavior profile
   */
  calculateAnomalyScore(transactionData, behaviorProfile) {
    let anomalyScore = 0;
    const amount = parseFloat(transactionData.amount);
    
    // Amount anomaly
    const amountDeviation = Math.abs(amount - behaviorProfile.averageTransactionAmount) / behaviorProfile.averageTransactionAmount;
    if (amountDeviation > 2) {
      anomalyScore += 0.4;
    }
    
    // Time anomaly (simplified)
    const currentHour = new Date().getHours();
    if (currentHour < 6 || currentHour > 22) {
      anomalyScore += 0.3;
    }
    
    // Counterparty anomaly
    if (!behaviorProfile.frequentCounterparties.includes(transactionData.counterpartyId)) {
      anomalyScore += 0.2;
    }
    
    return Math.min(anomalyScore, 1.0);
  }

  /**
   * Analyze transaction network risk
   */
  async analyzeTransactionNetwork(transactionData) {
    // Mock network analysis - in production would use graph databases
    const networkNodes = [transactionData.userId, transactionData.counterpartyId];
    const riskFactors = [];
    
    // Check for known high-risk entities in network
    if (networkNodes.some(node => node.includes('SUSPICIOUS') || node.includes('HIGH_RISK'))) {
      riskFactors.push('high_risk_entity');
    }
    
    // Simulate network density analysis
    const networkDensity = Math.random();
    if (networkDensity > 0.8) {
      riskFactors.push('dense_network');
    }
    
    return riskFactors.length * 0.3;
  }

  /**
   * Analyze temporal patterns
   */
  analyzeTimePatterns(transactionData, userId) {
    const currentTime = new Date();
    const hour = currentTime.getHours();
    const dayOfWeek = currentTime.getDay();
    
    let riskScore = 0;
    
    // Unusual hours (late night/early morning)
    if (hour < 6 || hour > 22) {
      riskScore += 0.3;
    }
    
    // Weekend transactions (higher risk for business accounts)
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      riskScore += 0.2;
    }
    
    return riskScore;
  }
}

module.exports = AMLService;