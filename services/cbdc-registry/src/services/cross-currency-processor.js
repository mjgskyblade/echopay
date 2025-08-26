const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

/**
 * Cross-Currency Transaction Processor
 * Handles CBDC transactions across different currencies with fraud protection
 */
class CrossCurrencyProcessor {
  constructor(cbdcRegistry, exchangeRateService, fraudDetectionClient) {
    this.cbdcRegistry = cbdcRegistry;
    this.exchangeRateService = exchangeRateService;
    this.fraudDetectionClient = fraudDetectionClient;
    this.transactionHistory = new Map();
    this.maxSlippage = 0.005; // 0.5% maximum slippage tolerance
  }

  /**
   * Process cross-currency CBDC transaction
   */
  async processCrossCurrencyTransaction(transactionRequest) {
    const {
      fromWallet,
      toWallet,
      amount,
      fromCurrency,
      toCurrency,
      maxSlippage = this.maxSlippage,
      metadata = {}
    } = transactionRequest;

    // Validate transaction request
    this.validateTransactionRequest(transactionRequest);

    const transactionId = uuidv4();
    const startTime = Date.now();

    try {
      // Step 1: Get current exchange rate
      const exchangeRate = await this.exchangeRateService.getExchangeRate(fromCurrency, toCurrency);
      
      // Step 2: Calculate converted amount
      const convertedAmount = await this.calculateConvertedAmount(
        amount, 
        fromCurrency, 
        toCurrency, 
        exchangeRate,
        maxSlippage
      );

      // Step 3: Fraud detection analysis
      const fraudAnalysis = await this.performFraudAnalysis({
        transactionId,
        fromWallet,
        toWallet,
        amount,
        convertedAmount,
        fromCurrency,
        toCurrency,
        exchangeRate: exchangeRate.rate,
        metadata
      });

      // Step 4: Process transaction if fraud score is acceptable
      if (fraudAnalysis.riskScore > 0.8) {
        throw new Error(`Transaction blocked due to high fraud risk: ${fraudAnalysis.riskScore}`);
      }

      // Step 5: Execute the cross-currency transaction
      const result = await this.executeCrossCurrencyTransaction({
        transactionId,
        fromWallet,
        toWallet,
        amount,
        convertedAmount,
        fromCurrency,
        toCurrency,
        exchangeRate,
        fraudAnalysis,
        metadata
      });

      // Step 6: Record transaction
      this.recordTransaction(transactionId, {
        ...transactionRequest,
        result,
        exchangeRate: exchangeRate.toJSON(),
        fraudAnalysis,
        processingTime: Date.now() - startTime
      });

      logger.info(`Cross-currency transaction completed: ${transactionId}`);
      return result;

    } catch (error) {
      logger.error(`Cross-currency transaction failed: ${transactionId}`, error);
      throw error;
    }
  }

  /**
   * Validate transaction request
   */
  validateTransactionRequest(request) {
    const required = ['fromWallet', 'toWallet', 'amount', 'fromCurrency', 'toCurrency'];
    
    for (const field of required) {
      if (!request[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    if (request.amount <= 0) {
      throw new Error('Transaction amount must be positive');
    }

    if (!this.cbdcRegistry.isSupported(request.fromCurrency)) {
      throw new Error(`Unsupported source currency: ${request.fromCurrency}`);
    }

    if (!this.cbdcRegistry.isSupported(request.toCurrency)) {
      throw new Error(`Unsupported target currency: ${request.toCurrency}`);
    }

    if (!this.cbdcRegistry.isPairSupported(request.fromCurrency, request.toCurrency)) {
      throw new Error(`Currency pair not supported: ${request.fromCurrency}/${request.toCurrency}`);
    }
  }

  /**
   * Calculate converted amount with slippage protection
   */
  async calculateConvertedAmount(amount, fromCurrency, toCurrency, exchangeRate, maxSlippage) {
    const baseConvertedAmount = exchangeRate.convert(amount, true); // Use ask rate for conversion
    
    // Calculate slippage tolerance
    const slippageTolerance = baseConvertedAmount * maxSlippage;
    const minAcceptableAmount = baseConvertedAmount - slippageTolerance;
    const maxAcceptableAmount = baseConvertedAmount + slippageTolerance;

    // Check if rate is within acceptable age (not too stale)
    const rateAge = exchangeRate.getAge();
    if (rateAge > 60000) { // 1 minute
      logger.warn(`Exchange rate is stale: ${rateAge}ms old`);
    }

    return {
      baseAmount: baseConvertedAmount,
      minAmount: minAcceptableAmount,
      maxAmount: maxAcceptableAmount,
      slippageTolerance,
      rateAge
    };
  }

  /**
   * Perform fraud analysis for cross-currency transaction
   */
  async performFraudAnalysis(transactionData) {
    try {
      // Enhanced fraud detection for cross-currency transactions
      const analysisRequest = {
        transactionId: transactionData.transactionId,
        type: 'cross_currency',
        fromWallet: transactionData.fromWallet,
        toWallet: transactionData.toWallet,
        amount: transactionData.amount,
        convertedAmount: transactionData.convertedAmount.baseAmount,
        fromCurrency: transactionData.fromCurrency,
        toCurrency: transactionData.toCurrency,
        exchangeRate: transactionData.exchangeRate,
        features: {
          // Cross-currency specific features
          currencyPairRisk: this.calculateCurrencyPairRisk(transactionData.fromCurrency, transactionData.toCurrency),
          exchangeRateVolatility: this.calculateRateVolatility(transactionData.fromCurrency, transactionData.toCurrency),
          crossBorderIndicator: this.isCrossBorderTransaction(transactionData.fromCurrency, transactionData.toCurrency),
          amountInUSD: await this.convertToUSD(transactionData.amount, transactionData.fromCurrency),
          
          // Advanced fraud features
          rateDeviationRisk: this.calculateRateDeviationRisk(transactionData.fromCurrency, transactionData.toCurrency, transactionData.exchangeRate),
          jurisdictionRisk: this.calculateJurisdictionRisk(transactionData.fromCurrency, transactionData.toCurrency),
          timeOfDayRisk: this.calculateTimeOfDayRisk(transactionData.fromCurrency, transactionData.toCurrency),
          velocityRisk: this.calculateVelocityRisk(transactionData.fromWallet, transactionData.amount),
          
          // Standard fraud features
          timestamp: Date.now(),
          metadata: transactionData.metadata
        }
      };

      // Call fraud detection service (enhanced implementation)
      const fraudResponse = await this.callFraudDetectionService(analysisRequest);
      
      return {
        riskScore: fraudResponse.riskScore,
        riskFactors: fraudResponse.riskFactors,
        recommendation: fraudResponse.recommendation,
        analysisId: fraudResponse.analysisId,
        detailedAnalysis: fraudResponse.detailedAnalysis
      };

    } catch (error) {
      logger.error('Fraud analysis failed:', error);
      // Default to medium risk if fraud detection fails
      return {
        riskScore: 0.5,
        riskFactors: ['fraud_detection_unavailable'],
        recommendation: 'manual_review',
        analysisId: uuidv4(),
        detailedAnalysis: { error: error.message }
      };
    }
  }

  /**
   * Calculate currency pair risk score
   */
  calculateCurrencyPairRisk(fromCurrency, toCurrency) {
    // Higher risk for certain currency pairs
    const highRiskPairs = new Set([
      'USD-CBDC/JPY-CBDC',
      'EUR-CBDC/GBP-CBDC'
    ]);

    const pair = `${fromCurrency}/${toCurrency}`;
    const inversePair = `${toCurrency}/${fromCurrency}`;

    if (highRiskPairs.has(pair) || highRiskPairs.has(inversePair)) {
      return 0.7;
    }

    return 0.3;
  }

  /**
   * Calculate exchange rate volatility
   */
  calculateRateVolatility(fromCurrency, toCurrency) {
    // Mock volatility calculation - in production this would analyze historical rates
    const volatilityMap = {
      'USD-CBDC/EUR-CBDC': 0.2,
      'USD-CBDC/GBP-CBDC': 0.3,
      'USD-CBDC/JPY-CBDC': 0.4,
      'EUR-CBDC/GBP-CBDC': 0.25,
      'EUR-CBDC/JPY-CBDC': 0.35,
      'GBP-CBDC/JPY-CBDC': 0.4
    };

    const pair = `${fromCurrency}/${toCurrency}`;
    const inversePair = `${toCurrency}/${fromCurrency}`;

    return volatilityMap[pair] || volatilityMap[inversePair] || 0.3;
  }

  /**
   * Check if transaction is cross-border
   */
  isCrossBorderTransaction(fromCurrency, toCurrency) {
    const fromCBDC = this.cbdcRegistry.getCBDC(fromCurrency);
    const toCBDC = this.cbdcRegistry.getCBDC(toCurrency);

    return fromCBDC && toCBDC && fromCBDC.country !== toCBDC.country;
  }

  /**
   * Convert amount to USD for standardized risk assessment
   */
  async convertToUSD(amount, currency) {
    if (currency === 'USD-CBDC') {
      return amount;
    }

    try {
      return await this.exchangeRateService.convertCurrency(amount, currency, 'USD-CBDC');
    } catch (error) {
      logger.warn(`Failed to convert ${currency} to USD for risk assessment`);
      return amount; // Fallback to original amount
    }
  }

  /**
   * Calculate rate deviation risk
   */
  calculateRateDeviationRisk(fromCurrency, toCurrency, currentRate) {
    // Check if current rate deviates significantly from recent average
    try {
      const recentRate = this.exchangeRateService.rates.get(`${fromCurrency}/${toCurrency}`);
      if (!recentRate) return 0.3; // Default risk if no recent rate

      const deviation = Math.abs((currentRate - recentRate.rate) / recentRate.rate);
      return Math.min(deviation * 2, 0.5); // Cap at 50% risk
    } catch (error) {
      return 0.3; // Default risk on error
    }
  }

  /**
   * Calculate jurisdiction risk based on regulatory environment
   */
  calculateJurisdictionRisk(fromCurrency, toCurrency) {
    const fromCBDC = this.cbdcRegistry.getCBDC(fromCurrency);
    const toCBDC = this.cbdcRegistry.getCBDC(toCurrency);

    if (!fromCBDC || !toCBDC) return 0.5;

    // Higher risk for certain jurisdictions or combinations
    const highRiskCountries = new Set(['China']); // Countries with capital controls
    const sanctionedCountries = new Set([]); // Would be populated with sanctioned countries

    let risk = 0.1; // Base risk

    if (highRiskCountries.has(fromCBDC.country) || highRiskCountries.has(toCBDC.country)) {
      risk += 0.3;
    }

    if (sanctionedCountries.has(fromCBDC.country) || sanctionedCountries.has(toCBDC.country)) {
      risk += 0.5;
    }

    // Additional risk for certain currency combinations
    if ((fromCurrency === 'CNY-CBDC' && toCurrency !== 'USD-CBDC') ||
        (toCurrency === 'CNY-CBDC' && fromCurrency !== 'USD-CBDC')) {
      risk += 0.2; // Higher risk for CNY transactions not involving USD
    }

    return Math.min(risk, 0.8);
  }

  /**
   * Calculate time-of-day risk based on operating hours
   */
  calculateTimeOfDayRisk(fromCurrency, toCurrency) {
    const fromCBDC = this.cbdcRegistry.getCBDC(fromCurrency);
    const toCBDC = this.cbdcRegistry.getCBDC(toCurrency);

    if (!fromCBDC || !toCBDC) return 0.2;

    // All CBDCs currently operate 24/7, but this could be enhanced
    // to detect unusual timing patterns
    const currentHour = new Date().getUTCHours();
    
    // Slightly higher risk during typical off-hours (2-6 AM UTC)
    if (currentHour >= 2 && currentHour <= 6) {
      return 0.15;
    }

    return 0.05;
  }

  /**
   * Calculate velocity risk based on recent transaction patterns
   */
  calculateVelocityRisk(walletId, amount) {
    // Check recent transaction history for this wallet
    const recentTransactions = Array.from(this.transactionHistory.values())
      .filter(tx => 
        (tx.fromWallet === walletId || tx.toWallet === walletId) &&
        (Date.now() - new Date(tx.recordedAt).getTime()) < 3600000 // Last hour
      );

    if (recentTransactions.length === 0) return 0.1;

    const totalRecentAmount = recentTransactions.reduce((sum, tx) => sum + tx.amount, 0);
    const transactionCount = recentTransactions.length;

    let risk = 0.1;

    // High frequency risk
    if (transactionCount > 10) {
      risk += 0.3;
    } else if (transactionCount > 5) {
      risk += 0.2;
    }

    // High volume risk
    if (totalRecentAmount > 100000) {
      risk += 0.3;
    } else if (totalRecentAmount > 50000) {
      risk += 0.2;
    }

    // Large single transaction risk
    if (amount > totalRecentAmount * 2) {
      risk += 0.2;
    }

    return Math.min(risk, 0.7);
  }

  /**
   * Call fraud detection service (enhanced implementation)
   */
  async callFraudDetectionService(analysisRequest) {
    // Enhanced fraud detection with multiple risk factors
    const features = analysisRequest.features;
    
    const baseRisk = 0.05;
    const currencyRisk = features.currencyPairRisk * 0.25;
    const volatilityRisk = features.exchangeRateVolatility * 0.15;
    const crossBorderRisk = features.crossBorderIndicator ? 0.15 : 0;
    const amountRisk = Math.min(features.amountInUSD / 100000, 0.25);
    const rateDeviationRisk = features.rateDeviationRisk * 0.2;
    const jurisdictionRisk = features.jurisdictionRisk * 0.3;
    const timeRisk = features.timeOfDayRisk * 0.1;
    const velocityRisk = features.velocityRisk * 0.25;

    const riskScore = Math.min(
      baseRisk + currencyRisk + volatilityRisk + crossBorderRisk + 
      amountRisk + rateDeviationRisk + jurisdictionRisk + timeRisk + velocityRisk,
      1.0
    );

    const riskFactors = [];
    if (currencyRisk > 0.15) riskFactors.push('high_risk_currency_pair');
    if (volatilityRisk > 0.1) riskFactors.push('high_volatility');
    if (crossBorderRisk > 0) riskFactors.push('cross_border_transaction');
    if (amountRisk > 0.15) riskFactors.push('large_amount');
    if (rateDeviationRisk > 0.1) riskFactors.push('unusual_exchange_rate');
    if (jurisdictionRisk > 0.2) riskFactors.push('high_risk_jurisdiction');
    if (timeRisk > 0.1) riskFactors.push('unusual_timing');
    if (velocityRisk > 0.2) riskFactors.push('high_velocity');

    return {
      analysisId: uuidv4(),
      riskScore,
      riskFactors,
      recommendation: riskScore > 0.8 ? 'block' : riskScore > 0.5 ? 'manual_review' : 'approve',
      detailedAnalysis: {
        baseRisk,
        currencyRisk,
        volatilityRisk,
        crossBorderRisk,
        amountRisk,
        rateDeviationRisk,
        jurisdictionRisk,
        timeRisk,
        velocityRisk,
        totalRiskScore: riskScore
      }
    };
  }

  /**
   * Execute cross-currency transaction
   */
  async executeCrossCurrencyTransaction(transactionData) {
    const {
      transactionId,
      fromWallet,
      toWallet,
      amount,
      convertedAmount,
      fromCurrency,
      toCurrency,
      exchangeRate,
      fraudAnalysis,
      metadata
    } = transactionData;

    // Mock transaction execution - in production this would interact with actual CBDC systems
    const executionResult = {
      transactionId,
      status: 'completed',
      fromWallet,
      toWallet,
      sourceAmount: amount,
      sourceCurrency: fromCurrency,
      targetAmount: convertedAmount.baseAmount,
      targetCurrency: toCurrency,
      exchangeRate: exchangeRate.rate,
      executionTime: new Date(),
      fees: {
        exchangeFee: convertedAmount.baseAmount * 0.001, // 0.1% exchange fee
        networkFee: 0.01 // Fixed network fee
      },
      fraudAnalysisId: fraudAnalysis.analysisId,
      metadata
    };

    logger.info(`Executed cross-currency transaction: ${amount} ${fromCurrency} -> ${convertedAmount.baseAmount} ${toCurrency}`);
    
    return executionResult;
  }

  /**
   * Record transaction for audit and analysis
   */
  recordTransaction(transactionId, transactionData) {
    this.transactionHistory.set(transactionId, {
      ...transactionData,
      recordedAt: new Date()
    });

    // Keep only last 1000 transactions in memory
    if (this.transactionHistory.size > 1000) {
      const oldestKey = this.transactionHistory.keys().next().value;
      this.transactionHistory.delete(oldestKey);
    }
  }

  /**
   * Get transaction history
   */
  getTransactionHistory(limit = 100) {
    const transactions = Array.from(this.transactionHistory.values())
      .sort((a, b) => b.recordedAt - a.recordedAt)
      .slice(0, limit);

    return transactions;
  }

  /**
   * Get cross-currency transaction statistics
   */
  getStats() {
    const transactions = Array.from(this.transactionHistory.values());
    const crossCurrencyTxs = transactions.filter(tx => tx.fromCurrency !== tx.toCurrency);
    
    const currencyPairs = {};
    const totalVolume = {};
    let totalFees = 0;

    crossCurrencyTxs.forEach(tx => {
      const pair = `${tx.fromCurrency}/${tx.toCurrency}`;
      currencyPairs[pair] = (currencyPairs[pair] || 0) + 1;
      
      totalVolume[tx.fromCurrency] = (totalVolume[tx.fromCurrency] || 0) + tx.amount;
      
      if (tx.result && tx.result.fees) {
        totalFees += tx.result.fees.exchangeFee + tx.result.fees.networkFee;
      }
    });

    return {
      totalTransactions: transactions.length,
      crossCurrencyTransactions: crossCurrencyTxs.length,
      currencyPairs,
      totalVolume,
      totalFeesCollected: totalFees,
      averageProcessingTime: crossCurrencyTxs.reduce((sum, tx) => sum + (tx.processingTime || 0), 0) / crossCurrencyTxs.length || 0
    };
  }
}

module.exports = CrossCurrencyProcessor;