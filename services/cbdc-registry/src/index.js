const express = require('express');
const redis = require('redis');
const CBDCRegistry = require('./services/cbdc-registry');
const ExchangeRateService = require('./services/exchange-rate-service');
const CrossCurrencyProcessor = require('./services/cross-currency-processor');
const logger = require('./utils/logger');

const app = express();
const port = process.env.PORT || 3005;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize services
let cbdcRegistry;
let exchangeRateService;
let crossCurrencyProcessor;
let redisClient;

async function initializeServices() {
  try {
    // Initialize Redis client
    redisClient = redis.createClient({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379
    });

    await redisClient.connect();
    logger.info('Connected to Redis');

    // Initialize CBDC Registry
    cbdcRegistry = new CBDCRegistry();
    
    // Initialize Exchange Rate Service
    exchangeRateService = new ExchangeRateService(cbdcRegistry, redisClient);
    
    // Initialize Cross-Currency Processor
    crossCurrencyProcessor = new CrossCurrencyProcessor(
      cbdcRegistry, 
      exchangeRateService, 
      null // Fraud detection client would be injected here
    );

    logger.info('All services initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize services:', error);
    process.exit(1);
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      cbdcRegistry: !!cbdcRegistry,
      exchangeRateService: !!exchangeRateService,
      crossCurrencyProcessor: !!crossCurrencyProcessor,
      redis: redisClient?.isReady || false
    }
  });
});

// CBDC Registry endpoints
app.get('/api/v1/cbdcs', (req, res) => {
  try {
    const cbdcs = cbdcRegistry.getAllCBDCs();
    res.json({
      success: true,
      data: cbdcs.map(cbdc => cbdc.toJSON())
    });
  } catch (error) {
    logger.error('Failed to get CBDCs:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/v1/cbdcs/active', (req, res) => {
  try {
    const activeCbdcs = cbdcRegistry.getActiveCBDCs();
    res.json({
      success: true,
      data: activeCbdcs.map(cbdc => cbdc.toJSON())
    });
  } catch (error) {
    logger.error('Failed to get active CBDCs:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/v1/cbdcs/:code', (req, res) => {
  try {
    const cbdc = cbdcRegistry.getCBDC(req.params.code);
    if (!cbdc) {
      return res.status(404).json({
        success: false,
        error: 'CBDC not found'
      });
    }
    res.json({
      success: true,
      data: cbdc.toJSON()
    });
  } catch (error) {
    logger.error('Failed to get CBDC:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/v1/cbdcs/pairs/supported', (req, res) => {
  try {
    const pairs = cbdcRegistry.getSupportedPairs();
    res.json({
      success: true,
      data: pairs
    });
  } catch (error) {
    logger.error('Failed to get supported pairs:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Exchange Rate endpoints
app.get('/api/v1/rates', (req, res) => {
  try {
    const rates = exchangeRateService.getAllRates();
    res.json({
      success: true,
      data: rates
    });
  } catch (error) {
    logger.error('Failed to get exchange rates:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/v1/rates/:fromCurrency/:toCurrency', async (req, res) => {
  try {
    const { fromCurrency, toCurrency } = req.params;
    const rate = await exchangeRateService.getExchangeRate(fromCurrency, toCurrency);
    res.json({
      success: true,
      data: rate.toJSON()
    });
  } catch (error) {
    logger.error('Failed to get exchange rate:', error);
    res.status(404).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/api/v1/rates/convert', async (req, res) => {
  try {
    const { amount, fromCurrency, toCurrency, useSpread = false } = req.body;
    
    if (!amount || !fromCurrency || !toCurrency) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: amount, fromCurrency, toCurrency'
      });
    }

    const convertedAmount = await exchangeRateService.convertCurrency(
      amount, 
      fromCurrency, 
      toCurrency, 
      useSpread
    );

    res.json({
      success: true,
      data: {
        originalAmount: amount,
        originalCurrency: fromCurrency,
        convertedAmount,
        targetCurrency: toCurrency,
        useSpread
      }
    });
  } catch (error) {
    logger.error('Failed to convert currency:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// Cross-Currency Transaction endpoints
app.post('/api/v1/transactions/cross-currency', async (req, res) => {
  try {
    const result = await crossCurrencyProcessor.processCrossCurrencyTransaction(req.body);
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Failed to process cross-currency transaction:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/v1/transactions/history', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const history = crossCurrencyProcessor.getTransactionHistory(limit);
    res.json({
      success: true,
      data: history
    });
  } catch (error) {
    logger.error('Failed to get transaction history:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Statistics endpoints
app.get('/api/v1/stats/registry', (req, res) => {
  try {
    const stats = cbdcRegistry.getStats();
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Failed to get registry stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/v1/stats/rates', (req, res) => {
  try {
    const stats = exchangeRateService.getStats();
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Failed to get rate stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/v1/stats/transactions', (req, res) => {
  try {
    const stats = crossCurrencyProcessor.getStats();
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Failed to get transaction stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  logger.error('Unhandled error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
});

// Start server
async function startServer() {
  await initializeServices();
  
  app.listen(port, () => {
    logger.info(`CBDC Registry Service listening on port ${port}`);
  });
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully');
  if (redisClient) {
    await redisClient.quit();
  }
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully');
  if (redisClient) {
    await redisClient.quit();
  }
  process.exit(0);
});

if (require.main === module) {
  startServer().catch(error => {
    logger.error('Failed to start server:', error);
    process.exit(1);
  });
}

module.exports = app;