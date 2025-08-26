const TransparencyService = require('../../services/transparency-service');
const AidDistribution = require('../../models/aid-distribution');

describe('TransparencyService', () => {
  let transparencyService;

  beforeEach(() => {
    transparencyService = new TransparencyService();
  });

  describe('validateTransparencyRequirements', () => {
    let distribution;

    beforeEach(() => {
      distribution = new AidDistribution({
        organizationId: 'org-123',
        transactionId: 'tx-456',
        amount: 1000,
        currency: 'USD',
        purpose: 'Emergency food assistance',
        category: 'food',
        location: 'Haiti',
        distributionMethod: 'direct'
      });
    });

    it('should validate standard transparency requirements', () => {
      const result = transparencyService.validateTransparencyRequirements(distribution, 'standard');

      expect(result.isValid).toBe(true);
      expect(result.missingFields).toHaveLength(0);
      expect(result.transparencyLevel).toBe('standard');
    });

    it('should identify missing fields for enhanced transparency', () => {
      const result = transparencyService.validateTransparencyRequirements(distribution, 'enhanced');

      expect(result.isValid).toBe(false);
      expect(result.missingFields).toContain('beneficiaryCount');
      expect(result.transparencyLevel).toBe('enhanced');
    });

    it('should validate enhanced transparency with complete data', () => {
      distribution.addTransparencyData({
        beneficiaryCount: 100,
        photos: ['photo1.jpg']
      });

      const result = transparencyService.validateTransparencyRequirements(distribution, 'enhanced');

      expect(result.isValid).toBe(true);
      expect(result.missingFields).toHaveLength(0);
    });

    it('should identify missing fields for full public transparency', () => {
      const result = transparencyService.validateTransparencyRequirements(distribution, 'full_public');

      expect(result.isValid).toBe(false);
      expect(result.missingFields).toContain('beneficiaryCount');
      expect(result.missingFields).toContain('gpsCoordinates');
    });

    it('should validate full public transparency with complete data', () => {
      distribution.addTransparencyData({
        beneficiaryCount: 100,
        gpsCoordinates: { lat: 18.5944, lng: -72.3074 }
      });

      const result = transparencyService.validateTransparencyRequirements(distribution, 'full_public');

      expect(result.isValid).toBe(true);
      expect(result.missingFields).toHaveLength(0);
    });

    it('should throw error for invalid transparency level', () => {
      expect(() => {
        transparencyService.validateTransparencyRequirements(distribution, 'invalid');
      }).toThrow('Invalid transparency level: invalid');
    });
  });

  describe('generatePublicReport', () => {
    let distribution;

    beforeEach(() => {
      distribution = new AidDistribution({
        organizationId: 'org-123',
        transactionId: 'tx-456',
        amount: 1000,
        currency: 'USD',
        purpose: 'Emergency food assistance',
        category: 'food',
        location: 'Haiti',
        distributionMethod: 'direct'
      });
    });

    it('should generate standard public report', () => {
      const report = transparencyService.generatePublicReport(distribution, 'standard');

      expect(report).toHaveProperty('id');
      expect(report).toHaveProperty('organizationId');
      expect(report).toHaveProperty('purpose');
      expect(report).toHaveProperty('category');
      expect(report).toHaveProperty('amount');
      expect(report).toHaveProperty('location');
      expect(report).toHaveProperty('status');
      expect(report).toHaveProperty('transparencyScore');
      expect(report).toHaveProperty('createdAt');
    });

    it('should generate enhanced public report', () => {
      distribution.addTransparencyData({
        beneficiaryCount: 100,
        photos: ['photo1.jpg']
      });

      const report = transparencyService.generatePublicReport(distribution, 'enhanced');

      expect(report).toHaveProperty('purpose');
      expect(report).toHaveProperty('category');
      expect(report).toHaveProperty('amount');
      expect(report).toHaveProperty('location');
      expect(report).toHaveProperty('beneficiaryCount');
      expect(report).toHaveProperty('photos');
    });

    it('should generate full public report', () => {
      distribution.addTransparencyData({
        beneficiaryCount: 100,
        gpsCoordinates: { lat: 18.5944, lng: -72.3074 }
      });

      const report = transparencyService.generatePublicReport(distribution, 'full_public');

      // Should include all public fields from toPublicJSON
      expect(report).toHaveProperty('id');
      expect(report).toHaveProperty('organizationId');
      expect(report).toHaveProperty('amount');
      expect(report).toHaveProperty('transparencyData');
      expect(report.transparencyData).toHaveProperty('gpsCoordinates');
    });

    it('should throw error for invalid transparency level', () => {
      expect(() => {
        transparencyService.generatePublicReport(distribution, 'invalid');
      }).toThrow('Invalid transparency level: invalid');
    });
  });

  describe('generateOrganizationTransparencyMetrics', () => {
    let distributions;

    beforeEach(() => {
      distributions = [
        new AidDistribution({
          organizationId: 'org-123',
          transactionId: 'tx-1',
          amount: 1000,
          currency: 'USD',
          purpose: 'Food assistance',
          category: 'food',
          location: 'Haiti',
          distributionMethod: 'direct',
          status: 'completed'
        }),
        new AidDistribution({
          organizationId: 'org-123',
          transactionId: 'tx-2',
          amount: 2000,
          currency: 'USD',
          purpose: 'Medical supplies',
          category: 'medical',
          location: 'Jordan',
          distributionMethod: 'voucher',
          status: 'pending'
        })
      ];

      // Add transparency data to make one fully transparent
      distributions[0].addTransparencyData({
        beneficiaryCount: 100,
        photos: ['photo1.jpg'],
        gpsCoordinates: { lat: 18.5944, lng: -72.3074 }
      });
      distributions[0].addImpactMetrics({ peopleHelped: 100 });
    });

    it('should generate metrics for empty distribution list', () => {
      const metrics = transparencyService.generateOrganizationTransparencyMetrics([]);

      expect(metrics.totalDistributions).toBe(0);
      expect(metrics.averageTransparencyScore).toBe(0);
      expect(metrics.fullyTransparentCount).toBe(0);
    });

    it('should generate comprehensive metrics', () => {
      const metrics = transparencyService.generateOrganizationTransparencyMetrics(distributions);

      expect(metrics.totalDistributions).toBe(2);
      expect(metrics.averageTransparencyScore).toBeGreaterThan(0);
      expect(metrics.fullyTransparentCount).toBe(1);
      expect(metrics.transparencyRate).toBe(50); // 1 out of 2 is fully transparent
      expect(metrics.categoryBreakdown).toHaveProperty('food', 1);
      expect(metrics.categoryBreakdown).toHaveProperty('medical', 1);
      expect(metrics.locationBreakdown).toHaveProperty('Haiti', 1);
      expect(metrics.locationBreakdown).toHaveProperty('Jordan', 1);
      expect(metrics.statusBreakdown).toHaveProperty('completed', 1);
      expect(metrics.statusBreakdown).toHaveProperty('pending', 1);
    });
  });

  describe('generateDonationTrackingChain', () => {
    let distributions;

    beforeEach(() => {
      distributions = [
        new AidDistribution({
          organizationId: 'org-123',
          campaignId: 'campaign-1',
          transactionId: 'tx-1',
          amount: 1000,
          currency: 'USD',
          purpose: 'Food assistance',
          category: 'food',
          location: 'Haiti',
          distributionMethod: 'direct'
        }),
        new AidDistribution({
          organizationId: 'org-123',
          campaignId: 'campaign-1',
          transactionId: 'tx-2',
          amount: 500,
          currency: 'USD',
          purpose: 'Medical supplies',
          category: 'medical',
          location: 'Haiti',
          distributionMethod: 'direct'
        }),
        new AidDistribution({
          organizationId: 'org-123',
          campaignId: 'campaign-2',
          transactionId: 'tx-3',
          amount: 2000,
          currency: 'EUR',
          purpose: 'Shelter materials',
          category: 'shelter',
          location: 'Jordan',
          distributionMethod: 'voucher'
        })
      ];
    });

    it('should generate tracking chain for multiple campaigns', () => {
      const chain = transparencyService.generateDonationTrackingChain(distributions);

      expect(chain).toHaveLength(2); // Two campaigns
      
      const campaign1 = chain.find(c => c.campaignId === 'campaign-1');
      expect(campaign1).toBeDefined();
      expect(campaign1.totalAmount).toBe(1500); // 1000 + 500
      expect(campaign1.distributionCount).toBe(2);
      expect(campaign1.currency).toBe('USD');
      expect(campaign1.distributions).toHaveLength(2);

      const campaign2 = chain.find(c => c.campaignId === 'campaign-2');
      expect(campaign2).toBeDefined();
      expect(campaign2.totalAmount).toBe(2000);
      expect(campaign2.distributionCount).toBe(1);
      expect(campaign2.currency).toBe('EUR');
    });

    it('should sort distributions by timestamp', () => {
      // Modify timestamps to test sorting
      distributions[1].createdAt = new Date(Date.now() - 1000); // Earlier
      distributions[0].createdAt = new Date(); // Later

      const chain = transparencyService.generateDonationTrackingChain(distributions);
      const campaign1 = chain.find(c => c.campaignId === 'campaign-1');

      expect(campaign1.distributions[0].id).toBe(distributions[1].id); // Earlier one first
      expect(campaign1.distributions[1].id).toBe(distributions[0].id); // Later one second
    });

    it('should handle distributions without campaign ID', () => {
      const directDistribution = new AidDistribution({
        organizationId: 'org-123',
        transactionId: 'tx-4',
        amount: 300,
        currency: 'USD',
        purpose: 'Direct aid',
        category: 'other',
        location: 'Local',
        distributionMethod: 'cash'
      });

      const chain = transparencyService.generateDonationTrackingChain([directDistribution]);

      expect(chain).toHaveLength(1);
      expect(chain[0].campaignId).toBe('direct');
      expect(chain[0].totalAmount).toBe(300);
    });
  });

  describe('validateTransparencyDataIntegrity', () => {
    let distribution;

    beforeEach(() => {
      distribution = new AidDistribution({
        organizationId: 'org-123',
        transactionId: 'tx-456',
        amount: 1000,
        currency: 'USD',
        purpose: 'Emergency food assistance for displaced families',
        category: 'food',
        location: 'Haiti',
        distributionMethod: 'direct'
      });
    });

    it('should validate valid transparency data', () => {
      distribution.addTransparencyData({
        beneficiaryCount: 100,
        gpsCoordinates: { lat: 18.5944, lng: -72.3074 }
      });

      const result = transparencyService.validateTransparencyDataIntegrity(distribution);

      expect(result.isValid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should identify invalid beneficiary count', () => {
      distribution.addTransparencyData({
        beneficiaryCount: -5
      });

      const result = transparencyService.validateTransparencyDataIntegrity(distribution);

      expect(result.isValid).toBe(false);
      expect(result.issues).toContain('Beneficiary count must be positive');
    });

    it('should identify invalid GPS coordinates', () => {
      distribution.addTransparencyData({
        gpsCoordinates: { lat: 200, lng: -200 } // Invalid coordinates
      });

      const result = transparencyService.validateTransparencyDataIntegrity(distribution);

      expect(result.isValid).toBe(false);
      expect(result.issues).toContain('Invalid GPS coordinates');
    });

    it('should identify invalid amount', () => {
      distribution.amount = -100;

      const result = transparencyService.validateTransparencyDataIntegrity(distribution);

      expect(result.isValid).toBe(false);
      expect(result.issues).toContain('Distribution amount must be positive');
    });

    it('should identify short purpose description', () => {
      distribution.purpose = 'Short';

      const result = transparencyService.validateTransparencyDataIntegrity(distribution);

      expect(result.isValid).toBe(false);
      expect(result.issues).toContain('Purpose description should be at least 10 characters');
    });
  });

  describe('generateAuditTrail', () => {
    let distribution;

    beforeEach(() => {
      distribution = new AidDistribution({
        organizationId: 'org-123',
        transactionId: 'tx-456',
        amount: 1000,
        currency: 'USD',
        purpose: 'Emergency food assistance',
        category: 'food',
        location: 'Haiti',
        distributionMethod: 'direct'
      });
    });

    it('should generate basic audit trail', () => {
      const auditTrail = transparencyService.generateAuditTrail(distribution);

      expect(auditTrail).toHaveProperty('distributionId', distribution.id);
      expect(auditTrail).toHaveProperty('organizationId', distribution.organizationId);
      expect(auditTrail).toHaveProperty('transparencyScore');
      expect(auditTrail).toHaveProperty('auditTimestamp');
      expect(auditTrail).toHaveProperty('dataIntegrity');
      expect(auditTrail).toHaveProperty('transparencyElements');

      expect(auditTrail.transparencyElements.hasBasicInfo).toBe(true);
      expect(auditTrail.transparencyElements.hasLocationData).toBe(true);
      expect(auditTrail.transparencyElements.hasImpactMetrics).toBe(false);
      expect(auditTrail.transparencyElements.hasVerificationData).toBe(false);
      expect(auditTrail.transparencyElements.hasPhotos).toBe(false);
      expect(auditTrail.transparencyElements.hasGpsCoordinates).toBe(false);
    });

    it('should generate comprehensive audit trail with full data', () => {
      distribution.addTransparencyData({
        photos: ['photo1.jpg'],
        gpsCoordinates: { lat: 18.5944, lng: -72.3074 }
      });
      distribution.addImpactMetrics({ peopleHelped: 100 });
      distribution.addVerificationData({ thirdPartyVerified: true });

      const auditTrail = transparencyService.generateAuditTrail(distribution);

      expect(auditTrail.transparencyElements.hasImpactMetrics).toBe(true);
      expect(auditTrail.transparencyElements.hasVerificationData).toBe(true);
      expect(auditTrail.transparencyElements.hasPhotos).toBe(true);
      expect(auditTrail.transparencyElements.hasGpsCoordinates).toBe(true);
    });
  });
});