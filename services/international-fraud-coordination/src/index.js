const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { RateLimiterMemory } = require('rate-limiter-flexible');
const logger = require('./utils/logger');
const crossBorderFraudDetection = require('./services/cross-border-fraud-detection');
const internationalCaseCoordination = require('./services/international-case-coordination');
const secureChannelManager = require('./services/secure-channel-manager');

const app = express();
const PORT = process.env.PORT || 3007;

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true
}));

// Rate limiting
const rateLimiter = new RateLimiterMemory({
  keyGenerator: (req) => req.ip,
  points: 100, // Number of requests
  duration: 60, // Per 60 seconds
});

app.use(async (req, res, next) => {
  try {
    await rateLimiter.consume(req.ip);
    next();
  } catch (rejRes) {
    res.status(429).json({ error: 'Too many requests' });
  }
});

app.use(express.json({ limit: '10mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'international-fraud-coordination',
    timestamp: new Date().toISOString()
  });
});

// Cross-border fraud detection routes
app.post('/api/v1/cross-border/analyze', async (req, res) => {
  try {
    const { transactionData, jurisdictions } = req.body;
    const analysis = await crossBorderFraudDetection.analyzeTransaction(transactionData, jurisdictions);
    res.json(analysis);
  } catch (error) {
    logger.error('Cross-border analysis failed:', error);
    res.status(500).json({ error: 'Analysis failed' });
  }
});

app.post('/api/v1/cross-border/patterns', async (req, res) => {
  try {
    const { patterns, jurisdiction } = req.body;
    await crossBorderFraudDetection.sharePatterns(patterns, jurisdiction);
    res.json({ success: true });
  } catch (error) {
    logger.error('Pattern sharing failed:', error);
    res.status(500).json({ error: 'Pattern sharing failed' });
  }
});

// International case coordination routes
app.post('/api/v1/cases/coordinate', async (req, res) => {
  try {
    const { caseData, targetJurisdictions } = req.body;
    const coordination = await internationalCaseCoordination.coordinateCase(caseData, targetJurisdictions);
    res.json(coordination);
  } catch (error) {
    logger.error('Case coordination failed:', error);
    res.status(500).json({ error: 'Case coordination failed' });
  }
});

app.get('/api/v1/cases/:caseId/status', async (req, res) => {
  try {
    const { caseId } = req.params;
    const status = await internationalCaseCoordination.getCaseStatus(caseId);
    res.json(status);
  } catch (error) {
    logger.error('Case status retrieval failed:', error);
    res.status(500).json({ error: 'Status retrieval failed' });
  }
});

// Secure communication routes
app.post('/api/v1/secure-channel/establish', async (req, res) => {
  try {
    const { targetJurisdiction, purpose } = req.body;
    const channel = await secureChannelManager.establishChannel(targetJurisdiction, purpose);
    res.json(channel);
  } catch (error) {
    logger.error('Secure channel establishment failed:', error);
    res.status(500).json({ error: 'Channel establishment failed' });
  }
});

app.post('/api/v1/secure-channel/send', async (req, res) => {
  try {
    const { channelId, message, recipient } = req.body;
    const result = await secureChannelManager.sendSecureMessage(channelId, message, recipient);
    res.json(result);
  } catch (error) {
    logger.error('Secure message sending failed:', error);
    res.status(500).json({ error: 'Message sending failed' });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  logger.error('Unhandled error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  logger.info(`International Fraud Coordination Service running on port ${PORT}`);
});

module.exports = app;