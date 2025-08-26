const CBDC = require('../models/cbdc');
const CBDCRegistry = require('../services/cbdc-registry');
const ExchangeRateService = require('../services/exchange-rate-service');
const CrossCurrencyProcessor = require('../services/cross-currency-processor');

describe('CBDCRegistry', () => {
  let registry;

  beforeEach(() => {
    registry = new CBDCRegistry();
  });

  describe('initialization', () => {
    test('should initialize with default CBDCs', () => {
      expect(registry.getAllCBDCs().length).toBeGreaterThan(0);
      expect(registry.getCBDC('USD-CBDC')).toBeDefined();
      expect(registry.getCBDC('EUR-CBDC')).toBeDefined();
    });

    test('should have supported currency pairs', () => {
      const pairs = registry.getSupportedPairs();
      expect(pairs.length).toBeGreaterThan(0);
      expect(pairs).toContain('USD-CBDC/EUR-CBDC');
      expect(pairs).toContain('EUR-CBDC/USD-CBDC');
    });
  });

  describe('CBDC registration', () => {
    test('should register new CBDC successfully', () => {
      const newCBDC = new CBDC({
        id: '550e8400-e29b-41d4-a716-446655440099',
        code: 'NZD-CBDC',
        name: 'Digital New Zealand Dollar',
        country: 'New Zealand',
        centralBank: 'Reserve Bank of New Zealand',
        issuanceDate: new Date('2024-12-01'),
        status: 'active',
        exchangeRateSource: 'https://api.rbnz.govt.nz/rates',
        complianceRules: {
          default: { kycRequired: true, amlScreening: true }
        }
      });

      const result = registry.registerCBDC(newCBDC);
      expect(result).toBe(newCBDC);
      expect(registry.getCBDC('NZD-CBDC')).toBe(newCBDC);
    });

    test('should throw error when registering duplicate CBDC', () => {
      const existingCBDC = registry.getCBDC('USD-CBDC');
      expect(() => registry.registerCBDC(existingCBDC)).toThrow('CBDC USD-CBDC already registered');
    });

    test('should throw error when registering invalid CBDC', () => {
      expect(() => registry.registerCBDC({})).toThrow('Invalid CBDC object');
    });
  });

  describe('CBDC retrieval', () => {
    test('should get CBDC by code', () => {
      const usdCBDC = registry.getCBDC('USD-CBDC');
      expect(usdCBDC).toBeDefined();
      expect(usdCBDC.code).toBe('USD-CBDC');
      expect(usdCBDC.name).toBe('Digital Dollar');
    });

    test('should return undefined for non-existent CBDC', () => {
      const nonExistent = registry.getCBDC('XXX-CBDC');
      expect(nonExistent).toBeUndefined();
    });

    test('should get all CBDCs', () => {
      const allCBDCs = registry.getAllCBDCs();
      expect(Array.isArray(allCBDCs)).toBe(true);
      expect(allCBDCs.length).toBeGreaterThan(0);
    });

    test('should get only active CBDCs', () => {
      const activeCBDCs = registry.getActiveCBDCs();
      const allCBDCs = registry.getAllCBDCs();
      
      expect(activeCBDCs.length).toBeLessThanOrEqual(allCBDCs.length);
      activeCBDCs.forEach(cbdc => {
        expect(cbdc.status).toBe('active');
      });
    });

    test('should get CBDCs by country', () => {
      const usCBDCs = registry.getCBDCsByCountry('United States');
      expect(usCBDCs.length).toBeGreaterThan(0);
      usCBDCs.forEach(cbdc => {
        expect(cbdc.country).toBe('United States');
      });
    });

    test('should get cross-border enabled CBDCs', () => {
      const crossBorderCBDCs = registry.getCrossBorderCBDCs();
      crossBorderCBDCs.forEach(cbdc => {
        expect(cbdc.supportsCrossBorder()).toBe(true);
      });
    });
  });

  describe('currency pair support', () => {
    test('should check if currency is supported', () => {
      expect(registry.isSupported('USD-CBDC')).toBe(true);
      expect(registry.isSupported('EUR-CBDC')).toBe(true);
      expect(registry.isSupported('XXX-CBDC')).toBe(false);
    });

    test('should check if currency pair is supported', () => {
      expect(registry.isPairSupported('USD-CBDC', 'EUR-CBDC')).toBe(true);
      expect(registry.isPairSupported('EUR-CBDC', 'USD-CBDC')).toBe(true);
      expect(registry.isPairSupported('USD-CBDC', 'XXX-CBDC')).toBe(false);
    });

    test('should get supported pairs', () => {
      const pairs = registry.getSupportedPairs();
      expect(Array.isArray(pairs)).toBe(true);
      expect(pairs.length).toBeGreaterThan(0);
    });
  });

  describe('CBDC management', () => {
    test('should update CBDC successfully', () => {
      const updates = {
        status: 'deprecated',
        metadata: { reason: 'replaced by v2' }
      };

      const updatedCBDC = registry.updateCBDC('GBP-CBDC', updates);
      expect(updatedCBDC.status).toBe('deprecated');
      expect(updatedCBDC.metadata.reason).toBe('replaced by v2');
      expect(updatedCBDC.updatedAt).toBeInstanceOf(Date);
    });

    test('should throw error when updating non-existent CBDC', () => {
      expect(() => registry.updateCBDC('XXX-CBDC', {})).toThrow('CBDC XXX-CBDC not found');
    });

    test('should remove CBDC successfully', () => {
      const removedCBDC = registry.removeCBDC('JPY-CBDC');
      expect(removedCBDC.code).toBe('JPY-CBDC');
      expect(registry.getCBDC('JPY-CBDC')).toBeUndefined();
    });

    test('should throw error when removing non-existent CBDC', () => {
      expect(() => registry.removeCBDC('XXX-CBDC')).toThrow('CBDC XXX-CBDC not found');
    });
  });

  describe('compliance rules', () => {
    test('should get compliance rules for jurisdiction', () => {
      const usRules = registry.getComplianceRules('USD-CBDC', 'US');
      expect(usRules).toBeDefined();
      expect(usRules.patriotAct).toBe(true);
      expect(usRules.ofacScreening).toBe(true);
    });

    test('should get default compliance rules for unknown jurisdiction', () => {
      const defaultRules = registry.getComplianceRules('USD-CBDC', 'UNKNOWN');
      expect(defaultRules).toBeDefined();
      expect(defaultRules.kycRequired).toBe(true);
      expect(defaultRules.amlScreening).toBe(true);
    });

    test('should throw error for non-existent CBDC', () => {
      expect(() => registry.getComplianceRules('XXX-CBDC', 'US')).toThrow('CBDC XXX-CBDC not found');
    });
  });

  describe('multi-CBDC support', () => {
    test('should support multiple global CBDCs', () => {
      const allCBDCs = registry.getAllCBDCs();
      expect(allCBDCs.length).toBeGreaterThanOrEqual(8); // Should have at least 8 CBDCs
      
      const expectedCBDCs = ['USD-CBDC', 'EUR-CBDC', 'GBP-CBDC', 'JPY-CBDC', 'CNY-CBDC', 'CAD-CBDC', 'AUD-CBDC', 'SGD-CBDC'];
      expectedCBDCs.forEach(code => {
        expect(registry.getCBDC(code)).toBeDefined();
      });
    });

    test('should get CBDCs by region', () => {
      const northAmericaCBDCs = registry.getCBDCsByRegion('North America');
      expect(northAmericaCBDCs.length).toBeGreaterThan(0);
      
      const asiaPacificCBDCs = registry.getCBDCsByRegion('Asia Pacific');
      expect(asiaPacificCBDCs.length).toBeGreaterThan(0);
      
      const europeCBDCs = registry.getCBDCsByRegion('Europe');
      expect(europeCBDCs.length).toBeGreaterThan(0);
    });

    test('should get CBDCs by interoperability protocol', () => {
      const iso20022CBDCs = registry.getCBDCsByProtocol('ISO20022');
      expect(iso20022CBDCs.length).toBeGreaterThan(0);
      
      iso20022CBDCs.forEach(cbdc => {
        expect(cbdc.interoperabilityProtocols).toContain('ISO20022');
      });
    });

    test('should check cross-currency transaction allowance', () => {
      expect(registry.isCrossCurrencyAllowed('USD-CBDC', 'EUR-CBDC')).toBe(true);
      expect(registry.isCrossCurrencyAllowed('EUR-CBDC', 'GBP-CBDC')).toBe(true);
      expect(registry.isCrossCurrencyAllowed('USD-CBDC', 'XXX-CBDC')).toBe(false);
    });

    test('should get maximum transaction amounts', () => {
      const maxAmount = registry.getMaxTransactionAmount('USD-CBDC', 'EUR-CBDC');
      expect(typeof maxAmount).toBe('number');
      expect(maxAmount).toBeGreaterThan(0);
    });

    test('should validate transactions against compliance rules', () => {
      const validation = registry.validateTransaction('USD-CBDC', 'EUR-CBDC', 10000);
      expect(validation).toHaveProperty('valid');
      expect(validation).toHaveProperty('warnings');
      expect(validation).toHaveProperty('requirements');
      expect(Array.isArray(validation.warnings)).toBe(true);
      expect(Array.isArray(validation.requirements)).toBe(true);
    });

    test('should reject transactions exceeding limits', () => {
      const validation = registry.validateTransaction('USD-CBDC', 'EUR-CBDC', 100000000);
      expect(validation.valid).toBe(false);
      expect(validation.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('statistics', () => {
    test('should get comprehensive registry statistics', () => {
      const stats = registry.getStats();
      
      expect(stats).toHaveProperty('totalCBDCs');
      expect(stats).toHaveProperty('activeCBDCs');
      expect(stats).toHaveProperty('supportedPairs');
      expect(stats).toHaveProperty('statusBreakdown');
      expect(stats).toHaveProperty('regionBreakdown');
      expect(stats).toHaveProperty('protocolBreakdown');
      expect(stats).toHaveProperty('crossBorderEnabled');
      expect(stats).toHaveProperty('totalDailyVolume');
      
      expect(typeof stats.totalCBDCs).toBe('number');
      expect(typeof stats.activeCBDCs).toBe('number');
      expect(typeof stats.supportedPairs).toBe('number');
      expect(typeof stats.statusBreakdown).toBe('object');
      expect(typeof stats.regionBreakdown).toBe('object');
      expect(typeof stats.protocolBreakdown).toBe('object');
      expect(typeof stats.crossBorderEnabled).toBe('number');
      expect(typeof stats.totalDailyVolume).toBe('number');
    });

    test('should have consistent statistics', () => {
      const stats = registry.getStats();
      const allCBDCs = registry.getAllCBDCs();
      const activeCBDCs = registry.getActiveCBDCs();
      
      expect(stats.totalCBDCs).toBe(allCBDCs.length);
      expect(stats.activeCBDCs).toBe(activeCBDCs.length);
    });
  });
});

describe('ExchangeRateService', () => {
  let registry;
  let exchangeRateService;
  let mockRedisClient;

  beforeEach(() => {
    registry = new CBDCRegistry();
    mockRedisClient = {
      setex: jest.fn(),
      get: jest.fn()
    };
    exchangeRateService = new ExchangeRateService(registry, mockRedisClient);
  });

  describe('real-time rate updates', () => {
    test('should generate synthetic rates for all supported CBDCs', async () => {
      const rates = await exchangeRateService.generateSyntheticRates('USD-CBDC');
      
      expect(typeof rates).toBe('object');
      expect(Object.keys(rates).length).toBeGreaterThan(0);
      
      // Should not include the base currency
      expect(rates['USD-CBDC']).toBeUndefined();
      
      // Should include other major CBDCs
      expect(rates['EUR-CBDC']).toBeDefined();
      expect(rates['GBP-CBDC']).toBeDefined();
    });

    test('should calculate currency volatility', () => {
      const usdVolatility = exchangeRateService.getCurrencyVolatility('USD-CBDC');
      const gbpVolatility = exchangeRateService.getCurrencyVolatility('GBP-CBDC');
      
      expect(typeof usdVolatility).toBe('number');
      expect(typeof gbpVolatility).toBe('number');
      expect(usdVolatility).toBeGreaterThan(0);
      expect(gbpVolatility).toBeGreaterThan(usdVolatility); // GBP should be more volatile
    });

    test('should get rate quality scores', () => {
      // First add a rate
      exchangeRateService.rates.set('USD-CBDC/EUR-CBDC', {
        rate: 0.85,
        getAge: () => 30000, // 30 seconds
        confidence: 0.95,
        isValid: () => true
      });

      const quality = exchangeRateService.getRateQuality('USD-CBDC', 'EUR-CBDC');
      expect(typeof quality).toBe('number');
      expect(quality).toBeGreaterThan(0);
      expect(quality).toBeLessThanOrEqual(1);
    });

    test('should generate mock historical data', () => {
      // First add a current rate to base the history on
      const ExchangeRate = require('../models/exchange-rate');
      const currentRate = new ExchangeRate({
        id: 'test-rate-id',
        fromCurrency: 'USD-CBDC',
        toCurrency: 'EUR-CBDC',
        rate: 0.85,
        bidRate: 0.849,
        askRate: 0.851,
        spread: 0.002,
        source: 'test',
        timestamp: new Date(),
        validUntil: new Date(Date.now() + 300000),
        confidence: 0.95
      });
      
      exchangeRateService.rates.set('USD-CBDC/EUR-CBDC', currentRate);
      
      const history = exchangeRateService.generateMockHistory('USD-CBDC', 'EUR-CBDC', 10);
      
      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBe(10);
      
      history.forEach(entry => {
        expect(entry).toHaveProperty('timestamp');
        expect(entry).toHaveProperty('rate');
        expect(entry).toHaveProperty('fromCurrency');
        expect(entry).toHaveProperty('toCurrency');
        expect(typeof entry.rate).toBe('number');
        expect(entry.rate).toBeGreaterThan(0);
      });
    });
  });

  describe('rate monitoring', () => {
    test('should detect significant rate changes', () => {
      const previousRate = { rate: 0.85 };
      const newRate = { 
        rate: 0.90, 
        fromCurrency: 'USD-CBDC', 
        toCurrency: 'EUR-CBDC',
        confidence: 0.95
      };

      // Mock the triggerRateAlert method
      exchangeRateService.triggerRateAlert = jest.fn();

      exchangeRateService.monitorRateChanges(newRate, previousRate);
      
      expect(exchangeRateService.triggerRateAlert).toHaveBeenCalled();
    });

    test('should calculate volatility from historical data', () => {
      const volatility = exchangeRateService.calculateVolatility('USD-CBDC', 'EUR-CBDC', 24);
      
      expect(typeof volatility).toBe('number');
      expect(volatility).toBeGreaterThanOrEqual(0);
    });
  });
});

describe('CrossCurrencyProcessor', () => {
  let registry;
  let exchangeRateService;
  let processor;
  let mockRedisClient;

  beforeEach(() => {
    registry = new CBDCRegistry();
    mockRedisClient = {
      setex: jest.fn(),
      get: jest.fn()
    };
    exchangeRateService = new ExchangeRateService(registry, mockRedisClient);
    processor = new CrossCurrencyProcessor(registry, exchangeRateService, null);
  });

  describe('enhanced fraud protection', () => {
    test('should calculate rate deviation risk', () => {
      // Add a mock rate to the exchange rate service
      exchangeRateService.rates.set('USD-CBDC/EUR-CBDC', {
        rate: 0.85,
        isValid: () => true
      });

      const risk = processor.calculateRateDeviationRisk('USD-CBDC', 'EUR-CBDC', 0.90);
      
      expect(typeof risk).toBe('number');
      expect(risk).toBeGreaterThanOrEqual(0);
      expect(risk).toBeLessThanOrEqual(0.5);
    });

    test('should calculate jurisdiction risk', () => {
      const usdEurRisk = processor.calculateJurisdictionRisk('USD-CBDC', 'EUR-CBDC');
      const cnyUsdRisk = processor.calculateJurisdictionRisk('CNY-CBDC', 'USD-CBDC');
      
      expect(typeof usdEurRisk).toBe('number');
      expect(typeof cnyUsdRisk).toBe('number');
      expect(cnyUsdRisk).toBeGreaterThan(usdEurRisk); // CNY should have higher risk
    });

    test('should calculate velocity risk', () => {
      // Add some mock transaction history
      processor.transactionHistory.set('tx1', {
        fromWallet: 'wallet123',
        amount: 1000,
        recordedAt: new Date(Date.now() - 1800000) // 30 minutes ago
      });

      const risk = processor.calculateVelocityRisk('wallet123', 5000);
      
      expect(typeof risk).toBe('number');
      expect(risk).toBeGreaterThanOrEqual(0.1);
      expect(risk).toBeLessThanOrEqual(0.7);
    });

    test('should calculate time-of-day risk', () => {
      const risk = processor.calculateTimeOfDayRisk('USD-CBDC', 'EUR-CBDC');
      
      expect(typeof risk).toBe('number');
      expect(risk).toBeGreaterThanOrEqual(0);
      expect(risk).toBeLessThanOrEqual(0.2);
    });

    test('should perform comprehensive fraud analysis', async () => {
      const transactionData = {
        transactionId: 'test-tx-123',
        fromWallet: 'wallet-from',
        toWallet: 'wallet-to',
        amount: 10000,
        convertedAmount: { baseAmount: 8500 },
        fromCurrency: 'USD-CBDC',
        toCurrency: 'EUR-CBDC',
        exchangeRate: 0.85,
        metadata: {}
      };

      const analysis = await processor.performFraudAnalysis(transactionData);
      
      expect(analysis).toHaveProperty('riskScore');
      expect(analysis).toHaveProperty('riskFactors');
      expect(analysis).toHaveProperty('recommendation');
      expect(analysis).toHaveProperty('analysisId');
      expect(analysis).toHaveProperty('detailedAnalysis');
      
      expect(typeof analysis.riskScore).toBe('number');
      expect(analysis.riskScore).toBeGreaterThanOrEqual(0);
      expect(analysis.riskScore).toBeLessThanOrEqual(1);
      expect(Array.isArray(analysis.riskFactors)).toBe(true);
      expect(['approve', 'manual_review', 'block']).toContain(analysis.recommendation);
    });
  });

  describe('cross-currency transaction processing', () => {
    test('should validate transaction requests', () => {
      const validRequest = {
        fromWallet: 'wallet1',
        toWallet: 'wallet2',
        amount: 1000,
        fromCurrency: 'USD-CBDC',
        toCurrency: 'EUR-CBDC'
      };

      expect(() => processor.validateTransactionRequest(validRequest)).not.toThrow();

      const invalidRequest = {
        fromWallet: 'wallet1',
        // Missing required fields
        amount: 1000
      };

      expect(() => processor.validateTransactionRequest(invalidRequest)).toThrow();
    });

    test('should calculate converted amounts with slippage protection', async () => {
      const mockExchangeRate = {
        convert: jest.fn().mockReturnValue(850),
        getAge: jest.fn().mockReturnValue(30000)
      };

      const result = await processor.calculateConvertedAmount(
        1000, 'USD-CBDC', 'EUR-CBDC', mockExchangeRate, 0.005
      );

      expect(result).toHaveProperty('baseAmount');
      expect(result).toHaveProperty('minAmount');
      expect(result).toHaveProperty('maxAmount');
      expect(result).toHaveProperty('slippageTolerance');
      expect(result).toHaveProperty('rateAge');
      
      expect(result.baseAmount).toBe(850);
      expect(result.minAmount).toBeLessThan(result.baseAmount);
      expect(result.maxAmount).toBeGreaterThan(result.baseAmount);
    });
  });

  describe('transaction statistics', () => {
    test('should track cross-currency transaction statistics', () => {
      // Add some mock transactions
      processor.recordTransaction('tx1', {
        fromCurrency: 'USD-CBDC',
        toCurrency: 'EUR-CBDC',
        amount: 1000,
        result: {
          fees: { exchangeFee: 0.85, networkFee: 0.01 }
        },
        processingTime: 150
      });

      const stats = processor.getStats();
      
      expect(stats).toHaveProperty('totalTransactions');
      expect(stats).toHaveProperty('crossCurrencyTransactions');
      expect(stats).toHaveProperty('currencyPairs');
      expect(stats).toHaveProperty('totalVolume');
      expect(stats).toHaveProperty('totalFeesCollected');
      expect(stats).toHaveProperty('averageProcessingTime');
      
      expect(typeof stats.totalTransactions).toBe('number');
      expect(typeof stats.crossCurrencyTransactions).toBe('number');
      expect(typeof stats.currencyPairs).toBe('object');
      expect(typeof stats.totalVolume).toBe('object');
      expect(typeof stats.totalFeesCollected).toBe('number');
      expect(typeof stats.averageProcessingTime).toBe('number');
    });
  });
});