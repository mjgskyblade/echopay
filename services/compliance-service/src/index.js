const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const winston = require('winston');
const promClient = require('prom-client');
const { v4: uuidv4 } = require('uuid');

// Initialize logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'compliance-service' },
  transports: [
    new winston.transports.Console()
  ]
});

// Initialize Prometheus metrics
const register = new promClient.Registry();
promClient.collectDefaultMetrics({ register });

const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register]
});

const httpRequestsTotal = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register]
});

// Initialize Express app
const app = express();
const port = process.env.PORT || 8004;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request ID middleware
app.use((req, res, next) => {
  req.id = req.headers['x-request-id'] || uuidv4();
  res.setHeader('X-Request-ID', req.id);
  next();
});

// Logging middleware
app.use(morgan('combined', {
  stream: {
    write: (message) => logger.info(message.trim())
  }
}));

// Metrics middleware
app.use((req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const labels = {
      method: req.method,
      route: req.route?.path || req.path,
      status_code: res.statusCode
    };
    
    httpRequestDuration.observe(labels, duration);
    httpRequestsTotal.inc(labels);
  });
  
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    service: 'compliance-service',
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

// Metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// Import controllers
const KYCController = require('./controllers/kyc-controller');
const AMLController = require('./controllers/aml-controller');
const RegulatoryReportingController = require('./controllers/regulatory-reporting-controller');
const CrossJurisdictionController = require('./controllers/cross-jurisdiction-controller');

// Initialize controllers
const kycController = new KYCController();
const amlController = new AMLController();
const regulatoryReportingController = new RegulatoryReportingController();
const crossJurisdictionController = new CrossJurisdictionController();

// API routes
const apiRouter = express.Router();

// KYC endpoints
apiRouter.post('/kyc/verify', (req, res) => kycController.verifyIdentity(req, res));
apiRouter.get('/kyc/status/:userId', (req, res) => kycController.getVerificationStatus(req, res));
apiRouter.put('/kyc/status/:userId', (req, res) => kycController.updateVerificationStatus(req, res));
apiRouter.get('/kyc/statistics', (req, res) => kycController.getKYCStatistics(req, res));

// AML endpoints
apiRouter.post('/aml/screen', (req, res) => amlController.screenTransaction(req, res));
apiRouter.get('/aml/screening/:transactionId', (req, res) => amlController.getScreeningResult(req, res));
apiRouter.get('/aml/sar-reports', (req, res) => amlController.getSARReports(req, res));
apiRouter.post('/aml/sar/file', (req, res) => amlController.fileManualSAR(req, res));
apiRouter.get('/aml/statistics', (req, res) => amlController.getAMLStatistics(req, res));

// Regulatory reporting endpoints
apiRouter.post('/reports/generate', (req, res) => regulatoryReportingController.generateReport(req, res));
apiRouter.get('/reports/:reportId/download', (req, res) => regulatoryReportingController.downloadReport(req, res));
apiRouter.post('/reports/:reportId/submit', (req, res) => regulatoryReportingController.submitReport(req, res));
apiRouter.get('/reports', (req, res) => regulatoryReportingController.getReports(req, res));

// ISO 20022 formatting endpoint
apiRouter.post('/iso20022/format', (req, res) => regulatoryReportingController.formatISO20022(req, res));

// Cross-jurisdiction compliance endpoints
apiRouter.get('/cross-jurisdiction/frameworks/:jurisdiction', (req, res) => crossJurisdictionController.getComplianceFramework(req, res));
apiRouter.get('/cross-jurisdiction/jurisdictions', (req, res) => crossJurisdictionController.getSupportedJurisdictions(req, res));
apiRouter.get('/cross-jurisdiction/data-residency/:jurisdiction', (req, res) => crossJurisdictionController.getDataResidencyRules(req, res));
apiRouter.post('/cross-jurisdiction/validate-residency', (req, res) => crossJurisdictionController.validateDataResidency(req, res));
apiRouter.post('/cross-jurisdiction/monitor-transaction', (req, res) => crossJurisdictionController.monitorCrossBorderTransaction(req, res));
apiRouter.post('/cross-jurisdiction/generate-report', (req, res) => crossJurisdictionController.generateComplianceReport(req, res));
apiRouter.post('/cross-jurisdiction/cooperation-request', (req, res) => crossJurisdictionController.handleCooperationRequest(req, res));

app.use('/api/v1', apiRouter);

// Error handling middleware
app.use((error, req, res, next) => {
  logger.error('Unhandled error', { requestId: req.id, error: error.message, stack: error.stack });
  res.status(500).json({
    error: 'Internal server error',
    requestId: req.id,
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    requestId: req.id,
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(port, () => {
  logger.info(`Compliance Service starting on port ${port}`, { port, environment: process.env.NODE_ENV || 'development' });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});