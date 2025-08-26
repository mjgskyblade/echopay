const express = require('express');
const { body, param, validationResult } = require('express-validator');
const DeviceManager = require('../services/device-manager');
const DeviceFraudDetector = require('../services/device-fraud-detector');
const MultiWalletManager = require('../services/multi-wallet-manager');
const logger = require('../utils/logger');

const router = express.Router();

// Initialize services
const deviceManager = new DeviceManager();
const multiWalletManager = new MultiWalletManager();
const deviceFraudDetector = new DeviceFraudDetector(deviceManager, multiWalletManager);

// Middleware to check validation results
const checkValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array()
    });
  }
  next();
};

// Mock authentication middleware
const authenticate = (req, res, next) => {
  // In production, verify JWT token
  const userId = req.headers['x-user-id'] || 'user-123';
  req.userId = userId;
  next();
};

/**
 * Register a new device
 */
router.post('/register',
  authenticate,
  [
    body('deviceName').notEmpty().withMessage('Device name is required'),
    body('deviceType').isIn(['mobile', 'web', 'desktop']).withMessage('Invalid device type'),
    body('platform').optional().isString(),
    body('location').optional().isObject(),
    body('clientInfo').optional().isObject()
  ],
  checkValidation,
  async (req, res) => {
    try {
      const { deviceName, deviceType, platform, location, clientInfo } = req.body;
      
      const deviceInfo = {
        deviceName,
        deviceType,
        platform,
        location,
        ...clientInfo
      };

      const device = await deviceManager.registerDevice(req.userId, deviceInfo, req);
      
      res.status(201).json({
        success: true,
        device: {
          deviceId: device.deviceId,
          deviceName: device.deviceName,
          deviceType: device.deviceType,
          fingerprint: device.fingerprint.substring(0, 8) + '...',
          registeredAt: device.registeredAt,
          isTrusted: device.isTrusted,
          riskScore: device.riskScore
        }
      });
    } catch (error) {
      logger.error('Device registration failed:', error);
      res.status(500).json({
        error: 'Device registration failed',
        message: error.message
      });
    }
  }
);

/**
 * Verify a device
 */
router.post('/:deviceId/verify',
  authenticate,
  [
    param('deviceId').isUUID().withMessage('Invalid device ID'),
    body('verificationCode').notEmpty().withMessage('Verification code is required')
  ],
  checkValidation,
  async (req, res) => {
    try {
      const { deviceId } = req.params;
      const { verificationCode } = req.body;

      const device = await deviceManager.verifyDevice(deviceId, verificationCode);
      
      res.json({
        success: true,
        device: {
          deviceId: device.deviceId,
          deviceName: device.deviceName,
          isTrusted: device.isTrusted,
          verifiedAt: device.verifiedAt,
          riskScore: device.riskScore
        }
      });
    } catch (error) {
      logger.error('Device verification failed:', error);
      res.status(400).json({
        error: 'Device verification failed',
        message: error.message
      });
    }
  }
);

/**
 * Get all devices for the authenticated user
 */
router.get('/',
  authenticate,
  async (req, res) => {
    try {
      const devices = deviceManager.getUserDevices(req.userId);
      
      const sanitizedDevices = devices.map(device => ({
        deviceId: device.deviceId,
        deviceName: device.deviceName,
        deviceType: device.deviceType,
        platform: device.platform,
        registeredAt: device.registeredAt,
        lastSeenAt: device.lastSeenAt,
        isTrusted: device.isTrusted,
        riskScore: device.riskScore,
        location: device.location,
        ipAddress: device.ipAddress
      }));

      res.json({
        success: true,
        devices: sanitizedDevices
      });
    } catch (error) {
      logger.error('Failed to get user devices:', error);
      res.status(500).json({
        error: 'Failed to get devices',
        message: error.message
      });
    }
  }
);

/**
 * Get device risk assessment
 */
router.get('/:deviceId/risk',
  authenticate,
  [
    param('deviceId').isUUID().withMessage('Invalid device ID')
  ],
  checkValidation,
  async (req, res) => {
    try {
      const { deviceId } = req.params;
      const riskAssessment = deviceManager.getDeviceRiskAssessment(deviceId);
      
      if (!riskAssessment) {
        return res.status(404).json({
          error: 'Device not found'
        });
      }

      res.json({
        success: true,
        riskAssessment
      });
    } catch (error) {
      logger.error('Failed to get device risk assessment:', error);
      res.status(500).json({
        error: 'Failed to get risk assessment',
        message: error.message
      });
    }
  }
);

/**
 * Update device activity
 */
router.post('/:deviceId/activity',
  authenticate,
  [
    param('deviceId').isUUID().withMessage('Invalid device ID'),
    body('location').optional().isObject()
  ],
  checkValidation,
  async (req, res) => {
    try {
      const { deviceId } = req.params;
      const { location } = req.body;

      const activityResult = await deviceManager.updateDeviceActivity(deviceId, req, location);
      
      if (!activityResult) {
        return res.status(404).json({
          error: 'Device not found'
        });
      }

      res.json({
        success: true,
        device: {
          deviceId: activityResult.device.deviceId,
          lastSeenAt: activityResult.device.lastSeenAt,
          riskScore: activityResult.device.riskScore
        },
        suspiciousPatterns: activityResult.suspiciousPatterns,
        riskScore: activityResult.riskScore
      });
    } catch (error) {
      logger.error('Failed to update device activity:', error);
      res.status(500).json({
        error: 'Failed to update activity',
        message: error.message
      });
    }
  }
);

/**
 * Check concurrent sessions
 */
router.get('/sessions/concurrent',
  authenticate,
  async (req, res) => {
    try {
      const concurrentSessions = deviceManager.checkConcurrentSessions(req.userId);
      
      res.json({
        success: true,
        concurrentSessions,
        sessionCount: concurrentSessions.length
      });
    } catch (error) {
      logger.error('Failed to check concurrent sessions:', error);
      res.status(500).json({
        error: 'Failed to check sessions',
        message: error.message
      });
    }
  }
);

/**
 * Analyze transaction for device fraud
 */
router.post('/:deviceId/analyze-transaction',
  authenticate,
  [
    param('deviceId').isUUID().withMessage('Invalid device ID'),
    body('transaction').isObject().withMessage('Transaction data is required'),
    body('transaction.transactionId').notEmpty().withMessage('Transaction ID is required'),
    body('transaction.amount').isNumeric().withMessage('Amount must be numeric'),
    body('transaction.walletId').optional().isString()
  ],
  checkValidation,
  async (req, res) => {
    try {
      const { deviceId } = req.params;
      const { transaction } = req.body;

      // Add user ID to transaction
      transaction.userId = req.userId;

      const analysis = await deviceFraudDetector.analyzeTransaction(transaction, deviceId, req);
      
      // Generate alert if high risk
      let alert = null;
      if (analysis.riskScore >= 0.7) {
        alert = await deviceFraudDetector.generateFraudAlert(analysis);
      }

      res.json({
        success: true,
        analysis,
        alert
      });
    } catch (error) {
      logger.error('Transaction fraud analysis failed:', error);
      res.status(500).json({
        error: 'Fraud analysis failed',
        message: error.message
      });
    }
  }
);

/**
 * Remove device
 */
router.delete('/:deviceId',
  authenticate,
  [
    param('deviceId').isUUID().withMessage('Invalid device ID')
  ],
  checkValidation,
  async (req, res) => {
    try {
      const { deviceId } = req.params;
      
      await deviceManager.removeDevice(req.userId, deviceId);
      
      res.json({
        success: true,
        message: 'Device removed successfully'
      });
    } catch (error) {
      logger.error('Device removal failed:', error);
      res.status(400).json({
        error: 'Device removal failed',
        message: error.message
      });
    }
  }
);

/**
 * Get fraud statistics
 */
router.get('/fraud/statistics',
  authenticate,
  async (req, res) => {
    try {
      const timeRange = parseInt(req.query.timeRange) || 24 * 60 * 60 * 1000; // 24 hours default
      const statistics = deviceFraudDetector.getFraudStatistics(req.userId, timeRange);
      
      res.json({
        success: true,
        statistics
      });
    } catch (error) {
      logger.error('Failed to get fraud statistics:', error);
      res.status(500).json({
        error: 'Failed to get statistics',
        message: error.message
      });
    }
  }
);

module.exports = router;