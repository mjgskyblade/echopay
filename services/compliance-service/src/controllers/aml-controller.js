const winston = require('winston');
const Joi = require('joi');
const AMLService = require('../services/aml-service');
const PrivacyService = require('../services/privacy-service');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'aml-controller' },
  transports: [new winston.transports.Console()]
});

/**
 * AML Controller
 * Handles AML screening endpoints with automated reporting
 */
class AMLController {
  constructor() {
    this.amlService = new AMLService({
      watchlistProviders: {
        ofac: {
          apiKey: process.env.OFAC_API_KEY,
          baseUrl: process.env.OFAC_BASE_URL
        },
        worldCheck: {
          apiKey: process.env.WORLD_CHECK_API_KEY,
          baseUrl: process.env.WORLD_CHECK_BASE_URL
        }
      },
      thresholds: {
        sarThreshold: parseFloat(process.env.SAR_THRESHOLD) || 10000,
        highRiskThreshold: parseFloat(process.env.HIGH_RISK_THRESHOLD) || 0.7,
        autoBlockThreshold: parseFloat(process.env.AUTO_BLOCK_THRESHOLD) || 0.9
      }
    });
    
    this.privacyService = new PrivacyService();
  }

  /**
   * Screen transaction for AML compliance
   */
  async screenTransaction(req, res) {
    try {
      // Validate request
      const schema = Joi.object({
        transactionId: Joi.string().required(),
        userId: Joi.string().required(),
        counterpartyId: Joi.string().required(),
        amount: Joi.number().positive().required(),
        currency: Joi.string().length(3).required(),
        transactionType: Joi.string().valid('transfer', 'payment', 'withdrawal', 'deposit'),
        metadata: Joi.object({
          description: Joi.string(),
          category: Joi.string(),
          location: Joi.object({
            country: Joi.string(),
            region: Joi.string()
          })
        })
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        return res.status(400).json({
          error: 'Validation failed',
          details: error.details.map(d => d.message),
          requestId: req.id
        });
      }

      const transactionData = value;

      logger.info('AML screening request', {
        requestId: req.id,
        transactionId: transactionData.transactionId,
        amount: transactionData.amount,
        currency: transactionData.currency
      });

      // Create privacy-preserving audit trail
      const auditTrail = this.privacyService.createAuditTrail({
        action: 'aml_screening_request',
        transactionId: transactionData.transactionId,
        userId: transactionData.userId,
        counterpartyId: transactionData.counterpartyId,
        amount: transactionData.amount,
        currency: transactionData.currency,
        timestamp: new Date(),
        requestId: req.id,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });

      // Perform AML screening
      const screening = await this.amlService.screenTransaction(transactionData);

      // Create audit trail for screening result
      this.privacyService.createAuditTrail({
        action: 'aml_screening_result',
        transactionId: transactionData.transactionId,
        screeningId: screening.screeningId,
        status: screening.status,
        riskLevel: screening.riskLevel,
        riskScore: screening.riskScore,
        sarFiled: screening.sarFiled,
        timestamp: new Date(),
        requestId: req.id
      });

      // Return sanitized response
      const response = {
        screeningId: screening.screeningId,
        transactionId: screening.transactionId,
        status: screening.status,
        riskLevel: screening.riskLevel,
        riskScore: screening.riskScore,
        sanctionsCheck: screening.sanctionsCheck,
        pepCheck: screening.pepCheck,
        adverseMediaCheck: screening.adverseMediaCheck,
        flags: screening.flags.map(f => ({
          type: f.type,
          severity: f.severity,
          timestamp: f.timestamp
        })),
        watchlistHits: screening.watchlistHits.map(h => ({
          listName: h.listName,
          matchType: h.matchType,
          confidence: h.confidence,
          timestamp: h.timestamp
        })),
        sarFiled: screening.sarFiled,
        screenedAt: screening.screenedAt,
        auditTrailId: auditTrail.auditId,
        requestId: req.id,
        timestamp: new Date().toISOString()
      };

      logger.info('AML screening completed', {
        requestId: req.id,
        transactionId: transactionData.transactionId,
        screeningId: screening.screeningId,
        status: screening.status,
        riskLevel: screening.riskLevel
      });

      res.json(response);

    } catch (error) {
      logger.error('AML screening failed', {
        requestId: req.id,
        error: error.message,
        stack: error.stack
      });

      res.status(500).json({
        error: 'AML screening failed',
        message: error.message,
        requestId: req.id,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Get screening result
   */
  async getScreeningResult(req, res) {
    try {
      const schema = Joi.object({
        transactionId: Joi.string().required()
      });

      const { error, value } = schema.validate(req.params);
      if (error) {
        return res.status(400).json({
          error: 'Validation failed',
          details: error.details.map(d => d.message),
          requestId: req.id
        });
      }

      const { transactionId } = value;

      logger.info('AML screening result request', { requestId: req.id, transactionId });

      const screening = await this.amlService.getScreeningResult(transactionId);

      if (!screening) {
        return res.status(404).json({
          error: 'Screening result not found',
          transactionId,
          requestId: req.id,
          timestamp: new Date().toISOString()
        });
      }

      // Create audit trail for result access
      this.privacyService.createAuditTrail({
        action: 'aml_result_access',
        transactionId,
        timestamp: new Date(),
        requestId: req.id,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });

      res.json({
        ...screening,
        requestId: req.id,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Failed to get AML screening result', {
        requestId: req.id,
        error: error.message
      });

      res.status(500).json({
        error: 'Failed to get screening result',
        message: error.message,
        requestId: req.id,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Get SAR reports (regulatory endpoint)
   */
  async getSARReports(req, res) {
    try {
      // Validate requester permissions (in real implementation, would check JWT/auth)
      const requesterInfo = {
        id: req.headers['x-requester-id'] || 'unknown',
        role: req.headers['x-requester-role'] || 'unknown',
        organization: req.headers['x-requester-org'] || 'unknown',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      };

      if (!['regulator', 'compliance_officer', 'auditor'].includes(requesterInfo.role)) {
        return res.status(403).json({
          error: 'Access denied - insufficient permissions',
          requiredRoles: ['regulator', 'compliance_officer', 'auditor'],
          requestId: req.id,
          timestamp: new Date().toISOString()
        });
      }

      logger.info('SAR reports request', {
        requestId: req.id,
        requesterId: requesterInfo.id,
        requesterRole: requesterInfo.role
      });

      const sarReports = this.amlService.getSARReports();

      // Create audit trail for SAR access
      this.privacyService.createAuditTrail({
        action: 'sar_reports_access',
        requesterId: requesterInfo.id,
        requesterRole: requesterInfo.role,
        reportsCount: sarReports.length,
        timestamp: new Date(),
        requestId: req.id,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });

      res.json({
        reports: sarReports,
        totalCount: sarReports.length,
        requestId: req.id,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Failed to get SAR reports', {
        requestId: req.id,
        error: error.message
      });

      res.status(500).json({
        error: 'Failed to get SAR reports',
        message: error.message,
        requestId: req.id,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * File manual SAR (compliance officer endpoint)
   */
  async fileManualSAR(req, res) {
    try {
      const schema = Joi.object({
        transactionId: Joi.string().required(),
        reason: Joi.string().required(),
        filedBy: Joi.string().required(),
        additionalInfo: Joi.string(),
        priority: Joi.string().valid('low', 'medium', 'high', 'critical').default('medium')
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        return res.status(400).json({
          error: 'Validation failed',
          details: error.details.map(d => d.message),
          requestId: req.id
        });
      }

      const { transactionId, reason, filedBy, additionalInfo, priority } = value;

      logger.info('Manual SAR filing request', {
        requestId: req.id,
        transactionId,
        filedBy,
        priority
      });

      // Get existing screening or create new one
      let screening = await this.amlService.getScreeningResult(transactionId);
      if (!screening) {
        // Create minimal screening record for manual SAR
        screening = await this.amlService.screenTransaction({
          transactionId,
          userId: 'manual_sar',
          counterpartyId: 'manual_sar',
          amount: 0,
          currency: 'USD'
        });
      }

      // File SAR
      const sarId = screening.fileSAR(reason, filedBy);

      // Create audit trail for manual SAR filing
      this.privacyService.createAuditTrail({
        action: 'manual_sar_filed',
        transactionId,
        sarId,
        reason,
        filedBy,
        priority,
        additionalInfo,
        timestamp: new Date(),
        requestId: req.id,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });

      res.json({
        sarId,
        transactionId,
        reason,
        filedBy,
        filedAt: new Date().toISOString(),
        status: 'filed',
        requestId: req.id,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Failed to file manual SAR', {
        requestId: req.id,
        error: error.message
      });

      res.status(500).json({
        error: 'Failed to file SAR',
        message: error.message,
        requestId: req.id,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Get AML statistics (admin endpoint)
   */
  async getAMLStatistics(req, res) {
    try {
      logger.info('AML statistics request', { requestId: req.id });

      const stats = this.amlService.getScreeningStats();
      const privacyReport = this.privacyService.getPrivacyComplianceReport();

      res.json({
        amlStats: stats,
        privacyCompliance: privacyReport,
        requestId: req.id,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Failed to get AML statistics', {
        requestId: req.id,
        error: error.message
      });

      res.status(500).json({
        error: 'Failed to get statistics',
        message: error.message,
        requestId: req.id,
        timestamp: new Date().toISOString()
      });
    }
  }
}

module.exports = AMLController;