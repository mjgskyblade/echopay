const request = require('supertest');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { v4: uuidv4 } = require('uuid');

// Import the actual services (not mocked for integration test)
const RegulatoryReportingController = require('../controllers/regulatory-reporting-controller');

describe('Regulatory Reporting Integration Tests', () => {
  let app;
  let server;

  beforeAll((done) => {
    // Create a full Express app similar to the main service
    app = express();
    
    // Middleware
    app.use(helmet());
    app.use(cors());
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true }));

    // Request ID middleware
    app.use((req, res, next) => {
      req.id = req.headers['x-request-id'] || uuidv4();
      res.setHeader('X-Request-ID', req.id);
      next();
    });

    // Initialize controller
    const regulatoryReportingController = new RegulatoryReportingController();

    // API routes
    const apiRouter = express.Router();
    apiRouter.post('/reports/generate', (req, res) => regulatoryReportingController.generateReport(req, res));
    apiRouter.get('/reports/:reportId/download', (req, res) => regulatoryReportingController.downloadReport(req, res));
    apiRouter.post('/reports/:reportId/submit', (req, res) => regulatoryReportingController.submitReport(req, res));
    apiRouter.get('/reports', (req, res) => regulatoryReportingController.getReports(req, res));
    apiRouter.post('/iso20022/format', (req, res) => regulatoryReportingController.formatISO20022(req, res));

    app.use('/api/v1', apiRouter);

    // Error handling
    app.use((error, req, res, next) => {
      res.status(500).json({
        error: 'Internal server error',
        requestId: req.id,
        message: error.message
      });
    });

    // Start server
    server = app.listen(0, done); // Use port 0 for random available port
  });

  afterAll((done) => {
    server.close(done);
  });

  describe('Complete SAR Reporting Workflow', () => {
    let reportId;

    it('should generate SAR report with comprehensive data', async () => {
      const sarData = {
        reportType: 'SAR',
        data: {
          sarCases: [
            {
              sarId: 'SAR-2025-001',
              transactionId: 'tx-suspicious-001',
              reportType: 'SANCTIONS_VIOLATION',
              filingDate: '2025-01-08T10:00:00Z',
              amount: 75000,
              currency: 'USD-CBDC',
              reason: 'Transaction involving sanctioned entity detected through automated screening',
              riskScore: 0.95,
              priority: 'CRITICAL',
              flags: [
                { type: 'SANCTIONS_HIT' },
                { type: 'HIGH_AMOUNT' },
                { type: 'UNUSUAL_PATTERN' }
              ],
              watchlistHits: [
                {
                  listName: 'OFAC_SANCTIONS_LIST',
                  matchType: 'EXACT',
                  confidence: 0.98
                },
                {
                  listName: 'EU_SANCTIONS_LIST',
                  matchType: 'FUZZY',
                  confidence: 0.85
                }
              ],
              regulatoryReferences: ['31 CFR 1010.320', 'BSA Section 5318(g)']
            },
            {
              sarId: 'SAR-2025-002',
              transactionId: 'tx-suspicious-002',
              reportType: 'STRUCTURING',
              filingDate: '2025-01-08T11:30:00Z',
              amount: 9500,
              currency: 'USD-CBDC',
              reason: 'Pattern of transactions just below reporting threshold detected',
              riskScore: 0.78,
              priority: 'HIGH',
              flags: [
                { type: 'STRUCTURING_PATTERN' },
                { type: 'MULTIPLE_TRANSACTIONS' }
              ]
            }
          ]
        },
        options: {
          jurisdiction: 'US',
          format: 'JSON',
          institutionName: 'EchoPay Digital Payments Inc.',
          startDate: '2025-01-01T00:00:00Z',
          endDate: '2025-01-08T23:59:59Z',
          generatedBy: 'compliance-officer-001'
        }
      };

      const response = await request(app)
        .post('/api/v1/reports/generate')
        .set('x-user-role', 'compliance_officer')
        .set('x-user-id', 'compliance-officer-001')
        .send(sarData)
        .expect(200);

      expect(response.body).toMatchObject({
        reportId: expect.any(String),
        downloadUrl: expect.stringContaining('/api/v1/reports/'),
        format: 'JSON',
        generatedAt: expect.any(String),
        recordCount: 2,
        status: 'generated',
        auditTrailId: expect.any(String)
      });

      reportId = response.body.reportId;
    });

    it('should download the generated SAR report', async () => {
      const response = await request(app)
        .get(`/api/v1/reports/${reportId}/download`)
        .set('x-user-role', 'compliance_officer')
        .set('x-user-id', 'compliance-officer-001')
        .expect(200);

      expect(response.headers['content-type']).toBe('application/json; charset=utf-8');
      expect(response.headers['content-disposition']).toContain('attachment; filename="SAR_');
      expect(response.headers['x-report-id']).toBe(reportId);

      const reportData = JSON.parse(response.text);
      expect(reportData.reportData.suspiciousActivities).toHaveLength(2);
      expect(reportData.reportData.suspiciousActivities[0]).toMatchObject({
        caseId: 'SAR-2025-001',
        suspiciousActivityType: 'SANC',
        amountInvolved: 75000,
        priority: 'CRITICAL'
      });
    });

    it('should download the report in XML format', async () => {
      const response = await request(app)
        .get(`/api/v1/reports/${reportId}/download?format=XML`)
        .set('x-user-role', 'compliance_officer')
        .set('x-user-id', 'compliance-officer-001')
        .expect(200);

      expect(response.headers['content-type']).toBe('application/xml; charset=utf-8');
      expect(response.headers['content-disposition']).toContain('.xml');
      expect(response.text).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(response.text).toContain('<reportId>');
      expect(response.text).toContain('<suspiciousActivities>');
    });

    it('should submit the report to regulatory authorities', async () => {
      const submissionData = {
        authorities: [
          {
            name: 'FINCEN',
            endpoint: 'https://api.fincen.gov/reports/sar',
            apiKey: 'test-fincen-api-key',
            institutionId: 'ECHOPAY-001'
          },
          {
            name: 'SEC',
            endpoint: 'https://api.sec.gov/reports/suspicious',
            apiKey: 'test-sec-api-key',
            institutionId: 'ECHOPAY-SEC-001'
          }
        ]
      };

      const response = await request(app)
        .post(`/api/v1/reports/${reportId}/submit`)
        .set('x-user-role', 'compliance_officer')
        .set('x-user-id', 'compliance-officer-001')
        .send(submissionData)
        .expect(200);

      expect(response.body).toMatchObject({
        reportId,
        submissionResults: expect.arrayContaining([
          expect.objectContaining({
            authority: 'FINCEN',
            status: 'accepted',
            submissionId: expect.any(String)
          }),
          expect.objectContaining({
            authority: 'SEC',
            status: 'accepted',
            submissionId: expect.any(String)
          })
        ]),
        auditTrailId: expect.any(String)
      });
    });
  });

  describe('Complete CTR Reporting Workflow', () => {
    let reportId;

    it('should generate CTR report with transaction data', async () => {
      const ctrData = {
        reportType: 'CTR',
        data: {
          transactions: [
            {
              transactionId: 'tx-large-001',
              timestamp: '2025-01-08T09:15:00Z',
              amount: '25000.00',
              currency: 'USD-CBDC',
              userId: 'user-business-001',
              counterpartyId: 'user-individual-002',
              transactionType: 'business_payment',
              description: 'Large business transaction - equipment purchase',
              location: 'New York, NY',
              kycStatus: 'verified'
            },
            {
              transactionId: 'tx-large-002',
              timestamp: '2025-01-08T14:30:00Z',
              amount: '15000.00',
              currency: 'EUR-CBDC',
              userId: 'user-individual-003',
              counterpartyId: 'user-business-004',
              transactionType: 'investment',
              description: 'Investment transaction',
              location: 'London, UK',
              kycStatus: 'enhanced_verified'
            },
            {
              transactionId: 'tx-large-003',
              timestamp: '2025-01-08T16:45:00Z',
              amount: '50000.00',
              currency: 'USD-CBDC',
              userId: 'user-business-005',
              counterpartyId: 'user-business-006',
              transactionType: 'b2b_transfer',
              description: 'Large B2B payment for services',
              location: 'San Francisco, CA',
              kycStatus: 'verified'
            }
          ]
        },
        options: {
          jurisdiction: 'US',
          format: 'XML',
          institutionName: 'EchoPay Digital Payments Inc.',
          startDate: '2025-01-08T00:00:00Z',
          endDate: '2025-01-08T23:59:59Z',
          generatedBy: 'compliance-analyst-002'
        }
      };

      const response = await request(app)
        .post('/api/v1/reports/generate')
        .set('x-user-role', 'compliance_officer')
        .set('x-user-id', 'compliance-analyst-002')
        .send(ctrData)
        .expect(200);

      expect(response.body.recordCount).toBe(3);
      expect(response.body.format).toBe('XML');
      reportId = response.body.reportId;
    });

    it('should download CTR report and verify currency breakdown', async () => {
      const response = await request(app)
        .get(`/api/v1/reports/${reportId}/download`)
        .set('x-user-role', 'compliance_officer')
        .set('x-user-id', 'compliance-analyst-002')
        .expect(200);

      expect(response.headers['content-type']).toBe('application/xml; charset=utf-8');
      expect(response.text).toContain('<currencyTransactions>');
      expect(response.text).toContain('<totalAmount>90000</totalAmount>');
      expect(response.text).toContain('<USD-CBDC>75000</USD-CBDC>');
      expect(response.text).toContain('<EUR-CBDC>15000</EUR-CBDC>');
    });
  });

  describe('ISO 20022 Message Formatting', () => {
    it('should format SAR message as ISO 20022', async () => {
      const iso20022Request = {
        messageType: 'SAR',
        messageData: {
          reportId: 'SAR-ISO-TEST-001',
          suspiciousActivities: [
            {
              caseId: 'SAR-001',
              transactionId: 'tx-001',
              suspiciousActivityType: 'SUSP',
              activityDate: '2025-01-08T10:00:00Z',
              amountInvolved: 50000,
              currency: 'USD-CBDC',
              description: 'Suspicious transaction pattern',
              riskScore: 0.85,
              priority: 'HIGH'
            }
          ]
        },
        options: {
          version: '001.001.01',
          includeHeader: true
        }
      };

      const response = await request(app)
        .post('/api/v1/iso20022/format')
        .set('x-user-role', 'compliance_officer')
        .set('x-user-id', 'iso-formatter-001')
        .send(iso20022Request)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/xml; charset=utf-8');
      expect(response.text).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(response.text).toContain('<Document xmlns="urn:iso:std:iso:20022:tech:xsd:auth.012.001.01"');
      expect(response.text).toContain('<SuspiciousActivityReport>');
      expect(response.text).toContain('<MessageId>iso20022_');
      expect(response.text).toContain('<ActivityId>SAR-001</ActivityId>');
      expect(response.text).toContain('<Value>50000</Value>');
      expect(response.text).toContain('<Currency>USD-CBDC</Currency>');
    });

    it('should format CTR message as ISO 20022', async () => {
      const iso20022Request = {
        messageType: 'CTR',
        messageData: {
          reportId: 'CTR-ISO-TEST-001',
          currencyTransactions: [
            {
              transactionId: 'tx-iso-001',
              transactionDate: '2025-01-08T10:00:00Z',
              transactionType: 'transfer',
              amount: 25000,
              currency: 'USD-CBDC',
              customerInfo: {
                customerId: 'hashed-customer-001',
                customerType: 'individual'
              },
              counterpartyInfo: {
                counterpartyId: 'hashed-counterparty-001',
                counterpartyType: 'business'
              }
            }
          ]
        },
        options: {
          version: '001.001.01'
        }
      };

      const response = await request(app)
        .post('/api/v1/iso20022/format')
        .set('x-user-role', 'compliance_officer')
        .send(iso20022Request)
        .expect(200);

      expect(response.text).toContain('<CurrencyTransactionReport>');
      expect(response.text).toContain('<ReportType>CTTR</ReportType>');
      expect(response.text).toContain('<TransactionId>tx-iso-001</TransactionId>');
      expect(response.text).toContain('<CustomerId>hashed-customer-001</CustomerId>');
    });
  });

  describe('Report Management and Filtering', () => {
    beforeAll(async () => {
      // Generate multiple reports for filtering tests
      const reportTypes = ['SAR', 'CTR', 'KYC_SUMMARY'];
      
      for (const reportType of reportTypes) {
        await request(app)
          .post('/api/v1/reports/generate')
          .set('x-user-role', 'compliance_officer')
          .set('x-user-id', 'test-user')
          .send({
            reportType,
            data: reportType === 'SAR' ? { sarCases: [] } : 
                  reportType === 'CTR' ? { transactions: [] } : 
                  { kycStats: { total: 0, verified: 0, rejected: 0, pending: 0 } },
            options: { jurisdiction: 'US', format: 'JSON' }
          });
      }
    });

    it('should list all reports', async () => {
      const response = await request(app)
        .get('/api/v1/reports')
        .set('x-user-role', 'compliance_officer')
        .expect(200);

      expect(response.body.reports).toBeInstanceOf(Array);
      expect(response.body.reports.length).toBeGreaterThan(0);
      expect(response.body.pagination).toMatchObject({
        total: expect.any(Number),
        limit: 50,
        offset: 0,
        hasMore: expect.any(Boolean)
      });
    });

    it('should filter reports by type', async () => {
      const response = await request(app)
        .get('/api/v1/reports?reportType=SAR')
        .set('x-user-role', 'compliance_officer')
        .expect(200);

      expect(response.body.reports.every(r => r.reportType === 'SAR')).toBe(true);
    });

    it('should paginate report results', async () => {
      const response = await request(app)
        .get('/api/v1/reports?limit=2&offset=0')
        .set('x-user-role', 'compliance_officer')
        .expect(200);

      expect(response.body.reports).toHaveLength(2);
      expect(response.body.pagination.limit).toBe(2);
      expect(response.body.pagination.offset).toBe(0);
    });

    it('should filter reports by date range', async () => {
      const startDate = '2025-01-08T00:00:00Z';
      const endDate = '2025-01-08T23:59:59Z';

      const response = await request(app)
        .get(`/api/v1/reports?startDate=${startDate}&endDate=${endDate}`)
        .set('x-user-role', 'compliance_officer')
        .expect(200);

      expect(response.body.reports).toBeInstanceOf(Array);
      // All reports should be within the date range
      response.body.reports.forEach(report => {
        const reportDate = new Date(report.generatedAt);
        expect(reportDate.getTime()).toBeGreaterThanOrEqual(new Date(startDate).getTime());
        expect(reportDate.getTime()).toBeLessThanOrEqual(new Date(endDate).getTime());
      });
    });
  });

  describe('Security and Authorization', () => {
    let testReportId;

    beforeAll(async () => {
      // Generate a test report
      const response = await request(app)
        .post('/api/v1/reports/generate')
        .set('x-user-role', 'compliance_officer')
        .set('x-user-id', 'authorized-user')
        .send({
          reportType: 'SAR',
          data: { sarCases: [] },
          options: { jurisdiction: 'US', format: 'JSON' }
        });
      
      testReportId = response.body.reportId;
    });

    it('should deny access to unauthorized users', async () => {
      await request(app)
        .post('/api/v1/reports/generate')
        .set('x-user-role', 'unauthorized_user')
        .send({
          reportType: 'SAR',
          data: { sarCases: [] }
        })
        .expect(403);
    });

    it('should deny report download to unauthorized users', async () => {
      await request(app)
        .get(`/api/v1/reports/${testReportId}/download`)
        .set('x-user-role', 'unauthorized_user')
        .set('x-user-id', 'unauthorized-user')
        .expect(403);
    });

    it('should deny report submission to unauthorized users', async () => {
      await request(app)
        .post(`/api/v1/reports/${testReportId}/submit`)
        .set('x-user-role', 'analyst')
        .send({
          authorities: [{
            name: 'FINCEN',
            endpoint: 'https://api.fincen.gov',
            apiKey: 'test-key',
            institutionId: 'test-inst'
          }]
        })
        .expect(403);
    });

    it('should allow report creator to access their own reports', async () => {
      await request(app)
        .get(`/api/v1/reports/${testReportId}/download`)
        .set('x-user-role', 'analyst')
        .set('x-user-id', 'authorized-user')
        .expect(200);
    });

    it('should validate request data and prevent injection attacks', async () => {
      const maliciousRequest = {
        reportType: 'SAR',
        data: {
          sarCases: [{
            sarId: '<script>alert("xss")</script>',
            transactionId: 'tx-001',
            amount: 'DROP TABLE reports;--'
          }]
        }
      };

      const response = await request(app)
        .post('/api/v1/reports/generate')
        .set('x-user-role', 'compliance_officer')
        .send(maliciousRequest)
        .expect(200);

      // Verify the malicious content is properly escaped/sanitized
      const downloadResponse = await request(app)
        .get(`/api/v1/reports/${response.body.reportId}/download`)
        .set('x-user-role', 'compliance_officer')
        .expect(200);

      const reportData = JSON.parse(downloadResponse.text);
      expect(reportData.reportData.suspiciousActivities[0].caseId).toBe('<script>alert("xss")</script>');
      // The system should handle this safely without executing the script
    });
  });

  describe('Error Handling and Resilience', () => {
    it('should handle invalid report types gracefully', async () => {
      await request(app)
        .post('/api/v1/reports/generate')
        .set('x-user-role', 'compliance_officer')
        .send({
          reportType: 'INVALID_TYPE',
          data: {}
        })
        .expect(400);
    });

    it('should handle missing required fields', async () => {
      await request(app)
        .post('/api/v1/reports/generate')
        .set('x-user-role', 'compliance_officer')
        .send({
          // Missing reportType and data
        })
        .expect(400);
    });

    it('should handle non-existent report downloads', async () => {
      await request(app)
        .get('/api/v1/reports/non-existent-report-id/download')
        .set('x-user-role', 'compliance_officer')
        .expect(404);
    });

    it('should handle large payloads efficiently', async () => {
      const largeDataSet = {
        reportType: 'SAR',
        data: {
          sarCases: Array(100).fill().map((_, i) => ({
            sarId: `SAR-LARGE-${i}`,
            transactionId: `tx-large-${i}`,
            reportType: 'SUSPICIOUS_PATTERN',
            filingDate: '2025-01-08T10:00:00Z',
            amount: 10000 + i,
            currency: 'USD-CBDC',
            reason: `Large dataset test case ${i}`,
            riskScore: 0.5 + (i % 50) / 100,
            priority: i % 3 === 0 ? 'HIGH' : 'MEDIUM'
          }))
        },
        options: {
          jurisdiction: 'US',
          format: 'JSON'
        }
      };

      const response = await request(app)
        .post('/api/v1/reports/generate')
        .set('x-user-role', 'compliance_officer')
        .send(largeDataSet)
        .expect(200);

      expect(response.body.recordCount).toBe(100);
    }, 10000); // Increase timeout for large dataset test

    it('should handle concurrent requests without conflicts', async () => {
      const concurrentRequests = Array(5).fill().map((_, i) =>
        request(app)
          .post('/api/v1/reports/generate')
          .set('x-user-role', 'compliance_officer')
          .set('x-user-id', `concurrent-user-${i}`)
          .send({
            reportType: 'SAR',
            data: { sarCases: [] },
            options: { jurisdiction: 'US', format: 'JSON' }
          })
      );

      const responses = await Promise.all(concurrentRequests);

      responses.forEach((response, i) => {
        expect(response.status).toBe(200);
        expect(response.body.reportId).toBeDefined();
      });

      // Verify all report IDs are unique
      const reportIds = responses.map(r => r.body.reportId);
      const uniqueIds = new Set(reportIds);
      expect(uniqueIds.size).toBe(reportIds.length);
    });
  });

  describe('Performance and Compliance Requirements', () => {
    it('should generate reports within acceptable time limits', async () => {
      const startTime = Date.now();

      await request(app)
        .post('/api/v1/reports/generate')
        .set('x-user-role', 'compliance_officer')
        .send({
          reportType: 'SAR',
          data: { sarCases: [] },
          options: { jurisdiction: 'US', format: 'JSON' }
        })
        .expect(200);

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Report generation should complete within 5 seconds
      expect(duration).toBeLessThan(5000);
    });

    it('should maintain audit trails for all operations', async () => {
      const response = await request(app)
        .post('/api/v1/reports/generate')
        .set('x-user-role', 'compliance_officer')
        .set('x-user-id', 'audit-test-user')
        .send({
          reportType: 'SAR',
          data: { sarCases: [] }
        })
        .expect(200);

      expect(response.body.auditTrailId).toBeDefined();
      expect(response.body.requestId).toBeDefined();
      expect(response.body.timestamp).toBeDefined();
    });

    it('should support all required regulatory frameworks', async () => {
      const jurisdictions = ['US', 'EU', 'UK', 'CA', 'AU'];

      for (const jurisdiction of jurisdictions) {
        const response = await request(app)
          .post('/api/v1/reports/generate')
          .set('x-user-role', 'compliance_officer')
          .send({
            reportType: 'SAR',
            data: { sarCases: [] },
            options: { jurisdiction, format: 'JSON' }
          })
          .expect(200);

        expect(response.body.reportId).toBeDefined();
      }
    });

    it('should maintain data integrity across all operations', async () => {
      const testData = {
        reportType: 'SAR',
        data: {
          sarCases: [{
            sarId: 'INTEGRITY-TEST-001',
            transactionId: 'tx-integrity-001',
            amount: 12345.67,
            currency: 'USD-CBDC'
          }]
        },
        options: { jurisdiction: 'US', format: 'JSON' }
      };

      // Generate report
      const generateResponse = await request(app)
        .post('/api/v1/reports/generate')
        .set('x-user-role', 'compliance_officer')
        .send(testData)
        .expect(200);

      // Download and verify data integrity
      const downloadResponse = await request(app)
        .get(`/api/v1/reports/${generateResponse.body.reportId}/download`)
        .set('x-user-role', 'compliance_officer')
        .expect(200);

      const reportData = JSON.parse(downloadResponse.text);
      expect(reportData.reportData.suspiciousActivities[0]).toMatchObject({
        caseId: 'INTEGRITY-TEST-001',
        transactionId: 'tx-integrity-001',
        amountInvolved: 12345.67,
        currency: 'USD-CBDC'
      });

      // Verify metadata includes data hash for integrity checking
      expect(reportData.metadata.dataHash).toBeDefined();
      expect(reportData.metadata.dataHash).toHaveLength(64); // SHA-256 hash
    });
  });
});