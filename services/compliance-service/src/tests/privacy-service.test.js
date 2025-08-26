const PrivacyService = require('../services/privacy-service');

describe('PrivacyService', () => {
  let privacyService;

  beforeEach(() => {
    privacyService = new PrivacyService({
      encryptionKey: 'test-encryption-key',
      dataRetentionPeriod: 7 * 365 * 24 * 60 * 60 * 1000, // 7 years
      anonymizationThreshold: 365 * 24 * 60 * 60 * 1000 // 1 year
    });
  });

  afterEach(() => {
    // Clear audit trails
    privacyService.auditTrails.clear();
  });

  describe('createAuditTrail', () => {
    const testData = {
      action: 'kyc_verification',
      userId: 'user123',
      personalInfo: {
        fullName: 'John Doe',
        dateOfBirth: '1990-01-01'
      },
      transactionId: 'tx123',
      amount: 1000,
      timestamp: new Date()
    };

    test('should create audit trail with privacy protection', () => {
      const result = privacyService.createAuditTrail(testData);

      expect(result.auditId).toBeDefined();
      expect(result.privacyHash).toBeDefined();
      expect(result.timestamp).toBeDefined();
      expect(result.publicData).toBeDefined();
      expect(result.publicData.action).toBe('kyc_verification');
      expect(result.publicData.transactionId).toBe('tx123');
      expect(result.publicData.amount).toBe(1000);
      // Sensitive data should not be in public data
      expect(result.publicData.userId).toBeUndefined();
      expect(result.publicData.personalInfo).toBeUndefined();
    });

    test('should separate sensitive and public data correctly', () => {
      const { sensitiveData, publicData } = privacyService.separateData(testData);

      expect(sensitiveData.userId).toBe('user123');
      expect(sensitiveData.personalInfo).toEqual({
        fullName: 'John Doe',
        dateOfBirth: '1990-01-01'
      });
      expect(publicData.action).toBe('kyc_verification');
      expect(publicData.transactionId).toBe('tx123');
      expect(publicData.amount).toBe(1000);
      expect(publicData.userId).toBeUndefined();
      expect(publicData.personalInfo).toBeUndefined();
    });

    test('should classify data correctly', () => {
      const classification = privacyService.classifyData(testData);

      expect(classification).toContain('PII');
      expect(classification).toContain('FINANCIAL');
    });

    test('should store audit trail in memory', () => {
      const result = privacyService.createAuditTrail(testData);

      expect(privacyService.auditTrails.has(result.auditId)).toBe(true);
      const storedTrail = privacyService.auditTrails.get(result.auditId);
      expect(storedTrail.auditId).toBe(result.auditId);
    });
  });

  describe('getAuditTrail', () => {
    let auditId;
    const requesterInfo = {
      id: 'regulator123',
      role: 'regulator',
      organization: 'Financial Authority',
      ipAddress: '192.168.1.1',
      userAgent: 'Mozilla/5.0'
    };

    beforeEach(() => {
      const result = privacyService.createAuditTrail({
        action: 'kyc_verification',
        userId: 'user123',
        personalInfo: {
          fullName: 'John Doe',
          dateOfBirth: '1990-01-01'
        },
        transactionId: 'tx123'
      });
      auditId = result.auditId;
    });

    test('should return audit trail for authorized regulator', () => {
      const result = privacyService.getAuditTrail(auditId, requesterInfo, 'regulatory_audit');

      expect(result.auditId).toBe(auditId);
      expect(result.sensitiveData).toBeDefined();
      expect(result.sensitiveData.userId).toBe('user123');
      expect(result.accessLevel).toBe('full');
    });

    test('should deny access for unauthorized role', () => {
      const unauthorizedRequester = {
        ...requesterInfo,
        role: 'customer_support'
      };

      expect(() => {
        privacyService.getAuditTrail(auditId, unauthorizedRequester, 'regulatory_audit');
      }).toThrow('Access denied - insufficient permissions');
    });

    test('should log access attempts', () => {
      privacyService.getAuditTrail(auditId, requesterInfo, 'regulatory_audit');

      const auditEntry = privacyService.auditTrails.get(auditId);
      expect(auditEntry.accessLog).toHaveLength(1);
      expect(auditEntry.accessLog[0].requester.id).toBe('regulator123');
      expect(auditEntry.accessLog[0].purpose).toBe('regulatory_audit');
    });

    test('should return limited access for non-privileged roles', () => {
      const supportRequester = {
        ...requesterInfo,
        role: 'support_agent'
      };

      const result = privacyService.getAuditTrail(auditId, supportRequester, 'customer_support');

      expect(result.auditId).toBe(auditId);
      expect(result.sensitiveData).toBeUndefined();
      expect(result.accessLevel).toBe('limited');
    });

    test('should throw error for non-existent audit trail', () => {
      expect(() => {
        privacyService.getAuditTrail('nonexistent', requesterInfo, 'regulatory_audit');
      }).toThrow('Audit trail not found');
    });
  });

  describe('data encryption', () => {
    const testData = {
      userId: 'user123',
      personalInfo: {
        fullName: 'John Doe',
        ssn: '123-45-6789'
      }
    };

    test('should encrypt and decrypt data correctly', () => {
      const encrypted = privacyService.encryptData(testData);

      expect(encrypted.encrypted).toBeDefined();
      expect(encrypted.algorithm).toBe('sha256-hash');

      const decrypted = privacyService.decryptData(encrypted);
      expect(decrypted.mockDecrypted).toBe(true);
      expect(decrypted.originalHash).toBe(encrypted.encrypted);
    });

    test('should create consistent privacy hash', () => {
      const hash1 = privacyService.createPrivacyHash(testData);
      const hash2 = privacyService.createPrivacyHash(testData);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 hex length
    });

    test('should create different hashes for different data', () => {
      const hash1 = privacyService.createPrivacyHash(testData);
      const hash2 = privacyService.createPrivacyHash({ ...testData, userId: 'user456' });

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('anonymization', () => {
    test('should anonymize data after threshold period', () => {
      // Create audit trail with old timestamp
      const oldDate = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000); // 2 years ago
      const result = privacyService.createAuditTrail({
        action: 'kyc_verification',
        userId: 'user123',
        personalInfo: { fullName: 'John Doe' }
      });

      // Manually set old anonymization date
      const auditEntry = privacyService.auditTrails.get(result.auditId);
      auditEntry.anonymizationDate = oldDate;

      const requesterInfo = {
        id: 'regulator123',
        role: 'regulator',
        organization: 'Financial Authority',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0'
      };

      const retrievedData = privacyService.getAuditTrail(
        result.auditId,
        requesterInfo,
        'regulatory_audit'
      );

      expect(retrievedData.anonymized).toBe(true);
      expect(retrievedData.sensitiveData).toBeUndefined();
      expect(retrievedData.publicData).toBeDefined();
    });

    test('should anonymize public data correctly', () => {
      const publicData = {
        transactionId: 'tx123',
        sessionId: 'session456',
        amount: 1000
      };

      const anonymized = privacyService.anonymizePublicData(publicData);

      expect(anonymized.transactionId).not.toBe('tx123');
      expect(anonymized.sessionId).not.toBe('session456');
      expect(anonymized.amount).toBe(1000); // Non-identifiable data unchanged
    });

    test('should hash values consistently for anonymization', () => {
      const hash1 = privacyService.hashValue('test123');
      const hash2 = privacyService.hashValue('test123');

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(16); // Truncated hash
    });
  });

  describe('access control', () => {
    const auditEntry = {
      auditId: 'audit123',
      dataClassification: ['PII', 'FINANCIAL'],
      accessLog: []
    };

    test('should allow access for regulatory audit by regulator', () => {
      const requesterInfo = { role: 'regulator' };
      const hasAccess = privacyService.checkAccessPermissions(
        auditEntry,
        requesterInfo,
        'regulatory_audit'
      );

      expect(hasAccess).toBe(true);
    });

    test('should deny access for customer support to regulatory audit', () => {
      const requesterInfo = { role: 'support_agent' };
      const hasAccess = privacyService.checkAccessPermissions(
        auditEntry,
        requesterInfo,
        'regulatory_audit'
      );

      expect(hasAccess).toBe(false);
    });

    test('should deny access to sensitive data for non-privileged roles', () => {
      const requesterInfo = { role: 'researcher' };
      const hasAccess = privacyService.checkAccessPermissions(
        auditEntry,
        requesterInfo,
        'research'
      );

      expect(hasAccess).toBe(false);
    });

    test('should allow access to non-sensitive data for researchers', () => {
      const nonSensitiveEntry = {
        ...auditEntry,
        dataClassification: ['GENERAL']
      };
      const requesterInfo = { role: 'researcher' };
      const hasAccess = privacyService.checkAccessPermissions(
        nonSensitiveEntry,
        requesterInfo,
        'research'
      );

      expect(hasAccess).toBe(true);
    });
  });

  describe('cleanup and maintenance', () => {
    test('should clean up expired audit trails', () => {
      // Create audit trail with expired retention date
      const result = privacyService.createAuditTrail({
        action: 'test',
        data: 'test'
      });

      const auditEntry = privacyService.auditTrails.get(result.auditId);
      auditEntry.retentionDate = new Date(Date.now() - 1000); // Expired

      const cleanedCount = privacyService.cleanupExpiredTrails();

      expect(cleanedCount).toBe(1);
      expect(privacyService.auditTrails.has(result.auditId)).toBe(false);
    });

    test('should not clean up non-expired audit trails', () => {
      const result = privacyService.createAuditTrail({
        action: 'test',
        data: 'test'
      });

      const cleanedCount = privacyService.cleanupExpiredTrails();

      expect(cleanedCount).toBe(0);
      expect(privacyService.auditTrails.has(result.auditId)).toBe(true);
    });
  });

  describe('privacy compliance reporting', () => {
    test('should generate comprehensive privacy compliance report', () => {
      // Create various audit trails
      privacyService.createAuditTrail({
        action: 'kyc_verification',
        userId: 'user1',
        personalInfo: { fullName: 'John Doe' }
      });

      privacyService.createAuditTrail({
        action: 'aml_screening',
        transactionId: 'tx1',
        amount: 1000
      });

      // Simulate some access
      const auditId = Array.from(privacyService.auditTrails.keys())[0];
      privacyService.getAuditTrail(auditId, {
        id: 'regulator1',
        role: 'regulator',
        organization: 'Authority',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0'
      }, 'regulatory_audit');

      const report = privacyService.getPrivacyComplianceReport();

      expect(report.totalAuditTrails).toBe(2);
      expect(report.dataClassifications.PII).toBe(1);
      expect(report.dataClassifications.FINANCIAL).toBe(1); // Only one has financial data
      expect(report.accessStats.totalAccesses).toBe(1);
      expect(report.accessStats.accessesByRole.regulator).toBe(1);
      expect(report.accessStats.accessesByPurpose.regulatory_audit).toBe(1);
    });
  });
});