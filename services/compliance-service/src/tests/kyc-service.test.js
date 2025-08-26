const KYCService = require('../services/kyc-service');
const KYCVerification = require('../models/kyc-verification');

describe('KYCService', () => {
  let kycService;

  beforeEach(() => {
    kycService = new KYCService({
      providers: {
        mock: {},
        jumio: { apiKey: 'test-key' },
        onfido: { apiKey: 'test-key' }
      },
      defaultProvider: 'mock'
    });
  });

  afterEach(() => {
    // Clear cache
    kycService.verificationCache.clear();
  });

  describe('verifyIdentity', () => {
    const validDocumentData = {
      documentType: 'passport',
      documentNumber: 'P123456789',
      fullName: 'John Doe',
      dateOfBirth: new Date('1990-01-01'),
      address: {
        street: '123 Main St',
        city: 'Anytown',
        state: 'CA',
        postalCode: '12345',
        country: 'US'
      },
      documentTypes: ['passport']
    };

    test('should successfully verify identity with valid data', async () => {
      const userId = 'user123';
      const verification = await kycService.verifyIdentity(userId, validDocumentData);

      expect(verification).toBeInstanceOf(KYCVerification);
      expect(verification.userId).toBe(userId);
      expect(verification.status).toBe('verified');
      expect(verification.verificationLevel).toBe('basic');
      expect(verification.privacyHash).toBeDefined();
      expect(verification.verifiedAt).toBeDefined();
      expect(verification.expiresAt).toBeDefined();
    });

    test('should reject verification with invalid document', async () => {
      const userId = 'user123';
      const invalidDocumentData = {
        ...validDocumentData,
        documentNumber: '123' // Too short
      };

      const verification = await kycService.verifyIdentity(userId, invalidDocumentData);

      expect(verification.status).toBe('rejected');
      expect(verification.verificationLevel).toBe('none');
      expect(verification.flags).toHaveLength(1);
      expect(verification.flags[0].flag).toBe('INVALID_DOCUMENT');
    });

    test('should handle provider-specific verification', async () => {
      const userId = 'user123';
      const options = { provider: 'jumio' };

      // Should fallback to mock since Jumio is not fully implemented
      const verification = await kycService.verifyIdentity(userId, validDocumentData, options);

      expect(verification).toBeInstanceOf(KYCVerification);
      expect(verification.providerId).toBe('jumio');
    });

    test('should generate privacy hash for sensitive data', async () => {
      const userId = 'user123';
      const verification = await kycService.verifyIdentity(userId, validDocumentData);

      expect(verification.privacyHash).toBeDefined();
      expect(typeof verification.privacyHash).toBe('string');
      expect(verification.privacyHash.length).toBe(64); // SHA-256 hex length
    });

    test('should cache verification results', async () => {
      const userId = 'user123';
      await kycService.verifyIdentity(userId, validDocumentData);

      expect(kycService.verificationCache.has(userId)).toBe(true);
      const cachedVerification = kycService.verificationCache.get(userId);
      expect(cachedVerification.userId).toBe(userId);
    });

    test('should throw error for invalid provider', async () => {
      const userId = 'user123';
      const options = { provider: 'invalid_provider' };

      await expect(
        kycService.verifyIdentity(userId, validDocumentData, options)
      ).rejects.toThrow('Unknown KYC provider: invalid_provider');
    });
  });

  describe('getVerificationStatus', () => {
    test('should return verification status for existing user', async () => {
      const userId = 'user123';
      await kycService.verifyIdentity(userId, {
        documentType: 'passport',
        documentNumber: 'P123456789',
        fullName: 'John Doe',
        dateOfBirth: new Date('1990-01-01'),
        address: {
          street: '123 Main St',
          city: 'Anytown',
          state: 'CA',
          postalCode: '12345',
          country: 'US'
        }
      });

      const status = await kycService.getVerificationStatus(userId);

      expect(status).toBeDefined();
      expect(status.userId).toBe(userId);
      expect(status.status).toBe('verified');
      expect(status.verificationLevel).toBe('basic');
      // Should not include sensitive data
      expect(status.privacyHash).toBeUndefined();
    });

    test('should return null for non-existent user', async () => {
      const status = await kycService.getVerificationStatus('nonexistent');
      expect(status).toBeNull();
    });

    test('should mark expired verifications', async () => {
      const userId = 'user123';
      const verification = new KYCVerification({
        userId,
        status: 'verified',
        verifiedAt: new Date('2020-01-01'),
        expiresAt: new Date('2021-01-01') // Expired
      });

      kycService.verificationCache.set(userId, verification);

      const status = await kycService.getVerificationStatus(userId);

      expect(status.status).toBe('expired');
    });
  });

  describe('updateVerificationStatus', () => {
    test('should update verification status', async () => {
      const userId = 'user123';
      await kycService.verifyIdentity(userId, {
        documentType: 'passport',
        documentNumber: 'P123456789',
        fullName: 'John Doe',
        dateOfBirth: new Date('1990-01-01'),
        address: {
          street: '123 Main St',
          city: 'Anytown',
          state: 'CA',
          postalCode: '12345',
          country: 'US'
        }
      });

      const updatedStatus = await kycService.updateVerificationStatus(
        userId,
        'rejected',
        'Failed manual review'
      );

      expect(updatedStatus.status).toBe('rejected');
      expect(updatedStatus.flags).toHaveLength(1);
      expect(updatedStatus.flags[0].flag).toBe('STATUS_UPDATE');
    });

    test('should throw error for non-existent verification', async () => {
      await expect(
        kycService.updateVerificationStatus('nonexistent', 'rejected')
      ).rejects.toThrow('Verification not found');
    });
  });

  describe('needsReVerification', () => {
    test('should return true for non-existent user', () => {
      const needsReVerification = kycService.needsReVerification('nonexistent');
      expect(needsReVerification).toBe(true);
    });

    test('should return true for expired verification', () => {
      const userId = 'user123';
      const verification = new KYCVerification({
        userId,
        status: 'verified',
        expiresAt: new Date('2020-01-01') // Expired
      });

      kycService.verificationCache.set(userId, verification);

      const needsReVerification = kycService.needsReVerification(userId);
      expect(needsReVerification).toBe(true);
    });

    test('should return true for rejected verification', () => {
      const userId = 'user123';
      const verification = new KYCVerification({
        userId,
        status: 'rejected'
      });

      kycService.verificationCache.set(userId, verification);

      const needsReVerification = kycService.needsReVerification(userId);
      expect(needsReVerification).toBe(true);
    });

    test('should return false for valid verification', () => {
      const userId = 'user123';
      const verification = new KYCVerification({
        userId,
        status: 'verified',
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // Future date
      });

      kycService.verificationCache.set(userId, verification);

      const needsReVerification = kycService.needsReVerification(userId);
      expect(needsReVerification).toBe(false);
    });
  });

  describe('getVerificationStats', () => {
    test('should return correct statistics', async () => {
      // Add some test verifications
      await kycService.verifyIdentity('user1', {
        documentType: 'passport',
        documentNumber: 'P123456789',
        fullName: 'John Doe',
        dateOfBirth: new Date('1990-01-01'),
        address: {
          street: '123 Main St',
          city: 'Anytown',
          state: 'CA',
          postalCode: '12345',
          country: 'US'
        }
      });

      await kycService.verifyIdentity('user2', {
        documentType: 'passport',
        documentNumber: '123', // Invalid
        fullName: 'Jane Doe',
        dateOfBirth: new Date('1990-01-01'),
        address: {
          street: '123 Main St',
          city: 'Anytown',
          state: 'CA',
          postalCode: '12345',
          country: 'US'
        }
      });

      const stats = kycService.getVerificationStats();

      expect(stats.total).toBe(2);
      expect(stats.verified).toBe(1);
      expect(stats.rejected).toBe(1);
      expect(stats.pending).toBe(0);
      expect(stats.expired).toBe(0);
    });
  });

  describe('privacy protection', () => {
    test('should encrypt and decrypt sensitive data', () => {
      const sensitiveData = {
        documentNumber: 'P123456789',
        fullName: 'John Doe',
        dateOfBirth: '1990-01-01'
      };

      const encrypted = kycService.encryptSensitiveData(sensitiveData);
      expect(encrypted).toBeDefined();
      expect(encrypted.encrypted).toBeDefined();
      expect(encrypted.algorithm).toBe('sha256-hash');

      const decrypted = kycService.decryptSensitiveData(encrypted);
      expect(decrypted.mockDecrypted).toBe(true);
      expect(decrypted.originalHash).toBe(encrypted.encrypted);
    });

    test('should extract sensitive data correctly', () => {
      const documentData = {
        documentNumber: 'P123456789',
        fullName: 'John Doe',
        dateOfBirth: '1990-01-01',
        address: { street: '123 Main St' },
        documentType: 'passport', // Not sensitive
        verificationLevel: 'basic' // Not sensitive
      };

      const sensitiveData = kycService.extractSensitiveData(documentData);

      expect(sensitiveData.documentNumber).toBe('P123456789');
      expect(sensitiveData.fullName).toBe('John Doe');
      expect(sensitiveData.dateOfBirth).toBe('1990-01-01');
      expect(sensitiveData.address).toEqual({ street: '123 Main St' });
      expect(sensitiveData.documentType).toBeUndefined();
      expect(sensitiveData.verificationLevel).toBeUndefined();
    });
  });
});