const crypto = require('crypto');
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'privacy-service' },
  transports: [new winston.transports.Console()]
});

/**
 * Privacy Service
 * Handles privacy-preserving audit trails and data protection
 */
class PrivacyService {
  constructor(config = {}) {
    this.encryptionKey = config.encryptionKey || process.env.PRIVACY_ENCRYPTION_KEY || 'default-privacy-key';
    this.auditTrails = new Map();
    this.dataRetentionPeriod = config.dataRetentionPeriod || 7 * 365 * 24 * 60 * 60 * 1000; // 7 years
    this.anonymizationThreshold = config.anonymizationThreshold || 365 * 24 * 60 * 60 * 1000; // 1 year
  }

  /**
   * Create privacy-preserving audit trail entry
   */
  createAuditTrail(data) {
    try {
      const auditId = crypto.randomUUID();
      const timestamp = new Date();

      // Separate sensitive and non-sensitive data
      const { sensitiveData, publicData } = this.separateData(data);

      // Create privacy hash for sensitive data
      const privacyHash = this.createPrivacyHash(sensitiveData);

      // Encrypt sensitive data
      const encryptedData = this.encryptData(sensitiveData);

      const auditEntry = {
        auditId,
        timestamp,
        publicData,
        privacyHash,
        encryptedData,
        dataClassification: this.classifyData(data),
        retentionDate: new Date(timestamp.getTime() + this.dataRetentionPeriod),
        anonymizationDate: new Date(timestamp.getTime() + this.anonymizationThreshold),
        accessLog: []
      };

      this.auditTrails.set(auditId, auditEntry);

      logger.info('Audit trail created', {
        auditId,
        dataClassification: auditEntry.dataClassification,
        privacyHash
      });

      return {
        auditId,
        privacyHash,
        timestamp,
        publicData: auditEntry.publicData
      };

    } catch (error) {
      logger.error('Failed to create audit trail', { error: error.message });
      throw error;
    }
  }

  /**
   * Retrieve audit trail with privacy controls
   */
  getAuditTrail(auditId, requesterInfo, purpose) {
    try {
      const auditEntry = this.auditTrails.get(auditId);
      if (!auditEntry) {
        throw new Error('Audit trail not found');
      }

      // Log access attempt
      this.logAccess(auditEntry, requesterInfo, purpose);

      // Check if data should be anonymized
      if (this.shouldAnonymize(auditEntry)) {
        return this.getAnonymizedData(auditEntry);
      }

      // Check access permissions
      if (!this.checkAccessPermissions(auditEntry, requesterInfo, purpose)) {
        throw new Error('Access denied - insufficient permissions');
      }

      // Return appropriate data based on requester permissions
      return this.getFilteredData(auditEntry, requesterInfo, purpose);

    } catch (error) {
      logger.error('Failed to retrieve audit trail', { auditId, error: error.message });
      throw error;
    }
  }

  /**
   * Separate sensitive and public data
   */
  separateData(data) {
    const sensitiveFields = [
      'userId', 'accountNumber', 'personalInfo', 'documentNumber',
      'fullName', 'dateOfBirth', 'address', 'phoneNumber', 'email',
      'biometricData', 'deviceFingerprint'
    ];

    const sensitiveData = {};
    const publicData = {};

    Object.keys(data).forEach(key => {
      if (sensitiveFields.includes(key) || key.includes('personal') || key.includes('private')) {
        sensitiveData[key] = data[key];
      } else {
        publicData[key] = data[key];
      }
    });

    return { sensitiveData, publicData };
  }

  /**
   * Create privacy hash for sensitive data
   */
  createPrivacyHash(sensitiveData) {
    const hash = crypto.createHash('sha256');
    hash.update(JSON.stringify(sensitiveData) + this.encryptionKey);
    return hash.digest('hex');
  }

  /**
   * Encrypt sensitive data
   */
  encryptData(data) {
    try {
      // Use simple hash-based encryption for testing
      const hash = crypto.createHash('sha256');
      hash.update(JSON.stringify(data) + this.encryptionKey);
      const encrypted = hash.digest('hex');
      
      return {
        encrypted,
        algorithm: 'sha256-hash'
      };

    } catch (error) {
      logger.error('Data encryption failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Decrypt sensitive data (mock implementation for testing)
   */
  decryptData(encryptedData) {
    try {
      // For testing purposes, return mock decrypted data
      // In real implementation, this would use proper decryption
      return {
        mockDecrypted: true,
        originalHash: encryptedData.encrypted
      };

    } catch (error) {
      logger.error('Data decryption failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Classify data based on sensitivity
   */
  classifyData(data) {
    const classifications = [];

    if (data.personalInfo || data.fullName || data.dateOfBirth) {
      classifications.push('PII');
    }
    if (data.accountNumber || data.transactionId) {
      classifications.push('FINANCIAL');
    }
    if (data.biometricData || data.documentNumber) {
      classifications.push('BIOMETRIC');
    }
    if (data.complianceData || data.kycData) {
      classifications.push('COMPLIANCE');
    }

    return classifications.length > 0 ? classifications : ['GENERAL'];
  }

  /**
   * Log access to audit trail
   */
  logAccess(auditEntry, requesterInfo, purpose) {
    const accessLog = {
      timestamp: new Date(),
      requester: {
        id: requesterInfo.id,
        role: requesterInfo.role,
        organization: requesterInfo.organization
      },
      purpose,
      ipAddress: requesterInfo.ipAddress,
      userAgent: requesterInfo.userAgent
    };

    auditEntry.accessLog.push(accessLog);

    logger.info('Audit trail accessed', {
      auditId: auditEntry.auditId,
      requesterId: requesterInfo.id,
      purpose
    });
  }

  /**
   * Check if data should be anonymized based on age
   */
  shouldAnonymize(auditEntry) {
    return new Date() > auditEntry.anonymizationDate;
  }

  /**
   * Get anonymized version of audit data
   */
  getAnonymizedData(auditEntry) {
    return {
      auditId: auditEntry.auditId,
      timestamp: auditEntry.timestamp,
      dataClassification: auditEntry.dataClassification,
      privacyHash: auditEntry.privacyHash,
      publicData: this.anonymizePublicData(auditEntry.publicData),
      anonymized: true,
      anonymizationDate: auditEntry.anonymizationDate
    };
  }

  /**
   * Anonymize public data
   */
  anonymizePublicData(publicData) {
    const anonymized = { ...publicData };
    
    // Remove or hash identifiable information
    if (anonymized.transactionId) {
      anonymized.transactionId = this.hashValue(anonymized.transactionId);
    }
    if (anonymized.sessionId) {
      anonymized.sessionId = this.hashValue(anonymized.sessionId);
    }
    
    return anonymized;
  }

  /**
   * Check access permissions
   */
  checkAccessPermissions(auditEntry, requesterInfo, purpose) {
    // Define access control rules
    const accessRules = {
      'regulatory_audit': ['regulator', 'compliance_officer', 'auditor'],
      'fraud_investigation': ['fraud_investigator', 'compliance_officer', 'law_enforcement'],
      'customer_support': ['support_agent', 'compliance_officer'],
      'system_maintenance': ['system_admin', 'developer'],
      'research': ['researcher', 'data_scientist']
    };

    const allowedRoles = accessRules[purpose] || [];
    
    // Check if requester has appropriate role
    if (!allowedRoles.includes(requesterInfo.role)) {
      logger.warn('Access denied - insufficient role', {
        auditId: auditEntry.auditId,
        requesterRole: requesterInfo.role,
        purpose,
        allowedRoles
      });
      return false;
    }

    // Additional checks for sensitive data
    if (auditEntry.dataClassification.includes('PII') || auditEntry.dataClassification.includes('BIOMETRIC')) {
      if (!['regulator', 'compliance_officer', 'law_enforcement'].includes(requesterInfo.role)) {
        logger.warn('Access denied - sensitive data requires elevated permissions', {
          auditId: auditEntry.auditId,
          requesterRole: requesterInfo.role,
          dataClassification: auditEntry.dataClassification
        });
        return false;
      }
    }

    return true;
  }

  /**
   * Get filtered data based on requester permissions
   */
  getFilteredData(auditEntry, requesterInfo, purpose) {
    const baseData = {
      auditId: auditEntry.auditId,
      timestamp: auditEntry.timestamp,
      publicData: auditEntry.publicData,
      dataClassification: auditEntry.dataClassification,
      privacyHash: auditEntry.privacyHash
    };

    // Regulators and compliance officers get full access
    if (['regulator', 'compliance_officer'].includes(requesterInfo.role)) {
      try {
        const decryptedData = this.decryptData(auditEntry.encryptedData);
        return {
          ...baseData,
          sensitiveData: decryptedData,
          accessLevel: 'full'
        };
      } catch (error) {
        logger.error('Failed to decrypt data for authorized user', {
          auditId: auditEntry.auditId,
          error: error.message
        });
        return { ...baseData, accessLevel: 'public_only', error: 'Decryption failed' };
      }
    }

    // Other roles get limited access
    return {
      ...baseData,
      accessLevel: 'limited'
    };
  }

  /**
   * Hash a value for anonymization
   */
  hashValue(value) {
    const hash = crypto.createHash('sha256');
    hash.update(value.toString() + 'anonymization_salt');
    return hash.digest('hex').substring(0, 16);
  }

  /**
   * Clean up expired audit trails
   */
  cleanupExpiredTrails() {
    const now = new Date();
    let cleanedCount = 0;

    this.auditTrails.forEach((auditEntry, auditId) => {
      if (now > auditEntry.retentionDate) {
        this.auditTrails.delete(auditId);
        cleanedCount++;
      }
    });

    logger.info('Expired audit trails cleaned up', { cleanedCount });
    return cleanedCount;
  }

  /**
   * Get comprehensive privacy compliance report
   */
  getPrivacyComplianceReport() {
    const now = new Date();
    const report = {
      totalAuditTrails: this.auditTrails.size,
      anonymizedTrails: 0,
      expiredTrails: 0,
      dataClassifications: {},
      accessStats: {
        totalAccesses: 0,
        accessesByRole: {},
        accessesByPurpose: {}
      },
      // Enhanced compliance metrics
      complianceMetrics: {
        gdprCompliance: this.calculateGDPRCompliance(),
        dataRetentionCompliance: this.calculateRetentionCompliance(),
        accessControlCompliance: this.calculateAccessControlCompliance(),
        privacyByDesignScore: this.calculatePrivacyByDesignScore()
      },
      riskAssessment: {
        highRiskDataCount: 0,
        unauthorizedAccessAttempts: 0,
        dataBreachRisk: 'LOW'
      },
      recommendations: []
    };

    this.auditTrails.forEach(auditEntry => {
      // Count anonymized trails
      if (this.shouldAnonymize(auditEntry)) {
        report.anonymizedTrails++;
      }

      // Count expired trails
      if (now > auditEntry.retentionDate) {
        report.expiredTrails++;
      }

      // Count high-risk data
      if (auditEntry.dataClassification.includes('PII') || auditEntry.dataClassification.includes('BIOMETRIC')) {
        report.riskAssessment.highRiskDataCount++;
      }

      // Count data classifications
      auditEntry.dataClassification.forEach(classification => {
        report.dataClassifications[classification] = (report.dataClassifications[classification] || 0) + 1;
      });

      // Count accesses and detect unauthorized attempts
      report.accessStats.totalAccesses += auditEntry.accessLog.length;
      auditEntry.accessLog.forEach(access => {
        const role = access.requester.role;
        const purpose = access.purpose;
        
        report.accessStats.accessesByRole[role] = (report.accessStats.accessesByRole[role] || 0) + 1;
        report.accessStats.accessesByPurpose[purpose] = (report.accessStats.accessesByPurpose[purpose] || 0) + 1;
        
        // Detect potential unauthorized access patterns
        if (role === 'unknown' || !this.isValidRolePurposeCombination(role, purpose)) {
          report.riskAssessment.unauthorizedAccessAttempts++;
        }
      });
    });

    // Calculate overall data breach risk
    report.riskAssessment.dataBreachRisk = this.calculateDataBreachRisk(report);

    // Generate recommendations
    report.recommendations = this.generatePrivacyRecommendations(report);

    return report;
  }

  /**
   * Calculate GDPR compliance score
   */
  calculateGDPRCompliance() {
    let score = 100;
    const now = new Date();
    
    this.auditTrails.forEach(auditEntry => {
      // Check data retention compliance
      if (now > auditEntry.retentionDate) {
        score -= 5; // Penalty for expired data not cleaned up
      }
      
      // Check anonymization compliance
      if (this.shouldAnonymize(auditEntry) && !auditEntry.anonymized) {
        score -= 3; // Penalty for data that should be anonymized
      }
      
      // Check access logging
      if (auditEntry.dataClassification.includes('PII') && auditEntry.accessLog.length === 0) {
        score -= 1; // Minor penalty for PII without access logs
      }
    });
    
    return Math.max(score, 0);
  }

  /**
   * Calculate data retention compliance score
   */
  calculateRetentionCompliance() {
    const now = new Date();
    let compliantTrails = 0;
    let totalTrails = this.auditTrails.size;
    
    this.auditTrails.forEach(auditEntry => {
      if (now <= auditEntry.retentionDate) {
        compliantTrails++;
      }
    });
    
    return totalTrails > 0 ? (compliantTrails / totalTrails) * 100 : 100;
  }

  /**
   * Calculate access control compliance score
   */
  calculateAccessControlCompliance() {
    let validAccesses = 0;
    let totalAccesses = 0;
    
    this.auditTrails.forEach(auditEntry => {
      auditEntry.accessLog.forEach(access => {
        totalAccesses++;
        if (this.isValidRolePurposeCombination(access.requester.role, access.purpose)) {
          validAccesses++;
        }
      });
    });
    
    return totalAccesses > 0 ? (validAccesses / totalAccesses) * 100 : 100;
  }

  /**
   * Calculate privacy by design score
   */
  calculatePrivacyByDesignScore() {
    let score = 0;
    const totalTrails = this.auditTrails.size;
    
    if (totalTrails === 0) return 100;
    
    this.auditTrails.forEach(auditEntry => {
      // Points for proper data classification
      if (auditEntry.dataClassification.length > 0) {
        score += 20;
      }
      
      // Points for privacy hash
      if (auditEntry.privacyHash) {
        score += 20;
      }
      
      // Points for encrypted sensitive data
      if (auditEntry.encryptedData) {
        score += 20;
      }
      
      // Points for proper retention dates
      if (auditEntry.retentionDate && auditEntry.anonymizationDate) {
        score += 20;
      }
      
      // Points for access logging
      if (auditEntry.accessLog.length > 0) {
        score += 20;
      }
    });
    
    return Math.min(score / totalTrails, 100);
  }

  /**
   * Check if role-purpose combination is valid
   */
  isValidRolePurposeCombination(role, purpose) {
    const validCombinations = {
      'regulator': ['regulatory_audit', 'compliance_investigation'],
      'compliance_officer': ['regulatory_audit', 'fraud_investigation', 'compliance_investigation'],
      'auditor': ['regulatory_audit', 'internal_audit'],
      'fraud_investigator': ['fraud_investigation'],
      'law_enforcement': ['fraud_investigation', 'criminal_investigation'],
      'support_agent': ['customer_support'],
      'system_admin': ['system_maintenance'],
      'developer': ['system_maintenance'],
      'researcher': ['research'],
      'data_scientist': ['research']
    };
    
    const allowedPurposes = validCombinations[role] || [];
    return allowedPurposes.includes(purpose);
  }

  /**
   * Calculate overall data breach risk
   */
  calculateDataBreachRisk(report) {
    let riskScore = 0;
    
    // High-risk data increases risk
    if (report.riskAssessment.highRiskDataCount > 100) {
      riskScore += 30;
    } else if (report.riskAssessment.highRiskDataCount > 50) {
      riskScore += 20;
    } else if (report.riskAssessment.highRiskDataCount > 10) {
      riskScore += 10;
    }
    
    // Unauthorized access attempts increase risk
    if (report.riskAssessment.unauthorizedAccessAttempts > 10) {
      riskScore += 40;
    } else if (report.riskAssessment.unauthorizedAccessAttempts > 5) {
      riskScore += 25;
    } else if (report.riskAssessment.unauthorizedAccessAttempts > 0) {
      riskScore += 15;
    }
    
    // Expired data increases risk
    if (report.expiredTrails > 50) {
      riskScore += 20;
    } else if (report.expiredTrails > 10) {
      riskScore += 10;
    }
    
    // Low compliance scores increase risk
    if (report.complianceMetrics.gdprCompliance < 80) {
      riskScore += 15;
    }
    if (report.complianceMetrics.accessControlCompliance < 90) {
      riskScore += 10;
    }
    
    if (riskScore >= 70) return 'CRITICAL';
    if (riskScore >= 50) return 'HIGH';
    if (riskScore >= 30) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Generate privacy recommendations
   */
  generatePrivacyRecommendations(report) {
    const recommendations = [];
    
    if (report.expiredTrails > 0) {
      recommendations.push({
        priority: 'HIGH',
        category: 'DATA_RETENTION',
        message: `${report.expiredTrails} audit trails have exceeded retention period and should be cleaned up`,
        action: 'Run cleanup process for expired audit trails'
      });
    }
    
    if (report.riskAssessment.unauthorizedAccessAttempts > 0) {
      recommendations.push({
        priority: 'HIGH',
        category: 'ACCESS_CONTROL',
        message: `${report.riskAssessment.unauthorizedAccessAttempts} unauthorized access attempts detected`,
        action: 'Review access control policies and investigate unauthorized attempts'
      });
    }
    
    if (report.complianceMetrics.gdprCompliance < 90) {
      recommendations.push({
        priority: 'MEDIUM',
        category: 'GDPR_COMPLIANCE',
        message: `GDPR compliance score is ${report.complianceMetrics.gdprCompliance}%`,
        action: 'Improve data retention and anonymization processes'
      });
    }
    
    if (report.anonymizedTrails / report.totalAuditTrails < 0.1) {
      recommendations.push({
        priority: 'LOW',
        category: 'ANONYMIZATION',
        message: 'Low percentage of anonymized data may indicate recent data only',
        action: 'Monitor anonymization process and ensure proper data lifecycle management'
      });
    }
    
    if (report.riskAssessment.highRiskDataCount > 100) {
      recommendations.push({
        priority: 'MEDIUM',
        category: 'DATA_MINIMIZATION',
        message: `${report.riskAssessment.highRiskDataCount} high-risk data entries detected`,
        action: 'Consider data minimization strategies to reduce privacy risk'
      });
    }
    
    return recommendations;
  }

  /**
   * Enhanced audit trail creation with compliance metadata
   */
  createComplianceAuditTrail(data, complianceContext = {}) {
    const enhancedData = {
      ...data,
      complianceContext: {
        regulatoryFramework: complianceContext.regulatoryFramework || 'GENERAL',
        dataSubject: complianceContext.dataSubject || 'unknown',
        processingPurpose: complianceContext.processingPurpose || 'compliance',
        legalBasis: complianceContext.legalBasis || 'legitimate_interest',
        dataController: complianceContext.dataController || 'echopay',
        dataProcessor: complianceContext.dataProcessor || 'compliance_service'
      }
    };
    
    return this.createAuditTrail(enhancedData);
  }

  /**
   * Generate privacy impact assessment
   */
  generatePrivacyImpactAssessment(dataTypes, processingPurpose, dataVolume) {
    const assessment = {
      assessmentId: crypto.randomUUID(),
      timestamp: new Date(),
      dataTypes,
      processingPurpose,
      dataVolume,
      riskLevel: 'LOW',
      riskFactors: [],
      mitigationMeasures: [],
      complianceRequirements: []
    };
    
    // Assess risk based on data types
    if (dataTypes.includes('biometric') || dataTypes.includes('genetic')) {
      assessment.riskLevel = 'HIGH';
      assessment.riskFactors.push('Special category personal data processing');
    } else if (dataTypes.includes('financial') || dataTypes.includes('health')) {
      assessment.riskLevel = 'MEDIUM';
      assessment.riskFactors.push('Sensitive personal data processing');
    }
    
    // Assess risk based on data volume
    if (dataVolume > 100000) {
      assessment.riskLevel = assessment.riskLevel === 'LOW' ? 'MEDIUM' : 'HIGH';
      assessment.riskFactors.push('Large scale data processing');
    }
    
    // Generate mitigation measures
    if (assessment.riskLevel === 'HIGH') {
      assessment.mitigationMeasures.push('Implement data minimization');
      assessment.mitigationMeasures.push('Enhanced encryption for data at rest and in transit');
      assessment.mitigationMeasures.push('Regular privacy audits');
      assessment.mitigationMeasures.push('Data Protection Officer oversight');
    }
    
    // Determine compliance requirements
    assessment.complianceRequirements.push('GDPR Article 6 - Lawfulness of processing');
    if (dataTypes.some(type => ['biometric', 'health', 'genetic'].includes(type))) {
      assessment.complianceRequirements.push('GDPR Article 9 - Special categories of personal data');
    }
    if (dataVolume > 50000) {
      assessment.complianceRequirements.push('GDPR Article 35 - Data protection impact assessment');
    }
    
    return assessment;
  }
}

module.exports = PrivacyService;