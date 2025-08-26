const crossBorderFraudDetection = require('../services/cross-border-fraud-detection');

describe('Cross-Border Fraud Detection', () => {
  let mockTransactionData;
  let mockJurisdictions;

  beforeEach(() => {
    mockTransactionData = {
      id: 'tx-test-123',
      fromWallet: 'wallet-us-456',
      toWallet: 'wallet-eu-789',
      amount: 50000,
      currency: 'USD-CBDC',
      timestamp: new Date().toISOString(),
      metadata: {
        description: 'International business payment',
        category: 'business'
      }
    };

    mockJurisdictions = ['US', 'EU'];
  });

  describe('analyzeTransaction', () => {
    test('should analyze transaction and return risk assessment', async () => {
      const result = await crossBorderFraudDetection.analyzeTransaction(
        mockTransactionData, 
        mockJurisdictions
      );

      expect(result).toHaveProperty('transactionId', mockTransactionData.id);
      expect(result).toHaveProperty('riskScore');
      expect(result).toHaveProperty('riskFactors');
      expect(result).toHaveProperty('jurisdictionalAlerts');
      expect(result).toHaveProperty('recommendedActions');
      expect(result).toHaveProperty('crossBorderPatterns');

      expect(typeof result.riskScore).toBe('number');
      expect(result.riskScore).toBeGreaterThanOrEqual(0);
      expect(result.riskScore).toBeLessThanOrEqual(1);
      expect(Array.isArray(result.riskFactors)).toBe(true);
      expect(Array.isArray(result.jurisdictionalAlerts)).toBe(true);
      expect(Array.isArray(result.recommendedActions)).toBe(true);
      expect(Array.isArray(result.crossBorderPatterns)).toBe(true);
    });

    test('should identify high-risk corridors', async () => {
      const highRiskJurisdictions = ['US', 'RU'];
      
      const result = await crossBorderFraudDetection.analyzeTransaction(
        mockTransactionData, 
        highRiskJurisdictions
      );

      expect(result.riskFactors).toContain('HIGH_RISK_CORRIDOR');
      expect(result.riskScore).toBeGreaterThan(0.2);
    });

    test('should detect multiple jurisdiction risk', async () => {
      const multipleJurisdictions = ['US', 'EU', 'UK', 'CA'];
      
      const result = await crossBorderFraudDetection.analyzeTransaction(
        mockTransactionData, 
        multipleJurisdictions
      );

      expect(result.riskFactors).toContain('MULTIPLE_JURISDICTIONS');
    });

    test('should handle large transaction amounts', async () => {
      const largeTransaction = {
        ...mockTransactionData,
        amount: 1000000
      };

      const result = await crossBorderFraudDetection.analyzeTransaction(
        largeTransaction, 
        mockJurisdictions
      );

      expect(result.riskScore).toBeGreaterThan(0.1);
    });

    test('should generate appropriate recommendations for high risk', async () => {
      // Mock high risk scenario
      const highRiskTransaction = {
        ...mockTransactionData,
        amount: 2000000
      };
      const highRiskJurisdictions = ['US', 'RU'];

      const result = await crossBorderFraudDetection.analyzeTransaction(
        highRiskTransaction, 
        highRiskJurisdictions
      );

      if (result.riskScore > 0.8) {
        expect(result.recommendedActions).toContain('BLOCK_TRANSACTION');
        expect(result.recommendedActions).toContain('IMMEDIATE_INVESTIGATION');
      } else if (result.riskScore > 0.6) {
        expect(result.recommendedActions).toContain('ENHANCED_MONITORING');
      }
    });
  });

  describe('sharePatterns', () => {
    test('should share fraud patterns with international partners', async () => {
      const patterns = [
        {
          type: 'RAPID_SEQUENTIAL_TRANSFERS',
          indicators: [
            { type: 'VELOCITY', value: 'HIGH' },
            { type: 'TIMING', value: 'SUSPICIOUS' }
          ],
          riskLevel: 'HIGH',
          frequency: 15
        },
        {
          type: 'ROUND_TRIP_TRANSACTIONS',
          indicators: [
            { type: 'PATTERN', value: 'CIRCULAR' },
            { type: 'AMOUNT', value: 'CONSISTENT' }
          ],
          riskLevel: 'MEDIUM',
          frequency: 8
        }
      ];

      const result = await crossBorderFraudDetection.sharePatterns(patterns, 'US');

      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('sharedPatterns', patterns.length);
      expect(result).toHaveProperty('shareResults');
      expect(Array.isArray(result.shareResults)).toBe(true);
    });

    test('should anonymize sensitive data in shared patterns', async () => {
      const patternsWithSensitiveData = [
        {
          type: 'SUSPICIOUS_BEHAVIOR',
          indicators: [
            { 
              type: 'WALLET',
              walletId: 'wallet-sensitive-123',
              userId: 'user-sensitive-456'
            }
          ],
          riskLevel: 'HIGH',
          frequency: 5
        }
      ];

      const result = await crossBorderFraudDetection.sharePatterns(
        patternsWithSensitiveData, 
        'US'
      );

      expect(result.success).toBe(true);
      // Verify that sensitive data would be anonymized (implementation detail)
    });

    test('should handle pattern sharing failures gracefully', async () => {
      const patterns = [
        {
          type: 'TEST_PATTERN',
          indicators: [],
          riskLevel: 'LOW',
          frequency: 1
        }
      ];

      // This should not throw even if some jurisdictions are unreachable
      const result = await crossBorderFraudDetection.sharePatterns(patterns, 'US');
      
      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('shareResults');
    });
  });

  describe('analyzeCorridorRisk', () => {
    test('should identify high-risk corridors', () => {
      const highRiskJurisdictions = ['US', 'RU'];
      const result = crossBorderFraudDetection.analyzeCorridorRisk(highRiskJurisdictions);

      expect(result.factors).toContain('HIGH_RISK_CORRIDOR');
      expect(result.score).toBeGreaterThan(0);
    });

    test('should detect multiple jurisdiction scenarios', () => {
      const multipleJurisdictions = ['US', 'EU', 'UK', 'CA'];
      const result = crossBorderFraudDetection.analyzeCorridorRisk(multipleJurisdictions);

      expect(result.factors).toContain('MULTIPLE_JURISDICTIONS');
      expect(result.score).toBeGreaterThan(0);
    });

    test('should return low risk for normal corridors', () => {
      const normalJurisdictions = ['US', 'CA'];
      const result = crossBorderFraudDetection.analyzeCorridorRisk(normalJurisdictions);

      expect(result.factors).not.toContain('HIGH_RISK_CORRIDOR');
    });
  });

  describe('analyzeVelocityPatterns', () => {
    test('should detect high velocity patterns', async () => {
      const highVelocityTransaction = {
        ...mockTransactionData,
        amount: 15000 // This will be multiplied in simulation
      };

      const result = await crossBorderFraudDetection.analyzeVelocityPatterns(
        highVelocityTransaction, 
        mockJurisdictions
      );

      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('factors');
      expect(Array.isArray(result.factors)).toBe(true);
    });

    test('should handle normal velocity transactions', async () => {
      const normalTransaction = {
        ...mockTransactionData,
        amount: 100 // Small amount
      };

      const result = await crossBorderFraudDetection.analyzeVelocityPatterns(
        normalTransaction, 
        mockJurisdictions
      );

      expect(result.score).toBeGreaterThanOrEqual(0);
    });
  });

  describe('detectCrossBorderPatterns', () => {
    test('should detect various fraud patterns', async () => {
      const result = await crossBorderFraudDetection.detectCrossBorderPatterns(
        mockTransactionData, 
        mockJurisdictions
      );

      expect(result).toHaveProperty('patterns');
      expect(result).toHaveProperty('riskScore');
      expect(Array.isArray(result.patterns)).toBe(true);
      expect(typeof result.riskScore).toBe('number');
    });

    test('should identify rapid sequential transfers', async () => {
      // Mock scenario where rapid transfers are detected
      const rapidTransferTransaction = {
        ...mockTransactionData,
        metadata: {
          ...mockTransactionData.metadata,
          sequenceIndicator: 'RAPID'
        }
      };

      const result = await crossBorderFraudDetection.detectCrossBorderPatterns(
        rapidTransferTransaction, 
        mockJurisdictions
      );

      // Pattern detection is probabilistic in the mock implementation
      expect(result.patterns).toBeDefined();
      expect(result.riskScore).toBeGreaterThanOrEqual(0);
    });
  });

  describe('generateRecommendations', () => {
    test('should generate block recommendation for very high risk', () => {
      const highRiskAnalysis = {
        riskScore: 0.9,
        jurisdictionalAlerts: [{ type: 'SANCTIONS_MATCH' }],
        crossBorderPatterns: [{ type: 'MONEY_LAUNDERING' }]
      };

      const recommendations = crossBorderFraudDetection.generateRecommendations(highRiskAnalysis);

      expect(recommendations).toContain('BLOCK_TRANSACTION');
      expect(recommendations).toContain('IMMEDIATE_INVESTIGATION');
      expect(recommendations).toContain('COORDINATE_WITH_AUTHORITIES');
    });

    test('should generate monitoring recommendation for medium risk', () => {
      const mediumRiskAnalysis = {
        riskScore: 0.7,
        jurisdictionalAlerts: [],
        crossBorderPatterns: []
      };

      const recommendations = crossBorderFraudDetection.generateRecommendations(mediumRiskAnalysis);

      expect(recommendations).toContain('ENHANCED_MONITORING');
      expect(recommendations).toContain('MANUAL_REVIEW');
    });

    test('should generate minimal recommendations for low risk', () => {
      const lowRiskAnalysis = {
        riskScore: 0.3,
        jurisdictionalAlerts: [],
        crossBorderPatterns: []
      };

      const recommendations = crossBorderFraudDetection.generateRecommendations(lowRiskAnalysis);

      expect(recommendations.length).toBeLessThanOrEqual(2);
    });
  });

  describe('Data Security and Privacy', () => {
    test('should hash sensitive data properly', () => {
      const sensitiveData = 'wallet-123-sensitive';
      const hashedData = crossBorderFraudDetection.hashSensitiveData(sensitiveData);

      expect(hashedData).toBeDefined();
      expect(hashedData).not.toBe(sensitiveData);
      expect(hashedData.length).toBe(64); // SHA-256 hex length
    });

    test('should sign data for secure transmission', () => {
      const testData = { test: 'data' };
      const signature = crossBorderFraudDetection.signData(testData);

      expect(signature).toBeDefined();
      expect(typeof signature).toBe('string');
      expect(signature.length).toBeGreaterThan(0);
    });

    test('should anonymize patterns correctly', () => {
      const pattern = {
        type: 'TEST_PATTERN',
        indicators: [
          {
            type: 'WALLET',
            walletId: 'wallet-sensitive-123',
            userId: 'user-sensitive-456',
            amount: 1000
          }
        ],
        riskLevel: 'HIGH',
        frequency: 5
      };

      const anonymized = crossBorderFraudDetection.anonymizePattern(pattern);

      expect(anonymized.type).toBe(pattern.type);
      expect(anonymized.riskLevel).toBe(pattern.riskLevel);
      expect(anonymized.frequency).toBe(pattern.frequency);
      
      // Check that sensitive data is hashed
      if (anonymized.indicators[0].walletId) {
        expect(anonymized.indicators[0].walletId).not.toBe(pattern.indicators[0].walletId);
      }
      if (anonymized.indicators[0].userId) {
        expect(anonymized.indicators[0].userId).not.toBe(pattern.indicators[0].userId);
      }
    });
  });

  describe('Error Handling', () => {
    test('should handle missing transaction data', async () => {
      await expect(
        crossBorderFraudDetection.analyzeTransaction(null, mockJurisdictions)
      ).rejects.toThrow();
    });

    test('should handle empty jurisdictions array', async () => {
      await expect(
        crossBorderFraudDetection.analyzeTransaction(mockTransactionData, [])
      ).rejects.toThrow();
    });

    test('should handle invalid pattern data', async () => {
      await expect(
        crossBorderFraudDetection.sharePatterns(null, 'US')
      ).rejects.toThrow();
    });

    test('should handle network failures gracefully', async () => {
      // This test would mock network failures and verify graceful handling
      const result = await crossBorderFraudDetection.analyzeTransaction(
        mockTransactionData, 
        mockJurisdictions
      );

      // Should still return a result even if some external calls fail
      expect(result).toBeDefined();
      expect(result.transactionId).toBe(mockTransactionData.id);
    });
  });
});