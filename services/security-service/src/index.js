const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const logger = require('./utils/logger');
const SecurityManager = require('./services/security-manager');
const IntrusionDetection = require('./services/intrusion-detection');
const DisasterRecovery = require('./services/disaster-recovery');
const EncryptionService = require('./services/encryption-service');
const AccessControl = require('./middleware/access-control');

const app = express();
const PORT = process.env.PORT || 3007;

// Initialize security services
const securityManager = new SecurityManager();
const intrusionDetection = new IntrusionDetection();
const disasterRecovery = new DisasterRecovery();
const encryptionService = new EncryptionService();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Access control middleware
app.use(AccessControl.authenticate);

// Security monitoring endpoints
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    service: 'security-service'
  });
});

app.get('/api/v1/security/status', AccessControl.requireRole('admin'), async (req, res) => {
  try {
    const status = await securityManager.getSecurityStatus();
    res.json(status);
  } catch (error) {
    logger.error('Error getting security status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/v1/security/threats', AccessControl.requireRole('security'), async (req, res) => {
  try {
    const threats = await intrusionDetection.getActiveThreats();
    res.json(threats);
  } catch (error) {
    logger.error('Error getting threats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/v1/security/encrypt', [
  AccessControl.requireRole('service'),
  body('data').notEmpty().withMessage('Data is required'),
  body('keyId').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { data, keyId } = req.body;
    const encrypted = await encryptionService.encrypt(data, keyId);
    res.json({ encrypted });
  } catch (error) {
    logger.error('Encryption error:', error);
    res.status(500).json({ error: 'Encryption failed' });
  }
});

app.post('/api/v1/security/decrypt', [
  AccessControl.requireRole('service'),
  body('encryptedData').notEmpty().withMessage('Encrypted data is required'),
  body('keyId').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { encryptedData, keyId } = req.body;
    const decrypted = await encryptionService.decrypt(encryptedData, keyId);
    res.json({ decrypted });
  } catch (error) {
    logger.error('Decryption error:', error);
    res.status(500).json({ error: 'Decryption failed' });
  }
});

app.post('/api/v1/security/backup', AccessControl.requireRole('admin'), async (req, res) => {
  try {
    const backupId = await disasterRecovery.createBackup();
    res.json({ backupId, message: 'Backup initiated successfully' });
  } catch (error) {
    logger.error('Backup error:', error);
    res.status(500).json({ error: 'Backup failed' });
  }
});

app.post('/api/v1/security/restore', [
  AccessControl.requireRole('admin'),
  body('backupId').notEmpty().withMessage('Backup ID is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { backupId } = req.body;
    await disasterRecovery.restoreFromBackup(backupId);
    res.json({ message: 'Restore completed successfully' });
  } catch (error) {
    logger.error('Restore error:', error);
    res.status(500).json({ error: 'Restore failed' });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  logger.error('Unhandled error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  logger.info(`Security service listening on port ${PORT}`);
  
  // Initialize security monitoring
  securityManager.initialize();
  intrusionDetection.startMonitoring();
  disasterRecovery.scheduleBackups();
});

module.exports = app;