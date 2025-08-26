const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const promMiddleware = require('express-prometheus-middleware');
require('dotenv').config();

const authMiddleware = require('./middleware/auth');
const proxyMiddleware = require('./middleware/proxy');
const serviceDiscovery = require('./services/service-discovery');
const healthCheck = require('./services/health-check');
const orchestration = require('./services/orchestration');
const logger = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.RATE_LIMIT_MAX || 1000, // limit each IP to 1000 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', limiter);

// Prometheus metrics
app.use(promMiddleware({
  metricsPath: '/metrics',
  collectDefaultMetrics: true,
  requestDurationBuckets: [0.1, 0.5, 1, 1.5, 2, 3, 5, 10],
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get('/health', healthCheck.handler);
app.get('/health/ready', healthCheck.readinessCheck);
app.get('/health/live', healthCheck.livenessCheck);

// Service discovery status
app.get('/services', async (req, res) => {
  try {
    const services = await serviceDiscovery.getHealthyServices();
    res.json({
      status: 'success',
      services: services,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get service status:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve service status'
    });
  }
});

// Circuit breaker status
app.get('/circuit-breaker', (req, res) => {
  try {
    const states = serviceDiscovery.circuitBreaker.getAllStates();
    const metrics = serviceDiscovery.circuitBreaker.getMetrics();
    
    res.json({
      status: 'success',
      circuitBreakers: states,
      metrics: metrics,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get circuit breaker status:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve circuit breaker status'
    });
  }
});

// Load balancer status
app.get('/load-balancer', (req, res) => {
  try {
    const loadBalancer = require('./services/load-balancer');
    const stats = {};
    
    // Get stats for all known services
    const knownServices = ['transaction-service', 'token-management', 'fraud-detection', 'reversibility-service', 'compliance-service'];
    knownServices.forEach(service => {
      stats[service] = loadBalancer.getStats(service);
    });
    
    res.json({
      status: 'success',
      algorithm: process.env.LOAD_BALANCING_ALGORITHM || 'round-robin',
      stats: stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get load balancer status:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve load balancer status'
    });
  }
});

// Circuit breaker control endpoints
app.post('/circuit-breaker/:serviceName/reset', (req, res) => {
  try {
    const { serviceName } = req.params;
    serviceDiscovery.circuitBreaker.reset(serviceName);
    
    res.json({
      status: 'success',
      message: `Circuit breaker for ${serviceName} has been reset`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to reset circuit breaker:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to reset circuit breaker'
    });
  }
});

app.post('/circuit-breaker/:serviceName/force/:state', (req, res) => {
  try {
    const { serviceName, state } = req.params;
    serviceDiscovery.circuitBreaker.forceState(serviceName, state);
    
    res.json({
      status: 'success',
      message: `Circuit breaker for ${serviceName} forced to ${state.toUpperCase()}`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to force circuit breaker state:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to force circuit breaker state'
    });
  }
});

// Orchestrated endpoints (high-level workflows)
app.post('/api/v1/orchestration/transaction', authMiddleware.authenticate, async (req, res) => {
  try {
    const result = await orchestration.processTransaction(req.body, req.user.id);
    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    logger.error('Transaction orchestration error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      correlationId: req.id
    });
  }
});

app.post('/api/v1/orchestration/fraud-report', authMiddleware.authenticate, async (req, res) => {
  try {
    const result = await orchestration.processFraudReport(req.body, req.user.id);
    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    logger.error('Fraud report orchestration error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      correlationId: req.id
    });
  }
});

// API routes with authentication and proxying
app.use('/api/v1/transactions', authMiddleware.authenticate, proxyMiddleware.createProxy('transaction-service'));
app.use('/api/v1/tokens', authMiddleware.authenticate, proxyMiddleware.createProxy('token-management'));
app.use('/api/v1/fraud', authMiddleware.authenticate, proxyMiddleware.createProxy('fraud-detection'));
app.use('/api/v1/reversibility', authMiddleware.authenticate, proxyMiddleware.createProxy('reversibility-service'));
app.use('/api/v1/compliance', authMiddleware.authenticate, proxyMiddleware.createProxy('compliance-service'));

// Public endpoints (no auth required)
app.use('/api/v1/auth', proxyMiddleware.createProxy('user-service'));

// Error handling middleware
app.use((error, req, res, next) => {
  logger.error('Gateway error:', {
    error: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    ip: req.ip
  });

  res.status(error.status || 500).json({
    status: 'error',
    message: error.message || 'Internal server error',
    requestId: req.id
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    status: 'error',
    message: 'Endpoint not found',
    path: req.originalUrl
  });
});

// Initialize service discovery
serviceDiscovery.initialize().then(() => {
  logger.info('Service discovery initialized');
}).catch(error => {
  logger.error('Failed to initialize service discovery:', error);
});

// Start server (only if not in test environment)
let server;
if (process.env.NODE_ENV !== 'test') {
  server = app.listen(PORT, () => {
    logger.info(`API Gateway running on port ${PORT}`);
  });
}

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  if (server) {
    server.close(() => {
      logger.info('Process terminated');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
});

module.exports = app;