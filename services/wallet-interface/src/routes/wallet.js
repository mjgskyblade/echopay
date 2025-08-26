const express = require('express');
const { body, query, validationResult } = require('express-validator');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const moment = require('moment');
const authRoutes = require('./auth');
const authenticateToken = authRoutes.authenticateToken;
const users = authRoutes.users;
const logger = require('../utils/logger');

const router = express.Router();

// Service endpoints
const TOKEN_SERVICE_URL = process.env.TOKEN_SERVICE_URL || 'http://localhost:8081';
const TRANSACTION_SERVICE_URL = process.env.TRANSACTION_SERVICE_URL || 'http://localhost:8080';
const FRAUD_DETECTION_URL = process.env.FRAUD_DETECTION_URL || 'http://localhost:8082';

// Mock wallet data store (in production, this would be a database)
const wallets = new Map();

// Create a new wallet
router.post('/create', authenticateToken, [
  body('name').trim().isLength({ min: 1, max: 50 }),
  body('currency').isIn(['USD-CBDC', 'EUR-CBDC', 'GBP-CBDC', 'JPY-CBDC'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { name, currency } = req.body;
    const walletId = uuidv4();

    const wallet = {
      id: walletId,
      userId: req.user.userId,
      name,
      currency,
      balance: 0,
      status: 'active',
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      devices: [],
      settings: {
        notifications: true,
        fraudAlerts: true,
        transactionLimits: {
          daily: 10000,
          single: 5000
        }
      }
    };

    wallets.set(walletId, wallet);

    // Update user's wallet list
    const user = users.get(req.user.email);
    if (user) {
      user.wallets.push(walletId);
    }

    logger.info('Wallet created successfully', { 
      walletId, 
      userId: req.user.userId,
      currency 
    });

    res.status(201).json({
      message: 'Wallet created successfully',
      wallet: {
        id: wallet.id,
        name: wallet.name,
        currency: wallet.currency,
        balance: wallet.balance,
        status: wallet.status,
        createdAt: wallet.createdAt
      }
    });
  } catch (error) {
    logger.error('Wallet creation error:', error);
    res.status(500).json({
      error: 'Wallet creation failed',
      message: 'Unable to create wallet'
    });
  }
});

// Get wallet dashboard data
router.get('/:walletId/dashboard', authenticateToken, async (req, res) => {
  try {
    const { walletId } = req.params;
    const wallet = wallets.get(walletId);

    if (!wallet || wallet.userId !== req.user.userId) {
      return res.status(404).json({
        error: 'Wallet not found',
        message: 'Wallet not found or access denied'
      });
    }

    // Get recent transactions (mock data for now)
    const recentTransactions = await getRecentTransactions(walletId);
    
    // Get balance and pending transactions
    const balanceInfo = await getBalanceInfo(walletId);
    
    // Get fraud alerts
    const fraudAlerts = await getFraudAlerts(walletId);

    // Calculate spending analytics
    const spendingAnalytics = calculateSpendingAnalytics(recentTransactions);

    const dashboardData = {
      wallet: {
        id: wallet.id,
        name: wallet.name,
        currency: wallet.currency,
        balance: balanceInfo.available,
        pendingBalance: balanceInfo.pending,
        status: wallet.status,
        lastActivity: wallet.lastActivity
      },
      recentTransactions: recentTransactions.slice(0, 10),
      fraudAlerts: fraudAlerts.filter(alert => alert.status === 'active'),
      analytics: spendingAnalytics,
      quickStats: {
        totalTransactions: recentTransactions.length,
        monthlySpending: spendingAnalytics.monthlyTotal,
        averageTransaction: spendingAnalytics.averageAmount,
        fraudScore: await getFraudScore(walletId)
      }
    };

    res.json(dashboardData);
  } catch (error) {
    logger.error('Dashboard fetch error:', error);
    res.status(500).json({
      error: 'Dashboard fetch failed',
      message: 'Unable to fetch dashboard data'
    });
  }
});

// Get transaction history with filtering and pagination
router.get('/:walletId/transactions', authenticateToken, [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('category').optional().isIn(['all', 'sent', 'received', 'pending', 'failed']),
  query('dateFrom').optional().isISO8601(),
  query('dateTo').optional().isISO8601(),
  query('search').optional().isLength({ max: 100 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { walletId } = req.params;
    const {
      page = 1,
      limit = 20,
      category = 'all',
      dateFrom,
      dateTo,
      search
    } = req.query;

    const wallet = wallets.get(walletId);
    if (!wallet || wallet.userId !== req.user.userId) {
      return res.status(404).json({
        error: 'Wallet not found',
        message: 'Wallet not found or access denied'
      });
    }

    // Get filtered transactions
    let transactions = await getTransactionHistory(walletId, {
      category,
      dateFrom,
      dateTo,
      search
    });

    // Apply pagination
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    const paginatedTransactions = transactions.slice(startIndex, endIndex);

    // Add categorization and enhanced data
    const enhancedTransactions = paginatedTransactions.map(tx => ({
      ...tx,
      category: categorizeTransaction(tx, walletId),
      displayAmount: formatAmount(tx.amount, wallet.currency),
      relativeTime: moment(tx.timestamp).fromNow(),
      fraudRisk: tx.fraudScore > 0.7 ? 'high' : tx.fraudScore > 0.3 ? 'medium' : 'low'
    }));

    res.json({
      transactions: enhancedTransactions,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(transactions.length / limit),
        totalItems: transactions.length,
        itemsPerPage: parseInt(limit)
      },
      summary: {
        totalAmount: transactions.reduce((sum, tx) => sum + Math.abs(tx.amount), 0),
        sentCount: transactions.filter(tx => tx.fromWallet === walletId).length,
        receivedCount: transactions.filter(tx => tx.toWallet === walletId).length,
        pendingCount: transactions.filter(tx => tx.status === 'pending').length
      }
    });
  } catch (error) {
    logger.error('Transaction history fetch error:', error);
    res.status(500).json({
      error: 'Transaction history fetch failed',
      message: 'Unable to fetch transaction history'
    });
  }
});

// Get wallet settings
router.get('/:walletId/settings', authenticateToken, (req, res) => {
  try {
    const { walletId } = req.params;
    const wallet = wallets.get(walletId);

    if (!wallet || wallet.userId !== req.user.userId) {
      return res.status(404).json({
        error: 'Wallet not found',
        message: 'Wallet not found or access denied'
      });
    }

    res.json({
      settings: wallet.settings,
      devices: wallet.devices,
      securityInfo: {
        lastPasswordChange: wallet.lastPasswordChange || null,
        twoFactorEnabled: wallet.twoFactorEnabled || false,
        loginHistory: wallet.loginHistory || []
      }
    });
  } catch (error) {
    logger.error('Settings fetch error:', error);
    res.status(500).json({
      error: 'Settings fetch failed',
      message: 'Unable to fetch wallet settings'
    });
  }
});

// Update wallet settings
router.put('/:walletId/settings', authenticateToken, [
  body('notifications').optional().isBoolean(),
  body('fraudAlerts').optional().isBoolean(),
  body('transactionLimits.daily').optional().isFloat({ min: 0 }),
  body('transactionLimits.single').optional().isFloat({ min: 0 })
], (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { walletId } = req.params;
    const wallet = wallets.get(walletId);

    if (!wallet || wallet.userId !== req.user.userId) {
      return res.status(404).json({
        error: 'Wallet not found',
        message: 'Wallet not found or access denied'
      });
    }

    // Update settings
    const updates = req.body;
    wallet.settings = { ...wallet.settings, ...updates };
    wallet.lastActivity = new Date().toISOString();

    logger.info('Wallet settings updated', { walletId, updates });

    res.json({
      message: 'Settings updated successfully',
      settings: wallet.settings
    });
  } catch (error) {
    logger.error('Settings update error:', error);
    res.status(500).json({
      error: 'Settings update failed',
      message: 'Unable to update settings'
    });
  }
});

// Helper functions
async function getRecentTransactions(walletId) {
  // Mock transaction data - in production, this would call the transaction service
  return [
    {
      id: 'tx-1',
      fromWallet: walletId,
      toWallet: 'wallet-2',
      amount: -50.00,
      currency: 'USD-CBDC',
      status: 'completed',
      timestamp: moment().subtract(1, 'hour').toISOString(),
      description: 'Coffee shop payment',
      fraudScore: 0.1
    },
    {
      id: 'tx-2',
      fromWallet: 'wallet-3',
      toWallet: walletId,
      amount: 100.00,
      currency: 'USD-CBDC',
      status: 'completed',
      timestamp: moment().subtract(2, 'hours').toISOString(),
      description: 'Salary payment',
      fraudScore: 0.05
    }
  ];
}

async function getBalanceInfo(walletId) {
  // Mock balance data - in production, this would call the token service
  return {
    available: 1250.75,
    pending: 25.00,
    frozen: 0.00
  };
}

async function getFraudAlerts(walletId) {
  // Mock fraud alerts - in production, this would call the fraud detection service
  return [
    {
      id: 'alert-1',
      type: 'suspicious_transaction',
      severity: 'medium',
      status: 'active',
      message: 'Unusual spending pattern detected',
      timestamp: moment().subtract(30, 'minutes').toISOString()
    }
  ];
}

async function getFraudScore(walletId) {
  // Mock fraud score - in production, this would call the fraud detection service
  return 0.15;
}

function calculateSpendingAnalytics(transactions) {
  const now = moment();
  const monthlyTransactions = transactions.filter(tx => 
    moment(tx.timestamp).isAfter(now.clone().subtract(30, 'days'))
  );

  const monthlyTotal = monthlyTransactions
    .filter(tx => tx.amount < 0)
    .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

  const averageAmount = monthlyTransactions.length > 0 
    ? monthlyTotal / monthlyTransactions.length 
    : 0;

  return {
    monthlyTotal,
    averageAmount,
    transactionCount: monthlyTransactions.length,
    categories: categorizeSpendings(monthlyTransactions)
  };
}

function categorizeTransaction(transaction, walletId) {
  if (transaction.status === 'pending') return 'pending';
  if (transaction.status === 'failed') return 'failed';
  return transaction.fromWallet === walletId ? 'sent' : 'received';
}

function formatAmount(amount, currency) {
  const symbol = currency.includes('USD') ? '$' : 
                 currency.includes('EUR') ? '€' : 
                 currency.includes('GBP') ? '£' : 
                 currency.includes('JPY') ? '¥' : '';
  
  return `${symbol}${Math.abs(amount).toFixed(2)}`;
}

function categorizeSpendings(transactions) {
  // Simple categorization based on description keywords
  const categories = {
    food: 0,
    transport: 0,
    shopping: 0,
    utilities: 0,
    entertainment: 0,
    other: 0
  };

  transactions.forEach(tx => {
    const desc = tx.description?.toLowerCase() || '';
    if (desc.includes('coffee') || desc.includes('restaurant') || desc.includes('food')) {
      categories.food += Math.abs(tx.amount);
    } else if (desc.includes('uber') || desc.includes('taxi') || desc.includes('transport')) {
      categories.transport += Math.abs(tx.amount);
    } else if (desc.includes('shop') || desc.includes('store') || desc.includes('amazon')) {
      categories.shopping += Math.abs(tx.amount);
    } else if (desc.includes('electric') || desc.includes('gas') || desc.includes('water')) {
      categories.utilities += Math.abs(tx.amount);
    } else if (desc.includes('movie') || desc.includes('game') || desc.includes('music')) {
      categories.entertainment += Math.abs(tx.amount);
    } else {
      categories.other += Math.abs(tx.amount);
    }
  });

  return categories;
}

async function getTransactionHistory(walletId, filters) {
  // Mock implementation - in production, this would call the transaction service
  let transactions = await getRecentTransactions(walletId);
  
  // Apply filters
  if (filters.category && filters.category !== 'all') {
    transactions = transactions.filter(tx => {
      const category = categorizeTransaction(tx, walletId);
      return category === filters.category;
    });
  }

  if (filters.dateFrom) {
    transactions = transactions.filter(tx => 
      moment(tx.timestamp).isAfter(moment(filters.dateFrom))
    );
  }

  if (filters.dateTo) {
    transactions = transactions.filter(tx => 
      moment(tx.timestamp).isBefore(moment(filters.dateTo))
    );
  }

  if (filters.search) {
    const searchTerm = filters.search.toLowerCase();
    transactions = transactions.filter(tx => 
      tx.description?.toLowerCase().includes(searchTerm) ||
      tx.id.toLowerCase().includes(searchTerm)
    );
  }

  return transactions;
}

module.exports = router;