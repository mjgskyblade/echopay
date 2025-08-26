const express = require('express');
const { body, validationResult } = require('express-validator');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const moment = require('moment');
const authRoutes = require('./auth');
const authenticateToken = authRoutes.authenticateToken;
const logger = require('../utils/logger');

const router = express.Router();

// Service endpoints
const TRANSACTION_SERVICE_URL = process.env.TRANSACTION_SERVICE_URL || 'http://localhost:8080';
const FRAUD_DETECTION_URL = process.env.FRAUD_DETECTION_URL || 'http://localhost:8082';

// Send transaction
router.post('/send', authenticateToken, [
  body('fromWallet').isUUID(),
  body('toWallet').isUUID(),
  body('amount').isFloat({ min: 0.01 }),
  body('currency').isIn(['USD-CBDC', 'EUR-CBDC', 'GBP-CBDC', 'JPY-CBDC']),
  body('description').optional().trim().isLength({ max: 200 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { fromWallet, toWallet, amount, currency, description } = req.body;

    // Create transaction request
    const transactionRequest = {
      id: uuidv4(),
      fromWallet,
      toWallet,
      amount,
      currency,
      description: description || '',
      timestamp: new Date().toISOString(),
      userId: req.user.userId
    };

    // In production, this would call the actual transaction service
    const transaction = await processTransaction(transactionRequest);

    // Emit real-time update via Socket.IO
    const io = req.app.get('io');
    io.to(`wallet-${fromWallet}`).emit('transaction-update', {
      type: 'transaction-sent',
      transaction: {
        id: transaction.id,
        amount: -amount,
        status: transaction.status,
        timestamp: transaction.timestamp,
        description: transaction.description
      }
    });

    io.to(`wallet-${toWallet}`).emit('transaction-update', {
      type: 'transaction-received',
      transaction: {
        id: transaction.id,
        amount: amount,
        status: transaction.status,
        timestamp: transaction.timestamp,
        description: transaction.description
      }
    });

    logger.info('Transaction initiated', {
      transactionId: transaction.id,
      fromWallet,
      toWallet,
      amount,
      currency
    });

    res.status(201).json({
      message: 'Transaction initiated successfully',
      transaction: {
        id: transaction.id,
        status: transaction.status,
        timestamp: transaction.timestamp,
        estimatedCompletion: transaction.estimatedCompletion,
        fraudScore: transaction.fraudScore
      }
    });
  } catch (error) {
    logger.error('Transaction send error:', error);
    
    if (error.code === 'INSUFFICIENT_FUNDS') {
      return res.status(400).json({
        error: 'Insufficient funds',
        message: 'Not enough balance to complete this transaction'
      });
    }
    
    if (error.code === 'FRAUD_DETECTED') {
      return res.status(403).json({
        error: 'Transaction blocked',
        message: 'Transaction blocked due to fraud detection',
        fraudScore: error.fraudScore
      });
    }

    res.status(500).json({
      error: 'Transaction failed',
      message: 'Unable to process transaction'
    });
  }
});

// Get transaction details
router.get('/:transactionId', authenticateToken, async (req, res) => {
  try {
    const { transactionId } = req.params;

    // In production, this would call the transaction service
    const transaction = await getTransactionDetails(transactionId);

    if (!transaction) {
      return res.status(404).json({
        error: 'Transaction not found',
        message: 'Transaction not found or access denied'
      });
    }

    // Verify user has access to this transaction
    if (!hasTransactionAccess(transaction, req.user.userId)) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have access to this transaction'
      });
    }

    // Enhance transaction data
    const enhancedTransaction = {
      ...transaction,
      relativeTime: moment(transaction.timestamp).fromNow(),
      formattedAmount: formatTransactionAmount(transaction),
      statusDetails: getStatusDetails(transaction.status),
      fraudAnalysis: await getFraudAnalysis(transactionId),
      timeline: generateTransactionTimeline(transaction)
    };

    res.json({
      transaction: enhancedTransaction
    });
  } catch (error) {
    logger.error('Transaction details fetch error:', error);
    res.status(500).json({
      error: 'Transaction details fetch failed',
      message: 'Unable to fetch transaction details'
    });
  }
});

// Cancel pending transaction
router.post('/:transactionId/cancel', authenticateToken, async (req, res) => {
  try {
    const { transactionId } = req.params;

    // Get transaction details
    const transaction = await getTransactionDetails(transactionId);

    if (!transaction) {
      return res.status(404).json({
        error: 'Transaction not found',
        message: 'Transaction not found'
      });
    }

    // Verify user has access and transaction is cancellable
    if (!hasTransactionAccess(transaction, req.user.userId)) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have access to this transaction'
      });
    }

    if (transaction.status !== 'pending') {
      return res.status(400).json({
        error: 'Cannot cancel transaction',
        message: 'Only pending transactions can be cancelled'
      });
    }

    // Cancel transaction
    const cancelledTransaction = await cancelTransaction(transactionId);

    // Emit real-time update
    const io = req.app.get('io');
    io.to(`wallet-${transaction.fromWallet}`).emit('transaction-update', {
      type: 'transaction-cancelled',
      transaction: {
        id: transactionId,
        status: 'cancelled',
        timestamp: new Date().toISOString()
      }
    });

    logger.info('Transaction cancelled', {
      transactionId,
      userId: req.user.userId
    });

    res.json({
      message: 'Transaction cancelled successfully',
      transaction: {
        id: transactionId,
        status: 'cancelled',
        timestamp: cancelledTransaction.cancelledAt
      }
    });
  } catch (error) {
    logger.error('Transaction cancellation error:', error);
    res.status(500).json({
      error: 'Transaction cancellation failed',
      message: 'Unable to cancel transaction'
    });
  }
});

// Get transaction receipt
router.get('/:transactionId/receipt', authenticateToken, async (req, res) => {
  try {
    const { transactionId } = req.params;

    const transaction = await getTransactionDetails(transactionId);

    if (!transaction) {
      return res.status(404).json({
        error: 'Transaction not found',
        message: 'Transaction not found'
      });
    }

    if (!hasTransactionAccess(transaction, req.user.userId)) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have access to this transaction'
      });
    }

    if (transaction.status !== 'completed') {
      return res.status(400).json({
        error: 'Receipt not available',
        message: 'Receipt is only available for completed transactions'
      });
    }

    const receipt = {
      transactionId: transaction.id,
      timestamp: transaction.timestamp,
      amount: transaction.amount,
      currency: transaction.currency,
      fromWallet: transaction.fromWallet,
      toWallet: transaction.toWallet,
      description: transaction.description,
      status: transaction.status,
      fees: transaction.fees || 0,
      exchangeRate: transaction.exchangeRate || 1,
      confirmationNumber: transaction.confirmationNumber || `ECHO-${transaction.id.slice(-8).toUpperCase()}`,
      networkFee: transaction.networkFee || 0,
      processingTime: transaction.processingTime || '< 1 second',
      securityHash: transaction.securityHash || generateSecurityHash(transaction)
    };

    res.json({
      receipt
    });
  } catch (error) {
    logger.error('Receipt generation error:', error);
    res.status(500).json({
      error: 'Receipt generation failed',
      message: 'Unable to generate transaction receipt'
    });
  }
});

// Search transactions
router.get('/search', authenticateToken, [
  body('query').trim().isLength({ min: 1, max: 100 }),
  body('walletId').optional().isUUID(),
  body('dateFrom').optional().isISO8601(),
  body('dateTo').optional().isISO8601()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { query, walletId, dateFrom, dateTo } = req.body;

    // Search transactions
    const searchResults = await searchTransactions({
      query,
      walletId,
      dateFrom,
      dateTo,
      userId: req.user.userId
    });

    res.json({
      results: searchResults,
      totalCount: searchResults.length,
      query: query
    });
  } catch (error) {
    logger.error('Transaction search error:', error);
    res.status(500).json({
      error: 'Transaction search failed',
      message: 'Unable to search transactions'
    });
  }
});

// Helper functions
async function processTransaction(transactionRequest) {
  // Mock transaction processing - in production, this would call the transaction service
  const fraudScore = Math.random() * 0.5; // Mock fraud score

  if (fraudScore > 0.8) {
    const error = new Error('Transaction blocked due to fraud detection');
    error.code = 'FRAUD_DETECTED';
    error.fraudScore = fraudScore;
    throw error;
  }

  // Simulate balance check
  if (Math.random() < 0.1) { // 10% chance of insufficient funds for demo
    const error = new Error('Insufficient funds');
    error.code = 'INSUFFICIENT_FUNDS';
    throw error;
  }

  return {
    id: transactionRequest.id,
    status: fraudScore > 0.3 ? 'pending' : 'completed',
    timestamp: transactionRequest.timestamp,
    estimatedCompletion: moment().add(fraudScore > 0.3 ? 5 : 1, 'minutes').toISOString(),
    fraudScore,
    confirmationNumber: `ECHO-${transactionRequest.id.slice(-8).toUpperCase()}`
  };
}

async function getTransactionDetails(transactionId) {
  // Mock transaction details - in production, this would call the transaction service
  return {
    id: transactionId,
    fromWallet: 'wallet-1',
    toWallet: 'wallet-2',
    amount: 100.00,
    currency: 'USD-CBDC',
    status: 'completed',
    timestamp: moment().subtract(1, 'hour').toISOString(),
    description: 'Test transaction',
    fees: 0.50,
    fraudScore: 0.15,
    confirmationNumber: `ECHO-${transactionId.slice(-8).toUpperCase()}`
  };
}

async function cancelTransaction(transactionId) {
  // Mock transaction cancellation - in production, this would call the transaction service
  return {
    id: transactionId,
    status: 'cancelled',
    cancelledAt: new Date().toISOString()
  };
}

async function getFraudAnalysis(transactionId) {
  // Mock fraud analysis - in production, this would call the fraud detection service
  return {
    riskScore: 0.15,
    riskLevel: 'low',
    factors: [
      { factor: 'amount', score: 0.1, description: 'Transaction amount within normal range' },
      { factor: 'timing', score: 0.05, description: 'Transaction time consistent with user pattern' },
      { factor: 'location', score: 0.0, description: 'Transaction from known location' }
    ],
    recommendations: []
  };
}

function hasTransactionAccess(transaction, userId) {
  // In production, this would check if the user owns either wallet involved in the transaction
  return true; // Simplified for demo
}

function formatTransactionAmount(transaction) {
  const symbol = transaction.currency.includes('USD') ? '$' : 
                 transaction.currency.includes('EUR') ? '€' : 
                 transaction.currency.includes('GBP') ? '£' : 
                 transaction.currency.includes('JPY') ? '¥' : '';
  
  return `${symbol}${transaction.amount.toFixed(2)}`;
}

function getStatusDetails(status) {
  const statusMap = {
    pending: {
      message: 'Transaction is being processed',
      color: 'orange',
      icon: 'clock'
    },
    completed: {
      message: 'Transaction completed successfully',
      color: 'green',
      icon: 'check'
    },
    failed: {
      message: 'Transaction failed',
      color: 'red',
      icon: 'x'
    },
    cancelled: {
      message: 'Transaction was cancelled',
      color: 'gray',
      icon: 'x-circle'
    }
  };

  return statusMap[status] || statusMap.pending;
}

function generateTransactionTimeline(transaction) {
  const timeline = [
    {
      step: 'initiated',
      timestamp: transaction.timestamp,
      status: 'completed',
      description: 'Transaction initiated'
    }
  ];

  if (transaction.status === 'completed') {
    timeline.push({
      step: 'processed',
      timestamp: moment(transaction.timestamp).add(1, 'second').toISOString(),
      status: 'completed',
      description: 'Transaction processed'
    });
    timeline.push({
      step: 'completed',
      timestamp: moment(transaction.timestamp).add(2, 'seconds').toISOString(),
      status: 'completed',
      description: 'Transaction completed'
    });
  }

  return timeline;
}

function generateSecurityHash(transaction) {
  // Mock security hash generation
  return `sha256:${transaction.id}${transaction.timestamp}`.slice(0, 32);
}

async function searchTransactions(searchParams) {
  // Mock transaction search - in production, this would call the transaction service
  return [
    {
      id: 'tx-search-1',
      amount: 50.00,
      currency: 'USD-CBDC',
      status: 'completed',
      timestamp: moment().subtract(1, 'day').toISOString(),
      description: 'Coffee shop payment',
      relevanceScore: 0.9
    }
  ];
}

module.exports = router;