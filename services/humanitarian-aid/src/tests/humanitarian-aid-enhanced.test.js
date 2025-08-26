const TransparencyService = require('../services/transparency-service');
const HumanitarianFraudDetection = require('../services/humanitarian-fraud-detection');
const DonationTrackingService = require('../services/donation-tracking-service');
const AidDistribution = require('../models/aid-distribution');
const HumanitarianOrganization = require('../models/humanitarian-organization');

describe('Enhanced Humanitarian Aid Features', () => {
  let transparencyService;
  let fraudDetection;
  let donationTracking;
  let organization;
  let distribution;

  beforeEach(() => {
    transparencyService = new TransparencyService();
    fraudDetection = new HumanitarianFraudDetection();
    donationTracking = new DonationTrackingService();
    
    organization = new HumanitarianOrganization({
      name: 'Global Aid Foundation',
      registrationNumber: 'GAF-2024-001',
      country: 'US',
      organizationType: 'ngo',
      verificationStatus: 'verified',
      transparencyLevel: 'enhanced',
      publicProfile: {
        operatingRegions: ['Haiti', 'Syria', 'Bangladesh'],
        specializations: ['emergency_response', 'food_security']
      }
    });

    distribution = new AidDistribution({
      organizationId: organization.id,
      transactionId: 'tx-humanitarian-001',
      donorId: 'donor-123',
      recipientId: 'recipient-456',
      amount: 5000,
      currency: 'USD',
      purpose: 'Emergency food assistance for earthquake survivors',
      category: 'emergency',
      location: 'Port-au-Prince, Haiti',
      distributionMethod: 'direct'
    });

    distribution.addTransparencyData({
      beneficiaryCount: 250,
      urgencyLevel: 'high',
      gpsCoordinates: { lat: 18.5944, lng: -72.3074 },
      photos: ['distribution1.jpg', 'distribution2.jpg'],
      accessibilityFeatures: ['wheelchair_accessible', 'sign_language_interpreter']
    });

    distribution.addImpactMetrics({
      peopleHelped: 250,
      familiesSupported: 50,
      daysOfFoodProvided: 7
    });

    distribution.addVerificationData({
      thirdPartyVerified: true,
      verifierId: 'local-partner-001',
      verificationDate: new Date()
    });
  });

  describe('Enhanced Transparency Features', () => {
    describe('generateRealTimeTransparencyDashboard', () => {
      it('should generate comprehensive real-time dashboard', () => {
        const distributions = [distribution];
        const dashboard = transparencyService.generateRealTimeTransparencyDashboard(
          distributions, 
          organization
        );

        expect(dashboard).toHaveProperty('organizationId', organization.id);
        expect(dashboard).toHaveProperty('organizationName', organization.name);
        expect(dashboard).toHaveProperty('lastUpdated');
        expect(dashboard).toHaveProperty('realTimeMetrics');
        expect(dashboard).toHaveProperty('liveUpdates');
        expect(dashboard).toHaveProperty('transparencyBreakdown');
        expect(dashboard).toHaveProperty('geographicDistribution');
        expect(dashboard).toHaveProperty('impactVisualization');
        expect(dashboard).toHaveProperty('complianceStatus');

        // Check real-time metrics
        expect(dashboard.realTimeMetrics.totalDistributions).toBe(1);
        expect(dashboard.realTimeMetrics.totalFundsDistributed).toBe(5000);
        expect(dashboard.realTimeMetrics.beneficiariesReached).toBe(250);
        expect(dashboard.realTimeMetrics.averageTransparencyScore).toBeGreaterThan(0);
        expect(dashboard.realTimeMetrics.verificationRate).toBeGreaterThan(0);

        // Check transparency breakdown
        expect(dashboard.transparencyBreakdown).toHaveProperty('fullyTransparent');
        expect(dashboard.transparencyBreakdown).toHaveProperty('partiallyTransparent');
        expect(dashboard.transparencyBreakdown).toHaveProperty('lowTransparency');

        // Check geographic distribution
        expect(dashboard.geographicDistribution).toHaveProperty('Port-au-Prince, Haiti');
        expect(dashboard.geographicDistribution['Port-au-Prince, Haiti'].count).toBe(1);
        expect(dashboard.geographicDistribution['Port-au-Prince, Haiti'].totalAmount).toBe(5000);

        // Check compliance status
        expect(dashboard.complianceStatus).toHaveProperty('overallScore');
        expect(dashboard.complianceStatus).toHaveProperty('organizationCompliance');
        expect(dashboard.complianceStatus).toHaveProperty('distributionCompliance');
        expect(dashboard.complianceStatus).toHaveProperty('regulatoryCompliance');
      });

      it('should handle multiple distributions across different locations', () => {
        const distribution2 = new AidDistribution({
          organizationId: organization.id,
          transactionId: 'tx-humanitarian-002',
          amount: 3000,
          currency: 'USD',
          purpose: 'Medical supplies for refugee camp',
          category: 'medical',
          location: 'Zaatari, Jordan',
          distributionMethod: 'voucher'
        });

        distribution2.addTransparencyData({
          beneficiaryCount: 150,
          urgencyLevel: 'medium'
        });

        const distributions = [distribution, distribution2];
        const dashboard = transparencyService.generateRealTimeTransparencyDashboard(
          distributions, 
          organization
        );

        expect(dashboard.realTimeMetrics.totalDistributions).toBe(2);
        expect(dashboard.realTimeMetrics.totalFundsDistributed).toBe(8000);
        expect(dashboard.realTimeMetrics.beneficiariesReached).toBe(400);

        expect(dashboard.geographicDistribution).toHaveProperty('Port-au-Prince, Haiti');
        expect(dashboard.geographicDistribution).toHaveProperty('Zaatari, Jordan');
      });

      it('should calculate emergency distributions correctly', () => {
        const distributions = [distribution];
        const dashboard = transparencyService.generateRealTimeTransparencyDashboard(
          distributions, 
          organization
        );

        expect(dashboard.liveUpdates.emergencyDistributions).toHaveLength(1);
        expect(dashboard.liveUpdates.emergencyDistributions[0]).toHaveProperty('urgencyLevel', 'high');
      });
    });

    describe('generateEnhancedTransparencyReport', () => {
      it('should generate comprehensive transparency report', () => {
        const distributions = [distribution];
        const report = transparencyService.generateEnhancedTransparencyReport(
          distributions, 
          organization
        );

        expect(report).toHaveProperty('organizationId', organization.id);
        expect(report).toHaveProperty('organizationName', organization.name);
        expect(report).toHaveProperty('reportTimestamp');
        expect(report).toHaveProperty('reportingPeriod');
        expect(report).toHaveProperty('transparencyMetrics');
        expect(report).toHaveProperty('impactSummary');
        expect(report).toHaveProperty('verificationStatus');
        expect(report).toHaveProperty('complianceScore');
        expect(report).toHaveProperty('publicAccountability');
        expect(report).toHaveProperty('auditTrails');

        // Check impact summary
        expect(report.impactSummary.totalDistributions).toBe(1);
        expect(report.impactSummary.completedDistributions).toBeGreaterThanOrEqual(0);
        expect(report.impactSummary).toHaveProperty('impactCategories');
        expect(report.impactSummary).toHaveProperty('timeToCompletion');

        // Check public accountability
        expect(report.publicAccountability.totalFundsDistributed).toBe(5000);
        expect(report.publicAccountability.beneficiariesReached).toBe(250);
        expect(report.publicAccountability).toHaveProperty('geographicCoverage');
        expect(report.publicAccountability).toHaveProperty('categoryBreakdown');

        // Check compliance score
        expect(report.complianceScore).toBeGreaterThanOrEqual(0);
        expect(report.complianceScore).toBeLessThanOrEqual(100);
      });
    });
  });

  describe('Context-Aware Fraud Detection', () => {
    describe('analyzeHumanitarianContext', () => {
      it('should analyze emergency response context', async () => {
        const contextData = {
          disasterType: 'earthquake',
          responseTimeHours: 12,
          fundingSource: 'emergency_fund'
        };

        const contextAnalysis = await fraudDetection.analyzeHumanitarianContext(
          distribution, 
          organization, 
          contextData
        );

        expect(contextAnalysis).toHaveProperty('distributionId', distribution.id);
        expect(contextAnalysis).toHaveProperty('contextType', 'humanitarian_aid');
        expect(contextAnalysis).toHaveProperty('contextFactors');
        expect(contextAnalysis).toHaveProperty('riskAdjustments');
        expect(contextAnalysis).toHaveProperty('specialConsiderations');
        expect(contextAnalysis).toHaveProperty('recommendedActions');

        // Should detect emergency response context
        const emergencyFactor = contextAnalysis.contextFactors.find(
          f => f.type === 'emergency_response'
        );
        expect(emergencyFactor).toBeDefined();
        expect(emergencyFactor.impact).toBe('reduce_fraud_scrutiny');

        // Should have risk adjustment for emergency
        const emergencyAdjustment = contextAnalysis.riskAdjustments.find(
          a => a.type === 'emergency_tolerance'
        );
        expect(emergencyAdjustment).toBeDefined();
        expect(emergencyAdjustment.adjustment).toBeLessThan(0); // Should reduce risk

        // Should have emergency-specific considerations
        expect(contextAnalysis.specialConsiderations).toContain(
          'Emergency response - prioritize speed over extensive verification'
        );
      });

      it('should analyze vulnerable population context', async () => {
        const contextData = {
          populationType: 'refugees',
          specialNeeds: 'gbv_survivors'
        };

        distribution.purpose = 'Support for refugee children and elderly';

        const contextAnalysis = await fraudDetection.analyzeHumanitarianContext(
          distribution, 
          organization, 
          contextData
        );

        // Should detect vulnerable population context
        const vulnerableFactor = contextAnalysis.contextFactors.find(
          f => f.type === 'vulnerable_population'
        );
        expect(vulnerableFactor).toBeDefined();
        expect(vulnerableFactor.impact).toBe('enhanced_protection_required');

        // Should have specific recommendations for vulnerable populations
        expect(contextAnalysis.recommendedActions).toContain(
          'Verify refugee status through UNHCR or local authorities'
        );
        expect(contextAnalysis.recommendedActions).toContain(
          'Implement child protection protocols and guardian verification'
        );
      });

      it('should analyze cross-border operations context', async () => {
        organization.organizationType = 'un_agency';
        distribution.location = 'Syrian border, Turkey';

        const contextAnalysis = await fraudDetection.analyzeHumanitarianContext(
          distribution, 
          organization
        );

        // Should detect cross-border context
        const crossBorderFactor = contextAnalysis.contextFactors.find(
          f => f.type === 'cross_border_operations'
        );
        expect(crossBorderFactor).toBeDefined();
        expect(crossBorderFactor.impact).toBe('enhanced_compliance_required');

        // Should have cross-border specific recommendations
        expect(contextAnalysis.recommendedActions).toContain(
          'Coordinate with local authorities and international partners'
        );
      });

      it('should analyze seasonal context', async () => {
        const contextData = {
          season: 'hurricane'
        };

        distribution.location = 'Port-au-Prince, Haiti'; // Hurricane-prone region

        const contextAnalysis = await fraudDetection.analyzeHumanitarianContext(
          distribution, 
          organization, 
          contextData
        );

        // Should detect seasonal context
        const seasonalFactor = contextAnalysis.contextFactors.find(
          f => f.type === 'seasonal_environmental'
        );
        expect(seasonalFactor).toBeDefined();
        expect(seasonalFactor.impact).toBe('context_sensitive_monitoring');
      });
    });

    describe('generateHumanitarianFraudPreventionGuidelines', () => {
      it('should generate comprehensive prevention guidelines', () => {
        const guidelines = fraudDetection.generateHumanitarianFraudPreventionGuidelines(
          organization
        );

        expect(guidelines).toHaveProperty('organizationId', organization.id);
        expect(guidelines).toHaveProperty('organizationType', organization.organizationType);
        expect(guidelines).toHaveProperty('riskProfile');
        expect(guidelines).toHaveProperty('preventionStrategies');
        expect(guidelines).toHaveProperty('monitoringRecommendations');
        expect(guidelines).toHaveProperty('complianceRequirements');
        expect(guidelines).toHaveProperty('emergencyProtocols');
        expect(guidelines).toHaveProperty('vulnerablePopulationProtections');

        // Check risk profile
        expect(guidelines.riskProfile).toHaveProperty('overallRisk');
        expect(guidelines.riskProfile).toHaveProperty('riskFactors');
        expect(guidelines.riskProfile).toHaveProperty('mitigatingFactors');
        expect(guidelines.riskProfile).toHaveProperty('riskScore');

        // Check prevention strategies
        expect(guidelines.preventionStrategies).toContain(
          'Implement robust beneficiary registration and verification systems'
        );
        expect(guidelines.preventionStrategies).toContain(
          'Create feedback mechanisms for beneficiaries to report issues'
        );

        // Check emergency protocols
        expect(guidelines.emergencyProtocols).toContain(
          'Establish rapid response procedures for emergency distributions'
        );
        expect(guidelines.emergencyProtocols).toContain(
          'Develop simplified verification procedures for life-saving interventions'
        );

        // Check vulnerable population protections
        expect(guidelines.vulnerablePopulationProtections).toContain(
          'Implement age, gender, and diversity-sensitive distribution methods'
        );
        expect(guidelines.vulnerablePopulationProtections).toContain(
          'Implement child protection protocols for distributions involving minors'
        );
      });

      it('should adjust guidelines based on organization risk profile', () => {
        // Create high-risk organization
        const highRiskOrg = new HumanitarianOrganization({
          name: 'New Aid Organization',
          registrationNumber: 'NAO-2024-001',
          country: 'Unknown',
          organizationType: 'charity',
          verificationStatus: 'pending',
          transparencyLevel: 'standard'
        });

        const guidelines = fraudDetection.generateHumanitarianFraudPreventionGuidelines(
          highRiskOrg
        );

        expect(guidelines.riskProfile.overallRisk).toBe('high');
        
        // Should have additional high-risk strategies
        expect(guidelines.preventionStrategies).toContain(
          'Require third-party verification for all distributions above threshold amounts'
        );
        expect(guidelines.preventionStrategies).toContain(
          'Implement real-time monitoring with GPS tracking and photo verification'
        );
      });
    });
  });

  describe('Enhanced Donation Tracking', () => {
    let trackingChain;

    beforeEach(async () => {
      trackingChain = await donationTracking.createTrackingChain({
        donorId: 'donor-123',
        amount: 10000,
        currency: 'USD',
        purpose: 'Emergency humanitarian response',
        organizationId: organization.id,
        transactionId: 'tx-tracking-001'
      });

      await donationTracking.addDistributionStage(trackingChain.id, distribution);
      
      await donationTracking.addVerificationStage(trackingChain.id, {
        verifierId: 'verifier-001',
        verifierType: 'local_partner',
        verifierName: 'Local NGO Partner',
        location: 'Port-au-Prince, Haiti',
        distributionConfirmed: true,
        beneficiariesReached: 250,
        impactAssessment: 'Positive impact on food security',
        photos: ['verification1.jpg'],
        gpsCoordinates: { lat: 18.5944, lng: -72.3074 }
      });
    });

    describe('generateHumanitarianImpactAssessment', () => {
      it('should generate comprehensive impact assessment', async () => {
        const assessment = await donationTracking.generateHumanitarianImpactAssessment(
          trackingChain.id
        );

        expect(assessment).toHaveProperty('trackingChainId', trackingChain.id);
        expect(assessment).toHaveProperty('assessmentTimestamp');
        expect(assessment).toHaveProperty('overallImpactScore');
        expect(assessment).toHaveProperty('impactDimensions');
        expect(assessment).toHaveProperty('beneficiaryOutcomes');
        expect(assessment).toHaveProperty('systemicImpact');
        expect(assessment).toHaveProperty('lessonsLearned');
        expect(assessment).toHaveProperty('recommendations');
        expect(assessment).toHaveProperty('comparativeBenchmarks');

        // Check impact dimensions
        expect(assessment.impactDimensions).toHaveProperty('reach');
        expect(assessment.impactDimensions).toHaveProperty('effectiveness');
        expect(assessment.impactDimensions).toHaveProperty('efficiency');
        expect(assessment.impactDimensions).toHaveProperty('sustainability');
        expect(assessment.impactDimensions).toHaveProperty('accountability');

        // Each dimension should have score and metrics
        Object.values(assessment.impactDimensions).forEach(dimension => {
          expect(dimension).toHaveProperty('score');
          expect(dimension).toHaveProperty('metrics');
          expect(dimension).toHaveProperty('strengths');
          expect(dimension).toHaveProperty('challenges');
          expect(dimension.score).toBeGreaterThanOrEqual(0);
          expect(dimension.score).toBeLessThanOrEqual(100);
        });

        // Check beneficiary outcomes
        expect(assessment.beneficiaryOutcomes).toHaveProperty('immediateOutcomes');
        expect(assessment.beneficiaryOutcomes).toHaveProperty('intermediateOutcomes');
        expect(assessment.beneficiaryOutcomes).toHaveProperty('longTermOutcomes');

        // Check lessons learned
        expect(assessment.lessonsLearned).toHaveProperty('successes');
        expect(assessment.lessonsLearned).toHaveProperty('challenges');
        expect(assessment.lessonsLearned).toHaveProperty('innovations');
        expect(assessment.lessonsLearned).toHaveProperty('recommendations');

        // Check comparative benchmarks
        expect(assessment.comparativeBenchmarks).toHaveProperty('sectorAverages');
        expect(assessment.comparativeBenchmarks).toHaveProperty('peerComparison');
        expect(assessment.comparativeBenchmarks).toHaveProperty('bestPractices');
      });

      it('should identify strengths and challenges correctly', async () => {
        const assessment = await donationTracking.generateHumanitarianImpactAssessment(
          trackingChain.id
        );

        // Should identify GPS verification as innovation
        expect(assessment.lessonsLearned.innovations).toContain(
          'GPS verification enhanced transparency and accountability'
        );

        // Should identify photo verification as innovation
        expect(assessment.lessonsLearned.innovations).toContain(
          'Photo documentation improved verification quality'
        );

        // Should have recommendations based on performance
        expect(assessment.recommendations).toBeInstanceOf(Array);
        expect(assessment.recommendations.length).toBeGreaterThan(0);
        
        assessment.recommendations.forEach(rec => {
          expect(rec).toHaveProperty('category');
          expect(rec).toHaveProperty('priority');
          expect(rec).toHaveProperty('recommendation');
          expect(rec).toHaveProperty('expectedImpact');
        });
      });
    });

    describe('generateEndToEndVisibilityReport', () => {
      it('should generate comprehensive visibility report', async () => {
        const report = await donationTracking.generateEndToEndVisibilityReport(
          trackingChain.id
        );

        expect(report).toHaveProperty('trackingChainId', trackingChain.id);
        expect(report).toHaveProperty('reportTimestamp');
        expect(report).toHaveProperty('donationJourney');
        expect(report).toHaveProperty('transparencyMetrics');
        expect(report).toHaveProperty('stakeholderVisibility');
        expect(report).toHaveProperty('riskAssessment');

        // Check donation journey
        expect(report.donationJourney).toHaveProperty('initialDonation');
        expect(report.donationJourney).toHaveProperty('distributionPath');
        expect(report.donationJourney).toHaveProperty('verificationTrail');
        expect(report.donationJourney).toHaveProperty('impactRealization');

        // Check transparency metrics
        expect(report.transparencyMetrics).toHaveProperty('overallTransparencyScore');
        expect(report.transparencyMetrics).toHaveProperty('dataCompleteness');
        expect(report.transparencyMetrics).toHaveProperty('verificationCoverage');
        expect(report.transparencyMetrics).toHaveProperty('auditTrailIntegrity');

        // Check stakeholder visibility
        expect(report.stakeholderVisibility).toHaveProperty('donorView');
        expect(report.stakeholderVisibility).toHaveProperty('recipientView');
        expect(report.stakeholderVisibility).toHaveProperty('publicView');
        expect(report.stakeholderVisibility).toHaveProperty('regulatorView');

        // Check risk assessment
        expect(report.riskAssessment).toHaveProperty('fraudRiskScore');
        expect(report.riskAssessment).toHaveProperty('complianceScore');
        expect(report.riskAssessment).toHaveProperty('reputationRisk');
      });

      it('should provide different visibility levels for different stakeholders', async () => {
        const report = await donationTracking.generateEndToEndVisibilityReport(
          trackingChain.id
        );

        // Donor view should have full visibility
        expect(report.stakeholderVisibility.donorView.transparencyLevel).toBe('full');
        expect(report.stakeholderVisibility.donorView).toHaveProperty('fundUtilization');
        expect(report.stakeholderVisibility.donorView).toHaveProperty('beneficiaryReach');

        // Public view should have summary information
        expect(report.stakeholderVisibility.publicView.transparencyLevel).toBe('public_summary');
        expect(report.stakeholderVisibility.publicView).toHaveProperty('donationSummary');
        expect(report.stakeholderVisibility.publicView).toHaveProperty('impactSummary');

        // Regulator view should have compliance focus
        expect(report.stakeholderVisibility.regulatorView.transparencyLevel).toBe('regulatory_compliance');
        expect(report.stakeholderVisibility.regulatorView).toHaveProperty('complianceMetrics');
        expect(report.stakeholderVisibility.regulatorView).toHaveProperty('auditEvents');
      });
    });
  });

  describe('Integration Tests', () => {
    it('should integrate transparency, fraud detection, and tracking services', async () => {
      // Create a complete humanitarian aid scenario
      const distributions = [distribution];
      
      // Generate transparency dashboard
      const dashboard = transparencyService.generateRealTimeTransparencyDashboard(
        distributions, 
        organization
      );

      // Perform fraud analysis with humanitarian context
      const contextData = {
        disasterType: 'earthquake',
        populationType: 'displaced_families',
        urgencyLevel: 'high'
      };

      const fraudAnalysis = await fraudDetection.analyzeDistribution(
        distribution, 
        organization, 
        []
      );

      const contextAnalysis = await fraudDetection.analyzeHumanitarianContext(
        distribution, 
        organization, 
        contextData
      );

      // Create tracking chain and generate impact assessment
      const trackingChain = await donationTracking.createTrackingChain({
        donorId: 'donor-integration-test',
        amount: distribution.amount,
        currency: distribution.currency,
        purpose: distribution.purpose,
        organizationId: organization.id,
        transactionId: distribution.transactionId
      });

      await donationTracking.addDistributionStage(trackingChain.id, distribution);

      const impactAssessment = await donationTracking.generateHumanitarianImpactAssessment(
        trackingChain.id
      );

      // Verify integration
      expect(dashboard.realTimeMetrics.totalFundsDistributed).toBe(distribution.amount);
      expect(fraudAnalysis.riskScore).toBeGreaterThanOrEqual(0);
      expect(contextAnalysis.contextFactors.length).toBeGreaterThan(0);
      expect(impactAssessment.overallImpactScore).toBeGreaterThan(0);

      // Verify that emergency context reduces fraud risk
      const emergencyAdjustment = contextAnalysis.riskAdjustments.find(
        a => a.type === 'emergency_tolerance'
      );
      expect(emergencyAdjustment).toBeDefined();
      expect(emergencyAdjustment.adjustment).toBeLessThan(0);

      // Verify transparency and accountability
      expect(dashboard.complianceStatus.overallScore).toBeGreaterThan(0);
      expect(impactAssessment.impactDimensions.accountability.score).toBeGreaterThan(0);
    });

    it('should handle complex multi-stage humanitarian operations', async () => {
      // Create multiple distributions for different phases
      const emergencyDistribution = new AidDistribution({
        organizationId: organization.id,
        transactionId: 'tx-emergency-001',
        amount: 10000,
        currency: 'USD',
        purpose: 'Immediate emergency food relief',
        category: 'emergency',
        location: 'Port-au-Prince, Haiti',
        distributionMethod: 'direct'
      });

      const recoveryDistribution = new AidDistribution({
        organizationId: organization.id,
        transactionId: 'tx-recovery-001',
        amount: 15000,
        currency: 'USD',
        purpose: 'Recovery phase shelter materials',
        category: 'shelter',
        location: 'Port-au-Prince, Haiti',
        distributionMethod: 'voucher'
      });

      const rehabilitationDistribution = new AidDistribution({
        organizationId: organization.id,
        transactionId: 'tx-rehab-001',
        amount: 8000,
        currency: 'USD',
        purpose: 'School reconstruction and education materials',
        category: 'education',
        location: 'Port-au-Prince, Haiti',
        distributionMethod: 'direct'
      });

      const distributions = [emergencyDistribution, recoveryDistribution, rehabilitationDistribution];

      // Add transparency data to each
      distributions.forEach((dist, index) => {
        dist.addTransparencyData({
          beneficiaryCount: 100 + (index * 50),
          urgencyLevel: index === 0 ? 'high' : 'medium',
          gpsCoordinates: { lat: 18.5944 + (index * 0.01), lng: -72.3074 + (index * 0.01) }
        });
        dist.addVerificationData({ thirdPartyVerified: true });
      });

      // Generate comprehensive dashboard
      const dashboard = transparencyService.generateRealTimeTransparencyDashboard(
        distributions, 
        organization
      );

      // Verify multi-phase tracking
      expect(dashboard.realTimeMetrics.totalDistributions).toBe(3);
      expect(dashboard.realTimeMetrics.totalFundsDistributed).toBe(33000);
      expect(dashboard.realTimeMetrics.beneficiariesReached).toBe(450); // 100 + 150 + 200

      // Verify category breakdown
      const categoryBreakdown = dashboard.impactVisualization.categoryImpact;
      expect(categoryBreakdown).toHaveProperty('emergency');
      expect(categoryBreakdown).toHaveProperty('shelter');
      expect(categoryBreakdown).toHaveProperty('education');

      // Verify geographic concentration
      expect(dashboard.geographicDistribution['Port-au-Prince, Haiti'].count).toBe(3);
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle large numbers of distributions efficiently', () => {
      const startTime = Date.now();
      
      // Create 100 distributions
      const distributions = [];
      for (let i = 0; i < 100; i++) {
        const dist = new AidDistribution({
          organizationId: organization.id,
          transactionId: `tx-perf-${i}`,
          amount: 1000 + (i * 10),
          currency: 'USD',
          purpose: `Distribution ${i}`,
          category: ['food', 'medical', 'shelter', 'education'][i % 4],
          location: ['Haiti', 'Syria', 'Bangladesh', 'Jordan'][i % 4],
          distributionMethod: 'direct'
        });
        
        dist.addTransparencyData({
          beneficiaryCount: 50 + (i % 20),
          urgencyLevel: i < 20 ? 'high' : 'medium'
        });
        
        distributions.push(dist);
      }

      // Generate dashboard
      const dashboard = transparencyService.generateRealTimeTransparencyDashboard(
        distributions, 
        organization
      );

      const endTime = Date.now();
      const processingTime = endTime - startTime;

      // Should process 100 distributions in reasonable time (< 1 second)
      expect(processingTime).toBeLessThan(1000);
      
      // Verify correct calculations
      expect(dashboard.realTimeMetrics.totalDistributions).toBe(100);
      expect(dashboard.realTimeMetrics.totalFundsDistributed).toBe(149500); // Sum of 1000 + 1010 + ... + 1990
      expect(dashboard.realTimeMetrics.beneficiariesReached).toBeGreaterThan(5000);
    });

    it('should maintain accuracy with complex tracking chains', async () => {
      // Create complex tracking chain with multiple stages
      const trackingChain = await donationTracking.createTrackingChain({
        donorId: 'donor-complex',
        amount: 50000,
        currency: 'USD',
        purpose: 'Multi-phase humanitarian response',
        organizationId: organization.id,
        transactionId: 'tx-complex-001'
      });

      // Add multiple distribution stages
      for (let i = 0; i < 10; i++) {
        const dist = new AidDistribution({
          organizationId: organization.id,
          transactionId: `tx-complex-dist-${i}`,
          amount: 5000,
          currency: 'USD',
          purpose: `Phase ${i + 1} distribution`,
          category: ['food', 'medical', 'shelter'][i % 3],
          location: `Location ${i + 1}`,
          distributionMethod: 'direct'
        });

        dist.addTransparencyData({
          beneficiaryCount: 100,
          urgencyLevel: 'medium'
        });

        await donationTracking.addDistributionStage(trackingChain.id, dist);
      }

      // Add verification stages
      for (let i = 0; i < 5; i++) {
        await donationTracking.addVerificationStage(trackingChain.id, {
          verifierId: `verifier-${i}`,
          verifierType: 'local_partner',
          verifierName: `Verifier ${i}`,
          location: `Location ${i + 1}`,
          distributionConfirmed: true,
          beneficiariesReached: 200,
          impactAssessment: `Verification ${i} completed successfully`
        });
      }

      // Generate impact assessment
      const assessment = await donationTracking.generateHumanitarianImpactAssessment(
        trackingChain.id
      );

      // Verify accuracy
      expect(assessment.impactDimensions.reach.metrics.totalBeneficiaries).toBe(1000); // 10 * 100
      expect(assessment.impactDimensions.effectiveness.metrics.verificationRate).toBe(50); // 5/10 * 100
      expect(assessment.overallImpactScore).toBeGreaterThan(0);
      expect(assessment.overallImpactScore).toBeLessThanOrEqual(100);
    });
  });
});