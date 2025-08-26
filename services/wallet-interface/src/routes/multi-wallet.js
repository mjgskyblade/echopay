const express = require('express');
const { body, param, validationResult } = require('express-validator');
const MultiWalletManager = require('../services/multi-wallet-manager');
const logger = require('../utils/logger');

const router = express.Router();

// Initialize service
const multiWalletManager = new MultiWalletManager();

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
 * Create a new wallet
 */
router.post('/',
  authenticate,
  [
    body('walletName').notEmpty().withMessage('Wallet name is required'),
    body('walletType').optional().isIn(['personal', 'business', 'savings']).withMessage('Invalid wallet type'),
    body('currency').optional().isString(),
    body('description').optional().isString(),
    body('tags').optional().isArray(),
    body('color').optional().isString()
  ],
  checkValidation,
  async (req, res) => {
    try {
      const walletInfo = {
        walletName: req.body.walletName,
        walletType: req.body.walletType || 'personal',
        currency: req.body.currency || 'USD-CBDC',
        description: req.body.description || '',
        tags: req.body.tags || [],
        color: req.body.color || '#007bff'
      };

      const wallet = await multiWalletManager.createWallet(req.userId, walletInfo);
      
      res.status(201).json({
        success: true,
        wallet
      });
    } catch (error) {
      logger.error('Wallet creation failed:', error);
      res.status(500).json({
        error: 'Wallet creation failed',
        message: error.message
      });
    }
  }
);

/**
 * Get all wallets for the authenticated user
 */
router.get('/',
  authenticate,
  async (req, res) => {
    try {
      const wallets = multiWalletManager.getUserWallets(req.userId);
      
      res.json({
        success: true,
        wallets
      });
    } catch (error) {
      logger.error('Failed to get user wallets:', error);
      res.status(500).json({
        error: 'Failed to get wallets',
        message: error.message
      });
    }
  }
);

/**
 * Get a specific wallet
 */
router.get('/:walletId',
  authenticate,
  [
    param('walletId').isUUID().withMessage('Invalid wallet ID')
  ],
  checkValidation,
  async (req, res) => {
    try {
      const { walletId } = req.params;
      const wallet = multiWalletManager.getWallet(walletId, req.userId);
      
      if (!wallet) {
        return res.status(404).json({
          error: 'Wallet not found'
        });
      }

      res.json({
        success: true,
        wallet
      });
    } catch (error) {
      logger.error('Failed to get wallet:', error);
      res.status(500).json({
        error: 'Failed to get wallet',
        message: error.message
      });
    }
  }
);

/**
 * Update wallet information
 */
router.put('/:walletId',
  authenticate,
  [
    param('walletId').isUUID().withMessage('Invalid wallet ID'),
    body('walletName').optional().notEmpty().withMessage('Wallet name cannot be empty'),
    body('walletType').optional().isIn(['personal', 'business', 'savings']),
    body('permissions').optional().isObject(),
    body('metadata').optional().isObject()
  ],
  checkValidation,
  async (req, res) => {
    try {
      const { walletId } = req.params;
      const updates = req.body;

      const wallet = await multiWalletManager.updateWallet(walletId, req.userId, updates);
      
      res.json({
        success: true,
        wallet
      });
    } catch (error) {
      logger.error('Wallet update failed:', error);
      res.status(400).json({
        error: 'Wallet update failed',
        message: error.message
      });
    }
  }
);

/**
 * Set primary wallet
 */
router.post('/:walletId/set-primary',
  authenticate,
  [
    param('walletId').isUUID().withMessage('Invalid wallet ID')
  ],
  checkValidation,
  async (req, res) => {
    try {
      const { walletId } = req.params;
      
      const wallet = await multiWalletManager.setPrimaryWallet(req.userId, walletId);
      
      res.json({
        success: true,
        wallet,
        message: 'Primary wallet updated successfully'
      });
    } catch (error) {
      logger.error('Failed to set primary wallet:', error);
      res.status(400).json({
        error: 'Failed to set primary wallet',
        message: error.message
      });
    }
  }
);

/**
 * Sync wallet with device
 */
router.post('/:walletId/sync',
  authenticate,
  [
    param('walletId').isUUID().withMessage('Invalid wallet ID'),
    body('deviceId').isUUID().withMessage('Device ID is required'),
    body('syncData').optional().isObject()
  ],
  checkValidation,
  async (req, res) => {
    try {
      const { walletId } = req.params;
      const { deviceId, syncData = {} } = req.body;

      const syncResult = await multiWalletManager.syncWallet(walletId, deviceId, syncData);
      
      res.json({
        success: true,
        ...syncResult
      });
    } catch (error) {
      logger.error('Wallet sync failed:', error);
      res.status(400).json({
        error: 'Wallet sync failed',
        message: error.message
      });
    }
  }
);

/**
 * Get wallet synchronization status
 */
router.get('/:walletId/sync-status',
  authenticate,
  [
    param('walletId').isUUID().withMessage('Invalid wallet ID')
  ],
  checkValidation,
  async (req, res) => {
    try {
      const { walletId } = req.params;
      const syncStatus = multiWalletManager.getWalletSyncStatus(walletId);
      
      if (!syncStatus) {
        return res.status(404).json({
          error: 'Wallet not found'
        });
      }

      res.json({
        success: true,
        syncStatus
      });
    } catch (error) {
      logger.error('Failed to get sync status:', error);
      res.status(500).json({
        error: 'Failed to get sync status',
        message: error.message
      });
    }
  }
);

/**
 * Transfer funds between wallets
 */
router.post('/transfer',
  authenticate,
  [
    body('fromWalletId').isUUID().withMessage('Source wallet ID is required'),
    body('toWalletId').isUUID().withMessage('Destination wallet ID is required'),
    body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be greater than 0'),
    body('description').optional().isString()
  ],
  checkValidation,
  async (req, res) => {
    try {
      const { fromWalletId, toWalletId, amount, description = '' } = req.body;

      const transferResult = await multiWalletManager.transferBetweenWallets(
        req.userId,
        fromWalletId,
        toWalletId,
        amount,
        description
      );
      
      res.json({
        success: true,
        ...transferResult,
        message: 'Transfer completed successfully'
      });
    } catch (error) {
      logger.error('Inter-wallet transfer failed:', error);
      res.status(400).json({
        error: 'Transfer failed',
        message: error.message
      });
    }
  }
);

/**
 * Remove wallet
 */
router.delete('/:walletId',
  authenticate,
  [
    param('walletId').isUUID().withMessage('Invalid wallet ID')
  ],
  checkValidation,
  async (req, res) => {
    try {
      const { walletId } = req.params;
      
      await multiWalletManager.removeWallet(req.userId, walletId);
      
      res.json({
        success: true,
        message: 'Wallet removed successfully'
      });
    } catch (error) {
      logger.error('Wallet removal failed:', error);
      res.status(400).json({
        error: 'Wallet removal failed',
        message: error.message
      });
    }
  }
);

/**
 * Get wallet statistics
 */
router.get('/statistics/overview',
  authenticate,
  async (req, res) => {
    try {
      const statistics = multiWalletManager.getWalletStatistics(req.userId);
      
      res.json({
        success: true,
        statistics
      });
    } catch (error) {
      logger.error('Failed to get wallet statistics:', error);
      res.status(500).json({
        error: 'Failed to get statistics',
        message: error.message
      });
    }
  }
);

module.exports = router;