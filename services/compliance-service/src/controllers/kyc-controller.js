const winston = require('winston');
const Joi = require('joi');
const KYCService = require('../services/kyc-service');
const PrivacyService = require('../services/privacy-service');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'kyc-controller' },
  transports: [new winston.transports.Console()]
});

/**
 * KYC Controller
 * Handles KYC verification endpoints with privacy preservation
 */
class KYCController {
  constructor() {
    this.kycService = new KYCService({
      providers: {
        jumio: {
          apiKey: process.env.JUMIO_API_KEY,
          apiSecret: process.env.JUMIO_API_SECRET,
          baseUrl: process.env.JUMIO_BASE_URL || 'https://netverify.com/api'
        },
        onfido: {
          apiKey: process.env.ONFIDO_API_KEY,
          baseUrl: process.env.ONFIDO_BASE_URL || 'https://api.onfido.com/v3'
        }
      },
      defaultProvider: process.env.KYC_DEFAULT_PROVIDER || 'mock'
    });
    
    this.privacyService = new PrivacyService();
  }

  /**
   * Verify user identity
   */
  async verifyIdentity(req, res) {
    try {
      // Validate request
      const schema = Joi.object({
        userId: Joi.string().required(),
        documentData: Joi.object({
          documentType: Joi.string().valid('passport', 'drivers_license', 'national_id').required(),
          documentNumber: Joi.string().required(),
          fullName: Joi.string().required(),
          dateOfBirth: Joi.date().required(),
          address: Joi.object({
            street: Joi.string().required(),
            city: Joi.string().required(),
            state: Joi.string(),
            postalCode: Joi.string().required(),
            country: Joi.string().required()
          }).required(),
          documentTypes: Joi.array().items(Joi.string())
        }).required(),
        options: Joi.object({
          provider: Joi.string().valid('jumio', 'onfido', 'mock'),
          verificationLevel: Joi.string().valid('basic', 'enhanced', 'premium'),
          skipBiometric: Joi.boolean()
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

      const { userId, documentData, options = {} } = value;

      logger.info('KYC verification request', {
        requestId: req.id,
        userId,
        provider: options.provider || this.kycService.defaultProvider
      });

      // Create privacy-preserving audit trail
      const auditTrail = this.privacyService.createAuditTrail({
        action: 'kyc_verification_request',
        userId,
        documentType: documentData.documentType,
        provider: options.provider || this.kycService.defaultProvider,
        timestamp: new Date(),
        requestId: req.id,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });

      // Perform KYC verification
      const verification = await this.kycService.verifyIdentity(userId, documentData, options);

      // Create audit trail for verification result
      this.privacyService.createAuditTrail({
        action: 'kyc_verification_result',
        userId,
        verificationId: verification.verificationId,
        status: verification.status,
        verificationLevel: verification.verificationLevel,
        riskScore: verification.riskScore,
        timestamp: new Date(),
        requestId: req.id
      });

      // Return sanitized response
      const response = {
        verificationId: verification.verificationId,
        userId: verification.userId,
        status: verification.status,
        verificationLevel: verification.verificationLevel,
        verifiedAt: verification.verifiedAt,
        expiresAt: verification.expiresAt,
        riskScore: verification.riskScore,
        flags: verification.flags.map(f => ({
          flag: f.flag,
          timestamp: f.timestamp
        })),
        auditTrailId: auditTrail.auditId,
        requestId: req.id,
        timestamp: new Date().toISOString()
      };

      logger.info('KYC verification completed', {
        requestId: req.id,
        userId,
        verificationId: verification.verificationId,
        status: verification.status
      });

      res.json(response);

    } catch (error) {
      logger.error('KYC verification failed', {
        requestId: req.id,
        error: error.message,
        stack: error.stack
      });

      res.status(500).json({
        error: 'KYC verification failed',
        message: error.message,
        requestId: req.id,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Get verification status
   */
  async getVerificationStatus(req, res) {
    try {
      const schema = Joi.object({
        userId: Joi.string().required()
      });

      const { error, value } = schema.validate(req.params);
      if (error) {
        return res.status(400).json({
          error: 'Validation failed',
          details: error.details.map(d => d.message),
          requestId: req.id
        });
      }

      const { userId } = value;

      logger.info('KYC status request', { requestId: req.id, userId });

      const verification = await this.kycService.getVerificationStatus(userId);

      if (!verification) {
        return res.status(404).json({
          error: 'Verification not found',
          userId,
          requestId: req.id,
          timestamp: new Date().toISOString()
        });
      }

      // Create audit trail for status check
      this.privacyService.createAuditTrail({
        action: 'kyc_status_check',
        userId,
        timestamp: new Date(),
        requestId: req.id,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });

      res.json({
        ...verification,
        requestId: req.id,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Failed to get KYC status', {
        requestId: req.id,
        error: error.message
      });

      res.status(500).json({
        error: 'Failed to get verification status',
        message: error.message,
        requestId: req.id,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Update verification status (admin endpoint)
   */
  async updateVerificationStatus(req, res) {
    try {
      const schema = Joi.object({
        userId: Joi.string().required(),
        status: Joi.string().valid('verified', 'rejected', 'expired').required(),
        reason: Joi.string(),
        updatedBy: Joi.string().required()
      });

      const { error, value } = schema.validate({
        ...req.params,
        ...req.body
      });

      if (error) {
        return res.status(400).json({
          error: 'Validation failed',
          details: error.details.map(d => d.message),
          requestId: req.id
        });
      }

      const { userId, status, reason, updatedBy } = value;

      logger.info('KYC status update request', {
        requestId: req.id,
        userId,
        status,
        updatedBy
      });

      const verification = await this.kycService.updateVerificationStatus(userId, status, reason);

      // Create audit trail for status update
      this.privacyService.createAuditTrail({
        action: 'kyc_status_update',
        userId,
        status,
        reason,
        updatedBy,
        timestamp: new Date(),
        requestId: req.id,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });

      res.json({
        ...verification,
        updatedBy,
        requestId: req.id,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Failed to update KYC status', {
        requestId: req.id,
        error: error.message
      });

      res.status(500).json({
        error: 'Failed to update verification status',
        message: error.message,
        requestId: req.id,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Get KYC statistics (admin endpoint)
   */
  async getKYCStatistics(req, res) {
    try {
      logger.info('KYC statistics request', { requestId: req.id });

      const stats = this.kycService.getVerificationStats();
      const privacyReport = this.privacyService.getPrivacyComplianceReport();

      res.json({
        kycStats: stats,
        privacyCompliance: privacyReport,
        requestId: req.id,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Failed to get KYC statistics', {
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

module.exports = KYCController;