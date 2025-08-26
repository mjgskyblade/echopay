const winston = require('winston');
const Joi = require('joi');
const RegulatoryReportingService = require('../services/regulatory-reporting-service');
const PrivacyService = require('../services/privacy-service');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'regulatory-reporting-controller' },
  transports: [new winston.transports.Console()]
});

/**
 * Regulatory Reporting Controller
 * Handles regulatory reporting and ISO 20022 compliance endpoints
 */
class RegulatoryReportingController {
  constructor() {
    this.reportingService = new RegulatoryReportingService({
      reportTemplates: this.getReportTemplates(),
      regulatoryEndpoints: this.getRegulatoryEndpoints(),
      iso20022Config: this.getISO20022Config()
    });
    
    this.privacyService = new PrivacyService();
  }

  /**
   * Generate regulatory report
   */
  async generateReport(req, res) {
    try {
      // Validate request
      const schema = Joi.object({
        reportType: Joi.string().valid(
          'SAR', 'CTR', 'KYC_SUMMARY', 'AML_STATISTICS', 
          'TRANSACTION_MONITORING', 'COMPLIANCE_AUDIT'
        ).required(),
        data: Joi.object().required(),
        options: Joi.object({
          jurisdiction: Joi.string().default('US'),
          format: Joi.string().valid('JSON', 'XML', 'CSV', 'ISO20022').default('JSON'),
          startDate: Joi.date(),
          endDate: Joi.date(),
          generatedBy: Joi.string(),
          institutionName: Joi.string(),
          includeData: Joi.boolean().default(false),
          auditor: Joi.string()
        }).default({})
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        return res.status(400).json({
          error: 'Validation failed',
          details: error.details.map(d => d.message),
          requestId: req.id
        });
      }

      const { reportType, data, options } = value;

      // Check authorization for report type
      if (!this.isAuthorizedForReportType(req, reportType)) {
        return res.status(403).json({
          error: 'Insufficient permissions for report type',
          reportType,
          requestId: req.id
        });
      }

      logger.info('Regulatory report generation request', {
        requestId: req.id,
        reportType,
        jurisdiction: options.jurisdiction,
        format: options.format
      });

      // Create privacy-preserving audit trail
      const auditTrail = this.privacyService.createAuditTrail({
        action: 'regulatory_report_generation',
        reportType,
        jurisdiction: options.jurisdiction,
        format: options.format,
        generatedBy: options.generatedBy || req.headers['x-user-id'] || 'unknown',
        timestamp: new Date(),
        requestId: req.id,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });

      // Generate report
      const report = await this.reportingService.generateRegulatoryReport(
        reportType, 
        data, 
        {
          ...options,
          generatedBy: options.generatedBy || req.headers['x-user-id'] || 'system'
        }
      );

      // Create audit trail for report generation result
      this.privacyService.createAuditTrail({
        action: 'regulatory_report_generated',
        reportId: report.reportId,
        reportType,
        recordCount: report.recordCount,
        status: report.status,
        timestamp: new Date(),
        requestId: req.id
      });

      logger.info('Regulatory report generated successfully', {
        requestId: req.id,
        reportId: report.reportId,
        reportType,
        recordCount: report.recordCount
      });

      res.json({
        ...report,
        auditTrailId: auditTrail.auditId,
        requestId: req.id,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Failed to generate regulatory report', {
        requestId: req.id,
        error: error.message,
        stack: error.stack
      });

      res.status(500).json({
        error: 'Report generation failed',
        message: error.message,
        requestId: req.id,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Download generated report
   */
  async downloadReport(req, res) {
    try {
      const schema = Joi.object({
        reportId: Joi.string().required(),
        format: Joi.string().valid('JSON', 'XML', 'CSV', 'ISO20022').optional()
      });

      const { error, value } = schema.validate({
        ...req.params,
        ...req.query
      });

      if (error) {
        return res.status(400).json({
          error: 'Validation failed',
          details: error.details.map(d => d.message),
          requestId: req.id
        });
      }

      const { reportId, format } = value;

      logger.info('Report download request', {
        requestId: req.id,
        reportId,
        format
      });

      // Get report
      const report = this.reportingService.getReport(reportId);
      if (!report) {
        return res.status(404).json({
          error: 'Report not found',
          reportId,
          requestId: req.id
        });
      }

      // Check authorization
      if (!this.isAuthorizedForReportAccess(req, report)) {
        return res.status(403).json({
          error: 'Insufficient permissions to access report',
          reportId,
          requestId: req.id
        });
      }

      // Create audit trail for report access
      this.privacyService.createAuditTrail({
        action: 'regulatory_report_download',
        reportId,
        reportType: report.reportType,
        accessedBy: req.headers['x-user-id'] || 'unknown',
        format: format || report.format,
        timestamp: new Date(),
        requestId: req.id,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });

      // Format report if different format requested
      let formattedReport;
      if (format && format !== report.format) {
        formattedReport = await this.reportingService.formatReport(report, format);
      } else {
        formattedReport = await this.reportingService.formatReport(report, report.format);
      }

      // Set appropriate headers
      const contentType = this.getContentType(format || report.format);
      const filename = `${report.reportType}_${report.reportId}.${this.getFileExtension(format || report.format)}`;

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('X-Report-ID', reportId);
      res.setHeader('X-Report-Type', report.reportType);
      res.setHeader('X-Generated-At', report.generatedAt);

      res.send(formattedReport);

      logger.info('Report downloaded successfully', {
        requestId: req.id,
        reportId,
        format: format || report.format
      });

    } catch (error) {
      logger.error('Failed to download report', {
        requestId: req.id,
        error: error.message
      });

      res.status(500).json({
        error: 'Report download failed',
        message: error.message,
        requestId: req.id
      });
    }
  }

  /**
   * Submit report to regulatory authorities
   */
  async submitReport(req, res) {
    try {
      const schema = Joi.object({
        reportId: Joi.string().required(),
        authorities: Joi.array().items(
          Joi.object({
            name: Joi.string().required(),
            endpoint: Joi.string().uri().required(),
            apiKey: Joi.string().required(),
            institutionId: Joi.string().required()
          })
        ).required()
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

      const { reportId, authorities } = value;

      // Check authorization for report submission
      if (!this.isAuthorizedForReportSubmission(req)) {
        return res.status(403).json({
          error: 'Insufficient permissions to submit reports',
          requestId: req.id
        });
      }

      logger.info('Report submission request', {
        requestId: req.id,
        reportId,
        authorities: authorities.map(a => a.name)
      });

      // Create audit trail for submission attempt
      const auditTrail = this.privacyService.createAuditTrail({
        action: 'regulatory_report_submission',
        reportId,
        authorities: authorities.map(a => a.name),
        submittedBy: req.headers['x-user-id'] || 'unknown',
        timestamp: new Date(),
        requestId: req.id,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });

      // Submit report
      const submissionResults = await this.reportingService.submitToRegulatoryAuthorities(
        reportId,
        authorities
      );

      // Create audit trail for submission results
      this.privacyService.createAuditTrail({
        action: 'regulatory_report_submission_result',
        reportId,
        submissionResults: submissionResults.map(r => ({
          authority: r.authority,
          status: r.status,
          submissionId: r.submissionId
        })),
        timestamp: new Date(),
        requestId: req.id
      });

      logger.info('Report submission completed', {
        requestId: req.id,
        reportId,
        successfulSubmissions: submissionResults.filter(r => r.status === 'accepted').length,
        totalSubmissions: submissionResults.length
      });

      res.json({
        reportId,
        submissionResults,
        auditTrailId: auditTrail.auditId,
        requestId: req.id,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Failed to submit report', {
        requestId: req.id,
        error: error.message
      });

      res.status(500).json({
        error: 'Report submission failed',
        message: error.message,
        requestId: req.id
      });
    }
  }

  /**
   * Format message as ISO 20022
   */
  async formatISO20022(req, res) {
    try {
      const schema = Joi.object({
        messageType: Joi.string().required(),
        messageData: Joi.object().required(),
        options: Joi.object({
          version: Joi.string().default('001.001.01'),
          namespace: Joi.string(),
          includeHeader: Joi.boolean().default(true)
        }).default({})
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        return res.status(400).json({
          error: 'Validation failed',
          details: error.details.map(d => d.message),
          requestId: req.id
        });
      }

      const { messageType, messageData, options } = value;

      logger.info('ISO 20022 formatting request', {
        requestId: req.id,
        messageType,
        version: options.version
      });

      // Create mock report for ISO 20022 formatting
      const mockReport = {
        reportId: `iso20022_${Date.now()}`,
        reportType: messageType,
        reportData: messageData,
        generatedAt: new Date(),
        metadata: {
          version: options.version,
          namespace: options.namespace
        }
      };

      // Format as ISO 20022
      const iso20022Message = await this.reportingService.formatAsISO20022(mockReport);

      // Create audit trail
      this.privacyService.createAuditTrail({
        action: 'iso20022_formatting',
        messageType,
        version: options.version,
        formattedBy: req.headers['x-user-id'] || 'unknown',
        timestamp: new Date(),
        requestId: req.id,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });

      res.set('Content-Type', 'application/xml');
      res.send(iso20022Message);

      logger.info('ISO 20022 message formatted successfully', {
        requestId: req.id,
        messageType
      });

    } catch (error) {
      logger.error('Failed to format ISO 20022 message', {
        requestId: req.id,
        error: error.message
      });

      res.status(500).json({
        error: 'ISO 20022 formatting failed',
        message: error.message,
        requestId: req.id
      });
    }
  }

  /**
   * Get report list
   */
  async getReports(req, res) {
    try {
      const schema = Joi.object({
        reportType: Joi.string().optional(),
        jurisdiction: Joi.string().optional(),
        status: Joi.string().optional(),
        startDate: Joi.date().optional(),
        endDate: Joi.date().optional(),
        limit: Joi.number().integer().min(1).max(100).default(50),
        offset: Joi.number().integer().min(0).default(0)
      });

      const { error, value } = schema.validate(req.query);
      if (error) {
        return res.status(400).json({
          error: 'Validation failed',
          details: error.details.map(d => d.message),
          requestId: req.id
        });
      }

      const filters = value;

      logger.info('Report list request', {
        requestId: req.id,
        filters
      });

      // Get reports with filters
      let reports = this.reportingService.getAllReports(filters);

      // Apply date filtering
      if (filters.startDate || filters.endDate) {
        reports = reports.filter(report => {
          const reportDate = new Date(report.generatedAt);
          if (filters.startDate && reportDate < filters.startDate) return false;
          if (filters.endDate && reportDate > filters.endDate) return false;
          return true;
        });
      }

      // Apply pagination
      const total = reports.length;
      const paginatedReports = reports
        .slice(filters.offset, filters.offset + filters.limit)
        .map(report => ({
          reportId: report.reportId,
          reportType: report.reportType,
          jurisdiction: report.jurisdiction,
          format: report.format,
          generatedAt: report.generatedAt,
          generatedBy: report.generatedBy,
          status: report.status,
          submissionStatus: report.submissionStatus,
          recordCount: report.metadata?.recordCount || 0
        }));

      res.json({
        reports: paginatedReports,
        pagination: {
          total,
          limit: filters.limit,
          offset: filters.offset,
          hasMore: filters.offset + filters.limit < total
        },
        requestId: req.id,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Failed to get report list', {
        requestId: req.id,
        error: error.message
      });

      res.status(500).json({
        error: 'Failed to get reports',
        message: error.message,
        requestId: req.id
      });
    }
  }

  /**
   * Get report templates
   */
  getReportTemplates() {
    return {
      'SAR_US': {
        requiredFields: ['suspiciousActivities', 'reportHeader'],
        optionalFields: ['summary', 'attachments'],
        validationRules: {
          'suspiciousActivities': 'array',
          'reportHeader.filingInstitution': 'string'
        }
      },
      'CTR_US': {
        requiredFields: ['currencyTransactions', 'reportHeader'],
        optionalFields: ['summary'],
        validationRules: {
          'currencyTransactions': 'array',
          'reportHeader.filingInstitution': 'string'
        }
      },
      'KYC_SUMMARY_US': {
        requiredFields: ['kycStatistics', 'reportHeader'],
        optionalFields: ['verificationLevels', 'riskAssessment'],
        validationRules: {
          'kycStatistics.totalVerifications': 'number',
          'reportHeader.filingInstitution': 'string'
        }
      }
    };
  }

  /**
   * Get regulatory endpoints configuration
   */
  getRegulatoryEndpoints() {
    return {
      'FINCEN': {
        name: 'Financial Crimes Enforcement Network',
        baseUrl: process.env.FINCEN_API_URL || 'https://api.fincen.gov',
        supportedReports: ['SAR', 'CTR'],
        authMethod: 'api_key'
      },
      'SEC': {
        name: 'Securities and Exchange Commission',
        baseUrl: process.env.SEC_API_URL || 'https://api.sec.gov',
        supportedReports: ['COMPLIANCE_AUDIT'],
        authMethod: 'oauth2'
      },
      'FCA': {
        name: 'Financial Conduct Authority (UK)',
        baseUrl: process.env.FCA_API_URL || 'https://api.fca.org.uk',
        supportedReports: ['SAR', 'AML_STATISTICS'],
        authMethod: 'api_key'
      }
    };
  }

  /**
   * Get ISO 20022 configuration
   */
  getISO20022Config() {
    return {
      defaultNamespace: 'urn:iso:std:iso:20022:tech:xsd',
      supportedVersions: ['001.001.01', '001.001.02', '001.001.03'],
      messageTypes: {
        'SAR': 'auth.012.001.01',
        'CTR': 'auth.011.001.01',
        'KYC_SUMMARY': 'auth.013.001.01'
      }
    };
  }

  /**
   * Check if user is authorized for report type
   */
  isAuthorizedForReportType(req, reportType) {
    const userRole = req.headers['x-user-role'] || 'unknown';
    
    const authorizedRoles = {
      'SAR': ['compliance_officer', 'regulator', 'auditor'],
      'CTR': ['compliance_officer', 'regulator', 'auditor'],
      'KYC_SUMMARY': ['compliance_officer', 'regulator', 'auditor', 'manager'],
      'AML_STATISTICS': ['compliance_officer', 'regulator', 'auditor', 'manager'],
      'TRANSACTION_MONITORING': ['compliance_officer', 'manager', 'analyst'],
      'COMPLIANCE_AUDIT': ['compliance_officer', 'auditor', 'regulator']
    };

    return authorizedRoles[reportType]?.includes(userRole) || false;
  }

  /**
   * Check if user is authorized for report access
   */
  isAuthorizedForReportAccess(req, report) {
    const userRole = req.headers['x-user-role'] || 'unknown';
    const userId = req.headers['x-user-id'] || 'unknown';
    
    // Report creator can always access
    if (report.generatedBy === userId) {
      return true;
    }
    
    // Check role-based access
    return this.isAuthorizedForReportType(req, report.reportType);
  }

  /**
   * Check if user is authorized for report submission
   */
  isAuthorizedForReportSubmission(req) {
    const userRole = req.headers['x-user-role'] || 'unknown';
    return ['compliance_officer', 'regulator'].includes(userRole);
  }

  /**
   * Get content type for format
   */
  getContentType(format) {
    const contentTypes = {
      'JSON': 'application/json',
      'XML': 'application/xml',
      'CSV': 'text/csv',
      'ISO20022': 'application/xml'
    };
    
    return contentTypes[format] || 'application/octet-stream';
  }

  /**
   * Get file extension for format
   */
  getFileExtension(format) {
    const extensions = {
      'JSON': 'json',
      'XML': 'xml',
      'CSV': 'csv',
      'ISO20022': 'xml'
    };
    
    return extensions[format] || 'txt';
  }
}

module.exports = RegulatoryReportingController;