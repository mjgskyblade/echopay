const express = require('express');
const { body, param, validationResult } = require('express-validator');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const moment = require('moment');
const authRoutes = require('./auth');
const authenticateToken = authRoutes.authenticateToken;
const logger = require('../utils/logger');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/evidence');
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `evidence-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 5 // Maximum 5 files
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

// Mock fraud cases storage (in production, this would be a database)
const fraudCases = new Map();
const caseCounters = { current: 1 };

// Submit fraud report
router.post('/report', authenticateToken, [
  body('fraudType').isIn(['unauthorized_transaction', 'account_takeover', 'phishing_scam', 'fake_merchant', 'social_engineering', 'identity_theft', 'other']),
  body('briefDescription').trim().isLength({ min: 10, max: 500 }),
  body('detailedDescription').trim().isLength({ min: 20, max: 2000 }),
  body('discoveryDate').isISO8601(),
  body('contactedRecipient').isIn(['yes', 'no', 'unable', 'unknown_recipient']),
  body('transactionId').optional().isUUID(),
  body('amount').optional().isFloat({ min: 0 }),
  body('currency').optional().isIn(['USD-CBDC', 'EUR-CBDC', 'GBP-CBDC', 'JPY-CBDC'])
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
      fraudType,
      briefDescription,
      detailedDescription,
      discoveryDate,
      contactedRecipient,
      transactionId,
      transactionDate,
      amount,
      currency,
      additionalInfo,
      evidenceFiles,
      notificationPreferences
    } = req.body;

    // Generate case number and ID
    const caseNumber = `FRAUD-${new Date().getFullYear()}-${String(caseCounters.current++).padStart(6, '0')}`;
    const caseId = uuidv4();

    // Determine priority based on fraud type and amount
    const priority = determinePriority(fraudType, amount);

    // Create fraud case
    const fraudCase = {
      id: caseId,
      caseNumber,
      userId: req.user.userId,
      status: 'submitted',
      priority,
      fraudType,
      briefDescription,
      detailedDescription,
      discoveryDate,
      contactedRecipient,
      transactionId: transactionId || null,
      transactionDate: transactionDate || null,
      amount: amount || null,
      currency: currency || null,
      additionalInfo: additionalInfo || null,
      evidenceFiles: evidenceFiles || [],
      notificationPreferences: notificationPreferences || ['email'],
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      assignedInvestigator: null,
      investigators: [],
      timeline: [
        {
          id: uuidv4(),
          type: 'submission',
          status: 'completed',
          title: 'Fraud Report Submitted',
          description: 'Your fraud report has been successfully submitted and assigned a case number.',
          timestamp: new Date().toISOString(),
          details: `Case ${caseNumber} created with ${priority} priority.`
        }
      ],
      progress: {
        percentage: 10,
        description: 'Report submitted, awaiting initial review'
      }
    };

    // Store the case
    fraudCases.set(caseId, fraudCase);

    // Simulate automatic assignment for high priority cases
    if (priority === 'high' || priority === 'urgent') {
      setTimeout(() => {
        assignInvestigator(caseId, 'high-priority-team');
      }, 1000);
    }

    // Emit real-time update
    const io = req.app.get('io');
    io.to(`user-${req.user.userId}`).emit('fraud-case-created', {
      caseId,
      caseNumber,
      status: 'submitted',
      priority,
      message: 'Your fraud report has been submitted successfully',
      timestamp: new Date().toISOString()
    });

    // Send push notification data for service worker
    io.to(`user-${req.user.userId}`).emit('push-notification', {
      title: 'Fraud Report Submitted',
      body: `Your fraud report has been submitted with case number ${caseNumber}`,
      icon: '/favicon.ico',
      tag: `case-created-${caseId}`,
      data: { caseId, caseNumber, type: 'case-created' }
    });

    logger.info('Fraud report submitted', {
      caseId,
      caseNumber,
      userId: req.user.userId,
      fraudType,
      priority
    });

    res.status(201).json({
      message: 'Fraud report submitted successfully',
      caseId,
      caseNumber,
      status: 'submitted',
      priority,
      expectedResolution: getExpectedResolutionTime(priority),
      trackingUrl: `/fraud-case-tracker.html?case=${caseNumber}`
    });

  } catch (error) {
    logger.error('Fraud report submission error:', error);
    res.status(500).json({
      error: 'Fraud report submission failed',
      message: 'Unable to submit fraud report'
    });
  }
});

// Get fraud case details
router.get('/case/:caseNumber', authenticateToken, [
  param('caseNumber').matches(/^FRAUD-\d{4}-\d{6}$/)
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Invalid case number format',
        details: errors.array()
      });
    }

    const { caseNumber } = req.params;
    
    // Find case by case number
    const fraudCase = Array.from(fraudCases.values()).find(c => c.caseNumber === caseNumber);

    if (!fraudCase) {
      return res.status(404).json({
        error: 'Case not found',
        message: 'Fraud case not found'
      });
    }

    // Check if user has access to this case
    if (fraudCase.userId !== req.user.userId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have access to this case'
      });
    }

    // Add computed fields
    const enhancedCase = {
      ...fraudCase,
      timeElapsed: moment().diff(moment(fraudCase.createdAt), 'hours'),
      expectedResolution: getExpectedResolutionTime(fraudCase.priority),
      canAddEvidence: ['submitted', 'under_investigation', 'evidence_review'].includes(fraudCase.status)
    };

    res.json({
      case: enhancedCase
    });

  } catch (error) {
    logger.error('Case retrieval error:', error);
    res.status(500).json({
      error: 'Case retrieval failed',
      message: 'Unable to retrieve case details'
    });
  }
});

// Get user's fraud cases
router.get('/cases/my-cases', authenticateToken, async (req, res) => {
  try {
    const userCases = Array.from(fraudCases.values())
      .filter(c => c.userId === req.user.userId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 10); // Return last 10 cases

    const caseSummaries = userCases.map(c => ({
      id: c.id,
      caseNumber: c.caseNumber,
      status: c.status,
      priority: c.priority,
      fraudType: c.fraudType,
      amount: c.amount,
      currency: c.currency,
      createdAt: c.createdAt,
      lastUpdated: c.lastUpdated,
      progress: c.progress
    }));

    res.json({
      cases: caseSummaries,
      totalCount: caseSummaries.length
    });

  } catch (error) {
    logger.error('User cases retrieval error:', error);
    res.status(500).json({
      error: 'Cases retrieval failed',
      message: 'Unable to retrieve your cases'
    });
  }
});

// Upload evidence file
router.post('/evidence', authenticateToken, upload.single('file'), [
  body('caseId').isUUID(),
  body('type').isIn(['screenshot', 'document', 'communication', 'other']),
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

    const { caseId, type, description } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({
        error: 'No file uploaded',
        message: 'Please select a file to upload'
      });
    }

    // Find the case
    const fraudCase = fraudCases.get(caseId);
    if (!fraudCase) {
      return res.status(404).json({
        error: 'Case not found',
        message: 'Fraud case not found'
      });
    }

    // Check if user owns the case
    if (fraudCase.userId !== req.user.userId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have access to this case'
      });
    }

    // Check if case allows evidence submission
    if (!['submitted', 'under_investigation', 'evidence_review'].includes(fraudCase.status)) {
      return res.status(400).json({
        error: 'Evidence not allowed',
        message: 'Evidence cannot be added to this case in its current status'
      });
    }

    // Create evidence record
    const evidence = {
      id: uuidv4(),
      type,
      description,
      filename: file.filename,
      originalName: file.originalname,
      size: file.size,
      mimetype: file.mimetype,
      url: `/uploads/evidence/${file.filename}`,
      uploadedAt: new Date().toISOString(),
      uploadedBy: req.user.userId
    };

    // Add evidence to case
    if (!fraudCase.evidenceFiles) {
      fraudCase.evidenceFiles = [];
    }
    fraudCase.evidenceFiles.push(evidence);

    // Add timeline entry
    fraudCase.timeline.push({
      id: uuidv4(),
      type: 'evidence',
      status: 'completed',
      title: 'New Evidence Added',
      description: `${type.charAt(0).toUpperCase() + type.slice(1)} evidence uploaded: ${description}`,
      timestamp: new Date().toISOString(),
      attachments: [{
        name: file.originalname,
        url: evidence.url
      }]
    });

    // Update case
    fraudCase.lastUpdated = new Date().toISOString();

    // Emit real-time update
    const io = req.app.get('io');
    io.to(`case-${caseId}`).emit('new-evidence-added', {
      caseId,
      evidence: fraudCase.evidenceFiles,
      message: 'New evidence has been added to your case'
    });

    logger.info('Evidence uploaded', {
      caseId,
      evidenceId: evidence.id,
      filename: file.originalname,
      type
    });

    res.status(201).json({
      message: 'Evidence uploaded successfully',
      evidence: {
        id: evidence.id,
        type: evidence.type,
        description: evidence.description,
        filename: evidence.originalName,
        uploadedAt: evidence.uploadedAt
      }
    });

  } catch (error) {
    logger.error('Evidence upload error:', error);
    res.status(500).json({
      error: 'Evidence upload failed',
      message: 'Unable to upload evidence'
    });
  }
});

// Generate case report
router.get('/case/:caseNumber/report', authenticateToken, [
  param('caseNumber').matches(/^FRAUD-\d{4}-\d{6}$/)
], async (req, res) => {
  try {
    const { caseNumber } = req.params;
    
    const fraudCase = Array.from(fraudCases.values()).find(c => c.caseNumber === caseNumber);

    if (!fraudCase || fraudCase.userId !== req.user.userId) {
      return res.status(404).json({
        error: 'Case not found',
        message: 'Case not found or access denied'
      });
    }

    // Generate report content
    const reportContent = generateCaseReport(fraudCase);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="fraud-case-${caseNumber}.pdf"`);
    
    // In a real implementation, you would use a PDF generation library
    // For now, return plain text
    res.setHeader('Content-Type', 'text/plain');
    res.send(reportContent);

  } catch (error) {
    logger.error('Report generation error:', error);
    res.status(500).json({
      error: 'Report generation failed',
      message: 'Unable to generate case report'
    });
  }
});

// Update case status (internal API for investigators)
router.put('/case/:caseId/status', authenticateToken, [
  param('caseId').isUUID(),
  body('status').isIn(['submitted', 'under_investigation', 'evidence_review', 'resolved', 'closed']),
  body('message').optional().trim().isLength({ max: 500 }),
  body('investigatorId').optional().isUUID()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { caseId } = req.params;
    const { status, message, investigatorId } = req.body;

    const fraudCase = fraudCases.get(caseId);
    if (!fraudCase) {
      return res.status(404).json({
        error: 'Case not found',
        message: 'Fraud case not found'
      });
    }

    // Update case status
    const oldStatus = fraudCase.status;
    fraudCase.status = status;
    fraudCase.lastUpdated = new Date().toISOString();

    // Update progress
    fraudCase.progress = getProgressForStatus(status);

    // Add timeline entry
    fraudCase.timeline.push({
      id: uuidv4(),
      type: 'decision',
      status: 'completed',
      title: `Status Changed to ${status.replace('_', ' ').toUpperCase()}`,
      description: message || `Case status updated from ${oldStatus} to ${status}`,
      timestamp: new Date().toISOString(),
      investigator: investigatorId
    });

    // Emit real-time update
    const io = req.app.get('io');
    io.to(`case-${caseId}`).emit('case-status-change', {
      caseId,
      oldStatus,
      newStatus: status,
      priority: fraudCase.priority,
      progress: fraudCase.progress,
      message: message || `Your case status has been updated to ${status.replace('_', ' ')}`,
      timestamp: new Date().toISOString()
    });

    // Send push notification for status changes
    io.to(`user-${fraudCase.userId}`).emit('push-notification', {
      title: 'Case Status Update',
      body: message || `Your fraud case status has been updated to ${status.replace('_', ' ')}`,
      icon: '/favicon.ico',
      tag: `status-${caseId}`,
      data: { caseId, status, type: 'status-change' }
    });

    logger.info('Case status updated', {
      caseId,
      oldStatus,
      newStatus: status,
      investigatorId
    });

    res.json({
      message: 'Case status updated successfully',
      status,
      progress: fraudCase.progress
    });

  } catch (error) {
    logger.error('Status update error:', error);
    res.status(500).json({
      error: 'Status update failed',
      message: 'Unable to update case status'
    });
  }
});

// Helper functions
function determinePriority(fraudType, amount) {
  // High priority for large amounts or serious fraud types
  if (amount && amount > 10000) return 'urgent';
  if (['account_takeover', 'identity_theft'].includes(fraudType)) return 'high';
  if (amount && amount > 1000) return 'high';
  if (['unauthorized_transaction', 'phishing_scam'].includes(fraudType)) return 'medium';
  return 'low';
}

function getExpectedResolutionTime(priority) {
  const times = {
    'urgent': 'Within 24 hours',
    'high': 'Within 48 hours',
    'medium': 'Within 72 hours',
    'low': 'Within 5 business days'
  };
  return times[priority] || times['medium'];
}

function getProgressForStatus(status) {
  const progressMap = {
    'submitted': { percentage: 10, description: 'Report submitted, awaiting initial review' },
    'under_investigation': { percentage: 40, description: 'Investigation in progress' },
    'evidence_review': { percentage: 70, description: 'Evidence review and analysis' },
    'resolved': { percentage: 100, description: 'Case resolved successfully' },
    'closed': { percentage: 100, description: 'Case closed' }
  };
  return progressMap[status] || progressMap['submitted'];
}

function assignInvestigator(caseId, team) {
  const fraudCase = fraudCases.get(caseId);
  if (!fraudCase) return;

  // Mock investigator assignment
  const investigators = [
    { id: uuidv4(), name: 'Sarah Johnson', role: 'Senior Fraud Investigator', online: true },
    { id: uuidv4(), name: 'Mike Chen', role: 'Fraud Analyst', online: false }
  ];

  fraudCase.assignedInvestigator = investigators[0].name;
  fraudCase.investigators = investigators;
  fraudCase.status = 'under_investigation';
  fraudCase.progress = getProgressForStatus('under_investigation');

  // Add timeline entry
  fraudCase.timeline.push({
    id: uuidv4(),
    type: 'assignment',
    status: 'completed',
    title: 'Investigator Assigned',
    description: `Case assigned to ${investigators[0].name} for investigation`,
    timestamp: new Date().toISOString()
  });

  fraudCase.lastUpdated = new Date().toISOString();
}

function generateCaseReport(fraudCase) {
  return `
ECHOPAY FRAUD CASE REPORT
========================

Case Number: ${fraudCase.caseNumber}
Case ID: ${fraudCase.id}
Status: ${fraudCase.status.toUpperCase()}
Priority: ${fraudCase.priority.toUpperCase()}

CASE DETAILS
-----------
Fraud Type: ${fraudCase.fraudType.replace('_', ' ').toUpperCase()}
Submitted: ${new Date(fraudCase.createdAt).toLocaleString()}
Last Updated: ${new Date(fraudCase.lastUpdated).toLocaleString()}

${fraudCase.transactionId ? `Transaction ID: ${fraudCase.transactionId}` : ''}
${fraudCase.amount ? `Amount: ${fraudCase.currency} ${fraudCase.amount}` : ''}

DESCRIPTION
----------
${fraudCase.briefDescription}

DETAILED DESCRIPTION
-------------------
${fraudCase.detailedDescription}

DISCOVERY INFORMATION
--------------------
Discovery Date: ${new Date(fraudCase.discoveryDate).toLocaleString()}
Contacted Recipient: ${fraudCase.contactedRecipient.replace('_', ' ').toUpperCase()}

${fraudCase.additionalInfo ? `
ADDITIONAL INFORMATION
---------------------
${fraudCase.additionalInfo}
` : ''}

EVIDENCE FILES
-------------
${fraudCase.evidenceFiles ? fraudCase.evidenceFiles.map(file => 
  `- ${file.originalName} (${file.type}, uploaded ${new Date(file.uploadedAt).toLocaleString()})`
).join('\n') : 'No evidence files uploaded'}

INVESTIGATION TIMELINE
---------------------
${fraudCase.timeline.map(item => 
  `${new Date(item.timestamp).toLocaleString()} - ${item.title}: ${item.description}`
).join('\n')}

${fraudCase.assignedInvestigator ? `
ASSIGNED INVESTIGATOR
--------------------
${fraudCase.assignedInvestigator}
` : ''}

Report generated on: ${new Date().toLocaleString()}
  `.trim();
}

module.exports = router;