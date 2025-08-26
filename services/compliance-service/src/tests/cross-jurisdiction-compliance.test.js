const request = require('supertest');
const express = require('express');
const CrossJurisdictionController = require('../controllers/cross-jurisdiction-controller');
const CrossJurisdictionComplianceService = require('../services/cross-jurisdiction-compliance-service');

describe('Cross-Jurisdiction Compliance Integration Tests', () => {
  let app;
  let controller;
  let service;

  beforeAll(() => {
    // Setup Express app for testing
    app = express();
    app.use(express.json());
    
    // Add request ID middleware
    app.use((req, res, next) => {
      req.id = 'test-request-id';
      next();
    });

    controller = new CrossJurisdictionController();
    service = new CrossJurisdictionComplianceService();

    // Setup routes
    app.get('/api/v1/cross-jurisdiction/frameworks/:jurisdiction', (req, res) => 
      controller.getComplianceFramework(req, res));
    app.get('/api/v1/cross-jurisdiction/jurisdictions', (req, res) => 
      controller.getSupportedJurisdictions(req, res));
    app.get('/api/v1/cross-jurisdiction/data-residency/:jurisdiction', (req, res) => 
      controller.getDataResidencyRules(req, res));
    app.post('/api/v1/cross-jurisdiction/validate-residency', (req, res) => 
      controller.validateDataResidency(req, res));
    app.post('/api/v1/cross-jurisdiction/monitor-transaction', (req, res) => 
      controller.monitorCrossBorderTransaction(req, res));
    app.post('/api/v1/cross-jurisdiction/generate-report', (req, res) => 
      controller.generateComplianceReport(req, res));
    app.post('/api/v1/cross-jurisdiction/cooperation-request', (req, res) => 
      controller.handleCooperationRequest(req, res));
  });

  describe('Compliance Framework Management', () => {
    test('should retrieve US compliance framework', async () => {
      const response = await request(app)
        .get('/api/v1/cross-jurisdiction/frameworks/US')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.framework.name).toBe('United States');
      expect(response.body.framework.regulations).toContain('BSA');
      expect(response.body.framework.regulations).toContain('PATRIOT_ACT');
      expect(response.body.framework.dataResidency).toBe('US');
      expect(response.body.framework.reportingAuthority).toBe('FINCEN');
    });

    test('should retrieve EU compliance framework', async () => {
      const response = await request(app)
        .get('/api/v1/cross-jurisdiction/frameworks/EU')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.framework.name).toBe('European Union');
      expect(response.body.framework.regulations).toContain('GDPR');
      expect(response.body.framework.regulations).toContain('AMLD5');
      expect(response.body.framework.dataResidency).toBe('EU');
      expect(response.body.framework.reportingAuthority).toBe('EBA');
    });

    test('should return 404 for unsupported jurisdiction', async () => {
      const response = await request(app)
        .get('/api/v1/cross-jurisdiction/frameworks/INVALID')
        .expect(404);

      expect(response.body.error).toContain('Unsupported jurisdiction');
    });

    test('should retrieve all supported jurisdictions', async () => {
      const response = await request(app)
        .get('/api/v1/cross-jurisdiction/jurisdictions')
        .expect(200);

      expect(response.body.jurisdictions).toBeInstanceOf(Array);
      expect(response.body.count).toBeGreaterThan(0);
      
      const usJurisdiction = response.body.jurisdictions.find(j => j.code === 'US');
      expect(usJurisdiction).toBeDefined();
      expect(usJurisdiction.name).toBe('United States');
      expect(usJurisdiction.reportingAuthority).toBe('FINCEN');
    });
  });

  describe('Data Residency Validation', () => {
    test('should validate compliant US to CA transaction', async () => {
      const transactionData = {
        fromJurisdiction: 'US',
        toJurisdiction: 'CA',
        amount: 5000,
        currency: 'USD',
        userId: 'user-123',
        beneficiaryId: 'beneficiary-456'
      };

      const response = await request(app)
        .post('/api/v1/cross-jurisdiction/validate-residency')
        .send(transactionData)
        .expect(200);

      expect(response.body.dataResidencyCompliant).toBe(true);
      expect(response.body.fromJurisdiction).toBe('US');
      expect(response.body.toJurisdiction).toBe('CA');
      expect(response.body.violations).toHaveLength(0);
      expect(response.body.requiredActions).toContainEqual({
        type: 'ENCRYPTION_REQUIRED',
        description: 'Transaction data must be encrypted in transit and at rest'
      });
    });

    test('should flag restricted jurisdiction transfer', async () => {
      const transactionData = {
        fromJurisdiction: 'US',
        toJurisdiction: 'CN',
        amount: 5000,
        currency: 'USD'
      };

      const response = await request(app)
        .post('/api/v1/cross-jurisdiction/validate-residency')
        .send(transactionData)
        .expect(200);

      expect(response.body.dataResidencyCompliant).toBe(false);
      expect(response.body.violations).toContainEqual({
        type: 'RESTRICTED_JURISDICTION',
        description: 'Transfers to CN are restricted from US',
        severity: 'HIGH'
      });
    });

    test('should validate EU adequacy decision requirements', async () => {
      const transactionData = {
        fromJurisdiction: 'EU',
        toJurisdiction: 'IN', // India - no adequacy decision
        amount: 5000,
        currency: 'EUR'
      };

      const response = await request(app)
        .post('/api/v1/cross-jurisdiction/validate-residency')
        .send(transactionData)
        .expect(200);

      expect(response.body.violations).toContainEqual({
        type: 'ADEQUACY_DECISION_REQUIRED',
        description: 'No adequacy decision exists for transfers to IN',
        severity: 'MEDIUM'
      });
    });

    test('should return validation error for missing required fields', async () => {
      const invalidData = {
        fromJurisdiction: 'US',
        // Missing toJurisdiction, amount, currency
      };

      const response = await request(app)
        .post('/api/v1/cross-jurisdiction/validate-residency')
        .send(invalidData)
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details).toBeInstanceOf(Array);
    });
  });

  describe('Cross-Border Transaction Monitoring', () => {
    test('should monitor low-risk cross-border transaction', async () => {
      const transactionData = {
        transactionId: 'tx-123',
        fromJurisdiction: 'US',
        toJurisdiction: 'CA',
        amount: 5000,
        currency: 'USD',
        userId: 'user-123',
        beneficiaryId: 'beneficiary-456'
      };

      const response = await request(app)
        .post('/api/v1/cross-jurisdiction/monitor-transaction')
        .send(transactionData)
        .expect(200);

      expect(response.body.transactionId).toBe('tx-123');
      expect(response.body.riskLevel).toBe('LOW');
      expect(response.body.flagged).toBe(false);
      expect(response.body.reportingRequired).toBe(false);
      expect(response.body.cooperationProtocolsTriggered).toBeInstanceOf(Array);
    });

    test('should flag high-risk transaction above AML threshold', async () => {
      const transactionData = {
        transactionId: 'tx-456',
        fromJurisdiction: 'US',
        toJurisdiction: 'CA',
        amount: 15000, // Above US AML threshold of 10000
        currency: 'USD',
        userId: 'user-123',
        beneficiaryId: 'beneficiary-456'
      };

      const response = await request(app)
        .post('/api/v1/cross-jurisdiction/monitor-transaction')
        .send(transactionData)
        .expect(200);

      expect(response.body.reportingRequired).toBe(true);
      expect(response.body.complianceChecks).toContainEqual({
        type: 'AML_THRESHOLD_EXCEEDED',
        description: 'Transaction exceeds AML reporting threshold',
        action: 'REGULATORY_REPORT_REQUIRED'
      });
    });

    test('should flag high-risk jurisdiction transaction', async () => {
      const transactionData = {
        transactionId: 'tx-789',
        fromJurisdiction: 'US',
        toJurisdiction: 'IR', // Iran - high risk
        amount: 5000,
        currency: 'USD',
        userId: 'user-123',
        beneficiaryId: 'beneficiary-456'
      };

      const response = await request(app)
        .post('/api/v1/cross-jurisdiction/monitor-transaction')
        .send(transactionData)
        .expect(200);

      expect(response.body.riskLevel).toBe('HIGH');
      expect(response.body.flagged).toBe(true);
      expect(response.body.complianceChecks).toContainEqual({
        type: 'HIGH_RISK_TRANSACTION',
        description: 'Transaction flagged for enhanced monitoring',
        action: 'ENHANCED_DUE_DILIGENCE'
      });
    });

    test('should identify applicable cooperation protocols', async () => {
      const transactionData = {
        transactionId: 'tx-protocol',
        fromJurisdiction: 'US',
        toJurisdiction: 'EU',
        amount: 5000,
        currency: 'USD',
        userId: 'user-123',
        beneficiaryId: 'beneficiary-456'
      };

      const response = await request(app)
        .post('/api/v1/cross-jurisdiction/monitor-transaction')
        .send(transactionData)
        .expect(200);

      expect(response.body.cooperationProtocolsTriggered).toContainEqual(
        expect.objectContaining({
          name: 'FATF',
          fullName: 'Financial Action Task Force',
          informationSharing: true
        })
      );
    });
  });

  describe('Data Residency Rules', () => {
    test('should retrieve US data residency rules', async () => {
      const response = await request(app)
        .get('/api/v1/cross-jurisdiction/data-residency/US')
        .expect(200);

      expect(response.body.jurisdiction).toBe('US');
      expect(response.body.rules.allowedRegions).toContain('US');
      expect(response.body.rules.encryptionRequired).toBe(true);
      expect(response.body.rules.crossBorderTransferRestrictions).toContain('CN');
    });

    test('should retrieve EU data residency rules with adequacy decisions', async () => {
      const response = await request(app)
        .get('/api/v1/cross-jurisdiction/data-residency/EU')
        .expect(200);

      expect(response.body.jurisdiction).toBe('EU');
      expect(response.body.rules.allowedRegions).toContain('EU');
      expect(response.body.rules.adequacyDecisions).toContain('UK');
      expect(response.body.rules.adequacyDecisions).toContain('CA');
    });

    test('should return 404 for unsupported jurisdiction', async () => {
      const response = await request(app)
        .get('/api/v1/cross-jurisdiction/data-residency/INVALID')
        .expect(404);

      expect(response.body.error).toContain('Data residency rules not found');
    });
  });

  describe('Cross-Jurisdiction Compliance Reports', () => {
    test('should generate cross-border activity report', async () => {
      const reportParams = {
        jurisdiction: 'US',
        startDate: '2025-01-01T00:00:00Z',
        endDate: '2025-01-31T23:59:59Z',
        reportType: 'CROSS_BORDER_ACTIVITY',
        includeStatistics: true
      };

      const response = await request(app)
        .post('/api/v1/cross-jurisdiction/generate-report')
        .send(reportParams)
        .expect(200);

      expect(response.body.reportId).toBeDefined();
      expect(response.body.jurisdiction).toBe('US');
      expect(response.body.reportType).toBe('CROSS_BORDER_ACTIVITY');
      expect(response.body.framework).toBe('United States');
      expect(response.body.reportingAuthority).toBe('FINCEN');
      expect(response.body.statistics).toBeDefined();
      expect(response.body.data.crossBorderTransactions).toBeInstanceOf(Array);
    });

    test('should generate sanctions screening report', async () => {
      const reportParams = {
        jurisdiction: 'EU',
        startDate: '2025-01-01T00:00:00Z',
        endDate: '2025-01-31T23:59:59Z',
        reportType: 'SANCTIONS_SCREENING'
      };

      const response = await request(app)
        .post('/api/v1/cross-jurisdiction/generate-report')
        .send(reportParams)
        .expect(200);

      expect(response.body.jurisdiction).toBe('EU');
      expect(response.body.reportType).toBe('SANCTIONS_SCREENING');
      expect(response.body.framework).toBe('European Union');
      expect(response.body.reportingAuthority).toBe('EBA');
    });

    test('should return validation error for invalid date range', async () => {
      const invalidParams = {
        jurisdiction: 'US',
        startDate: 'invalid-date',
        endDate: '2025-01-31T23:59:59Z'
      };

      const response = await request(app)
        .post('/api/v1/cross-jurisdiction/generate-report')
        .send(invalidParams)
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
    });
  });

  describe('International Cooperation', () => {
    test('should handle FIU cooperation request', async () => {
      const cooperationRequest = {
        requestId: 'req-123',
        requestingJurisdiction: 'US',
        targetJurisdiction: 'EU',
        requestType: 'FIU_COOPERATION',
        caseId: 'case-456',
        urgency: 'NORMAL',
        data: {
          suspiciousActivity: 'Large cash deposits'
        }
      };

      const response = await request(app)
        .post('/api/v1/cross-jurisdiction/cooperation-request')
        .send(cooperationRequest)
        .expect(200);

      expect(response.body.requestId).toBe('req-123');
      expect(response.body.responseId).toBeDefined();
      expect(response.body.status).toBe('APPROVED');
      expect(response.body.requestingJurisdiction).toBe('US');
      expect(response.body.targetJurisdiction).toBe('EU');
    });

    test('should handle information request with processing status', async () => {
      const cooperationRequest = {
        requestId: 'req-456',
        requestingJurisdiction: 'CA',
        targetJurisdiction: 'US',
        requestType: 'INFORMATION_REQUEST',
        caseId: 'case-789',
        urgency: 'HIGH'
      };

      const response = await request(app)
        .post('/api/v1/cross-jurisdiction/cooperation-request')
        .send(cooperationRequest)
        .expect(200);

      expect(response.body.status).toBe('PROCESSING');
      expect(response.body.nextSteps).toContain('Legal review required');
      expect(response.body.nextSteps).toContain('Data compilation in progress');
    });

    test('should reject cooperation request between non-protocol jurisdictions', async () => {
      const cooperationRequest = {
        requestId: 'req-789',
        requestingJurisdiction: 'US',
        targetJurisdiction: 'CN', // No cooperation protocol
        requestType: 'INFORMATION_REQUEST',
        caseId: 'case-999'
      };

      const response = await request(app)
        .post('/api/v1/cross-jurisdiction/cooperation-request')
        .send(cooperationRequest)
        .expect(200);

      expect(response.body.status).toBe('REJECTED');
      expect(response.body.response).toBe('No applicable cooperation protocol exists');
    });

    test('should handle mutual legal assistance request', async () => {
      const cooperationRequest = {
        requestId: 'req-mla',
        requestingJurisdiction: 'UK',
        targetJurisdiction: 'US',
        requestType: 'MUTUAL_LEGAL_ASSISTANCE',
        caseId: 'case-mla-123',
        urgency: 'URGENT'
      };

      const response = await request(app)
        .post('/api/v1/cross-jurisdiction/cooperation-request')
        .send(cooperationRequest)
        .expect(200);

      expect(response.body.status).toBe('PROCESSING');
      expect(response.body.nextSteps).toContain('Formal MLA process initiated');
      expect(response.body.nextSteps).toContain('Court approval required');
    });

    test('should return validation error for invalid request type', async () => {
      const invalidRequest = {
        requestId: 'req-invalid',
        requestingJurisdiction: 'US',
        targetJurisdiction: 'EU',
        requestType: 'INVALID_TYPE',
        caseId: 'case-invalid'
      };

      const response = await request(app)
        .post('/api/v1/cross-jurisdiction/cooperation-request')
        .send(invalidRequest)
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
    });
  });

  describe('End-to-End Multi-Jurisdiction Scenarios', () => {
    test('should handle complete US-EU cross-border transaction workflow', async () => {
      // Step 1: Validate data residency
      const transactionData = {
        fromJurisdiction: 'US',
        toJurisdiction: 'EU',
        amount: 25000,
        currency: 'USD',
        userId: 'user-us-123',
        beneficiaryId: 'beneficiary-eu-456'
      };

      const residencyResponse = await request(app)
        .post('/api/v1/cross-jurisdiction/validate-residency')
        .send(transactionData)
        .expect(200);

      expect(residencyResponse.body.dataResidencyCompliant).toBe(true);

      // Step 2: Monitor cross-border transaction
      const monitoringData = {
        transactionId: 'tx-us-eu-123',
        ...transactionData
      };

      const monitoringResponse = await request(app)
        .post('/api/v1/cross-jurisdiction/monitor-transaction')
        .send(monitoringData)
        .expect(200);

      expect(monitoringResponse.body.reportingRequired).toBe(true); // Above thresholds
      expect(monitoringResponse.body.cooperationProtocolsTriggered.length).toBeGreaterThan(0);

      // Step 3: Generate compliance report
      const reportParams = {
        jurisdiction: 'US',
        startDate: '2025-01-01T00:00:00Z',
        endDate: '2025-01-31T23:59:59Z',
        reportType: 'CROSS_BORDER_ACTIVITY',
        includeStatistics: true
      };

      const reportResponse = await request(app)
        .post('/api/v1/cross-jurisdiction/generate-report')
        .send(reportParams)
        .expect(200);

      expect(reportResponse.body.reportingAuthority).toBe('FINCEN');
      expect(reportResponse.body.complianceStatus).toBe('COMPLIANT');
    });

    test('should handle high-risk jurisdiction transaction with cooperation', async () => {
      // Monitor high-risk transaction
      const highRiskTransaction = {
        transactionId: 'tx-high-risk',
        fromJurisdiction: 'US',
        toJurisdiction: 'RU', // High-risk jurisdiction
        amount: 75000,
        currency: 'USD',
        userId: 'user-123',
        beneficiaryId: 'beneficiary-ru-789'
      };

      const monitoringResponse = await request(app)
        .post('/api/v1/cross-jurisdiction/monitor-transaction')
        .send(highRiskTransaction)
        .expect(200);

      expect(monitoringResponse.body.riskLevel).toBe('HIGH');
      expect(monitoringResponse.body.flagged).toBe(true);

      // Initiate cooperation request due to high-risk transaction
      const cooperationRequest = {
        requestId: 'req-high-risk',
        requestingJurisdiction: 'US',
        targetJurisdiction: 'EU', // Request EU assistance
        requestType: 'INFORMATION_REQUEST',
        caseId: 'case-high-risk-123',
        urgency: 'HIGH',
        data: {
          transactionId: highRiskTransaction.transactionId,
          suspiciousIndicators: ['High amount', 'High-risk jurisdiction']
        }
      };

      const cooperationResponse = await request(app)
        .post('/api/v1/cross-jurisdiction/cooperation-request')
        .send(cooperationRequest)
        .expect(200);

      expect(cooperationResponse.body.status).toBe('PROCESSING');
    });

    test('should validate multi-jurisdiction data sovereignty compliance', async () => {
      // Test various jurisdiction combinations for data sovereignty
      const jurisdictionPairs = [
        { from: 'EU', to: 'US', shouldComply: false }, // No adequacy decision
        { from: 'EU', to: 'UK', shouldComply: true },  // Adequacy decision exists
        { from: 'US', to: 'CN', shouldComply: false }, // Restricted jurisdiction
        { from: 'CA', to: 'US', shouldComply: true },  // Allowed regions
        { from: 'SG', to: 'AU', shouldComply: true }   // No restrictions
      ];

      for (const pair of jurisdictionPairs) {
        const transactionData = {
          fromJurisdiction: pair.from,
          toJurisdiction: pair.to,
          amount: 5000,
          currency: 'USD'
        };

        const response = await request(app)
          .post('/api/v1/cross-jurisdiction/validate-residency')
          .send(transactionData)
          .expect(200);

        if (pair.shouldComply) {
          expect(response.body.dataResidencyCompliant).toBe(true);
        } else {
          expect(response.body.violations.length).toBeGreaterThan(0);
        }
      }
    });
  });
});

describe('Cross-Jurisdiction Compliance Service Unit Tests', () => {
  let service;

  beforeEach(() => {
    service = new CrossJurisdictionComplianceService();
  });

  describe('Risk Assessment', () => {
    test('should assess high-risk for large amounts', () => {
      const riskLevel = service.assessTransactionRisk(100000, 'US', 'CA');
      expect(riskLevel).toBe('HIGH');
    });

    test('should assess high-risk for restricted jurisdictions', () => {
      const riskLevel = service.assessTransactionRisk(5000, 'US', 'IR');
      expect(riskLevel).toBe('HIGH');
    });

    test('should assess medium-risk for moderate amounts', () => {
      const riskLevel = service.assessTransactionRisk(30000, 'US', 'CA');
      expect(riskLevel).toBe('MEDIUM');
    });

    test('should assess low-risk for small amounts between friendly jurisdictions', () => {
      const riskLevel = service.assessTransactionRisk(1000, 'US', 'CA');
      expect(riskLevel).toBe('LOW');
    });
  });

  describe('Cooperation Protocols', () => {
    test('should identify FATF protocol for member countries', () => {
      const protocols = service.getApplicableCooperationProtocols('US', 'EU');
      const fatfProtocol = protocols.find(p => p.name === 'FATF');
      
      expect(fatfProtocol).toBeDefined();
      expect(fatfProtocol.informationSharing).toBe(true);
      expect(fatfProtocol.mutualLegalAssistance).toBe(true);
    });

    test('should identify Egmont Group protocol for FIU cooperation', () => {
      const protocols = service.getApplicableCooperationProtocols('US', 'UK');
      const egmontProtocol = protocols.find(p => p.name === 'EGMONT');
      
      expect(egmontProtocol).toBeDefined();
      expect(egmontProtocol.fiuCooperation).toBe(true);
    });

    test('should return empty array for non-member countries', () => {
      const protocols = service.getApplicableCooperationProtocols('US', 'CN');
      expect(protocols).toHaveLength(0);
    });
  });

  describe('Sanctions Screening', () => {
    test('should perform sanctions screening with applicable lists', async () => {
      const result = await service.performSanctionsScreening('user-123', 'beneficiary-456', 'US', 'EU');
      
      expect(result.screeningId).toBeDefined();
      expect(result.cleared).toBeDefined();
      expect(result.listsScreened).toContain('OFAC_SDN');
      expect(result.listsScreened).toContain('EU_SANCTIONS');
      expect(result.timestamp).toBeDefined();
    });

    test('should include jurisdiction-specific sanctions lists', async () => {
      const result = await service.performSanctionsScreening('user-123', 'beneficiary-456', 'UK', 'SG');
      
      expect(result.listsScreened).toContain('UK_SANCTIONS');
      expect(result.listsScreened).toContain('MAS_SANCTIONS');
      expect(result.listsScreened).toContain('UN_SANCTIONS');
    });
  });
});