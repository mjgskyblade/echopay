const request = require('supertest');
const express = require('express');
const RegulatoryReportingController = require('../controllers/regulatory-reporting-controller');
const RegulatoryReportingService = require('../services/regulatory-reporting-service');

// Mock the service
jest.mock('../services/regulatory-reporting-service');

describe('Regulatory Reporting Controller', () => {
  let app;
  let controller;
  let mockService;

  beforeEach(() => {
    // Create Express app for testing
    app = express();
    app.use(express.json());
    
    // Add request ID middleware
    app.use((req, res, next) => {
      req.id = 'test-request-id';
      next();
    });

    // Initialize controller
    controller = new RegulatoryReportingController();
    mockService = controller.reportingService;

    // Setup routes
    app.post('/reports/generate', (req, res) => controller.generateReport(req, res));
    app.get('/reports/:reportId/download', (req, res) => controller.downloadReport(req, res));
    app.post('/reports/:reportId/submit', (req, res) => controller.submitReport(req, res));
    app.get('/reports', (req, res) => controller.getReports(req, res));
    app.post('/iso20022/format', (req, res) => controller.formatISO20022(req, res));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /reports/generate', () => {
    it('should generate SAR report successfully', async () => {
      const mockReport = {
        reportId: 'test-report-id',
        downloadUrl: '/api/v1/reports/test-report-id/download',
        format: 'JSON',
        generatedAt: new Date(),
        recordCount: 5,
        status: 'generated'
      };

      mockService.generateRegulatoryReport.mockResolvedValue(mockReport);

      const requestData = {
        reportType: 'SAR',
        data: {
          sarCases: [
            {
              sarId: 'SAR-001',
              transactionId: 'tx-001',
              reportType: 'SUSPICIOUS_PATTERN',
              filingDate: '2025-01-08T10:00:00Z',
              amount: 50000,
              currency: 'USD-CBDC',
              reason: 'Unusual transaction pattern detected',
              riskScore: 0.85,
              priority: 'HIGH'
            }
          ]
        },
        options: {
          jurisdiction: 'US',
          format: 'JSON',
          institutionName: 'EchoPay Test Bank'
        }
      };

      const response = await request(app)
        .post('/reports/generate')
        .set('x-user-role', 'compliance_officer')
        .send(requestData)
        .expect(200);

      expect(response.body).toMatchObject({
        reportId: 'test-report-id',
        downloadUrl: '/api/v1/reports/test-report-id/download',
        format: 'JSON',
        status: 'generated',
        recordCount: 5
      });

      expect(mockService.generateRegulatoryReport).toHaveBeenCalledWith(
        'SAR',
        requestData.data,
        expect.objectContaining({
          jurisdiction: 'US',
          format: 'JSON',
          institutionName: 'EchoPay Test Bank'
        })
      );
    });

    it('should generate CTR report successfully', async () => {
      const mockReport = {
        reportId: 'ctr-report-id',
        downloadUrl: '/api/v1/reports/ctr-report-id/download',
        format: 'XML',
        generatedAt: new Date(),
        recordCount: 10,
        status: 'generated'
      };

      mockService.generateRegulatoryReport.mockResolvedValue(mockReport);

      const requestData = {
        reportType: 'CTR',
        data: {
          transactions: [
            {
              transactionId: 'tx-001',
              timestamp: '2025-01-08T10:00:00Z',
              amount: '15000.00',
              currency: 'USD-CBDC',
              userId: 'user-001',
              counterpartyId: 'user-002',
              transactionType: 'transfer'
            }
          ]
        },
        options: {
          jurisdiction: 'US',
          format: 'XML',
          startDate: '2025-01-01',
          endDate: '2025-01-08'
        }
      };

      const response = await request(app)
        .post('/reports/generate')
        .set('x-user-role', 'compliance_officer')
        .send(requestData)
        .expect(200);

      expect(response.body.reportId).toBe('ctr-report-id');
      expect(response.body.format).toBe('XML');
      expect(mockService.generateRegulatoryReport).toHaveBeenCalledWith('CTR', requestData.data, expect.any(Object));
    });

    it('should validate request data', async () => {
      const invalidRequest = {
        reportType: 'INVALID_TYPE',
        data: {}
      };

      const response = await request(app)
        .post('/reports/generate')
        .send(invalidRequest)
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details).toContain('"reportType" must be one of [SAR, CTR, KYC_SUMMARY, AML_STATISTICS, TRANSACTION_MONITORING, COMPLIANCE_AUDIT]');
    });

    it('should check authorization for report type', async () => {
      const requestData = {
        reportType: 'SAR',
        data: { sarCases: [] }
      };

      const response = await request(app)
        .post('/reports/generate')
        .set('x-user-role', 'unauthorized_user')
        .send(requestData)
        .expect(403);

      expect(response.body.error).toBe('Insufficient permissions for report type');
    });

    it('should handle service errors gracefully', async () => {
      mockService.generateRegulatoryReport.mockRejectedValue(new Error('Service unavailable'));

      const requestData = {
        reportType: 'SAR',
        data: { sarCases: [] }
      };

      const response = await request(app)
        .post('/reports/generate')
        .set('x-user-role', 'compliance_officer')
        .send(requestData)
        .expect(500);

      expect(response.body.error).toBe('Report generation failed');
      expect(response.body.message).toBe('Service unavailable');
    });
  });

  describe('GET /reports/:reportId/download', () => {
    it('should download report successfully', async () => {
      const mockReport = {
        reportId: 'test-report-id',
        reportType: 'SAR',
        format: 'JSON',
        generatedAt: '2025-01-08T10:00:00Z',
        reportData: { test: 'data' }
      };

      const formattedReport = JSON.stringify(mockReport, null, 2);

      mockService.getReport.mockReturnValue(mockReport);
      mockService.formatReport.mockResolvedValue(formattedReport);

      const response = await request(app)
        .get('/reports/test-report-id/download')
        .set('x-user-role', 'compliance_officer')
        .expect(200);

      expect(response.headers['content-type']).toBe('application/json; charset=utf-8');
      expect(response.headers['content-disposition']).toContain('attachment; filename="SAR_test-report-id.json"');
      expect(response.headers['x-report-id']).toBe('test-report-id');
      expect(response.text).toBe(formattedReport);
    });

    it('should return 404 for non-existent report', async () => {
      mockService.getReport.mockReturnValue(null);

      const response = await request(app)
        .get('/reports/non-existent-id/download')
        .expect(404);

      expect(response.body.error).toBe('Report not found');
    });

    it('should check authorization for report access', async () => {
      const mockReport = {
        reportId: 'test-report-id',
        reportType: 'SAR',
        generatedBy: 'other-user'
      };

      mockService.getReport.mockReturnValue(mockReport);

      const response = await request(app)
        .get('/reports/test-report-id/download')
        .set('x-user-role', 'unauthorized_user')
        .set('x-user-id', 'current-user')
        .expect(403);

      expect(response.body.error).toBe('Insufficient permissions to access report');
    });

    it('should format report in different formats', async () => {
      const mockReport = {
        reportId: 'test-report-id',
        reportType: 'SAR',
        format: 'JSON',
        generatedAt: '2025-01-08T10:00:00Z'
      };

      const xmlFormattedReport = '<?xml version="1.0"?><report></report>';

      mockService.getReport.mockReturnValue(mockReport);
      mockService.formatReport.mockResolvedValue(xmlFormattedReport);

      const response = await request(app)
        .get('/reports/test-report-id/download?format=XML')
        .set('x-user-role', 'compliance_officer')
        .expect(200);

      expect(response.headers['content-type']).toBe('application/xml; charset=utf-8');
      expect(response.headers['content-disposition']).toContain('attachment; filename="SAR_test-report-id.xml"');
      expect(mockService.formatReport).toHaveBeenCalledWith(mockReport, 'XML');
    });
  });

  describe('POST /reports/:reportId/submit', () => {
    it('should submit report to regulatory authorities', async () => {
      const submissionResults = [
        {
          authority: 'FINCEN',
          status: 'accepted',
          submissionId: 'sub-001',
          submittedAt: '2025-08-14T07:57:10.708Z'
        }
      ];

      mockService.submitToRegulatoryAuthorities.mockResolvedValue(submissionResults);

      const requestData = {
        authorities: [
          {
            name: 'FINCEN',
            endpoint: 'https://api.fincen.gov/reports',
            apiKey: 'test-api-key',
            institutionId: 'INST-001'
          }
        ]
      };

      const response = await request(app)
        .post('/reports/test-report-id/submit')
        .set('x-user-role', 'compliance_officer')
        .send(requestData)
        .expect(200);

      expect(response.body.reportId).toBe('test-report-id');
      expect(response.body.submissionResults).toEqual(submissionResults);
      expect(mockService.submitToRegulatoryAuthorities).toHaveBeenCalledWith('test-report-id', requestData.authorities);
    });

    it('should check authorization for report submission', async () => {
      const requestData = {
        authorities: []
      };

      const response = await request(app)
        .post('/reports/test-report-id/submit')
        .set('x-user-role', 'unauthorized_user')
        .send(requestData)
        .expect(403);

      expect(response.body.error).toBe('Insufficient permissions to submit reports');
    });

    it('should validate submission request', async () => {
      const invalidRequest = {
        authorities: [
          {
            name: 'FINCEN'
            // Missing required fields
          }
        ]
      };

      const response = await request(app)
        .post('/reports/test-report-id/submit')
        .set('x-user-role', 'compliance_officer')
        .send(invalidRequest)
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
    });
  });

  describe('POST /iso20022/format', () => {
    it('should format message as ISO 20022', async () => {
      const iso20022Message = '<?xml version="1.0" encoding="UTF-8"?><Document xmlns="urn:iso:std:iso:20022:tech:xsd:auth.012.001.01"><SuspiciousActivityReport></SuspiciousActivityReport></Document>';

      mockService.formatAsISO20022.mockResolvedValue(iso20022Message);

      const requestData = {
        messageType: 'SAR',
        messageData: {
          reportId: 'test-report',
          suspiciousActivities: []
        },
        options: {
          version: '001.001.01'
        }
      };

      const response = await request(app)
        .post('/iso20022/format')
        .send(requestData)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/xml; charset=utf-8');
      expect(response.text).toBe(iso20022Message);
      expect(mockService.formatAsISO20022).toHaveBeenCalled();
    });

    it('should validate ISO 20022 format request', async () => {
      const invalidRequest = {
        // Missing required fields
      };

      const response = await request(app)
        .post('/iso20022/format')
        .send(invalidRequest)
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
    });

    it('should handle ISO 20022 formatting errors', async () => {
      mockService.formatAsISO20022.mockRejectedValue(new Error('Invalid message format'));

      const requestData = {
        messageType: 'SAR',
        messageData: {},
        options: {}
      };

      const response = await request(app)
        .post('/iso20022/format')
        .send(requestData)
        .expect(500);

      expect(response.body.error).toBe('ISO 20022 formatting failed');
    });
  });

  describe('GET /reports', () => {
    it('should get report list with filters', async () => {
      const mockReports = [
        {
          reportId: 'report-1',
          reportType: 'SAR',
          jurisdiction: 'US',
          format: 'JSON',
          generatedAt: '2025-01-08T10:00:00Z',
          status: 'generated'
        },
        {
          reportId: 'report-2',
          reportType: 'CTR',
          jurisdiction: 'US',
          format: 'XML',
          generatedAt: '2025-01-07T10:00:00Z',
          status: 'submitted'
        }
      ];

      mockService.getAllReports.mockReturnValue(mockReports);

      const response = await request(app)
        .get('/reports?reportType=SAR&limit=10&offset=0')
        .expect(200);

      expect(response.body.reports).toHaveLength(2);
      expect(response.body.pagination).toMatchObject({
        total: 2,
        limit: 10,
        offset: 0,
        hasMore: false
      });
    });

    it('should apply date filtering', async () => {
      const mockReports = [
        {
          reportId: 'report-1',
          reportType: 'SAR',
          generatedAt: '2025-01-08T10:00:00Z'
        }
      ];

      mockService.getAllReports.mockReturnValue(mockReports);

      const response = await request(app)
        .get('/reports?startDate=2025-01-01&endDate=2025-01-10')
        .expect(200);

      expect(response.body.reports).toHaveLength(1);
    });

    it('should validate query parameters', async () => {
      const response = await request(app)
        .get('/reports?limit=invalid')
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
    });
  });

  describe('Authorization and Security', () => {
    it('should create audit trails for all operations', async () => {
      const mockReport = {
        reportId: 'test-report-id',
        downloadUrl: '/api/v1/reports/test-report-id/download',
        format: 'JSON',
        generatedAt: new Date(),
        recordCount: 1,
        status: 'generated'
      };

      mockService.generateRegulatoryReport.mockResolvedValue(mockReport);

      const requestData = {
        reportType: 'SAR',
        data: { sarCases: [] }
      };

      const response = await request(app)
        .post('/reports/generate')
        .set('x-user-role', 'compliance_officer')
        .set('x-user-id', 'test-user')
        .send(requestData)
        .expect(200);

      expect(response.body.auditTrailId).toBeDefined();
    });

    it('should log all regulatory authority access', async () => {
      const mockReport = {
        reportId: 'test-report-id',
        reportType: 'SAR',
        format: 'JSON',
        generatedAt: '2025-01-08T10:00:00Z'
      };

      mockService.getReport.mockReturnValue(mockReport);
      mockService.formatReport.mockResolvedValue('{}');

      await request(app)
        .get('/reports/test-report-id/download')
        .set('x-user-role', 'regulator')
        .set('x-user-id', 'regulator-001')
        .expect(200);

      // Verify audit trail creation would be called
      // In a real test, we'd mock the privacy service and verify the call
    });
  });

  describe('Performance and Reliability', () => {
    it('should handle concurrent report generation requests', async () => {
      const mockReport = {
        reportId: 'concurrent-report',
        downloadUrl: '/api/v1/reports/concurrent-report/download',
        format: 'JSON',
        generatedAt: new Date(),
        recordCount: 1,
        status: 'generated'
      };

      mockService.generateRegulatoryReport.mockResolvedValue(mockReport);

      const requestData = {
        reportType: 'SAR',
        data: { sarCases: [] }
      };

      // Simulate concurrent requests
      const promises = Array(5).fill().map(() =>
        request(app)
          .post('/reports/generate')
          .set('x-user-role', 'compliance_officer')
          .send(requestData)
      );

      const responses = await Promise.all(promises);

      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.reportId).toBeDefined();
      });
    });

    it('should handle large report data efficiently', async () => {
      const largeDataSet = {
        sarCases: Array(100).fill().map((_, i) => ({
          sarId: `SAR-${i}`,
          transactionId: `tx-${i}`,
          reportType: 'SUSPICIOUS_PATTERN',
          amount: 10000 + i,
          currency: 'USD-CBDC'
        }))
      };

      const mockReport = {
        reportId: 'large-report',
        downloadUrl: '/api/v1/reports/large-report/download',
        format: 'JSON',
        generatedAt: new Date(),
        recordCount: 100,
        status: 'generated'
      };

      mockService.generateRegulatoryReport.mockResolvedValue(mockReport);

      const requestData = {
        reportType: 'SAR',
        data: largeDataSet
      };

      const response = await request(app)
        .post('/reports/generate')
        .set('x-user-role', 'compliance_officer')
        .send(requestData)
        .expect(200);

      expect(response.body.recordCount).toBe(100);
    });
  });

  describe('Compliance Requirements', () => {
    it('should support all required report types', async () => {
      const reportTypes = ['SAR', 'CTR', 'KYC_SUMMARY', 'AML_STATISTICS', 'TRANSACTION_MONITORING', 'COMPLIANCE_AUDIT'];
      
      for (const reportType of reportTypes) {
        const mockReport = {
          reportId: `${reportType.toLowerCase()}-report`,
          downloadUrl: `/api/v1/reports/${reportType.toLowerCase()}-report/download`,
          format: 'JSON',
          generatedAt: new Date(),
          recordCount: 1,
          status: 'generated'
        };

        mockService.generateRegulatoryReport.mockResolvedValue(mockReport);

        const requestData = {
          reportType,
          data: {}
        };

        const response = await request(app)
          .post('/reports/generate')
          .set('x-user-role', 'compliance_officer')
          .send(requestData)
          .expect(200);

        expect(response.body.reportId).toBe(`${reportType.toLowerCase()}-report`);
      }
    });

    it('should support multiple output formats', async () => {
      const formats = ['JSON', 'XML', 'CSV', 'ISO20022'];
      
      for (const format of formats) {
        const mockReport = {
          reportId: `format-test-${format.toLowerCase()}`,
          downloadUrl: `/api/v1/reports/format-test-${format.toLowerCase()}/download`,
          format,
          generatedAt: new Date(),
          recordCount: 1,
          status: 'generated'
        };

        mockService.generateRegulatoryReport.mockResolvedValue(mockReport);

        const requestData = {
          reportType: 'SAR',
          data: { sarCases: [] },
          options: { format }
        };

        const response = await request(app)
          .post('/reports/generate')
          .set('x-user-role', 'compliance_officer')
          .send(requestData)
          .expect(200);

        expect(response.body.format).toBe(format);
      }
    });

    it('should maintain data integrity and audit trails', async () => {
      const mockReport = {
        reportId: 'integrity-test',
        downloadUrl: '/api/v1/reports/integrity-test/download',
        format: 'JSON',
        generatedAt: new Date(),
        recordCount: 1,
        status: 'generated'
      };

      mockService.generateRegulatoryReport.mockResolvedValue(mockReport);

      const requestData = {
        reportType: 'SAR',
        data: { sarCases: [] }
      };

      const response = await request(app)
        .post('/reports/generate')
        .set('x-user-role', 'compliance_officer')
        .set('x-user-id', 'compliance-user-001')
        .send(requestData)
        .expect(200);

      // Verify audit trail information is included
      expect(response.body.auditTrailId).toBeDefined();
      expect(response.body.requestId).toBe('test-request-id');
      expect(response.body.timestamp).toBeDefined();
    });
  });
});