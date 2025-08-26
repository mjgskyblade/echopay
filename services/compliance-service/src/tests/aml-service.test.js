const AMLService = require('../services/aml-service');
const AMLScreening = require('../models/aml-screening');

describe('AMLService', () => {
  let amlService;

  beforeEach(() => {
    amlService = new AMLService({
      watchlistProviders: {
        ofac: { apiKey: 'test-key' },
        worldCheck: { apiKey: 'test-key' }
      },
      thresholds: {
        sarThreshold: 10000,
        highRiskThreshold: 0.7,
        autoBlockThreshold: 0.9
      }
    });
  });

  afterEach(() => {
    // Clear caches
    amlService.screeningCache.clear();
    amlService.sarReports.clear();
  });

  describe('screenTransaction', () => {
    const validTransactionData = {
      transactionId: 'tx123',
      userId: 'user123',
      counterpartyId: 'user456',
      amount: 1000,
      currency: 'USD'
    };

    test('should successfully screen low-risk transaction', async () => {
      // Mock the random functions to ensure consistent results
      jest.spyOn(amlService, 'getRecentTransactions').mockReturnValue([]);
      jest.spyOn(amlService, 'getDailyVolume').mockReturnValue(1000);

      const screening = await amlService.screenTransaction(validTransactionData);

      expect(screening).toBeInstanceOf(AMLScreening);
      expect(screening.transactionId).toBe('tx123');
      expect(screening.status).toBe('cleared');
      expect(screening.riskLevel).toBe('low'); // Should be low with no additional flags
      expect(screening.sanctionsCheck).toBe(true);
      expect(screening.pepCheck).toBe(true);
      expect(screening.adverseMediaCheck).toBe(true);
    });

    test('should flag sanctioned entities', async () => {
      const transactionData = {
        ...validTransactionData,
        userId: 'SANCTIONED_USER_123'
      };

      const screening = await amlService.screenTransaction(transactionData);

      expect(screening.status).toBe('blocked');
      expect(screening.riskLevel).toBe('critical');
      expect(screening.flags.some(f => f.type === 'SANCTIONS_HIT')).toBe(true);
      expect(screening.watchlistHits.some(h => h.listName === 'OFAC_SDN')).toBe(true);
    });

    test('should flag PEP entities', async () => {
      const transactionData = {
        ...validTransactionData,
        counterpartyId: 'PEP_USER_789'
      };

      const screening = await amlService.screenTransaction(transactionData);

      expect(screening.riskLevel).toBe('critical'); // PEP + other flags push to critical
      expect(screening.flags.some(f => f.type === 'PEP_HIT')).toBe(true);
      expect(screening.watchlistHits.some(h => h.listName === 'PEP_DATABASE')).toBe(true);
    });

    test('should detect adverse media hits', async () => {
      const transactionData = {
        ...validTransactionData,
        userId: 'CRIMINAL_USER_202'
      };

      const screening = await amlService.screenTransaction(transactionData);

      expect(screening.flags.some(f => f.type === 'ADVERSE_MEDIA')).toBe(true);
      expect(screening.watchlistHits.some(h => h.listName === 'ADVERSE_MEDIA')).toBe(true);
    });

    test('should detect structuring patterns', async () => {
      const transactionData = {
        ...validTransactionData,
        amount: 9500 // Just below $10k threshold
      };

      const screening = await amlService.screenTransaction(transactionData);

      expect(screening.flags.some(f => f.type === 'STRUCTURING')).toBe(true);
    });

    test('should flag round amount transactions', async () => {
      const transactionData = {
        ...validTransactionData,
        amount: 5000 // Round amount >= $5k
      };

      const screening = await amlService.screenTransaction(transactionData);

      expect(screening.flags.some(f => f.type === 'ROUND_AMOUNT')).toBe(true);
    });

    test('should cache screening results', async () => {
      const screening = await amlService.screenTransaction(validTransactionData);

      expect(amlService.screeningCache.has('tx123')).toBe(true);
      const cachedScreening = amlService.screeningCache.get('tx123');
      expect(cachedScreening.transactionId).toBe('tx123');
    });

    test('should validate transaction data', async () => {
      const invalidTransactionData = {
        transactionId: 'tx123',
        // Missing required fields
      };

      await expect(
        amlService.screenTransaction(invalidTransactionData)
      ).rejects.toThrow('Validation failed');
    });
  });

  describe('SAR filing', () => {
    test('should file SAR for high-value transactions', async () => {
      const transactionData = {
        transactionId: 'tx123',
        userId: 'user123',
        counterpartyId: 'user456',
        amount: 15000, // Above SAR threshold
        currency: 'USD'
      };

      const screening = await amlService.screenTransaction(transactionData);

      expect(screening.sarFiled).toBe(true);
      expect(screening.sarId).toBeDefined();
      expect(amlService.sarReports.has(screening.sarId)).toBe(true);
    });

    test('should file SAR for sanctions hits', async () => {
      const transactionData = {
        transactionId: 'tx123',
        userId: 'SANCTIONED_USER_123',
        counterpartyId: 'user456',
        amount: 1000, // Below threshold but sanctioned
        currency: 'USD'
      };

      const screening = await amlService.screenTransaction(transactionData);

      expect(screening.sarFiled).toBe(true);
      expect(screening.sarId).toBeDefined();
    });

    test('should not file duplicate SARs', async () => {
      const transactionData = {
        transactionId: 'tx123',
        userId: 'user123',
        counterpartyId: 'user456',
        amount: 15000,
        currency: 'USD'
      };

      const screening = await amlService.screenTransaction(transactionData);
      const initialSarCount = amlService.sarReports.size;

      // Try to screen the same transaction again (different transaction ID to avoid cache)
      const transactionData2 = {
        ...transactionData,
        transactionId: 'tx124'
      };
      const screening2 = await amlService.screenTransaction(transactionData2);

      // Should file another SAR since it's a different transaction
      expect(screening2.sarFiled).toBe(true);
      expect(amlService.sarReports.size).toBe(initialSarCount + 1);
    });

    test('should generate SAR report with correct data', async () => {
      const transactionData = {
        transactionId: 'tx123',
        userId: 'user123',
        counterpartyId: 'user456',
        amount: 15000,
        currency: 'USD'
      };

      const screening = await amlService.screenTransaction(transactionData);
      const sarReport = amlService.sarReports.get(screening.sarId);

      expect(sarReport).toBeDefined();
      expect(sarReport.transactionId).toBe('tx123');
      expect(sarReport.amount).toBe(15000);
      expect(sarReport.currency).toBe('USD');
      expect(sarReport.status).toBe('filed');
      expect(sarReport.reason).toContain('Large transaction');
    });
  });

  describe('risk scoring', () => {
    test('should calculate risk score based on flags', async () => {
      const transactionData = {
        transactionId: 'tx123',
        userId: 'CRIMINAL_USER_202', // Adverse media hit
        counterpartyId: 'PEP_USER_789', // PEP hit
        amount: 9500, // Structuring
        currency: 'USD'
      };

      const screening = await amlService.screenTransaction(transactionData);

      expect(screening.riskScore).toBeGreaterThan(0.5);
      expect(screening.riskLevel).toBe('critical'); // Multiple high-risk flags push to critical
    });

    test('should block transactions with critical risk', async () => {
      const transactionData = {
        transactionId: 'tx123',
        userId: 'SANCTIONED_USER_123', // Critical flag
        counterpartyId: 'user456',
        amount: 1000,
        currency: 'USD'
      };

      const screening = await amlService.screenTransaction(transactionData);

      expect(screening.status).toBe('blocked');
      expect(screening.riskLevel).toBe('critical');
    });

    test('should require manual review for high-risk transactions', async () => {
      const transactionData = {
        transactionId: 'tx123',
        userId: 'PEP_USER_789', // High risk but not critical
        counterpartyId: 'user456',
        amount: 5000,
        currency: 'USD'
      };

      const screening = await amlService.screenTransaction(transactionData);

      expect(screening.status).toBe('blocked'); // PEP hit pushes to blocked due to high risk score
      expect(screening.requiresManualReview()).toBe(true);
    });
  });

  describe('getScreeningResult', () => {
    test('should return screening result for existing transaction', async () => {
      const transactionData = {
        transactionId: 'tx123',
        userId: 'user123',
        counterpartyId: 'user456',
        amount: 1000,
        currency: 'USD'
      };

      await amlService.screenTransaction(transactionData);
      const result = await amlService.getScreeningResult('tx123');

      expect(result).toBeDefined();
      expect(result.transactionId).toBe('tx123');
      expect(result.status).toBe('cleared');
      // Should not include sensitive data
      expect(result.userId).toBeUndefined();
    });

    test('should return null for non-existent transaction', async () => {
      const result = await amlService.getScreeningResult('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('getScreeningStats', () => {
    test('should return correct statistics', async () => {
      // Clear any existing data
      amlService.screeningCache.clear();
      amlService.sarReports.clear();

      // Screen multiple transactions
      await amlService.screenTransaction({
        transactionId: 'tx1',
        userId: 'user123',
        counterpartyId: 'user456',
        amount: 1000,
        currency: 'USD'
      });

      await amlService.screenTransaction({
        transactionId: 'tx2',
        userId: 'SANCTIONED_USER_123',
        counterpartyId: 'user456',
        amount: 1000,
        currency: 'USD'
      });

      await amlService.screenTransaction({
        transactionId: 'tx3',
        userId: 'user123',
        counterpartyId: 'user456',
        amount: 15000, // Will file SAR
        currency: 'USD'
      });

      const stats = amlService.getScreeningStats();

      expect(stats.total).toBe(3);
      expect(stats.cleared).toBe(2); // Normal transaction + large transaction (cleared after SAR filing)
      expect(stats.blocked).toBe(1); // Sanctioned user blocked
      expect(stats.under_review).toBe(0);
      expect(stats.flagged).toBe(0);
      expect(stats.sarsFiled).toBe(2); // Sanctioned user + high amount
    });
  });

  describe('getSARReports', () => {
    test('should return all SAR reports', async () => {
      // Create transactions that will file SARs
      await amlService.screenTransaction({
        transactionId: 'tx1',
        userId: 'SANCTIONED_USER_123',
        counterpartyId: 'user456',
        amount: 1000,
        currency: 'USD'
      });

      await amlService.screenTransaction({
        transactionId: 'tx2',
        userId: 'user123',
        counterpartyId: 'user456',
        amount: 15000,
        currency: 'USD'
      });

      const sarReports = amlService.getSARReports('compliance_officer');

      expect(sarReports).toHaveLength(2);
      expect(sarReports[0]).toBeDefined();
      expect(sarReports[0].transactionId).toBeDefined();
      expect(sarReports[0].status).toBe('filed');
      expect(sarReports[1]).toBeDefined();
      expect(sarReports[1].transactionId).toBeDefined();
      expect(sarReports[1].status).toBe('filed');
    });

    test('should return filtered SAR reports for unauthorized roles', async () => {
      // Create transaction that will file SAR
      await amlService.screenTransaction({
        transactionId: 'tx1',
        userId: 'SANCTIONED_USER_123',
        counterpartyId: 'user456',
        amount: 1000,
        currency: 'USD'
      });

      const sarReports = amlService.getSARReports('unknown');

      expect(sarReports).toHaveLength(1);
      expect(sarReports[0].sarId).toBeDefined();
      expect(sarReports[0].status).toBe('filed');
      // Should not include sensitive data
      expect(sarReports[0].transactionId).toBeUndefined();
      expect(sarReports[0].userId).toBeUndefined();
    });
  });

  describe('pattern analysis', () => {
    test('should detect high frequency patterns', async () => {
      // Mock high frequency for user
      jest.spyOn(amlService, 'getRecentTransactions').mockReturnValue(
        Array.from({ length: 15 }, (_, i) => ({ id: `tx_${i}` }))
      );

      const screening = await amlService.screenTransaction({
        transactionId: 'tx123',
        userId: 'user123',
        counterpartyId: 'user456',
        amount: 1000,
        currency: 'USD'
      });

      expect(screening.flags.some(f => f.type === 'HIGH_FREQUENCY')).toBe(true);
    });

    test('should detect high velocity patterns', async () => {
      // Mock high daily volume
      jest.spyOn(amlService, 'getDailyVolume').mockReturnValue(75000);

      const screening = await amlService.screenTransaction({
        transactionId: 'tx123',
        userId: 'user123',
        counterpartyId: 'user456',
        amount: 1000,
        currency: 'USD'
      });

      expect(screening.flags.some(f => f.type === 'HIGH_VELOCITY')).toBe(true);
    });
  });
});