const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const moment = require('moment');
const authRoutes = require('./auth');
const authenticateToken = authRoutes.authenticateToken;
const logger = require('../utils/logger');

const router = express.Router();

// Configure multer for evidence uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/reversal-evidence');
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `reversal-evidence-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 10 // Maximum 10 files
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf|doc|docx|txt/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only images, PDFs, and documents are allowed'));
    }
  }
});

// Mock storage for reversals (in production, this would be a database)
const reversals = new Map();
const reversalCounters = { current: 1 };

// Mock transaction flagging storage
const flaggedTransactions = new Map();
const suspiciousActivityAlerts = new Map();

// Get reversal history with filtering and pagination
router.get('/history', authenticateToken, [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('status').optional().isIn(['all', 'completed', 'pending', 'investigating', 'failed']),
  query('time').optional().isIn(['all', '7days', '30days', '90days', '1year']),
  query('type').optional().isIn(['all', 'fraud', 'error', 'dispute', 'chargeback']),
  query('search').optional().trim().isLength({ max: 100 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const {
      page = 1,
      limit = 10,
      status = 'all',
      time = 'all',
      type = 'all',
      search = ''
    } = req.query;

    // Filter reversals for the user
    let userReversals = Array.from(reversals.values())
      .filter(r => r.userId === req.user.userId);

    // Apply filters
    if (status !== 'all') {
      userReversals = userReversals.filter(r => r.status === status);
    }

    if (type !== 'all') {
      userReversals = userReversals.filter(r => r.type === type);
    }

    if (time !== 'all') {
      const timeFilters = {
        '7days': moment().subtract(7, 'days'),
        '30days': moment().subtract(30, 'days'),
        '90days': moment().subtract(90, 'days'),
        '1year': moment().subtract(1, 'year')
      };
      const cutoffDate = timeFilters[time];
      if (cutoffDate) {
        userReversals = userReversals.filter(r => moment(r.createdAt).isAfter(cutoffDate));
      }
    }

    if (search) {
      const searchLower = search.toLowerCase();
      userReversals = userReversals.filter(r => 
        r.caseNumber.toLowerCase().includes(searchLower) ||
        r.description.toLowerCase().includes(searchLower) ||
        (r.transactionId && r.transactionId.toLowerCase().includes(searchLower))
      );
    }

    // Sort by creation date (newest first)
    userReversals.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Pagination
    const totalCount = userReversals.length;
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    const paginatedReversals = userReversals.slice(startIndex, endIndex);

    // Enhance reversals with additional data
    const enhancedReversals = await Promise.all(
      paginatedReversals.map(async (reversal) => {
        const transactionDetails = await getTransactionDetails(reversal.transactionId);
        return {
          ...reversal,
          transactionDetails,
          relativeTime: moment(reversal.createdAt).fromNow(),
          estimatedResolution: getEstimatedResolution(reversal),
          canAddEvidence: canAddEvidence(reversal),
          canCancel: canCancelReversal(reversal)
        };
      })
    );

    res.json({
      reversals: enhancedReversals,
      totalCount,
      currentPage: parseInt(page),
      totalPages: Math.ceil(totalCount / limit),
      hasNextPage: endIndex < totalCount,
      hasPrevPage: page > 1
    });

  } catch (error) {
    logger.error('Reversal history fetch error:', error);
    res.status(500).json({
      error: 'Failed to fetch reversal history',
      message: 'Unable to retrieve reversal history'
    });
  }
});

// Get reversal statistics
router.get('/statistics', authenticateToken, async (req, res) => {
  try {
    const userReversals = Array.from(reversals.values())
      .filter(r => r.userId === req.user.userId);

    const stats = {
      total: userReversals.length,
      successful: userReversals.filter(r => r.status === 'completed').length,
      pending: userReversals.filter(r => ['pending', 'investigating'].includes(r.status)).length,
      failed: userReversals.filter(r => r.status === 'failed').length,
      amountRecovered: userReversals
        .filter(r => r.status === 'completed')
        .reduce((sum, r) => sum + (r.amount || 0), 0),
      successRate: userReversals.length > 0 
        ? Math.round((userReversals.filter(r => r.status === 'completed').length / userReversals.length) * 100)
        : 0,
      averageResolutionTime: calculateAverageResolutionTime(userReversals),
      monthlyTrend: getMonthlyReversalTrend(userReversals)
    };

    res.json(stats);

  } catch (error) {
    logger.error('Statistics fetch error:', error);
    res.status(500).json({
      error: 'Failed to fetch statistics',
      message: 'Unable to retrieve reversal statistics'
    });
  }
});

// Get specific reversal details
router.get('/:reversalId', authenticateToken, [
  param('reversalId').isUUID()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { reversalId } = req.params;
    const reversal = reversals.get(reversalId);

    if (!reversal) {
      return res.status(404).json({
        error: 'Reversal not found',
        message: 'Reversal not found'
      });
    }

    if (reversal.userId !== req.user.userId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have access to this reversal'
      });
    }

    // Enhance reversal with additional details
    const transactionDetails = await getTransactionDetails(reversal.transactionId);
    const enhancedReversal = {
      ...reversal,
      transactionDetails,
      canAddEvidence: canAddEvidence(reversal),
      canCancel: canCancelReversal(reversal),
      estimatedResolution: getEstimatedResolution(reversal),
      relativeTime: moment(reversal.createdAt).fromNow()
    };

    res.json(enhancedReversal);

  } catch (error) {
    logger.error('Reversal details fetch error:', error);
    res.status(500).json({
      error: 'Failed to fetch reversal details',
      message: 'Unable to retrieve reversal details'
    });
  }
});

// Submit transaction dispute
router.post('/dispute', authenticateToken, upload.array('evidenceFiles', 10), [
  body('transactionId').isUUID(),
  body('disputeReason').isIn(['unauthorized', 'fraud', 'error', 'duplicate', 'service_not_received', 'other']),
  body('disputeDescription').trim().isLength({ min: 20, max: 2000 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { transactionId, disputeReason, disputeDescription } = req.body;
    const evidenceFiles = req.files || [];

    // Verify transaction exists and user has access
    const transaction = await getTransactionDetails(transactionId);
    if (!transaction) {
      return res.status(404).json({
        error: 'Transaction not found',
        message: 'Transaction not found or access denied'
      });
    }

    if (!hasTransactionAccess(transaction, req.user.userId)) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have access to this transaction'
      });
    }

    // Check if transaction is already disputed
    const existingDispute = Array.from(reversals.values())
      .find(r => r.transactionId === transactionId && r.userId === req.user.userId);

    if (existingDispute) {
      return res.status(400).json({
        error: 'Transaction already disputed',
        message: 'This transaction has already been disputed',
        existingCaseNumber: existingDispute.caseNumber
      });
    }

    // Generate case number and ID
    const caseNumber = `REV-${new Date().getFullYear()}-${String(reversalCounters.current++).padStart(6, '0')}`;
    const reversalId = uuidv4();

    // Process evidence files
    const evidence = evidenceFiles.map(file => ({
      id: uuidv4(),
      name: file.originalname,
      filename: file.filename,
      size: formatFileSize(file.size),
      type: getFileType(file.mimetype),
      url: `/uploads/reversal-evidence/${file.filename}`,
      uploadedAt: new Date().toISOString()
    }));

    // Determine priority and type
    const priority = determinePriority(disputeReason, transaction.amount);
    const type = mapDisputeReasonToType(disputeReason);

    // Create reversal case
    const reversal = {
      id: reversalId,
      caseNumber,
      userId: req.user.userId,
      transactionId,
      status: 'pending',
      type,
      priority,
      reason: disputeReason,
      description: disputeDescription,
      amount: transaction.amount,
      currency: transaction.currency,
      evidence,
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      timeline: [
        {
          id: uuidv4(),
          type: 'submission',
          status: 'completed',
          title: 'Dispute Submitted',
          description: 'Transaction dispute has been submitted and is under review.',
          timestamp: new Date().toISOString(),
          details: `Case ${caseNumber} created with ${priority} priority.`
        }
      ],
      progress: {
        percentage: 15,
        description: 'Dispute submitted, initial review in progress'
      }
    };

    // Store the reversal
    reversals.set(reversalId, reversal);

    // Flag the transaction for monitoring
    flagTransaction(transactionId, disputeReason, req.user.userId);

    // Simulate automatic processing for high priority cases
    if (priority === 'high' || priority === 'urgent') {
      setTimeout(() => {
        processHighPriorityDispute(reversalId);
      }, 2000);
    }

    // Emit real-time update
    const io = req.app.get('io');
    io.to(`user-${req.user.userId}`).emit('new-reversal-created', {
      reversalId,
      caseNumber,
      status: 'pending',
      priority,
      message: 'Your dispute has been submitted successfully',
      timestamp: new Date().toISOString()
    });

    logger.info('Transaction dispute submitted', {
      reversalId,
      caseNumber,
      transactionId,
      userId: req.user.userId,
      reason: disputeReason,
      priority
    });

    res.status(201).json({
      message: 'Dispute submitted successfully',
      reversalId,
      caseNumber,
      status: 'pending',
      priority,
      estimatedResolution: getEstimatedResolution({ priority, type }),
      trackingUrl: `/reversal-history.html?case=${caseNumber}`
    });

  } catch (error) {
    logger.error('Dispute submission error:', error);
    res.status(500).json({
      error: 'Dispute submission failed',
      message: 'Unable to submit dispute'
    });
  }
});

// Add evidence to existing reversal
router.post('/:reversalId/evidence', authenticateToken, upload.array('evidenceFiles', 5), [
  param('reversalId').isUUID(),
  body('description').trim().isLength({ min: 1, max: 500 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { reversalId } = req.params;
    const { description } = req.body;
    const evidenceFiles = req.files || [];

    if (evidenceFiles.length === 0) {
      return res.status(400).json({
        error: 'No files uploaded',
        message: 'Please select at least one file to upload'
      });
    }

    const reversal = reversals.get(reversalId);
    if (!reversal) {
      return res.status(404).json({
        error: 'Reversal not found',
        message: 'Reversal not found'
      });
    }

    if (reversal.userId !== req.user.userId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have access to this reversal'
      });
    }

    if (!canAddEvidence(reversal)) {
      return res.status(400).json({
        error: 'Evidence not allowed',
        message: 'Evidence cannot be added to this reversal in its current status'
      });
    }

    // Process new evidence files
    const newEvidence = evidenceFiles.map(file => ({
      id: uuidv4(),
      name: file.originalname,
      filename: file.filename,
      size: formatFileSize(file.size),
      type: getFileType(file.mimetype),
      url: `/uploads/reversal-evidence/${file.filename}`,
      uploadedAt: new Date().toISOString(),
      description
    }));

    // Add evidence to reversal
    if (!reversal.evidence) {
      reversal.evidence = [];
    }
    reversal.evidence.push(...newEvidence);

    // Add timeline entry
    reversal.timeline.push({
      id: uuidv4(),
      type: 'evidence',
      status: 'completed',
      title: 'New Evidence Added',
      description: `${newEvidence.length} evidence file(s) uploaded: ${description}`,
      timestamp: new Date().toISOString(),
      attachments: newEvidence.map(e => ({
        name: e.name,
        url: e.url
      }))
    });

    reversal.lastUpdated = new Date().toISOString();

    // Emit real-time update
    const io = req.app.get('io');
    io.to(`user-${req.user.userId}`).emit('reversal-evidence-added', {
      reversalId,
      caseNumber: reversal.caseNumber,
      evidenceCount: newEvidence.length,
      message: 'New evidence has been added to your reversal case'
    });

    logger.info('Evidence added to reversal', {
      reversalId,
      caseNumber: reversal.caseNumber,
      evidenceCount: newEvidence.length,
      userId: req.user.userId
    });

    res.status(201).json({
      message: 'Evidence added successfully',
      evidenceCount: newEvidence.length,
      totalEvidence: reversal.evidence.length
    });

  } catch (error) {
    logger.error('Evidence upload error:', error);
    res.status(500).json({
      error: 'Evidence upload failed',
      message: 'Unable to upload evidence'
    });
  }
});

// Cancel reversal
router.post('/:reversalId/cancel', authenticateToken, [
  param('reversalId').isUUID(),
  body('reason').optional().trim().isLength({ max: 500 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { reversalId } = req.params;
    const { reason } = req.body;

    const reversal = reversals.get(reversalId);
    if (!reversal) {
      return res.status(404).json({
        error: 'Reversal not found',
        message: 'Reversal not found'
      });
    }

    if (reversal.userId !== req.user.userId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have access to this reversal'
      });
    }

    if (!canCancelReversal(reversal)) {
      return res.status(400).json({
        error: 'Cannot cancel reversal',
        message: 'This reversal cannot be cancelled in its current status'
      });
    }

    // Update reversal status
    reversal.status = 'cancelled';
    reversal.lastUpdated = new Date().toISOString();
    reversal.cancelledAt = new Date().toISOString();
    reversal.cancellationReason = reason;

    // Add timeline entry
    reversal.timeline.push({
      id: uuidv4(),
      type: 'cancellation',
      status: 'completed',
      title: 'Reversal Cancelled',
      description: reason || 'Reversal cancelled by user request',
      timestamp: new Date().toISOString()
    });

    // Update progress
    reversal.progress = {
      percentage: 100,
      description: 'Reversal cancelled'
    };

    // Unlag transaction if it was flagged
    unflagTransaction(reversal.transactionId);

    // Emit real-time update
    const io = req.app.get('io');
    io.to(`user-${req.user.userId}`).emit('reversal-cancelled', {
      reversalId,
      caseNumber: reversal.caseNumber,
      message: 'Your reversal has been cancelled'
    });

    logger.info('Reversal cancelled', {
      reversalId,
      caseNumber: reversal.caseNumber,
      userId: req.user.userId,
      reason
    });

    res.json({
      message: 'Reversal cancelled successfully',
      status: 'cancelled',
      cancelledAt: reversal.cancelledAt
    });

  } catch (error) {
    logger.error('Reversal cancellation error:', error);
    res.status(500).json({
      error: 'Reversal cancellation failed',
      message: 'Unable to cancel reversal'
    });
  }
});

// Export reversal history
router.get('/export', authenticateToken, async (req, res) => {
  try {
    const userReversals = Array.from(reversals.values())
      .filter(r => r.userId === req.user.userId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Generate CSV content
    const csvHeader = 'Case Number,Status,Type,Amount,Currency,Created Date,Last Updated,Description,Transaction ID\n';
    const csvRows = userReversals.map(r => {
      return [
        r.caseNumber,
        r.status,
        r.type,
        r.amount || '',
        r.currency || '',
        new Date(r.createdAt).toISOString(),
        new Date(r.lastUpdated).toISOString(),
        `"${r.description.replace(/"/g, '""')}"`,
        r.transactionId || ''
      ].join(',');
    }).join('\n');

    const csvContent = csvHeader + csvRows;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="reversal-history-${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csvContent);

  } catch (error) {
    logger.error('Export error:', error);
    res.status(500).json({
      error: 'Export failed',
      message: 'Unable to export reversal history'
    });
  }
});

// Get flagged transactions
router.get('/flagged-transactions', authenticateToken, async (req, res) => {
  try {
    const userFlaggedTransactions = Array.from(flaggedTransactions.values())
      .filter(ft => ft.userId === req.user.userId)
      .sort((a, b) => new Date(b.flaggedAt) - new Date(a.flaggedAt));

    const enhancedTransactions = await Promise.all(
      userFlaggedTransactions.map(async (flagged) => {
        const transactionDetails = await getTransactionDetails(flagged.transactionId);
        return {
          ...flagged,
          transactionDetails,
          relativeTime: moment(flagged.flaggedAt).fromNow()
        };
      })
    );

    res.json({
      flaggedTransactions: enhancedTransactions,
      totalCount: enhancedTransactions.length
    });

  } catch (error) {
    logger.error('Flagged transactions fetch error:', error);
    res.status(500).json({
      error: 'Failed to fetch flagged transactions',
      message: 'Unable to retrieve flagged transactions'
    });
  }
});

// Get suspicious activity alerts
router.get('/suspicious-alerts', authenticateToken, async (req, res) => {
  try {
    const userAlerts = Array.from(suspiciousActivityAlerts.values())
      .filter(alert => alert.userId === req.user.userId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 20); // Return last 20 alerts

    res.json({
      alerts: userAlerts,
      totalCount: userAlerts.length
    });

  } catch (error) {
    logger.error('Suspicious alerts fetch error:', error);
    res.status(500).json({
      error: 'Failed to fetch suspicious alerts',
      message: 'Unable to retrieve suspicious activity alerts'
    });
  }
});

// Flag transaction for monitoring
router.post('/flag-transaction', authenticateToken, [
  body('transactionId').isUUID(),
  body('reason').isIn(['suspicious_activity', 'potential_fraud', 'unusual_pattern', 'high_risk', 'manual_review', 'other']),
  body('description').optional().trim().isLength({ max: 500 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { transactionId, reason, description } = req.body;

    // Verify transaction exists and user has access
    const transaction = await getTransactionDetails(transactionId);
    if (!transaction) {
      return res.status(404).json({
        error: 'Transaction not found',
        message: 'Transaction not found or access denied'
      });
    }

    if (!hasTransactionAccess(transaction, req.user.userId)) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have access to this transaction'
      });
    }

    // Check if transaction is already flagged by this user
    const existingFlag = Array.from(flaggedTransactions.values())
      .find(ft => ft.transactionId === transactionId && ft.userId === req.user.userId);

    if (existingFlag) {
      return res.status(400).json({
        error: 'Transaction already flagged',
        message: 'This transaction has already been flagged by you'
      });
    }

    // Flag the transaction
    flagTransaction(transactionId, reason, req.user.userId, description);

    // Emit real-time update
    const io = req.app.get('io');
    io.to(`user-${req.user.userId}`).emit('transaction-flagged', {
      transactionId,
      reason,
      message: 'Transaction has been flagged for review',
      timestamp: new Date().toISOString()
    });

    logger.info('Transaction flagged', {
      transactionId,
      userId: req.user.userId,
      reason,
      description
    });

    res.status(201).json({
      message: 'Transaction flagged successfully',
      transactionId,
      reason,
      flaggedAt: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Transaction flagging error:', error);
    res.status(500).json({
      error: 'Transaction flagging failed',
      message: 'Unable to flag transaction'
    });
  }
});

// Unflag transaction
router.post('/unflag-transaction/:flagId', authenticateToken, [
  param('flagId').isUUID()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { flagId } = req.params;

    const flag = flaggedTransactions.get(flagId);
    if (!flag) {
      return res.status(404).json({
        error: 'Flag not found',
        message: 'Flag not found'
      });
    }

    if (flag.userId !== req.user.userId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have access to this flag'
      });
    }

    // Update flag status
    flag.status = 'resolved';
    flag.resolvedAt = new Date().toISOString();
    flag.resolvedBy = req.user.userId;

    // Emit real-time update
    const io = req.app.get('io');
    io.to(`user-${req.user.userId}`).emit('transaction-unflagged', {
      transactionId: flag.transactionId,
      message: 'Transaction flag has been removed',
      timestamp: new Date().toISOString()
    });

    logger.info('Transaction unflagged', {
      flagId,
      transactionId: flag.transactionId,
      userId: req.user.userId
    });

    res.json({
      message: 'Transaction unflagged successfully',
      transactionId: flag.transactionId,
      unflaggedAt: flag.resolvedAt
    });

  } catch (error) {
    logger.error('Transaction unflagging error:', error);
    res.status(500).json({
      error: 'Transaction unflagging failed',
      message: 'Unable to unflag transaction'
    });
  }
});

// Helper functions
async function getTransactionDetails(transactionId) {
  if (!transactionId) return null;
  
  // Mock transaction details - in production, this would call the transaction service
  return {
    id: transactionId,
    fromWallet: 'wallet-1',
    toWallet: 'wallet-2',
    amount: 100.00,
    currency: 'USD-CBDC',
    status: 'completed',
    timestamp: moment().subtract(1, 'day').toISOString(),
    description: 'Test transaction'
  };
}

function hasTransactionAccess(transaction, userId) {
  // In production, this would check if the user owns either wallet involved in the transaction
  return true; // Simplified for demo
}

function determinePriority(reason, amount) {
  if (reason === 'fraud' || (amount && amount > 10000)) return 'urgent';
  if (reason === 'unauthorized' || (amount && amount > 1000)) return 'high';
  if (reason === 'error' || reason === 'duplicate') return 'medium';
  return 'low';
}

function mapDisputeReasonToType(reason) {
  const mapping = {
    'unauthorized': 'fraud',
    'fraud': 'fraud',
    'error': 'error',
    'duplicate': 'error',
    'service_not_received': 'dispute',
    'other': 'dispute'
  };
  return mapping[reason] || 'dispute';
}

function getEstimatedResolution(reversal) {
  const resolutionTimes = {
    'urgent': 'Within 24 hours',
    'high': 'Within 48 hours',
    'medium': 'Within 72 hours',
    'low': 'Within 5 business days'
  };
  return resolutionTimes[reversal.priority] || resolutionTimes['medium'];
}

function canAddEvidence(reversal) {
  return ['pending', 'investigating', 'evidence_review'].includes(reversal.status);
}

function canCancelReversal(reversal) {
  return ['pending', 'investigating'].includes(reversal.status);
}

function flagTransaction(transactionId, reason, userId, description = null) {
  const flagId = uuidv4();
  flaggedTransactions.set(flagId, {
    id: flagId,
    transactionId,
    userId,
    reason,
    description,
    flaggedAt: new Date().toISOString(),
    status: 'active'
  });

  // Create suspicious activity alert
  createSuspiciousActivityAlert(userId, transactionId, reason);
}

function unflagTransaction(transactionId) {
  for (const [flagId, flag] of flaggedTransactions.entries()) {
    if (flag.transactionId === transactionId) {
      flag.status = 'resolved';
      flag.resolvedAt = new Date().toISOString();
    }
  }
}

function createSuspiciousActivityAlert(userId, transactionId, reason) {
  const alertId = uuidv4();
  suspiciousActivityAlerts.set(alertId, {
    id: alertId,
    userId,
    transactionId,
    type: 'transaction_disputed',
    severity: 'medium',
    title: 'Transaction Disputed',
    message: `Transaction ${transactionId.slice(0, 8)}... has been disputed for: ${reason}`,
    createdAt: new Date().toISOString(),
    read: false,
    actions: [
      {
        label: 'View Transaction',
        url: `/transaction/${transactionId}`
      },
      {
        label: 'View Dispute',
        url: `/reversal-history.html`
      }
    ]
  });
}

function processHighPriorityDispute(reversalId) {
  const reversal = reversals.get(reversalId);
  if (!reversal) return;

  // Simulate automated processing for high priority disputes
  reversal.status = 'investigating';
  reversal.progress = {
    percentage: 40,
    description: 'High priority case - automated investigation in progress'
  };

  reversal.timeline.push({
    id: uuidv4(),
    type: 'investigation',
    status: 'completed',
    title: 'Investigation Started',
    description: 'High priority case automatically escalated for investigation',
    timestamp: new Date().toISOString()
  });

  reversal.lastUpdated = new Date().toISOString();
}

function calculateAverageResolutionTime(reversals) {
  const completedReversals = reversals.filter(r => r.status === 'completed' && r.resolvedAt);
  if (completedReversals.length === 0) return 0;

  const totalTime = completedReversals.reduce((sum, r) => {
    const created = new Date(r.createdAt);
    const resolved = new Date(r.resolvedAt);
    return sum + (resolved - created);
  }, 0);

  return Math.round(totalTime / completedReversals.length / (1000 * 60 * 60 * 24)); // Days
}

function getMonthlyReversalTrend(reversals) {
  const last6Months = [];
  for (let i = 5; i >= 0; i--) {
    const month = moment().subtract(i, 'months');
    const monthReversals = reversals.filter(r => 
      moment(r.createdAt).isSame(month, 'month')
    );
    last6Months.push({
      month: month.format('MMM YYYY'),
      count: monthReversals.length,
      successful: monthReversals.filter(r => r.status === 'completed').length
    });
  }
  return last6Months;
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getFileType(mimetype) {
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype === 'application/pdf') return 'pdf';
  if (mimetype.includes('document') || mimetype.includes('word')) return 'document';
  return 'file';
}

module.exports = router;