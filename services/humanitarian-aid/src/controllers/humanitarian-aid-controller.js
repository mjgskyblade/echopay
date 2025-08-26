const express = require('express');
const Joi = require('joi');
const logger = require('../utils/logger');
const HumanitarianOrganization = require('../models/humanitarian-organization');
const AidDistribution = require('../models/aid-distribution');
const TransparencyService = require('../services/transparency-service');
const HumanitarianFraudDetection = require('../services/humanitarian-fraud-detection');
const DonationTrackingService = require('../services/donation-tracking-service');

const router = express.Router();

// Initialize services
const transparencyService = new TransparencyService();
const fraudDetection = new HumanitarianFraudDetection();
const donationTracking = new DonationTrackingService();

// In-memory storage for demo purposes
const organizations = new Map();
const distributions = new Map();

// Validation schemas
const organizationSchema = Joi.object({
  name: Joi.string().required().min(3).max(100),
  registrationNumber: Joi.string().required(),
  country: Joi.string().required().min(2).max(50),
  organizationType: Joi.string().valid('ngo', 'un_agency', 'government', 'charity').required(),
  transparencyLevel: Joi.string().valid('standard', 'enhanced', 'full_public').default('standard'),
  publicProfile: Joi.object().default({}),
  complianceFlags: Joi.object().default({})
});

const distributionSchema = Joi.object({
  organizationId: Joi.string().uuid().required(),
  campaignId: Joi.string().uuid().optional(),
  transactionId: Joi.string().uuid().required(),
  donorId: Joi.string().uuid().optional(),
  recipientId: Joi.string().uuid().optional(),
  amount: Joi.number().positive().required(),
  currency: Joi.string().length(3).required(),
  purpose: Joi.string().required().min(10).max(500),
  category: Joi.string().valid('food', 'medical', 'shelter', 'education', 'emergency', 'other').required(),
  location: Joi.string().required().min(3).max(100),
  distributionMethod: Joi.string().valid('direct', 'voucher', 'cash', 'goods').required(),
  transparencyData: Joi.object().default({}),
  impactMetrics: Joi.object().default({}),
  verificationData: Joi.object().default({})
});

// Organization endpoints
router.post('/organizations', async (req, res) => {
  try {
    const { error, value } = organizationSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.details.map(d => d.message)
      });
    }

    const organization = new HumanitarianOrganization(value);
    organizations.set(organization.id, organization);

    logger.info('Humanitarian organization registered', {
      organizationId: organization.id,
      name: organization.name,
      type: organization.organizationType
    });

    res.status(201).json({
      success: true,
      organization: organization.toJSON()
    });

  } catch (error) {
    logger.error('Error registering organization', { error: error.message });
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

router.get('/organizations/:id', async (req, res) => {
  try {
    const organization = organizations.get(req.params.id);
    if (!organization) {
      return res.status(404).json({
        error: 'Organization not found'
      });
    }

    res.json({
      success: true,
      organization: organization.toJSON()
    });

  } catch (error) {
    logger.error('Error fetching organization', { error: error.message });
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

router.put('/organizations/:id/verify', async (req, res) => {
  try {
    const organization = organizations.get(req.params.id);
    if (!organization) {
      return res.status(404).json({
        error: 'Organization not found'
      });
    }

    organization.verify();
    organizations.set(organization.id, organization);

    logger.info('Organization verified', {
      organizationId: organization.id,
      name: organization.name
    });

    res.json({
      success: true,
      organization: organization.toJSON()
    });

  } catch (error) {
    logger.error('Error verifying organization', { error: error.message });
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Distribution endpoints
router.post('/distributions', async (req, res) => {
  try {
    const { error, value } = distributionSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.details.map(d => d.message)
      });
    }

    // Check if organization exists and is verified
    const organization = organizations.get(value.organizationId);
    if (!organization) {
      return res.status(400).json({
        error: 'Organization not found'
      });
    }

    // Create distribution
    const distribution = new AidDistribution(value);

    // Validate transparency requirements
    const transparencyValidation = transparencyService.validateTransparencyRequirements(
      distribution, 
      organization.transparencyLevel
    );

    if (!transparencyValidation.isValid) {
      return res.status(400).json({
        error: 'Transparency requirements not met',
        missingFields: transparencyValidation.missingFields,
        requiredLevel: organization.transparencyLevel
      });
    }

    // Perform fraud detection analysis
    const historicalDistributions = Array.from(distributions.values())
      .filter(d => d.organizationId === organization.id);

    const fraudAnalysis = await fraudDetection.analyzeDistribution(
      distribution,
      organization,
      historicalDistributions
    );

    // Store distribution
    distributions.set(distribution.id, distribution);

    // Create donation tracking chain if donor is specified
    let trackingChain = null;
    if (value.donorId) {
      trackingChain = await donationTracking.createTrackingChain({
        donorId: value.donorId,
        amount: value.amount,
        currency: value.currency,
        purpose: value.purpose,
        organizationId: value.organizationId,
        transactionId: value.transactionId
      });

      await donationTracking.addDistributionStage(trackingChain.id, distribution);
    }

    logger.info('Aid distribution created', {
      distributionId: distribution.id,
      organizationId: organization.id,
      amount: distribution.amount,
      riskScore: fraudAnalysis.riskScore,
      trackingChainId: trackingChain?.id
    });

    res.status(201).json({
      success: true,
      distribution: distribution.toJSON(),
      fraudAnalysis: {
        riskScore: fraudAnalysis.riskScore,
        detectedPatterns: fraudAnalysis.detectedPatterns,
        recommendations: fraudAnalysis.recommendations
      },
      transparencyValidation,
      trackingChainId: trackingChain?.id
    });

  } catch (error) {
    logger.error('Error creating distribution', { error: error.message });
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

router.get('/distributions/:id', async (req, res) => {
  try {
    const distribution = distributions.get(req.params.id);
    if (!distribution) {
      return res.status(404).json({
        error: 'Distribution not found'
      });
    }

    const organization = organizations.get(distribution.organizationId);
    const publicReport = transparencyService.generatePublicReport(
      distribution,
      organization?.transparencyLevel || 'standard'
    );

    res.json({
      success: true,
      distribution: publicReport
    });

  } catch (error) {
    logger.error('Error fetching distribution', { error: error.message });
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

router.put('/distributions/:id/status', async (req, res) => {
  try {
    const distribution = distributions.get(req.params.id);
    if (!distribution) {
      return res.status(404).json({
        error: 'Distribution not found'
      });
    }

    const { status } = req.body;
    if (!AidDistribution.validateStatus(status)) {
      return res.status(400).json({
        error: 'Invalid status',
        validStatuses: ['pending', 'distributed', 'verified', 'completed', 'failed']
      });
    }

    distribution.updateStatus(status);
    distributions.set(distribution.id, distribution);

    logger.info('Distribution status updated', {
      distributionId: distribution.id,
      newStatus: status
    });

    res.json({
      success: true,
      distribution: distribution.toJSON()
    });

  } catch (error) {
    logger.error('Error updating distribution status', { error: error.message });
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Transparency endpoints
router.get('/organizations/:id/transparency-metrics', async (req, res) => {
  try {
    const organization = organizations.get(req.params.id);
    if (!organization) {
      return res.status(404).json({
        error: 'Organization not found'
      });
    }

    const orgDistributions = Array.from(distributions.values())
      .filter(d => d.organizationId === organization.id);

    const metrics = transparencyService.generateOrganizationTransparencyMetrics(orgDistributions);

    res.json({
      success: true,
      organizationId: organization.id,
      transparencyMetrics: metrics
    });

  } catch (error) {
    logger.error('Error generating transparency metrics', { error: error.message });
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

router.get('/organizations/:id/donation-tracking', async (req, res) => {
  try {
    const organization = organizations.get(req.params.id);
    if (!organization) {
      return res.status(404).json({
        error: 'Organization not found'
      });
    }

    const orgDistributions = Array.from(distributions.values())
      .filter(d => d.organizationId === organization.id);

    const trackingChain = transparencyService.generateDonationTrackingChain(orgDistributions);

    res.json({
      success: true,
      organizationId: organization.id,
      donationTrackingChain: trackingChain
    });

  } catch (error) {
    logger.error('Error generating donation tracking chain', { error: error.message });
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Donation tracking endpoints
router.get('/tracking/:chainId', async (req, res) => {
  try {
    const requesterId = req.query.requesterId;
    const trackingChain = await donationTracking.getTrackingChain(req.params.chainId, requesterId);

    res.json({
      success: true,
      trackingChain
    });

  } catch (error) {
    logger.error('Error fetching tracking chain', { error: error.message });
    if (error.message.includes('not found')) {
      return res.status(404).json({
        error: 'Tracking chain not found'
      });
    }
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

router.post('/tracking/:chainId/verification', async (req, res) => {
  try {
    const verificationData = req.body;
    const trackingChain = await donationTracking.addVerificationStage(
      req.params.chainId,
      verificationData
    );

    logger.info('Verification added to tracking chain', {
      trackingChainId: req.params.chainId,
      verifierId: verificationData.verifierId
    });

    res.json({
      success: true,
      trackingChain: await donationTracking.getTrackingChain(req.params.chainId)
    });

  } catch (error) {
    logger.error('Error adding verification to tracking chain', { error: error.message });
    if (error.message.includes('not found')) {
      return res.status(404).json({
        error: 'Tracking chain not found'
      });
    }
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

router.get('/tracking/search', async (req, res) => {
  try {
    const criteria = req.query;
    const results = await donationTracking.searchTrackingChains(criteria);

    res.json({
      success: true,
      results,
      count: results.length
    });

  } catch (error) {
    logger.error('Error searching tracking chains', { error: error.message });
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Statistics endpoints
router.get('/statistics/transparency', async (req, res) => {
  try {
    const stats = await donationTracking.getTrackingStatistics();

    res.json({
      success: true,
      statistics: stats
    });

  } catch (error) {
    logger.error('Error fetching transparency statistics', { error: error.message });
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

router.get('/statistics/fraud', async (req, res) => {
  try {
    // Get all fraud analyses (in a real implementation, this would come from a database)
    const allAnalyses = []; // Placeholder for fraud analysis history
    const stats = fraudDetection.getOrganizationFraudStats(allAnalyses);

    res.json({
      success: true,
      fraudStatistics: stats
    });

  } catch (error) {
    logger.error('Error fetching fraud statistics', { error: error.message });
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'humanitarian-aid-service',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

module.exports = router;