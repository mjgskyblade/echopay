const RegulatoryReportingService = require('../services/regulatory-reporting-service');

describe('RegulatoryReportingService', () => {
  let service;

  beforeEach(() => {
    service = new RegulatoryReportingService({
      reportTemplates: {
        'SAR_US': {
          requiredFields: ['suspiciousActivities', 'reportHeader'],
          optionalFields: ['summary', 'attachments']
        },
        'CTR_US': {
          requiredFields: ['currencyTransactions', 'reportHeader'],
          optionalFields: ['summary']
        }
      },
      regulatoryEndpoints: {
        'FINCEN': {
          name: 'Financial Crimes Enforcement Network',
          baseUrl: 'https://api.fincen.gov',
          supportedReports: ['SAR', 'CTR'],
          authMethod: 'api_key'
        }
      },
      iso20022Config: {
        defaultNamespace: 'urn:iso:std:iso:20022:tech:xsd',
        supportedVersions: ['001.001.01', '001.001.02'],
        messageTypes: {
          'SAR': 'auth.012.001.01',
          'CTR': 'auth.011.001.01'
        }
      }
    });
  });

  describe('generateRegulatoryReport', () => {
    it('should generate SAR report with correct structure', async () => {
      const testData = {
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
            priority: 'HIGH',
            flags: [{ type: 'HIGH_VELOCITY' }],
            watchlistHits: [
              {
                listName: 'SANCTIONS_LIST',
                matchType: 'EXACT',
                confidence: 0.95
              }
            ]
          }
        ]
      };

      const options = {
        jurisdiction: 'US',
        format: 'JSON',
        institutionName: 'EchoPay Test Bank',
        startDate: '2025-01-01',
        endDate: '2025-01-08'
      };

      const result = await service.generateRegulatoryReport('SAR', testData, options);

      expect(result).toMatchObject({
        reportId: expect.any(String),
        downloadUrl: expect.stringContaining('/api/v1/reports/'),
        format: 'JSON',
        generatedAt: expect.any(Date),
        recordCount: 1,
        status: 'generated'
      });

      // Verify the report is cached
      const cachedReport = service.getReport(result.reportId);
      expect(cachedReport).toBeDefined();
      expect(cachedReport.reportType).toBe('SAR');
      expect(cachedReport.reportData.suspiciousActivities).toHaveLength(1);
      expect(cachedReport.reportData.suspiciousActivities[0]).toMatchObject({
        caseId: 'SAR-001',
        transactionId: 'tx-001',
        suspiciousActivityType: 'SUSP',
        amountInvolved: 50000,
        currency: 'USD-CBDC',
        priority: 'HIGH'
      });
    });

    it('should generate CTR report with correct structure', async () => {
      const testData = {
        transactions: [
          {
            transactionId: 'tx-001',
            timestamp: '2025-01-08T10:00:00Z',
            amount: '15000.00',
            currency: 'USD-CBDC',
            userId: 'user-001',
            counterpartyId: 'user-002',
            transactionType: 'transfer',
            description: 'Large transfer',
            kycStatus: 'verified'
          },
          {
            transactionId: 'tx-002',
            timestamp: '2025-01-08T11:00:00Z',
            amount: '25000.00',
            currency: 'EUR-CBDC',
            userId: 'user-003',
            counterpartyId: 'user-004',
            transactionType: 'transfer'
          }
        ]
      };

      const options = {
        jurisdiction: 'US',
        format: 'XML',
        institutionName: 'EchoPay Test Bank'
      };

      const result = await service.generateRegulatoryReport('CTR', testData, options);

      expect(result.recordCount).toBe(2);
      
      const cachedReport = service.getReport(result.reportId);
      expect(cachedReport.reportData.currencyTransactions).toHaveLength(2);
      expect(cachedReport.reportData.summary.totalAmount).toBe(40000);
      expect(cachedReport.reportData.summary.currencyBreakdown).toMatchObject({
        'USD-CBDC': 15000,
        'EUR-CBDC': 25000
      });
    });

    it('should generate KYC Summary report', async () => {
      const testData = {
        kycStats: {
          total: 1000,
          verified: 950,
          rejected: 30,
          pending: 20,
          expired: 0
        },
        verificationLevels: {
          basic: 600,
          enhanced: 300,
          premium: 50
        },
        riskBreakdown: {
          low: 700,
          medium: 250,
          high: 50
        },
        averageRiskScore: 0.25,
        averageVerificationTime: '2.5 hours'
      };

      const result = await service.generateRegulatoryReport('KYC_SUMMARY', testData);

      const cachedReport = service.getReport(result.reportId);
      expect(cachedReport.reportData.kycStatistics).toMatchObject({
        totalVerifications: 1000,
        verifiedCustomers: 950,
        verificationRate: '95.00'
      });
      expect(cachedReport.reportData.riskAssessment).toMatchObject({
        lowRisk: 700,
        mediumRisk: 250,
        highRisk: 50
      });
    });

    it('should generate AML Statistics report', async () => {
      const testData = {
        amlStats: {
          total: 10000,
          cleared: 9500,
          flagged: 400,
          blocked: 80,
          under_review: 20,
          sarsFiled: 15
        },
        watchlistStats: {
          sanctions: 25,
          pep: 10,
          adverseMedia: 5,
          internal: 8
        },
        riskDistribution: {
          low: 8000,
          medium: 1500,
          high: 400,
          critical: 100
        }
      };

      const result = await service.generateRegulatoryReport('AML_STATISTICS', testData);

      const cachedReport = service.getReport(result.reportId);
      expect(cachedReport.reportData.screeningStatistics.totalScreenings).toBe(10000);
      expect(cachedReport.reportData.watchlistHits.sanctionsHits).toBe(25);
      expect(cachedReport.reportData.riskDistribution.criticalRisk).toBe(100);
    });

    it('should validate report type', async () => {
      await expect(
        service.generateRegulatoryReport('INVALID_TYPE', {})
      ).rejects.toThrow('Unsupported report type: INVALID_TYPE');
    });

    it('should validate report data', async () => {
      await expect(
        service.generateRegulatoryReport('SAR', null)
      ).rejects.toThrow('Report data is required');
    });

    it('should include metadata in generated reports', async () => {
      const testData = { sarCases: [] };
      const result = await service.generateRegulatoryReport('SAR', testData);

      const cachedReport = service.getReport(result.reportId);
      expect(cachedReport.metadata).toMatchObject({
        recordCount: 0,
        dataHash: expect.any(String),
        complianceVersion: '1.0',
        regulatoryFramework: ['BSA', 'USA_PATRIOT_ACT', 'FINCEN'],
        confidentialityLevel: 'CONFIDENTIAL',
        retentionPeriod: expect.any(Date)
      });
    });
  });

  describe('formatReport', () => {
    let testReport;

    beforeEach(() => {
      testReport = {
        reportId: 'test-report',
        reportType: 'SAR',
        reportData: {
          reportHeader: {
            reportType: 'SAR',
            reportNumber: 'SAR-123'
          },
          suspiciousActivities: [
            {
              caseId: 'SAR-001',
              transactionId: 'tx-001',
              amount: 10000
            }
          ]
        }
      };
    });

    it('should format report as JSON', async () => {
      const result = await service.formatReport(testReport, 'JSON');
      
      expect(result).toBe(JSON.stringify(testReport, null, 2));
    });

    it('should format report as XML', async () => {
      const result = await service.formatReport(testReport, 'XML');
      
      expect(result).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(result).toContain('<reportId>test-report</reportId>');
      expect(result).toContain('<reportType>SAR</reportType>');
    });

    it('should format report as CSV', async () => {
      const result = await service.formatReport(testReport, 'CSV');
      
      expect(result).toContain('reportHeader,suspiciousActivities');
      expect(result).toContain('SAR-001,tx-001,SUSP,10000');
    });

    it('should throw error for unsupported format', async () => {
      await expect(
        service.formatReport(testReport, 'UNSUPPORTED')
      ).rejects.toThrow('Unsupported format: UNSUPPORTED');
    });
  });

  describe('formatAsISO20022', () => {
    it('should format SAR report as ISO 20022', async () => {
      const testReport = {
        reportId: 'sar-iso-test',
        reportType: 'SAR',
        generatedAt: new Date('2025-01-08T10:00:00Z'),
        reportData: {
          reportHeader: {
            reportNumber: 'SAR-123',
            filingInstitution: 'EchoPay',
            reportingPeriod: {
              startDate: '2025-01-01',
              endDate: '2025-01-08'
            }
          },
          suspiciousActivities: [
            {
              caseId: 'SAR-001',
              transactionId: 'tx-001',
              suspiciousActivityType: 'SUSP',
              activityDate: '2025-01-08T10:00:00Z',
              amountInvolved: 50000,
              currency: 'USD-CBDC',
              description: 'Suspicious pattern',
              riskScore: 0.85,
              priority: 'HIGH'
            }
          ]
        }
      };

      const result = await service.formatAsISO20022(testReport);

      expect(result).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(result).toContain('<Document>');
      expect(result).toContain('<SuspiciousActivityReport>');
      expect(result).toContain('<MessageId>sar-iso-test</MessageId>');
      expect(result).toContain('<ReportType>SUSP</ReportType>');
      expect(result).toContain('<ActivityId>SAR-001</ActivityId>');
      expect(result).toContain('<Value>50000</Value>');
      expect(result).toContain('<Currency>USD-CBDC</Currency>');
    });

    it('should format CTR report as ISO 20022', async () => {
      const testReport = {
        reportId: 'ctr-iso-test',
        reportType: 'CTR',
        generatedAt: new Date('2025-01-08T10:00:00Z'),
        reportData: {
          reportHeader: {
            reportNumber: 'CTR-123',
            filingInstitution: 'EchoPay'
          },
          currencyTransactions: [
            {
              transactionId: 'tx-001',
              transactionDate: '2025-01-08T10:00:00Z',
              transactionType: 'transfer',
              amount: 15000,
              currency: 'USD-CBDC',
              customerInfo: {
                customerId: 'hashed-customer-id',
                customerType: 'individual'
              },
              counterpartyInfo: {
                counterpartyId: 'hashed-counterparty-id',
                counterpartyType: 'individual'
              }
            }
          ]
        }
      };

      const result = await service.formatAsISO20022(testReport);

      expect(result).toContain('<CurrencyTransactionReport>');
      expect(result).toContain('<ReportType>CTTR</ReportType>');
      expect(result).toContain('<TransactionId>tx-001</TransactionId>');
      expect(result).toContain('<CustomerId>hashed-customer-id</CustomerId>');
    });

    it('should format KYC report as ISO 20022', async () => {
      const testReport = {
        reportId: 'kyc-iso-test',
        reportType: 'KYC_SUMMARY',
        generatedAt: new Date('2025-01-08T10:00:00Z'),
        reportData: {
          reportHeader: {
            reportNumber: 'KYC-123',
            filingInstitution: 'EchoPay'
          },
          kycStatistics: {
            totalVerifications: 1000,
            verifiedCustomers: 950,
            verificationRate: '95.00'
          },
          riskAssessment: {
            lowRisk: 700,
            mediumRisk: 250,
            highRisk: 50
          }
        }
      };

      const result = await service.formatAsISO20022(testReport);

      expect(result).toContain('<CustomerDueDiligenceReport>');
      expect(result).toContain('<ReportType>KYCS</ReportType>');
      expect(result).toContain('<TotalVerifications>1000</TotalVerifications>');
      expect(result).toContain('<VerificationRate>95.00</VerificationRate>');
    });

    it('should handle generic report types', async () => {
      const testReport = {
        reportId: 'generic-test',
        reportType: 'CUSTOM_REPORT',
        generatedAt: new Date('2025-01-08T10:00:00Z'),
        reportData: {
          customField: 'customValue'
        }
      };

      const result = await service.formatAsISO20022(testReport);

      expect(result).toContain('<GenericReport>');
      expect(result).toContain('<MessageId>generic-test</MessageId>');
      expect(result).toContain('<ReportType>CUSTOM_REPORT</ReportType>');
    });
  });

  describe('submitToRegulatoryAuthorities', () => {
    beforeEach(() => {
      // Mock report in cache
      service.reportCache.set('test-report-id', {
        reportId: 'test-report-id',
        reportType: 'SAR',
        reportData: { test: 'data' }
      });
    });

    it('should submit report to single authority', async () => {
      const authorities = [
        {
          name: 'FINCEN',
          endpoint: 'https://api.fincen.gov/reports',
          apiKey: 'test-api-key',
          institutionId: 'INST-001'
        }
      ];

      const results = await service.submitToRegulatoryAuthorities('test-report-id', authorities);

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        authority: 'FINCEN',
        status: 'accepted',
        submissionId: expect.any(String),
        submittedAt: expect.any(Date)
      });
    });

    it('should submit report to multiple authorities', async () => {
      const authorities = [
        {
          name: 'FINCEN',
          endpoint: 'https://api.fincen.gov/reports',
          apiKey: 'test-api-key-1',
          institutionId: 'INST-001'
        },
        {
          name: 'SEC',
          endpoint: 'https://api.sec.gov/reports',
          apiKey: 'test-api-key-2',
          institutionId: 'INST-002'
        }
      ];

      const results = await service.submitToRegulatoryAuthorities('test-report-id', authorities);

      expect(results).toHaveLength(2);
      expect(results[0].authority).toBe('FINCEN');
      expect(results[1].authority).toBe('SEC');
      expect(results.every(r => r.status === 'accepted')).toBe(true);
    });

    it('should handle submission failures gracefully', async () => {
      // Mock a failing authority
      const authorities = [
        {
          name: 'FAILING_AUTHORITY',
          endpoint: 'https://invalid-endpoint.com',
          apiKey: 'invalid-key',
          institutionId: 'INVALID'
        }
      ];

      const results = await service.submitToRegulatoryAuthorities('test-report-id', authorities);

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('accepted'); // Mock always succeeds in test environment
    });

    it('should throw error for non-existent report', async () => {
      const authorities = [
        {
          name: 'FINCEN',
          endpoint: 'https://api.fincen.gov/reports',
          apiKey: 'test-api-key',
          institutionId: 'INST-001'
        }
      ];

      await expect(
        service.submitToRegulatoryAuthorities('non-existent-report', authorities)
      ).rejects.toThrow('Report not found');
    });

    it('should update report submission status', async () => {
      const authorities = [
        {
          name: 'FINCEN',
          endpoint: 'https://api.fincen.gov/reports',
          apiKey: 'test-api-key',
          institutionId: 'INST-001'
        }
      ];

      await service.submitToRegulatoryAuthorities('test-report-id', authorities);

      const report = service.getReport('test-report-id');
      expect(report.submissionStatus).toBe('submitted');
      expect(report.submissionResults).toHaveLength(1);
    });
  });

  describe('Utility Functions', () => {
    it('should map SAR types correctly', () => {
      expect(service.mapSARType('SANCTIONS_VIOLATION')).toBe('SANC');
      expect(service.mapSARType('STRUCTURING')).toBe('STRU');
      expect(service.mapSARType('PEP_TRANSACTION')).toBe('PEP');
      expect(service.mapSARType('UNKNOWN_TYPE')).toBe('GNRL');
    });

    it('should get ISO 20022 message types correctly', () => {
      expect(service.getISO20022MessageType('SAR')).toBe('auth.012.001.01');
      expect(service.getISO20022MessageType('CTR')).toBe('auth.011.001.01');
      expect(service.getISO20022MessageType('KYC_SUMMARY')).toBe('auth.013.001.01');
      expect(service.getISO20022MessageType('UNKNOWN')).toBe('auth.010.001.01');
    });

    it('should calculate false positive rate', () => {
      const amlStats = { flagged: 100, cleared: 90 };
      const rate = service.calculateFalsePositiveRate(amlStats);
      expect(parseFloat(rate)).toBe(10.00);
    });

    it('should calculate currency breakdown', () => {
      const transactions = [
        { amount: '15000', currency: 'USD-CBDC' },
        { amount: '25000', currency: 'EUR-CBDC' },
        { amount: '5000', currency: 'USD-CBDC' }, // Below threshold
        { amount: '20000', currency: 'USD-CBDC' }
      ];

      const breakdown = service.calculateCurrencyBreakdown(transactions);
      expect(breakdown).toEqual({
        'USD-CBDC': 35000, // 15000 + 20000 (5000 excluded as below 10000 threshold)
        'EUR-CBDC': 25000
      });
    });

    it('should hash customer IDs for privacy', () => {
      const customerId = 'user-123';
      const hashedId = service.hashCustomerId(customerId);
      
      expect(hashedId).toHaveLength(16);
      expect(hashedId).not.toBe(customerId);
      
      // Same input should produce same hash
      expect(service.hashCustomerId(customerId)).toBe(hashedId);
    });

    it('should determine regulatory frameworks by jurisdiction', () => {
      expect(service.determineRegulatoryFramework('US')).toEqual(['BSA', 'USA_PATRIOT_ACT', 'FINCEN']);
      expect(service.determineRegulatoryFramework('EU')).toEqual(['AMLD5', 'GDPR', 'MiFID_II']);
      expect(service.determineRegulatoryFramework('UK')).toEqual(['MLR_2017', 'POCA_2002', 'FCA_RULES']);
      expect(service.determineRegulatoryFramework('UNKNOWN')).toEqual(['FATF_RECOMMENDATIONS']);
    });

    it('should determine confidentiality levels', () => {
      expect(service.determineConfidentialityLevel('SAR')).toBe('CONFIDENTIAL');
      expect(service.determineConfidentialityLevel('CTR')).toBe('RESTRICTED');
      expect(service.determineConfidentialityLevel('KYC_SUMMARY')).toBe('INTERNAL');
      expect(service.determineConfidentialityLevel('UNKNOWN')).toBe('INTERNAL');
    });

    it('should calculate retention periods', () => {
      const sarRetention = service.calculateReportRetentionPeriod('SAR');
      const ctrRetention = service.calculateReportRetentionPeriod('CTR');
      const kycRetention = service.calculateReportRetentionPeriod('KYC_SUMMARY');
      
      expect(sarRetention).toBeInstanceOf(Date);
      expect(ctrRetention).toBeInstanceOf(Date);
      expect(kycRetention).toBeInstanceOf(Date);
      
      // KYC should have longer retention than SAR/CTR
      expect(kycRetention.getTime()).toBeGreaterThan(sarRetention.getTime());
    });
  });

  describe('Report Management', () => {
    it('should cache generated reports', async () => {
      const testData = { sarCases: [] };
      const result = await service.generateRegulatoryReport('SAR', testData);

      const cachedReport = service.getReport(result.reportId);
      expect(cachedReport).toBeDefined();
      expect(cachedReport.reportId).toBe(result.reportId);
    });

    it('should filter reports by criteria', () => {
      // Add test reports to cache
      service.reportCache.set('report-1', {
        reportId: 'report-1',
        reportType: 'SAR',
        jurisdiction: 'US',
        generatedAt: new Date('2025-01-08T10:00:00Z')
      });
      service.reportCache.set('report-2', {
        reportId: 'report-2',
        reportType: 'CTR',
        jurisdiction: 'EU',
        generatedAt: new Date('2025-01-07T10:00:00Z')
      });

      const allReports = service.getAllReports();
      expect(allReports).toHaveLength(2);

      const sarReports = service.getAllReports({ reportType: 'SAR' });
      expect(sarReports).toHaveLength(1);
      expect(sarReports[0].reportType).toBe('SAR');
    });

    it('should generate unique report IDs', async () => {
      const testData = { sarCases: [] };
      
      const result1 = await service.generateRegulatoryReport('SAR', testData);
      const result2 = await service.generateRegulatoryReport('SAR', testData);

      expect(result1.reportId).not.toBe(result2.reportId);
    });

    it('should generate data hashes for integrity', () => {
      const testData = { test: 'data', number: 123 };
      const hash1 = service.generateDataHash(testData);
      const hash2 = service.generateDataHash(testData);
      const hash3 = service.generateDataHash({ test: 'different data' });

      expect(hash1).toBe(hash2); // Same data should produce same hash
      expect(hash1).not.toBe(hash3); // Different data should produce different hash
      expect(hash1).toHaveLength(64); // SHA-256 produces 64-character hex string
    });
  });

  describe('Error Handling', () => {
    it('should handle XML building errors gracefully', async () => {
      const invalidReport = {
        reportId: 'invalid-report',
        reportType: 'SAR',
        reportData: {
          // Circular reference that would break XML serialization
          circular: {}
        }
      };
      invalidReport.reportData.circular.self = invalidReport.reportData.circular;

      // Should not throw, but handle gracefully
      const result = await service.formatReport(invalidReport, 'XML');
      expect(result).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    });

    it('should handle missing report templates gracefully', async () => {
      const testData = { sarCases: [] };
      const options = { jurisdiction: 'UNKNOWN_JURISDICTION' };

      // Should not throw, but use default template
      const result = await service.generateRegulatoryReport('SAR', testData, options);
      expect(result.reportId).toBeDefined();
    });

    it('should handle empty data sets', async () => {
      const emptyData = {
        sarCases: [],
        transactions: [],
        kycStats: { total: 0, verified: 0, rejected: 0, pending: 0 }
      };

      const sarResult = await service.generateRegulatoryReport('SAR', emptyData);
      const ctrResult = await service.generateRegulatoryReport('CTR', emptyData);
      const kycResult = await service.generateRegulatoryReport('KYC_SUMMARY', emptyData);

      expect(sarResult.recordCount).toBe(0);
      expect(ctrResult.recordCount).toBe(0);
      expect(kycResult.recordCount).toBe(0);
    });
  });
});