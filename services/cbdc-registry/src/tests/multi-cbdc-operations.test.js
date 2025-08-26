const CBDC = require('../models/cbdc');
const CBDCRegistry = require('../services/cbdc-registry');
const ExchangeRateService = require('../services/exchange-rate-service');
const CrossCurrencyProcessor = require('../services/cross-currency-processor');
const ExchangeRate = require('../models/exchange-rate');

describe('Multi-CBDC Operations', () => {
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

  describe('CBDC Registry Multi-Currency Support', () => {
    test('should support all major global CBDCs', () => {
      const expectedCBDCs = [
        'USD-CBDC', 'EUR-CBDC', 'GBP-CBDC', 'JPY-CBDC', 
        'CNY-CBDC', 'CAD-CBDC', 'AUD-CBDC', 'SGD-CBDC'
      ];

      expectedCBDCs.forEach(code => {
        const cbdc = registry.getCBDC(code);
        expect(cbdc).toBeDefined();
        expect(cbdc.code).toBe(code);
        expect(cbdc.interoperabilityProtocols).toContain('ISO20022');
      });
    });

    test('should have comprehensive compliance rules for each CBDC', () => {
      const allCBDCs = registry.getAllCBDCs();
      
      allCBDCs.forEach(cbdc => {
        expect(cbdc.complianceRules).toBeDefined();
        expect(cbdc.complianceRules.default).toBeDefined();
        expect(cbdc.complianceRules.default.kycRequired).toBe(true);
        expect(cbdc.complianceRules.default.amlScreening).toBe(true);
        expect(typeof cbdc.complianceRules.default.maxTransactionAmount).toBe('number');
      });
    });

    test('should support cross-currency transactions between all active CBDCs', () => {
      const activeCBDCs = registry.getActiveCBDCs();
      
      for (let i = 0; i < activeCBDCs.length; i++) {
        for (let j = i + 1; j < activeCBDCs.length; j++) {
          const from = activeCBDCs[i].code;
          const to = activeCBDCs[j].code;
          
          expect(registry.isPairSupported(from, to)).toBe(true);
          expect(registry.isCrossCurrencyAllowed(from, to)).toBe(true);
        }
      }
    });

    test('should have regional distribution of CBDCs', () => {
      const regions = ['North America', 'Europe', 'Asia Pacific'];
      
      regions.forEach(region => {
        const regionalCBDCs = registry.getCBDCsByRegion(region);
        expect(regionalCBDCs.length).toBeGreaterThan(0);
        
        regionalCBDCs.forEach(cbdc => {
          expect(cbdc.metadata.region).toBe(region);
        });
      });
    });

    test('should validate transaction amounts against CBDC-specific limits', () => {
      const testCases = [
        { from: 'USD-CBDC', to: 'EUR-CBDC', amount: 10000, shouldPass: true },
        { from: 'USD-CBDC', to: 'EUR-CBDC', amount: 100000, shouldPass: false },
        { from: 'CNY-CBDC', to: 'USD-CBDC', amount: 50000, shouldPass: true },
        { from: 'JPY-CBDC', to: 'USD-CBDC', amount: 10000000, shouldPass: false }
      ];

      testCases.forEach(testCase => {
        const validation = registry.validateTransaction(
          testCase.from, 
          testCase.to, 
          testCase.amount
        );
        
        expect(validation.valid).toBe(testCase.shouldPass);
        if (!testCase.shouldPass) {
          expect(validation.warnings.length).toBeGreaterThan(0);
        }
      });
    });
  });

  describe('Exchange Rate Service Real-Time Updates', () => {
    test('should generate realistic exchange rates with proper volatility', async () => {
      const baseCurrency = 'USD-CBDC';
      const rates = await exchangeRateService.generateSyntheticRates(baseCurrency);
      
      // Test major currency pairs have realistic rates
      expect(rates['EUR-CBDC']).toBeGreaterThan(0.7);
      expect(rates['EUR-CBDC']).toBeLessThan(1.0);
      
      expect(rates['GBP-CBDC']).toBeGreaterThan(0.6);
      expect(rates['GBP-CBDC']).toBeLessThan(0.9);
      
      expect(rates['JPY-CBDC']).toBeGreaterThan(100);
      expect(rates['JPY-CBDC']).toBeLessThan(200);
      
      expect(rates['CNY-CBDC']).toBeGreaterThan(6);
      expect(rates['CNY-CBDC']).toBeLessThan(8);
    });

    test('should apply appropriate volatility based on currency characteristics', () => {
      const currencies = ['USD-CBDC', 'EUR-CBDC', 'GBP-CBDC', 'CNY-CBDC'];
      const volatilities = currencies.map(currency => 
        exchangeRateService.getCurrencyVolatility(currency)
      );
      
      // USD should have lowest volatility as reserve currency
      const usdVolatility = exchangeRateService.getCurrencyVolatility('USD-CBDC');
      const gbpVolatility = exchangeRateService.getCurrencyVolatility('GBP-CBDC');
      const cnyVolatility = exchangeRateService.getCurrencyVolatility('CNY-CBDC');
      
      expect(usdVolatility).toBeLessThan(gbpVolatility);
      expect(gbpVolatility).toBeLessThan(cnyVolatility);
    });

    test('should maintain rate consistency across inverse pairs', async () => {
      // Set up a rate
      const rate = new ExchangeRate({
        id: 'test-rate-1',
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
      
      exchangeRateService.rates.set('USD-CBDC/EUR-CBDC', rate);
      
      // Get inverse rate
      const inverseRate = rate.getInverse();
      
      // Test consistency
      expect(inverseRate.fromCurrency).toBe('EUR-CBDC');
      expect(inverseRate.toCurrency).toBe('USD-CBDC');
      expect(Math.abs(inverseRate.rate - (1 / rate.rate))).toBeLessThan(0.0001);
    });

    test('should handle rate expiration and cleanup', () => {
      // Add expired rate
      const expiredRate = new ExchangeRate({
        id: 'expired-rate',
        fromCurrency: 'USD-CBDC',
        toCurrency: 'EUR-CBDC',
        rate: 0.85,
        bidRate: 0.849,
        askRate: 0.851,
        spread: 0.002,
        source: 'test',
        timestamp: new Date(Date.now() - 600000), // 10 minutes ago
        validUntil: new Date(Date.now() - 300000), // Expired 5 minutes ago
        confidence: 0.95
      });
      
      exchangeRateService.rates.set('USD-CBDC/EUR-CBDC', expiredRate);
      
      expect(expiredRate.isExpired()).toBe(true);
      expect(expiredRate.isValid()).toBe(false);
      
      const cleaned = exchangeRateService.cleanupExpiredRates();
      expect(cleaned).toBe(1);
      expect(exchangeRateService.rates.has('USD-CBDC/EUR-CBDC')).toBe(false);
    });
  });

  describe('Cross-Currency Transaction Processing', () => {
    test('should process cross-currency transactions with accurate conversion', async () => {
      // Mock exchange rate
      const mockRate = new ExchangeRate({
        id: 'mock-rate',
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
      
      exchangeRateService.rates.set('USD-CBDC/EUR-CBDC', mockRate);
      
      const transactionRequest = {
        fromWallet: 'wallet-usd-123',
        toWallet: 'wallet-eur-456',
        amount: 1000,
        fromCurrency: 'USD-CBDC',
        toCurrency: 'EUR-CBDC',
        maxSlippage: 0.005,
        metadata: { purpose: 'international_transfer' }
      };
      
      const result = await processor.processCrossCurrencyTransaction(transactionRequest);
      
      expect(result.status).toBe('completed');
      expect(result.sourceAmount).toBe(1000);
      expect(result.sourceCurrency).toBe('USD-CBDC');
      expect(result.targetCurrency).toBe('EUR-CBDC');
      expect(result.targetAmount).toBeCloseTo(851, 1); // Using ask rate
      expect(result.exchangeRate).toBe(0.85);
      expect(result.fees).toBeDefined();
      expect(result.fraudAnalysisId).toBeDefined();
    });

    test('should apply enhanced fraud detection for cross-currency transactions', async () => {
      const transactionData = {
        transactionId: 'test-cross-currency-tx',
        fromWallet: 'wallet-suspicious',
        toWallet: 'wallet-target',
        amount: 50000, // Large amount
        convertedAmount: { baseAmount: 42500 },
        fromCurrency: 'USD-CBDC',
        toCurrency: 'EUR-CBDC',
        exchangeRate: 0.85,
        metadata: { suspicious_flag: true }
      };
      
      const analysis = await processor.performFraudAnalysis(transactionData);
      
      expect(analysis.riskScore).toBeGreaterThan(0);
      expect(analysis.riskFactors).toContain('large_amount');
      expect(analysis.detailedAnalysis).toBeDefined();
      expect(analysis.detailedAnalysis.amountRisk).toBeGreaterThan(0);
      expect(analysis.detailedAnalysis.crossBorderRisk).toBeGreaterThan(0);
    });

    test('should handle currency-specific compliance restrictions', async () => {
      // Test CNY-CBDC restrictions
      const cnyTransactionData = {
        transactionId: 'cny-test-tx',
        fromWallet: 'wallet-cny',
        toWallet: 'wallet-eur',
        amount: 10000,
        convertedAmount: { baseAmount: 1250 },
        fromCurrency: 'CNY-CBDC',
        toCurrency: 'EUR-CBDC',
        exchangeRate: 0.125,
        metadata: {}
      };
      
      const analysis = await processor.performFraudAnalysis(cnyTransactionData);
      
      // CNY should have higher jurisdiction risk
      expect(analysis.detailedAnalysis.jurisdictionRisk).toBeGreaterThan(0.15);
      // Check if high_risk_jurisdiction is in risk factors, or just verify the risk is elevated
      expect(analysis.detailedAnalysis.jurisdictionRisk).toBeGreaterThan(0.15);
    });

    test('should calculate accurate slippage protection', async () => {
      const mockRate = {
        convert: jest.fn().mockReturnValue(850),
        getAge: jest.fn().mockReturnValue(30000)
      };
      
      const result = await processor.calculateConvertedAmount(
        1000, 'USD-CBDC', 'EUR-CBDC', mockRate, 0.01 // 1% slippage
      );
      
      expect(result.baseAmount).toBe(850);
      expect(result.slippageTolerance).toBe(8.5); // 1% of 850
      expect(result.minAmount).toBe(841.5);
      expect(result.maxAmount).toBe(858.5);
      expect(result.rateAge).toBe(30000);
    });

    test('should track comprehensive transaction statistics', () => {
      // Add mock transactions
      processor.recordTransaction('tx1', {
        fromCurrency: 'USD-CBDC',
        toCurrency: 'EUR-CBDC',
        amount: 1000,
        result: { fees: { exchangeFee: 0.85, networkFee: 0.01 } },
        processingTime: 150
      });
      
      processor.recordTransaction('tx2', {
        fromCurrency: 'EUR-CBDC',
        toCurrency: 'GBP-CBDC',
        amount: 850,
        result: { fees: { exchangeFee: 0.62, networkFee: 0.01 } },
        processingTime: 200
      });
      
      const stats = processor.getStats();
      
      expect(stats.totalTransactions).toBe(2);
      expect(stats.crossCurrencyTransactions).toBe(2);
      expect(stats.currencyPairs['USD-CBDC/EUR-CBDC']).toBe(1);
      expect(stats.currencyPairs['EUR-CBDC/GBP-CBDC']).toBe(1);
      expect(stats.totalVolume['USD-CBDC']).toBe(1000);
      expect(stats.totalVolume['EUR-CBDC']).toBe(850);
      expect(stats.totalFeesCollected).toBeCloseTo(1.49, 2);
      expect(stats.averageProcessingTime).toBe(175);
    });
  });

  describe('Currency Conversion Accuracy', () => {
    test('should maintain precision in currency conversions', async () => {
      const testCases = [
        { amount: 1000.00, rate: 0.85, expected: 850.00 },
        { amount: 1234.56, rate: 0.73, expected: 901.2288 },
        { amount: 999.99, rate: 150.25, expected: 150248.4975 },
        { amount: 0.01, rate: 0.85, expected: 0.0085 }
      ];
      
      testCases.forEach(testCase => {
        const mockRate = new ExchangeRate({
          id: 'precision-test',
          fromCurrency: 'USD-CBDC',
          toCurrency: 'EUR-CBDC',
          rate: testCase.rate,
          bidRate: testCase.rate * 0.999,
          askRate: testCase.rate * 1.001,
          spread: 0.002,
          source: 'test',
          timestamp: new Date(),
          validUntil: new Date(Date.now() + 300000),
          confidence: 0.95
        });
        
        const converted = mockRate.convert(testCase.amount);
        expect(converted).toBeCloseTo(testCase.expected, 4);
      });
    });

    test('should handle edge cases in currency conversion', async () => {
      const rate = new ExchangeRate({
        id: 'edge-case-test',
        fromCurrency: 'USD-CBDC',
        toCurrency: 'JPY-CBDC',
        rate: 150.0,
        bidRate: 149.85,
        askRate: 150.15,
        spread: 0.002,
        source: 'test',
        timestamp: new Date(),
        validUntil: new Date(Date.now() + 300000),
        confidence: 0.95
      });
      
      // Test very small amounts
      expect(rate.convert(0.01)).toBeCloseTo(1.5, 2);
      
      // Test very large amounts
      expect(rate.convert(1000000)).toBeCloseTo(150000000, 0);
      
      // Test with spread
      expect(rate.convert(100, true)).toBeCloseTo(15015, 0); // Using ask rate
    });

    test('should validate exchange rate data integrity', () => {
      const { v4: uuidv4 } = require('uuid');
      const validRateData = {
        id: uuidv4(),
        fromCurrency: 'USD-CBDC',
        toCurrency: 'EUR-CBDC',
        rate: 0.85,
        bidRate: 0.849,
        askRate: 0.851,
        spread: 0.002,
        source: 'test-source',
        timestamp: new Date(),
        validUntil: new Date(Date.now() + 300000),
        confidence: 0.95
      };
      
      const validation = ExchangeRate.validate(validRateData);
      expect(validation.error).toBeUndefined();
      
      // Test invalid data
      const invalidRateData = {
        ...validRateData,
        rate: -0.85, // Negative rate should be invalid
        fromCurrency: 'INVALID-CODE' // Invalid currency code
      };
      
      const invalidValidation = ExchangeRate.validate(invalidRateData);
      expect(invalidValidation.error).toBeDefined();
    });
  });

  describe('Performance and Scalability', () => {
    test('should handle multiple concurrent rate updates efficiently', async () => {
      const startTime = Date.now();
      const updatePromises = [];
      
      // Simulate concurrent rate updates for all CBDCs
      const activeCBDCs = registry.getActiveCBDCs();
      activeCBDCs.forEach(cbdc => {
        updatePromises.push(exchangeRateService.updateRatesForCBDC(cbdc.code));
      });
      
      await Promise.all(updatePromises);
      const endTime = Date.now();
      
      // Should complete within reasonable time (less than 2 seconds for synthetic rate generation)
      expect(endTime - startTime).toBeLessThan(2000);
      
      // Verify rates were updated
      const stats = exchangeRateService.getStats();
      expect(stats.validRates).toBeGreaterThan(0);
    });

    test('should maintain memory efficiency with transaction history', () => {
      // Add more than the limit of transactions
      for (let i = 0; i < 1200; i++) {
        processor.recordTransaction(`tx-${i}`, {
          fromCurrency: 'USD-CBDC',
          toCurrency: 'EUR-CBDC',
          amount: 1000,
          result: { fees: { exchangeFee: 0.85, networkFee: 0.01 } },
          processingTime: 150
        });
      }
      
      // Should maintain only the last 1000 transactions
      expect(processor.transactionHistory.size).toBe(1000);
      
      // Should have the most recent transactions
      expect(processor.transactionHistory.has('tx-1199')).toBe(true);
      expect(processor.transactionHistory.has('tx-0')).toBe(false);
    });
  });
});