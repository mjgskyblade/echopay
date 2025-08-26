const CrossJurisdictionComplianceService = require('../services/cross-jurisdiction-compliance-service');
const winston = require('winston');
const Joi = require('joi');

class CrossJurisdictionController {
  constructor() {
    this.complianceService = new CrossJurisdictionComplianceService();
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      defaultMeta: { service: 'cross-jurisdiction-controller' },
      transports: [
        new winston.transports.Console()
      ]
    });

    // Validation schemas
    this.schemas = {
      dataResidencyValidation: Joi.object({
        fromJurisdiction: Joi.string().required(),
        toJurisdiction: Joi.string().required(),
        amount: Joi.number().positive().required(),
        currency: Joi.string().required(),
        userId: Joi.string().optional(),
        beneficiaryId: Joi.string().optional()
      }),

      crossBorderMonitoring: Joi.object({
        transactionId: Joi.string().required(),
        fromJurisdiction: Joi.string().required(),
        toJurisdiction: Joi.string().required(),
        amount: Joi.number().positive().required(),
        currency: Joi.string().required(),
        userId: Joi.string().required(),
        beneficiaryId: Joi.string().required()
      }),

      complianceReport: Joi.object({
        jurisdiction: Joi.string().required(),
        startDate: Joi.date().iso().required(),
        endDate: Joi.date().iso().required(),
        reportType: Joi.string().valid('CROSS_BORDER_ACTIVITY', 'SANCTIONS_SCREENING', 'DATA_RESIDENCY').optional(),
        includeStatistics: Joi.boolean().optional()
      }),

      cooperationRequest: Joi.object({
        requestId: Joi.string().required(),
        requestingJurisdiction: Joi.string().required(),
        targetJurisdiction: Joi.string().required(),
        requestType: Joi.string().valid('INFORMATION_REQUEST', 'MUTUAL_LEGAL_ASSISTANCE', 'FIU_COOPERATION').required(),
        caseId: Joi.string().required(),
        urgency: Joi.string().valid('LOW', 'NORMAL', 'HIGH', 'URGENT').optional(),
        data: Joi.object().optional()
      })
    };
  }

  /**
   * Get compliance framework for a jurisdiction
   */
  async getComplianceFramework(req, res) {
    try {
      const { jurisdiction } = req.params;

      if (!jurisdiction) {
        return res.status(400).json({
          error: 'Jurisdiction parameter is required',
          requestId: req.id,
          timestamp: new Date().toISOString()
        });
      }

      const result = this.complianceService.getComplianceFramework(jurisdiction);

      this.logger.info('Compliance framework retrieved', {
        requestId: req.id,
        jurisdiction,
        success: result.success
      });

      res.json(result);
    } catch (error) {
      this.logger.error('Error retrieving compliance framework', {
        requestId: req.id,
        jurisdiction: req.params.jurisdiction,
        error: error.message
      });

      res.status(error.message.includes('Unsupported jurisdiction') ? 404 : 500).json({
        error: error.message,
        requestId: req.id,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Validate data residency requirements
   */
  async validateDataResidency(req, res) {
    try {
      const { error, value } = this.schemas.dataResidencyValidation.validate(req.body);
      
      if (error) {
        return res.status(400).json({
          error: 'Validation failed',
          details: error.details.map(d => d.message),
          requestId: req.id,
          timestamp: new Date().toISOString()
        });
      }

      const result = await this.complianceService.validateDataResidency(value);

      this.logger.info('Data residency validation completed', {
        requestId: req.id,
        transactionId: result.transactionId,
        compliant: result.dataResidencyCompliant,
        violations: result.violations.length
      });

      res.json(result);
    } catch (error) {
      this.logger.error('Error validating data residency', {
        requestId: req.id,
        error: error.message
      });

      res.status(500).json({
        error: error.message,
        requestId: req.id,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Monitor cross-border transaction
   */
  async monitorCrossBorderTransaction(req, res) {
    try {
      const { error, value } = this.schemas.crossBorderMonitoring.validate(req.body);
      
      if (error) {
        return res.status(400).json({
          error: 'Validation failed',
          details: error.details.map(d => d.message),
          requestId: req.id,
          timestamp: new Date().toISOString()
        });
      }

      const result = await this.complianceService.monitorCrossBorderTransaction(value);

      this.logger.info('Cross-border transaction monitoring completed', {
        requestId: req.id,
        transactionId: result.transactionId,
        monitoringId: result.monitoringId,
        riskLevel: result.riskLevel,
        flagged: result.flagged
      });

      res.json(result);
    } catch (error) {
      this.logger.error('Error monitoring cross-border transaction', {
        requestId: req.id,
        error: error.message
      });

      res.status(500).json({
        error: error.message,
        requestId: req.id,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Generate cross-jurisdiction compliance report
   */
  async generateComplianceReport(req, res) {
    try {
      const { error, value } = this.schemas.complianceReport.validate(req.body);
      
      if (error) {
        return res.status(400).json({
          error: 'Validation failed',
          details: error.details.map(d => d.message),
          requestId: req.id,
          timestamp: new Date().toISOString()
        });
      }

      const result = await this.complianceService.generateCrossJurisdictionReport(value);

      this.logger.info('Cross-jurisdiction compliance report generated', {
        requestId: req.id,
        reportId: result.reportId,
        jurisdiction: result.jurisdiction,
        reportType: result.reportType
      });

      res.json(result);
    } catch (error) {
      this.logger.error('Error generating compliance report', {
        requestId: req.id,
        error: error.message
      });

      res.status(500).json({
        error: error.message,
        requestId: req.id,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Handle international cooperation request
   */
  async handleCooperationRequest(req, res) {
    try {
      const { error, value } = this.schemas.cooperationRequest.validate(req.body);
      
      if (error) {
        return res.status(400).json({
          error: 'Validation failed',
          details: error.details.map(d => d.message),
          requestId: req.id,
          timestamp: new Date().toISOString()
        });
      }

      const result = await this.complianceService.handleCooperationRequest(value);

      this.logger.info('International cooperation request processed', {
        requestId: req.id,
        cooperationRequestId: result.requestId,
        responseId: result.responseId,
        status: result.status
      });

      res.json(result);
    } catch (error) {
      this.logger.error('Error handling cooperation request', {
        requestId: req.id,
        error: error.message
      });

      res.status(500).json({
        error: error.message,
        requestId: req.id,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Get supported jurisdictions
   */
  async getSupportedJurisdictions(req, res) {
    try {
      const jurisdictions = Object.keys(this.complianceService.regionalFrameworks).map(code => ({
        code,
        name: this.complianceService.regionalFrameworks[code].name,
        regulations: this.complianceService.regionalFrameworks[code].regulations,
        reportingAuthority: this.complianceService.regionalFrameworks[code].reportingAuthority
      }));

      this.logger.info('Supported jurisdictions retrieved', {
        requestId: req.id,
        count: jurisdictions.length
      });

      res.json({
        jurisdictions,
        count: jurisdictions.length,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.logger.error('Error retrieving supported jurisdictions', {
        requestId: req.id,
        error: error.message
      });

      res.status(500).json({
        error: error.message,
        requestId: req.id,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Get data residency rules for a jurisdiction
   */
  async getDataResidencyRules(req, res) {
    try {
      const { jurisdiction } = req.params;

      if (!jurisdiction) {
        return res.status(400).json({
          error: 'Jurisdiction parameter is required',
          requestId: req.id,
          timestamp: new Date().toISOString()
        });
      }

      const rules = this.complianceService.dataResidencyRules[jurisdiction];
      
      if (!rules) {
        return res.status(404).json({
          error: `Data residency rules not found for jurisdiction: ${jurisdiction}`,
          requestId: req.id,
          timestamp: new Date().toISOString()
        });
      }

      this.logger.info('Data residency rules retrieved', {
        requestId: req.id,
        jurisdiction
      });

      res.json({
        jurisdiction,
        rules,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.logger.error('Error retrieving data residency rules', {
        requestId: req.id,
        jurisdiction: req.params.jurisdiction,
        error: error.message
      });

      res.status(500).json({
        error: error.message,
        requestId: req.id,
        timestamp: new Date().toISOString()
      });
    }
  }
}

module.exports = CrossJurisdictionController;