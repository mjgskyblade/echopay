const axios = require('axios');
const cron = require('node-cron');
const ExchangeRate = require('../models/exchange-rate');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

/**
 * Exchange Rate Service
 * Manages real-time exchange rates for CBDC cross-currency transactions
 */
class ExchangeRateService {
  constructor(cbdcRegistry, redisClient) {
    this.cbdcRegistry = cbdcRegistry;
    this.redis = redisClient;
    this.rates = new Map();
    this.rateSources = new Map();
    this.updateInterval = 30000; // 30 seconds
    this.rateValidityPeriod = 300000; // 5 minutes
    this.initialize();
  }

  /**
   * Initialize exchange rate service
   */
  initialize() {
    this.setupRateSources();
    
    // Only start rate updates if not in test environment
    if (process.env.NODE_ENV !== 'test') {
      this.startRateUpdates();
    }
    
    logger.info('Exchange Rate Service initialized');
  }

  /**
   * Setup rate sources for different CBDCs
   */
  setupRateSources() {
    // Mock rate sources - in production these would be real APIs
    this.rateSources.set('USD-CBDC', {
      url: 'https://api.exchangerate-api.com/v4/latest/USD',
      parser: this.parseStandardRates.bind(this),
      headers: { 'User-Agent': 'EchoPay-CBDC-Registry' }
    });

    this.rateSources.set('EUR-CBDC', {
      url: 'https://api.exchangerate-api.com/v4/latest/EUR',
      parser: this.parseStandardRates.bind(this),
      headers: { 'User-Agent': 'EchoPay-CBDC-Registry' }
    });

    // Fallback synthetic rate generator for pilot CBDCs
    this.rateSources.set('synthetic', {
      generator: this.generateSyntheticRates.bind(this)
    });
  }

  /**
   * Start periodic rate updates
   */
  startRateUpdates() {
    // Update rates every 30 seconds
    cron.schedule('*/30 * * * * *', async () => {
      try {
        await this.updateAllRates();
      } catch (error) {
        logger.error('Failed to update exchange rates:', error);
      }
    });

    // Initial update
    this.updateAllRates();
  }

  /**
   * Update all exchange rates
   */
  async updateAllRates() {
    const activeCBDCs = this.cbdcRegistry.getActiveCBDCs();
    const updatePromises = [];

    for (const cbdc of activeCBDCs) {
      updatePromises.push(this.updateRatesForCBDC(cbdc.code));
    }

    await Promise.allSettled(updatePromises);
    logger.debug(`Updated rates for ${activeCBDCs.length} CBDCs`);
  }

  /**
   * Update rates for specific CBDC
   */
  async updateRatesForCBDC(cbdcCode) {
    try {
      const source = this.rateSources.get(cbdcCode) || this.rateSources.get('synthetic');
      let rates;

      if (source.url) {
        rates = await this.fetchRatesFromAPI(source);
      } else if (source.generator) {
        rates = await source.generator(cbdcCode);
      }

      if (rates) {
        await this.processRates(cbdcCode, rates);
      }
    } catch (error) {
      logger.error(`Failed to update rates for ${cbdcCode}:`, error);
      // Fallback to synthetic rates
      const syntheticRates = await this.generateSyntheticRates(cbdcCode);
      await this.processRates(cbdcCode, syntheticRates);
    }
  }

  /**
   * Fetch rates from external API
   */
  async fetchRatesFromAPI(source) {
    const response = await axios.get(source.url, {
      headers: source.headers,
      timeout: 5000
    });
    return source.parser(response.data);
  }

  /**
   * Parse standard exchange rate API response
   */
  parseStandardRates(data) {
    return data.rates || {};
  }

  /**
   * Generate synthetic rates for testing/pilot CBDCs with realistic market data
   */
  async generateSyntheticRates(baseCurrency) {
    const baseRates = {
      'USD-CBDC': 1.0,
      'EUR-CBDC': 0.85,
      'GBP-CBDC': 0.73,
      'JPY-CBDC': 150.0,
      'CNY-CBDC': 7.2,
      'CAD-CBDC': 1.35,
      'AUD-CBDC': 1.55,
      'SGD-CBDC': 1.35
    };

    const rates = {};
    const baseValue = baseRates[baseCurrency] || 1.0;

    // Get historical volatility for more realistic fluctuations
    const volatility = this.getCurrencyVolatility(baseCurrency);

    Object.entries(baseRates).forEach(([currency, value]) => {
      if (currency !== baseCurrency) {
        // Add realistic market fluctuation based on currency volatility
        const fluctuation = (Math.random() - 0.5) * volatility * 2;
        const rate = (value / baseValue) * (1 + fluctuation);
        
        // Ensure rate is positive and within reasonable bounds
        rates[currency] = Math.max(rate, 0.001);
      }
    });

    return rates;
  }

  /**
   * Get currency volatility for realistic rate generation
   */
  getCurrencyVolatility(currency) {
    const volatilityMap = {
      'USD-CBDC': 0.005,  // 0.5% - stable reserve currency
      'EUR-CBDC': 0.008,  // 0.8% - major currency
      'GBP-CBDC': 0.012,  // 1.2% - post-Brexit volatility
      'JPY-CBDC': 0.010,  // 1.0% - carry trade effects
      'CNY-CBDC': 0.015,  // 1.5% - managed float
      'CAD-CBDC': 0.010,  // 1.0% - commodity currency
      'AUD-CBDC': 0.015,  // 1.5% - commodity currency
      'SGD-CBDC': 0.008   // 0.8% - managed currency
    };

    return volatilityMap[currency] || 0.010;
  }

  /**
   * Process and store exchange rates
   */
  async processRates(baseCurrency, rates) {
    const timestamp = new Date();
    const validUntil = new Date(timestamp.getTime() + this.rateValidityPeriod);

    for (const [targetCurrency, rate] of Object.entries(rates)) {
      if (this.cbdcRegistry.isSupported(targetCurrency)) {
        const exchangeRate = new ExchangeRate({
          id: uuidv4(),
          fromCurrency: baseCurrency,
          toCurrency: targetCurrency,
          rate: parseFloat(rate),
          bidRate: parseFloat(rate) * 0.999, // 0.1% spread
          askRate: parseFloat(rate) * 1.001,
          spread: 0.002,
          source: `exchange-rate-service-${baseCurrency}`,
          timestamp,
          validUntil,
          confidence: 0.95
        });

        const key = `${baseCurrency}/${targetCurrency}`;
        this.rates.set(key, exchangeRate);

        // Cache in Redis
        if (this.redis) {
          await this.redis.setex(
            `exchange_rate:${key}`,
            300, // 5 minutes TTL
            JSON.stringify(exchangeRate.toJSON())
          );
        }
      }
    }
  }

  /**
   * Get exchange rate between two currencies
   */
  async getExchangeRate(fromCurrency, toCurrency) {
    if (fromCurrency === toCurrency) {
      return new ExchangeRate({
        id: uuidv4(),
        fromCurrency,
        toCurrency,
        rate: 1.0,
        bidRate: 1.0,
        askRate: 1.0,
        spread: 0,
        source: 'identity',
        timestamp: new Date(),
        validUntil: new Date(Date.now() + 3600000), // 1 hour
        confidence: 1.0
      });
    }

    const key = `${fromCurrency}/${toCurrency}`;
    const inverseKey = `${toCurrency}/${fromCurrency}`;

    // Try direct rate first
    let rate = this.rates.get(key);
    if (rate && rate.isValid()) {
      return rate;
    }

    // Try Redis cache
    if (this.redis) {
      const cached = await this.redis.get(`exchange_rate:${key}`);
      if (cached) {
        const rateData = JSON.parse(cached);
        rate = new ExchangeRate(rateData);
        if (rate.isValid()) {
          this.rates.set(key, rate);
          return rate;
        }
      }
    }

    // Try inverse rate
    const inverseRate = this.rates.get(inverseKey);
    if (inverseRate && inverseRate.isValid()) {
      rate = inverseRate.getInverse();
      this.rates.set(key, rate);
      return rate;
    }

    throw new Error(`Exchange rate not available for ${fromCurrency}/${toCurrency}`);
  }

  /**
   * Convert amount between currencies
   */
  async convertCurrency(amount, fromCurrency, toCurrency, useSpread = false) {
    const rate = await this.getExchangeRate(fromCurrency, toCurrency);
    return rate.convert(amount, useSpread);
  }

  /**
   * Get all current exchange rates
   */
  getAllRates() {
    const validRates = {};
    for (const [pair, rate] of this.rates.entries()) {
      if (rate.isValid()) {
        validRates[pair] = rate.toJSON();
      }
    }
    return validRates;
  }

  /**
   * Get rates for specific currency
   */
  getRatesForCurrency(currency) {
    const rates = {};
    for (const [pair, rate] of this.rates.entries()) {
      if (pair.startsWith(currency + '/') && rate.isValid()) {
        const targetCurrency = pair.split('/')[1];
        rates[targetCurrency] = rate.toJSON();
      }
    }
    return rates;
  }

  /**
   * Check if rate is available and fresh
   */
  isRateAvailable(fromCurrency, toCurrency) {
    const key = `${fromCurrency}/${toCurrency}`;
    const inverseKey = `${toCurrency}/${fromCurrency}`;
    
    const rate = this.rates.get(key);
    const inverseRate = this.rates.get(inverseKey);
    
    return (rate && rate.isValid()) || (inverseRate && inverseRate.isValid());
  }

  /**
   * Get exchange rate statistics
   */
  getStats() {
    const allRates = Array.from(this.rates.values());
    const validRates = allRates.filter(rate => rate.isValid());
    const expiredRates = allRates.filter(rate => rate.isExpired());

    return {
      totalRates: allRates.length,
      validRates: validRates.length,
      expiredRates: expiredRates.length,
      averageAge: validRates.reduce((sum, rate) => sum + rate.getAge(), 0) / validRates.length || 0,
      supportedPairs: this.cbdcRegistry.getSupportedPairs().length
    };
  }

  /**
   * Monitor rate changes and trigger alerts for significant movements
   */
  monitorRateChanges(newRate, previousRate) {
    if (!previousRate) return;

    const changePercent = Math.abs((newRate.rate - previousRate.rate) / previousRate.rate);
    const significantChangeThreshold = 0.02; // 2%
    const extremeChangeThreshold = 0.05; // 5%

    if (changePercent > extremeChangeThreshold) {
      logger.warn(`Extreme rate change detected: ${newRate.fromCurrency}/${newRate.toCurrency} changed by ${(changePercent * 100).toFixed(2)}%`);
      this.triggerRateAlert('extreme_change', newRate, previousRate, changePercent);
    } else if (changePercent > significantChangeThreshold) {
      logger.info(`Significant rate change: ${newRate.fromCurrency}/${newRate.toCurrency} changed by ${(changePercent * 100).toFixed(2)}%`);
      this.triggerRateAlert('significant_change', newRate, previousRate, changePercent);
    }
  }

  /**
   * Trigger rate change alert
   */
  triggerRateAlert(alertType, newRate, previousRate, changePercent) {
    const alert = {
      type: alertType,
      timestamp: new Date(),
      currencyPair: `${newRate.fromCurrency}/${newRate.toCurrency}`,
      previousRate: previousRate.rate,
      newRate: newRate.rate,
      changePercent: changePercent * 100,
      confidence: newRate.confidence
    };

    // In production, this would send alerts to monitoring systems
    logger.warn('Rate Alert:', alert);
  }

  /**
   * Get rate history for analysis
   */
  getRateHistory(fromCurrency, toCurrency, limit = 100) {
    const key = `${fromCurrency}/${toCurrency}`;
    // In production, this would query a time-series database
    // For now, return mock historical data
    return this.generateMockHistory(fromCurrency, toCurrency, limit);
  }

  /**
   * Generate mock historical rate data
   */
  generateMockHistory(fromCurrency, toCurrency, limit) {
    const currentRate = this.rates.get(`${fromCurrency}/${toCurrency}`);
    if (!currentRate) return [];

    const history = [];
    const volatility = this.getCurrencyVolatility(fromCurrency);
    let rate = currentRate.rate;

    for (let i = limit; i > 0; i--) {
      const timestamp = new Date(Date.now() - (i * 60000)); // 1 minute intervals
      const fluctuation = (Math.random() - 0.5) * volatility;
      rate = rate * (1 + fluctuation);

      history.push({
        timestamp,
        rate: Math.max(rate, 0.001),
        fromCurrency,
        toCurrency
      });
    }

    return history;
  }

  /**
   * Calculate rate volatility over time period
   */
  calculateVolatility(fromCurrency, toCurrency, periodHours = 24) {
    const history = this.getRateHistory(fromCurrency, toCurrency, periodHours * 60);
    if (history.length < 2) return 0;

    const returns = [];
    for (let i = 1; i < history.length; i++) {
      const returnValue = Math.log(history[i].rate / history[i-1].rate);
      returns.push(returnValue);
    }

    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    
    return Math.sqrt(variance * 365 * 24); // Annualized volatility
  }

  /**
   * Get rate quality score based on freshness, confidence, and volatility
   */
  getRateQuality(fromCurrency, toCurrency) {
    const rate = this.rates.get(`${fromCurrency}/${toCurrency}`);
    if (!rate) return 0;

    const ageScore = Math.max(0, 1 - (rate.getAge() / this.rateValidityPeriod));
    const confidenceScore = rate.confidence;
    const volatility = this.calculateVolatility(fromCurrency, toCurrency);
    const volatilityScore = Math.max(0, 1 - volatility);

    return (ageScore * 0.4 + confidenceScore * 0.4 + volatilityScore * 0.2);
  }

  /**
   * Cleanup expired rates
   */
  cleanupExpiredRates() {
    let cleaned = 0;
    for (const [key, rate] of this.rates.entries()) {
      if (rate.isExpired()) {
        this.rates.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      logger.debug(`Cleaned up ${cleaned} expired exchange rates`);
    }
    
    return cleaned;
  }
}

module.exports = ExchangeRateService;