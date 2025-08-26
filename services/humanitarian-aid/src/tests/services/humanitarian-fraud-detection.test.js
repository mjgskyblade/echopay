const HumanitarianFraudDetection = require('../../services/humanitarian-fraud-detection');
const AidDistribution = require('../../models/aid-distribution');
const HumanitarianOrganization = require('../../models/humanitarian-organization');

describe('HumanitarianFraudDetection', () => {
  let fraudDetection;
  let organization;
  let distribution;

  beforeEach(() => {
    fraudDetection = new HumanitarianFraudDetection();
    
    organization = new HumanitarianOrganization({
      name: 'Test NGO',
      registrationNumber: 'NGO-123',
      country: 'US',
      organizationType: 'ngo',
      verificationStatus: 'verified',
      transparencyLevel: 'standard',
      publicProfile: {
        operatingRegions: ['Haiti', 'Dominican Republic']
      }
    });

    distribution = new AidDistribution({
      organizationId: organization.id,
      transactionId: 'tx-456',
      recipientId: 'recipient-123',
      amount: 1000,
      currency: 'USD',
      purpose: 'Emergency food assistance',
      category: 'food',
      location: 'Haiti',
      distributionMethod: 'direct'
    });
  });

  describe('analyzeDistribution', () => {
    it('should analyze distribution with low risk score', async () => {
      const analysis = await fraudDetection.analyzeDistribution(distribution, organization, []);

      expect(analysis).toHaveProperty('distributionId', distribution.id);
      expect(analysis).toHaveProperty('organizationId', organization.id);
      expect(analysis).toHaveProperty('riskScore');
      expect(analysis).toHaveProperty('detectedPatterns');
      expect(analysis).toHaveProperty('contextualFactors');
      expect(analysis).toHaveProperty('recommendations');
      expect(analysis).toHaveProperty('analysisTimestamp');

      expect(analysis.riskScore).toBeGreaterThanOrEqual(0);
      expect(analysis.riskScore).toBeLessThanOrEqual(1);
      expect(Array.isArray(analysis.detectedPatterns)).toBe(true);
      expect(Array.isArray(analysis.contextualFactors)).toBe(true);
      expect(Array.isArray(analysis.recommendations)).toBe(true);
    });

    it('should detect duplicate recipient pattern', async () => {
      const historicalData = [
        new AidDistribution({
          id: 'dist-1',
          organizationId: organization.id,
          recipientId: 'recipient-123', // Same recipient
          amount: 500,
          currency: 'USD',
          purpose: 'Previous aid',
          category: 'food',
          location: 'Haiti',
          distributionMethod: 'direct',
          createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) // 10 days ago
        })
      ];

      const analysis = await fraudDetection.analyzeDistribution(distribution, organization, historicalData);

      expect(analysis.riskScore).toBeGreaterThan(0.5);
      expect(analysis.detectedPatterns).toHaveLength(1);
      expect(analysis.detectedPatterns[0].type).toBe('duplicateRecipient');
      expect(analysis.detectedPatterns[0].severity).toBe('high');
    });

    it('should detect location mismatch pattern', async () => {
      distribution.location = 'Syria'; // Not in operating regions

      const analysis = await fraudDetection.analyzeDistribution(distribution, organization, []);

      const locationMismatchPattern = analysis.detectedPatterns.find(p => p.type === 'locationMismatch');
      expect(locationMismatchPattern).toBeDefined();
      expect(locationMismatchPattern.severity).toBe('high');
    });

    it('should detect unverified organization pattern', async () => {
      organization.verificationStatus = 'pending';

      const analysis = await fraudDetection.analyzeDistribution(distribution, organization, []);

      const unverifiedPattern = analysis.detectedPatterns.find(p => p.type === 'unverifiedOrganization');
      expect(unverifiedPattern).toBeDefined();
      expect(unverifiedPattern.severity).toBe('high');
      expect(analysis.riskScore).toBeGreaterThan(0.8);
    });

    it('should detect low transparency score pattern', async () => {
      // Distribution with minimal transparency data will have low score
      const analysis = await fraudDetection.analyzeDistribution(distribution, organization, []);

      const lowTransparencyPattern = analysis.detectedPatterns.find(p => p.type === 'lowTransparencyScore');
      expect(lowTransparencyPattern).toBeDefined();
    });

    it('should detect amount anomaly pattern', async () => {
      const historicalData = [];
      // Create historical data with consistent amounts around 1000
      for (let i = 0; i < 5; i++) {
        historicalData.push(new AidDistribution({
          id: `dist-${i}`,
          organizationId: organization.id,
          amount: 1000 + (Math.random() * 100 - 50), // 950-1050 range
          currency: 'USD',
          category: 'food',
          location: 'Haiti',
          distributionMethod: 'direct',
          createdAt: new Date(Date.now() - (i + 1) * 30 * 24 * 60 * 60 * 1000) // Months ago
        }));
      }

      // Set current distribution to anomalous amount
      distribution.amount = 10000; // Much higher than historical

      const analysis = await fraudDetection.analyzeDistribution(distribution, organization, historicalData);

      const amountAnomalyPattern = analysis.detectedPatterns.find(p => p.type === 'amountAnomaly');
      expect(amountAnomalyPattern).toBeDefined();
    });

    it('should detect rapid successive distributions pattern', async () => {
      const historicalData = [];
      // Create multiple recent distributions in same location
      for (let i = 0; i < 4; i++) {
        historicalData.push(new AidDistribution({
          id: `dist-${i}`,
          organizationId: organization.id,
          location: 'Haiti', // Same location
          amount: 1000,
          currency: 'USD',
          category: 'food',
          distributionMethod: 'direct',
          createdAt: new Date(Date.now() - i * 24 * 60 * 60 * 1000) // Daily distributions
        }));
      }

      const analysis = await fraudDetection.analyzeDistribution(distribution, organization, historicalData);

      const rapidDistributionsPattern = analysis.detectedPatterns.find(p => p.type === 'rapidSuccessiveDistributions');
      expect(rapidDistributionsPattern).toBeDefined();
      expect(rapidDistributionsPattern.severity).toBe('medium');
    });

    it('should apply contextual factors to reduce risk', async () => {
      // Set up conditions that should reduce risk
      distribution.category = 'emergency';
      organization.organizationType = 'un_agency';
      organization.transparencyLevel = 'enhanced';
      distribution.addVerificationData({ thirdPartyVerified: true });

      const analysis = await fraudDetection.analyzeDistribution(distribution, organization, []);

      expect(analysis.contextualFactors.length).toBeGreaterThan(0);
      
      const emergencyFactor = analysis.contextualFactors.find(f => f.type === 'emergencyResponse');
      const establishedOrgFactor = analysis.contextualFactors.find(f => f.type === 'establishedOrganization');
      const transparencyFactor = analysis.contextualFactors.find(f => f.type === 'highTransparencyLevel');
      const verificationFactor = analysis.contextualFactors.find(f => f.type === 'thirdPartyVerification');

      expect(emergencyFactor).toBeDefined();
      expect(establishedOrgFactor).toBeDefined();
      expect(transparencyFactor).toBeDefined();
      expect(verificationFactor).toBeDefined();

      // All factors should have negative impact (reduce risk)
      expect(emergencyFactor.impact).toBeLessThan(0);
      expect(establishedOrgFactor.impact).toBeLessThan(0);
      expect(transparencyFactor.impact).toBeLessThan(0);
      expect(verificationFactor.impact).toBeLessThan(0);
    });

    it('should generate appropriate recommendations based on risk score', async () => {
      // High risk scenario
      organization.verificationStatus = 'pending';
      distribution.location = 'Unknown Location';

      const analysis = await fraudDetection.analyzeDistribution(distribution, organization, []);

      expect(analysis.riskScore).toBeGreaterThan(0.8);
      expect(analysis.recommendations).toContain('HIGH RISK: Block distribution and require manual investigation');
      expect(analysis.recommendations).toContain('Complete organization verification before processing');
    });

    it('should handle analysis errors gracefully', async () => {
      // Force an error by passing invalid data
      const invalidDistribution = null;

      const analysis = await fraudDetection.analyzeDistribution(invalidDistribution, organization, []);

      expect(analysis.riskScore).toBe(0.5); // Default medium risk
      expect(analysis.recommendations).toContain('Manual review required due to analysis error');
    });
  });

  describe('getOrganizationFraudStats', () => {
    it('should generate stats for empty analyses', () => {
      const stats = fraudDetection.getOrganizationFraudStats([]);

      expect(stats.totalAnalyses).toBe(0);
      expect(stats.averageRiskScore).toBe(0);
      expect(stats.highRiskCount).toBe(0);
      expect(stats.mediumRiskCount).toBe(0);
      expect(stats.lowRiskCount).toBe(0);
      expect(stats.commonPatterns).toEqual({});
    });

    it('should generate comprehensive stats', () => {
      const analyses = [
        {
          riskScore: 0.8,
          detectedPatterns: [
            { type: 'duplicateRecipient' },
            { type: 'locationMismatch' }
          ]
        },
        {
          riskScore: 0.4,
          detectedPatterns: [
            { type: 'lowTransparencyScore' }
          ]
        },
        {
          riskScore: 0.2,
          detectedPatterns: []
        }
      ];

      const stats = fraudDetection.getOrganizationFraudStats(analyses);

      expect(stats.totalAnalyses).toBe(3);
      expect(stats.averageRiskScore).toBeCloseTo(0.47, 1);
      expect(stats.highRiskCount).toBe(1); // riskScore > 0.6
      expect(stats.mediumRiskCount).toBe(1); // 0.3 < riskScore <= 0.6
      expect(stats.lowRiskCount).toBe(1); // riskScore <= 0.3
      expect(stats.commonPatterns.duplicateRecipient).toBe(1);
      expect(stats.commonPatterns.locationMismatch).toBe(1);
      expect(stats.commonPatterns.lowTransparencyScore).toBe(1);
    });
  });

  describe('isWithinTimeWindow', () => {
    it('should correctly identify dates within time window', () => {
      const now = new Date();
      const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
      const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);

      expect(fraudDetection.isWithinTimeWindow(fiveDaysAgo, 7)).toBe(true);
      expect(fraudDetection.isWithinTimeWindow(tenDaysAgo, 7)).toBe(false);
      expect(fraudDetection.isWithinTimeWindow(tenDaysAgo, 15)).toBe(true);
    });
  });

  describe('fraud pattern detection methods', () => {
    let analysis;

    beforeEach(() => {
      analysis = {
        distributionId: distribution.id,
        organizationId: organization.id,
        riskScore: 0,
        detectedPatterns: [],
        contextualFactors: [],
        recommendations: [],
        analysisTimestamp: new Date()
      };
    });

    it('should check duplicate recipient correctly', async () => {
      const historicalData = [
        new AidDistribution({
          id: 'dist-1',
          recipientId: 'recipient-123',
          createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) // 5 days ago
        })
      ];

      await fraudDetection.checkDuplicateRecipient(distribution, historicalData, analysis);

      expect(analysis.detectedPatterns).toHaveLength(1);
      expect(analysis.detectedPatterns[0].type).toBe('duplicateRecipient');
      expect(analysis.riskScore).toBeGreaterThan(0);
    });

    it('should check organization verification correctly', async () => {
      organization.verificationStatus = 'pending';

      await fraudDetection.checkOrganizationVerification(organization, analysis);

      expect(analysis.detectedPatterns).toHaveLength(1);
      expect(analysis.detectedPatterns[0].type).toBe('unverifiedOrganization');
      expect(analysis.riskScore).toBeGreaterThan(0.8);
    });

    it('should check transparency score correctly', async () => {
      // Distribution with minimal data will have low transparency score
      await fraudDetection.checkTransparencyScore(distribution, analysis);

      expect(analysis.detectedPatterns).toHaveLength(1);
      expect(analysis.detectedPatterns[0].type).toBe('lowTransparencyScore');
    });
  });
});