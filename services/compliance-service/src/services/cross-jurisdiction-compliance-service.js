const winston = require('winston');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');

class CrossJurisdictionComplianceService {
  constructor() {
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      defaultMeta: { service: 'cross-jurisdiction-compliance' },
      transports: [
        new winston.transports.Console()
      ]
    });

    // Regional compliance frameworks configuration
    this.regionalFrameworks = {
      'US': {
        name: 'United States',
        regulations: ['BSA', 'PATRIOT_ACT', 'FINCEN'],
        dataResidency: 'US',
        kycRequirements: 'ENHANCED',
        amlThreshold: 10000,
        reportingAuthority: 'FINCEN',
        crossBorderReporting: true,
        sanctionsLists: ['OFAC_SDN', 'OFAC_CONSOLIDATED']
      },
      'EU': {
        name: 'European Union',
        regulations: ['GDPR', 'AMLD5', 'AMLD6', 'PSD2'],
        dataResidency: 'EU',
        kycRequirements: 'STANDARD',
        amlThreshold: 15000,
        reportingAuthority: 'EBA',
        crossBorderReporting: true,
        sanctionsLists: ['EU_SANCTIONS', 'UN_SANCTIONS']
      },
      'UK': {
        name: 'United Kingdom',
        regulations: ['MLR2017', 'GDPR_UK', 'PSR2017'],
        dataResidency: 'UK',
        kycRequirements: 'ENHANCED',
        amlThreshold: 15000,
        reportingAuthority: 'FCA',
        crossBorderReporting: true,
        sanctionsLists: ['UK_SANCTIONS', 'UN_SANCTIONS']
      },
      'CA': {
        name: 'Canada',
        regulations: ['PCMLTFA', 'PIPEDA'],
        dataResidency: 'CA',
        kycRequirements: 'STANDARD',
        amlThreshold: 10000,
        reportingAuthority: 'FINTRAC',
        crossBorderReporting: true,
        sanctionsLists: ['OSFI_SANCTIONS']
      },
      'SG': {
        name: 'Singapore',
        regulations: ['AMLA', 'PDPA', 'PSA'],
        dataResidency: 'SG',
        kycRequirements: 'ENHANCED',
        amlThreshold: 20000,
        reportingAuthority: 'MAS',
        crossBorderReporting: true,
        sanctionsLists: ['MAS_SANCTIONS', 'UN_SANCTIONS']
      },
      'AU': {
        name: 'Australia',
        regulations: ['AML_CTF_ACT', 'PRIVACY_ACT'],
        dataResidency: 'AU',
        kycRequirements: 'STANDARD',
        amlThreshold: 10000,
        reportingAuthority: 'AUSTRAC',
        crossBorderReporting: true,
        sanctionsLists: ['DFAT_SANCTIONS']
      },
      'CN': {
        name: 'China',
        regulations: ['CYBERSECURITY_LAW', 'DATA_SECURITY_LAW'],
        dataResidency: 'CN',
        kycRequirements: 'ENHANCED',
        amlThreshold: 50000,
        reportingAuthority: 'PBOC',
        crossBorderReporting: false,
        sanctionsLists: ['CN_SANCTIONS']
      },
      'RU': {
        name: 'Russia',
        regulations: ['FEDERAL_LAW_115', 'DATA_LOCALIZATION'],
        dataResidency: 'RU',
        kycRequirements: 'ENHANCED',
        amlThreshold: 15000,
        reportingAuthority: 'ROSFINMONITORING',
        crossBorderReporting: false,
        sanctionsLists: ['RU_SANCTIONS']
      },
      'IR': {
        name: 'Iran',
        regulations: ['AML_LAW', 'BANKING_LAW'],
        dataResidency: 'IR',
        kycRequirements: 'ENHANCED',
        amlThreshold: 10000,
        reportingAuthority: 'CBI',
        crossBorderReporting: false,
        sanctionsLists: ['IR_SANCTIONS']
      },
      'IN': {
        name: 'India',
        regulations: ['PMLA', 'IT_ACT', 'DPDP_ACT'],
        dataResidency: 'IN',
        kycRequirements: 'STANDARD',
        amlThreshold: 20000,
        reportingAuthority: 'FIU_IND',
        crossBorderReporting: true,
        sanctionsLists: ['IN_SANCTIONS', 'UN_SANCTIONS']
      }
    };

    // Data residency rules
    this.dataResidencyRules = {
      'US': {
        allowedRegions: ['US'],
        encryptionRequired: true,
        localProcessingRequired: true,
        crossBorderTransferRestrictions: ['CN', 'RU', 'IR', 'KP']
      },
      'EU': {
        allowedRegions: ['EU', 'EEA'],
        encryptionRequired: true,
        localProcessingRequired: true,
        crossBorderTransferRestrictions: [],
        adequacyDecisions: ['US_PRIVACY_SHIELD', 'UK', 'CA', 'SG']
      },
      'UK': {
        allowedRegions: ['UK', 'EU'],
        encryptionRequired: true,
        localProcessingRequired: false,
        crossBorderTransferRestrictions: []
      },
      'CA': {
        allowedRegions: ['CA', 'US'],
        encryptionRequired: true,
        localProcessingRequired: false,
        crossBorderTransferRestrictions: []
      },
      'SG': {
        allowedRegions: ['SG', 'ASEAN'],
        encryptionRequired: true,
        localProcessingRequired: true,
        crossBorderTransferRestrictions: []
      },
      'AU': {
        allowedRegions: ['AU', 'NZ'],
        encryptionRequired: true,
        localProcessingRequired: false,
        crossBorderTransferRestrictions: []
      },
      // High-risk jurisdictions with restricted rules
      'CN': {
        allowedRegions: ['CN'],
        encryptionRequired: true,
        localProcessingRequired: true,
        crossBorderTransferRestrictions: ['US', 'EU', 'UK', 'CA', 'AU']
      },
      'RU': {
        allowedRegions: ['RU'],
        encryptionRequired: true,
        localProcessingRequired: true,
        crossBorderTransferRestrictions: ['US', 'EU', 'UK', 'CA', 'AU']
      },
      'IR': {
        allowedRegions: ['IR'],
        encryptionRequired: true,
        localProcessingRequired: true,
        crossBorderTransferRestrictions: ['US', 'EU', 'UK', 'CA', 'AU']
      },
      'IN': {
        allowedRegions: ['IN'],
        encryptionRequired: true,
        localProcessingRequired: true,
        crossBorderTransferRestrictions: []
      }
    };

    // Cross-border monitoring thresholds
    this.crossBorderThresholds = {
      'HIGH_RISK': 50000,
      'MEDIUM_RISK': 25000,
      'LOW_RISK': 10000
    };

    // International cooperation protocols
    this.cooperationProtocols = {
      'FATF': {
        name: 'Financial Action Task Force',
        members: ['US', 'EU', 'UK', 'CA', 'SG', 'AU', 'JP', 'KR'],
        informationSharing: true,
        mutualLegalAssistance: true
      },
      'EGMONT': {
        name: 'Egmont Group',
        members: ['US', 'EU', 'UK', 'CA', 'SG', 'AU'],
        fiuCooperation: true,
        suspiciousActivitySharing: true
      }
    };
  }

  /**
   * Get compliance framework for a specific jurisdiction
   */
  getComplianceFramework(jurisdiction) {
    try {
      const framework = this.regionalFrameworks[jurisdiction];
      if (!framework) {
        throw new Error(`Unsupported jurisdiction: ${jurisdiction}`);
      }

      this.logger.info('Retrieved compliance framework', { 
        jurisdiction, 
        framework: framework.name 
      });

      return {
        success: true,
        framework,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error('Error retrieving compliance framework', { 
        jurisdiction, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Validate data residency requirements for a transaction
   */
  async validateDataResidency(transactionData) {
    try {
      const { fromJurisdiction, toJurisdiction, amount, currency } = transactionData;
      
      const fromRules = this.dataResidencyRules[fromJurisdiction];
      const toRules = this.dataResidencyRules[toJurisdiction];

      if (!fromRules || !toRules) {
        throw new Error('Unsupported jurisdiction for data residency validation');
      }

      const validationResult = {
        transactionId: uuidv4(),
        fromJurisdiction,
        toJurisdiction,
        amount,
        currency,
        dataResidencyCompliant: true,
        violations: [],
        requiredActions: [],
        timestamp: new Date().toISOString()
      };

      // Check cross-border transfer restrictions
      if (fromRules.crossBorderTransferRestrictions.includes(toJurisdiction)) {
        validationResult.dataResidencyCompliant = false;
        validationResult.violations.push({
          type: 'RESTRICTED_JURISDICTION',
          description: `Transfers to ${toJurisdiction} are restricted from ${fromJurisdiction}`,
          severity: 'HIGH'
        });
      }

      // Check if encryption is required
      if (fromRules.encryptionRequired || toRules.encryptionRequired) {
        validationResult.requiredActions.push({
          type: 'ENCRYPTION_REQUIRED',
          description: 'Transaction data must be encrypted in transit and at rest'
        });
      }

      // Check local processing requirements
      if (fromRules.localProcessingRequired && fromJurisdiction !== toJurisdiction) {
        validationResult.requiredActions.push({
          type: 'LOCAL_PROCESSING',
          description: `Transaction processing must occur within ${fromJurisdiction}`
        });
      }

      // Check adequacy decisions for EU
      if (fromJurisdiction === 'EU' && !fromRules.adequacyDecisions.includes(toJurisdiction)) {
        validationResult.violations.push({
          type: 'ADEQUACY_DECISION_REQUIRED',
          description: `No adequacy decision exists for transfers to ${toJurisdiction}`,
          severity: 'MEDIUM'
        });
      }

      this.logger.info('Data residency validation completed', {
        transactionId: validationResult.transactionId,
        compliant: validationResult.dataResidencyCompliant,
        violations: validationResult.violations.length
      });

      return validationResult;
    } catch (error) {
      this.logger.error('Error validating data residency', { 
        error: error.message,
        transactionData 
      });
      throw error;
    }
  }

  /**
   * Monitor cross-border transactions for compliance
   */
  async monitorCrossBorderTransaction(transactionData) {
    try {
      const { 
        transactionId, 
        fromJurisdiction, 
        toJurisdiction, 
        amount, 
        currency,
        userId,
        beneficiaryId 
      } = transactionData;

      const monitoringResult = {
        transactionId,
        monitoringId: uuidv4(),
        fromJurisdiction,
        toJurisdiction,
        amount,
        currency,
        riskLevel: 'LOW',
        flagged: false,
        reportingRequired: false,
        cooperationProtocolsTriggered: [],
        complianceChecks: [],
        timestamp: new Date().toISOString()
      };

      // Determine risk level based on amount and jurisdictions
      const riskLevel = this.assessTransactionRisk(amount, fromJurisdiction, toJurisdiction);
      monitoringResult.riskLevel = riskLevel;

      // Check if transaction exceeds reporting thresholds
      const fromFramework = this.regionalFrameworks[fromJurisdiction];
      const toFramework = this.regionalFrameworks[toJurisdiction];

      if (amount >= fromFramework.amlThreshold || amount >= toFramework.amlThreshold) {
        monitoringResult.reportingRequired = true;
        monitoringResult.complianceChecks.push({
          type: 'AML_THRESHOLD_EXCEEDED',
          description: `Transaction exceeds AML reporting threshold`,
          action: 'REGULATORY_REPORT_REQUIRED'
        });
      }

      // Check if high-risk transaction requires enhanced monitoring
      if (riskLevel === 'HIGH') {
        monitoringResult.flagged = true;
        monitoringResult.complianceChecks.push({
          type: 'HIGH_RISK_TRANSACTION',
          description: 'Transaction flagged for enhanced monitoring',
          action: 'ENHANCED_DUE_DILIGENCE'
        });
      }

      // Check international cooperation protocols
      const applicableProtocols = this.getApplicableCooperationProtocols(fromJurisdiction, toJurisdiction);
      monitoringResult.cooperationProtocolsTriggered = applicableProtocols;

      // Perform sanctions screening
      const sanctionsCheck = await this.performSanctionsScreening(userId, beneficiaryId, fromJurisdiction, toJurisdiction);
      if (!sanctionsCheck.cleared) {
        monitoringResult.flagged = true;
        monitoringResult.complianceChecks.push({
          type: 'SANCTIONS_HIT',
          description: 'Potential sanctions match detected',
          action: 'TRANSACTION_BLOCKED'
        });
      }

      this.logger.info('Cross-border transaction monitoring completed', {
        transactionId,
        monitoringId: monitoringResult.monitoringId,
        riskLevel: monitoringResult.riskLevel,
        flagged: monitoringResult.flagged,
        reportingRequired: monitoringResult.reportingRequired
      });

      return monitoringResult;
    } catch (error) {
      this.logger.error('Error monitoring cross-border transaction', { 
        error: error.message,
        transactionData 
      });
      throw error;
    }
  }

  /**
   * Generate cross-jurisdiction compliance report
   */
  async generateCrossJurisdictionReport(reportParams) {
    try {
      const { 
        jurisdiction, 
        startDate, 
        endDate, 
        reportType = 'CROSS_BORDER_ACTIVITY',
        includeStatistics = true 
      } = reportParams;

      const reportId = uuidv4();
      const framework = this.regionalFrameworks[jurisdiction];

      if (!framework) {
        throw new Error(`Unsupported jurisdiction: ${jurisdiction}`);
      }

      const report = {
        reportId,
        jurisdiction,
        reportType,
        framework: framework.name,
        reportingAuthority: framework.reportingAuthority,
        period: {
          startDate,
          endDate
        },
        generatedAt: new Date().toISOString(),
        data: {
          crossBorderTransactions: [],
          flaggedTransactions: [],
          sanctionsHits: [],
          dataResidencyViolations: [],
          cooperationProtocolActivations: []
        },
        statistics: {},
        complianceStatus: 'COMPLIANT'
      };

      // In a real implementation, this would query the database for actual transaction data
      // For now, we'll simulate the report structure

      if (includeStatistics) {
        report.statistics = {
          totalCrossBorderTransactions: 0,
          totalVolume: 0,
          flaggedTransactionCount: 0,
          sanctionsHitCount: 0,
          dataResidencyViolationCount: 0,
          complianceRate: 100.0
        };
      }

      this.logger.info('Cross-jurisdiction compliance report generated', {
        reportId,
        jurisdiction,
        reportType,
        period: report.period
      });

      return report;
    } catch (error) {
      this.logger.error('Error generating cross-jurisdiction report', { 
        error: error.message,
        reportParams 
      });
      throw error;
    }
  }

  /**
   * Assess transaction risk level
   */
  assessTransactionRisk(amount, fromJurisdiction, toJurisdiction) {
    // High-risk jurisdictions or amounts
    const highRiskJurisdictions = ['CN', 'RU', 'IR', 'KP', 'AF'];
    
    if (amount >= this.crossBorderThresholds.HIGH_RISK) {
      return 'HIGH';
    }
    
    if (highRiskJurisdictions.includes(fromJurisdiction) || 
        highRiskJurisdictions.includes(toJurisdiction)) {
      return 'HIGH';
    }
    
    if (amount >= this.crossBorderThresholds.MEDIUM_RISK) {
      return 'MEDIUM';
    }
    
    return 'LOW';
  }

  /**
   * Get applicable international cooperation protocols
   */
  getApplicableCooperationProtocols(fromJurisdiction, toJurisdiction) {
    const applicableProtocols = [];
    
    for (const [protocolName, protocol] of Object.entries(this.cooperationProtocols)) {
      if (protocol.members.includes(fromJurisdiction) && 
          protocol.members.includes(toJurisdiction)) {
        applicableProtocols.push({
          name: protocolName,
          fullName: protocol.name,
          informationSharing: protocol.informationSharing || false,
          mutualLegalAssistance: protocol.mutualLegalAssistance || false,
          fiuCooperation: protocol.fiuCooperation || false
        });
      }
    }
    
    return applicableProtocols;
  }

  /**
   * Perform sanctions screening
   */
  async performSanctionsScreening(userId, beneficiaryId, fromJurisdiction, toJurisdiction) {
    try {
      // In a real implementation, this would integrate with actual sanctions databases
      // For now, we'll simulate the screening process
      
      const screeningResult = {
        screeningId: uuidv4(),
        userId,
        beneficiaryId,
        fromJurisdiction,
        toJurisdiction,
        cleared: true,
        hits: [],
        listsScreened: [],
        timestamp: new Date().toISOString()
      };

      // Get applicable sanctions lists for both jurisdictions
      const fromFramework = this.regionalFrameworks[fromJurisdiction];
      const toFramework = this.regionalFrameworks[toJurisdiction];

      if (fromFramework) {
        screeningResult.listsScreened.push(...fromFramework.sanctionsLists);
      }
      if (toFramework) {
        screeningResult.listsScreened.push(...toFramework.sanctionsLists);
      }

      // Remove duplicates
      screeningResult.listsScreened = [...new Set(screeningResult.listsScreened)];

      // Simulate screening (in real implementation, would check against actual lists)
      // For demo purposes, we'll randomly flag some transactions
      const shouldFlag = Math.random() < 0.01; // 1% chance of sanctions hit
      
      if (shouldFlag) {
        screeningResult.cleared = false;
        screeningResult.hits.push({
          listName: 'OFAC_SDN',
          matchType: 'PARTIAL_NAME_MATCH',
          confidence: 0.85,
          entity: 'Simulated sanctions entity'
        });
      }

      this.logger.info('Sanctions screening completed', {
        screeningId: screeningResult.screeningId,
        cleared: screeningResult.cleared,
        hits: screeningResult.hits.length,
        listsScreened: screeningResult.listsScreened.length
      });

      return screeningResult;
    } catch (error) {
      this.logger.error('Error performing sanctions screening', { 
        error: error.message,
        userId,
        beneficiaryId 
      });
      throw error;
    }
  }

  /**
   * Handle international cooperation request
   */
  async handleCooperationRequest(requestData) {
    try {
      const {
        requestId,
        requestingJurisdiction,
        targetJurisdiction,
        requestType,
        caseId,
        urgency = 'NORMAL',
        data
      } = requestData;

      const cooperationResponse = {
        requestId,
        responseId: uuidv4(),
        requestingJurisdiction,
        targetJurisdiction,
        requestType,
        caseId,
        status: 'RECEIVED',
        urgency,
        processedAt: new Date().toISOString(),
        response: null,
        nextSteps: []
      };

      // Check if cooperation protocol exists between jurisdictions
      const applicableProtocols = this.getApplicableCooperationProtocols(
        requestingJurisdiction, 
        targetJurisdiction
      );

      if (applicableProtocols.length === 0) {
        cooperationResponse.status = 'REJECTED';
        cooperationResponse.response = 'No applicable cooperation protocol exists';
        return cooperationResponse;
      }

      // Process different types of cooperation requests
      switch (requestType) {
        case 'INFORMATION_REQUEST':
          cooperationResponse.status = 'PROCESSING';
          cooperationResponse.nextSteps.push('Legal review required');
          cooperationResponse.nextSteps.push('Data compilation in progress');
          break;

        case 'MUTUAL_LEGAL_ASSISTANCE':
          cooperationResponse.status = 'PROCESSING';
          cooperationResponse.nextSteps.push('Formal MLA process initiated');
          cooperationResponse.nextSteps.push('Court approval required');
          break;

        case 'FIU_COOPERATION':
          cooperationResponse.status = 'APPROVED';
          cooperationResponse.response = 'FIU cooperation request approved';
          break;

        default:
          cooperationResponse.status = 'REJECTED';
          cooperationResponse.response = 'Unsupported request type';
      }

      this.logger.info('International cooperation request processed', {
        requestId,
        responseId: cooperationResponse.responseId,
        requestingJurisdiction,
        targetJurisdiction,
        requestType,
        status: cooperationResponse.status
      });

      return cooperationResponse;
    } catch (error) {
      this.logger.error('Error handling cooperation request', { 
        error: error.message,
        requestData 
      });
      throw error;
    }
  }
}

module.exports = CrossJurisdictionComplianceService;