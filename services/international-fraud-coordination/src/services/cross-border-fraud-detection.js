const axios = require('axios');
const crypto = require('crypto');
const logger = require('../utils/logger');

class CrossBorderFraudDetection {
  constructor() {
    this.jurisdictionEndpoints = new Map([
      ['US', process.env.US_FRAUD_ENDPOINT || 'https://api.us-cbdc.gov/fraud'],
      ['EU', process.env.EU_FRAUD_ENDPOINT || 'https://api.eu-cbdc.europa.eu/fraud'],
      ['UK', process.env.UK_FRAUD_ENDPOINT || 'https://api.uk-cbdc.gov.uk/fraud'],
      ['CA', process.env.CA_FRAUD_ENDPOINT || 'https://api.ca-cbdc.gc.ca/fraud'],
      ['JP', process.env.JP_FRAUD_ENDPOINT || 'https://api.jp-cbdc.boj.or.jp/fraud'],
      ['AU', process.env.AU_FRAUD_ENDPOINT || 'https://api.au-cbdc.rba.gov.au/fraud']
    ]);
    
    this.fraudPatternCache = new Map();
    this.crossBorderRiskFactors = {
      HIGH_RISK_CORRIDORS: ['US-RU', 'EU-CN', 'UK-IR'],
      VELOCITY_THRESHOLDS: {
        DAILY: 10000,
        HOURLY: 5000,
        TRANSACTION_COUNT: 50
      },
      SUSPICIOUS_PATTERNS: [
        'RAPID_SEQUENTIAL_TRANSFERS',
        'ROUND_TRIP_TRANSACTIONS',
        'LAYERED_TRANSFERS',
        'UNUSUAL_TIMING_PATTERNS'
      ]
    };
  }

  /**
   * Analyze cross-border transaction for fraud patterns
   */
  async analyzeTransaction(transactionData, jurisdictions) {
    try {
      logger.info('Analyzing cross-border transaction', { 
        transactionId: transactionData.id,
        jurisdictions 
      });

      const analysis = {
        transactionId: transactionData.id,
        riskScore: 0,
        riskFactors: [],
        jurisdictionalAlerts: [],
        recommendedActions: [],
        crossBorderPatterns: []
      };

      // Analyze transaction corridor risk
      const corridorRisk = this.analyzeCorridorRisk(jurisdictions);
      analysis.riskScore += corridorRisk.score;
      analysis.riskFactors.push(...corridorRisk.factors);

      // Check velocity patterns across jurisdictions
      const velocityRisk = await this.analyzeVelocityPatterns(transactionData, jurisdictions);
      analysis.riskScore += velocityRisk.score;
      analysis.riskFactors.push(...velocityRisk.factors);

      // Query international fraud databases
      const internationalChecks = await this.queryInternationalDatabases(transactionData, jurisdictions);
      analysis.jurisdictionalAlerts = internationalChecks.alerts;
      analysis.riskScore += internationalChecks.riskScore;

      // Detect cross-border fraud patterns
      const patternAnalysis = await this.detectCrossBorderPatterns(transactionData, jurisdictions);
      analysis.crossBorderPatterns = patternAnalysis.patterns;
      analysis.riskScore += patternAnalysis.riskScore;

      // Generate recommendations
      analysis.recommendedActions = this.generateRecommendations(analysis);

      // Normalize risk score (0-1)
      analysis.riskScore = Math.min(analysis.riskScore / 100, 1);

      logger.info('Cross-border analysis completed', {
        transactionId: transactionData.id,
        riskScore: analysis.riskScore,
        alertCount: analysis.jurisdictionalAlerts.length
      });

      return analysis;
    } catch (error) {
      logger.error('Cross-border analysis failed', error);
      throw error;
    }
  }

  /**
   * Share fraud patterns with international partners
   */
  async sharePatterns(patterns, sourceJurisdiction) {
    try {
      logger.info('Sharing fraud patterns', { 
        sourceJurisdiction,
        patternCount: patterns.length 
      });

      const sharedPatterns = patterns.map(pattern => ({
        id: crypto.randomUUID(),
        type: pattern.type,
        indicators: pattern.indicators,
        riskLevel: pattern.riskLevel,
        sourceJurisdiction,
        timestamp: new Date().toISOString(),
        // Remove sensitive data
        anonymizedData: this.anonymizePattern(pattern)
      }));

      const shareResults = [];

      // Share with all partner jurisdictions
      for (const [jurisdiction, endpoint] of this.jurisdictionEndpoints) {
        if (jurisdiction !== sourceJurisdiction) {
          try {
            const response = await this.sendSecurePatternData(endpoint, sharedPatterns);
            shareResults.push({
              jurisdiction,
              status: 'success',
              patternsShared: sharedPatterns.length,
              response: response.data
            });
          } catch (error) {
            logger.error(`Pattern sharing failed for ${jurisdiction}`, error);
            shareResults.push({
              jurisdiction,
              status: 'failed',
              error: error.message
            });
          }
        }
      }

      // Update local pattern cache
      sharedPatterns.forEach(pattern => {
        this.fraudPatternCache.set(pattern.id, pattern);
      });

      return {
        success: true,
        sharedPatterns: sharedPatterns.length,
        shareResults
      };
    } catch (error) {
      logger.error('Pattern sharing failed', error);
      throw error;
    }
  }

  /**
   * Analyze corridor risk between jurisdictions
   */
  analyzeCorridorRisk(jurisdictions) {
    const corridor = jurisdictions.sort().join('-');
    const riskFactors = [];
    let score = 0;

    if (this.crossBorderRiskFactors.HIGH_RISK_CORRIDORS.includes(corridor)) {
      riskFactors.push('HIGH_RISK_CORRIDOR');
      score += 25;
    }

    // Check for unusual jurisdiction combinations
    if (jurisdictions.length > 3) {
      riskFactors.push('MULTIPLE_JURISDICTIONS');
      score += 15;
    }

    return { score, factors: riskFactors };
  }

  /**
   * Analyze velocity patterns across jurisdictions
   */
  async analyzeVelocityPatterns(transactionData, jurisdictions) {
    const riskFactors = [];
    let score = 0;

    // This would typically query a distributed database
    // For now, we'll simulate velocity analysis
    const velocityData = {
      dailyVolume: transactionData.amount * 10, // Simulated
      hourlyVolume: transactionData.amount * 3,
      transactionCount: 15
    };

    if (velocityData.dailyVolume > this.crossBorderRiskFactors.VELOCITY_THRESHOLDS.DAILY) {
      riskFactors.push('HIGH_DAILY_VELOCITY');
      score += 20;
    }

    if (velocityData.hourlyVolume > this.crossBorderRiskFactors.VELOCITY_THRESHOLDS.HOURLY) {
      riskFactors.push('HIGH_HOURLY_VELOCITY');
      score += 15;
    }

    if (velocityData.transactionCount > this.crossBorderRiskFactors.VELOCITY_THRESHOLDS.TRANSACTION_COUNT) {
      riskFactors.push('HIGH_TRANSACTION_FREQUENCY');
      score += 10;
    }

    return { score, factors: riskFactors };
  }

  /**
   * Query international fraud databases
   */
  async queryInternationalDatabases(transactionData, jurisdictions) {
    const alerts = [];
    let riskScore = 0;

    for (const jurisdiction of jurisdictions) {
      const endpoint = this.jurisdictionEndpoints.get(jurisdiction);
      if (endpoint) {
        try {
          const response = await axios.post(`${endpoint}/check`, {
            transactionId: transactionData.id,
            amount: transactionData.amount,
            fromWallet: this.hashSensitiveData(transactionData.fromWallet),
            toWallet: this.hashSensitiveData(transactionData.toWallet),
            timestamp: transactionData.timestamp
          }, {
            timeout: 5000,
            headers: {
              'Authorization': `Bearer ${process.env[`${jurisdiction}_API_KEY`]}`,
              'Content-Type': 'application/json'
            }
          });

          if (response.data.alerts && response.data.alerts.length > 0) {
            alerts.push(...response.data.alerts.map(alert => ({
              ...alert,
              jurisdiction,
              source: 'international_database'
            })));
            riskScore += response.data.riskScore || 0;
          }
        } catch (error) {
          logger.warn(`Failed to query ${jurisdiction} database`, error.message);
          // Don't fail the entire analysis if one jurisdiction is unavailable
        }
      }
    }

    return { alerts, riskScore };
  }

  /**
   * Detect cross-border fraud patterns
   */
  async detectCrossBorderPatterns(transactionData, jurisdictions) {
    const patterns = [];
    let riskScore = 0;

    // Check for rapid sequential transfers
    if (this.detectRapidSequentialTransfers(transactionData)) {
      patterns.push({
        type: 'RAPID_SEQUENTIAL_TRANSFERS',
        confidence: 0.8,
        description: 'Multiple rapid transfers detected across jurisdictions'
      });
      riskScore += 15;
    }

    // Check for round-trip transactions
    if (this.detectRoundTripTransactions(transactionData, jurisdictions)) {
      patterns.push({
        type: 'ROUND_TRIP_TRANSACTIONS',
        confidence: 0.9,
        description: 'Potential money laundering through round-trip transfers'
      });
      riskScore += 25;
    }

    // Check for layered transfers
    if (this.detectLayeredTransfers(transactionData)) {
      patterns.push({
        type: 'LAYERED_TRANSFERS',
        confidence: 0.7,
        description: 'Complex layering pattern detected'
      });
      riskScore += 20;
    }

    return { patterns, riskScore };
  }

  /**
   * Generate recommendations based on analysis
   */
  generateRecommendations(analysis) {
    const recommendations = [];

    if (analysis.riskScore > 0.8) {
      recommendations.push('BLOCK_TRANSACTION');
      recommendations.push('IMMEDIATE_INVESTIGATION');
    } else if (analysis.riskScore > 0.6) {
      recommendations.push('ENHANCED_MONITORING');
      recommendations.push('MANUAL_REVIEW');
    } else if (analysis.riskScore > 0.4) {
      recommendations.push('ADDITIONAL_VERIFICATION');
    }

    if (analysis.jurisdictionalAlerts.length > 0) {
      recommendations.push('COORDINATE_WITH_AUTHORITIES');
    }

    if (analysis.crossBorderPatterns.length > 0) {
      recommendations.push('PATTERN_ANALYSIS');
    }

    return recommendations;
  }

  /**
   * Anonymize pattern data for sharing
   */
  anonymizePattern(pattern) {
    return {
      type: pattern.type,
      indicators: pattern.indicators.map(indicator => ({
        ...indicator,
        // Hash any sensitive identifiers
        walletId: indicator.walletId ? this.hashSensitiveData(indicator.walletId) : undefined,
        userId: indicator.userId ? this.hashSensitiveData(indicator.userId) : undefined
      })),
      riskLevel: pattern.riskLevel,
      frequency: pattern.frequency
    };
  }

  /**
   * Send secure pattern data to partner jurisdiction
   */
  async sendSecurePatternData(endpoint, patterns) {
    return axios.post(`${endpoint}/patterns/receive`, {
      patterns,
      timestamp: new Date().toISOString(),
      source: 'echopay-international'
    }, {
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
        'X-Signature': this.signData(patterns)
      }
    });
  }

  /**
   * Hash sensitive data for privacy
   */
  hashSensitiveData(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Sign data for secure transmission
   */
  signData(data) {
    const dataString = JSON.stringify(data);
    return crypto.createHmac('sha256', process.env.SIGNING_KEY || 'default-key')
                 .update(dataString)
                 .digest('hex');
  }

  // Pattern detection methods (simplified implementations)
  detectRapidSequentialTransfers(transactionData) {
    // Simplified logic - would check transaction history
    return Math.random() > 0.8;
  }

  detectRoundTripTransactions(transactionData, jurisdictions) {
    // Simplified logic - would analyze transaction flows
    return jurisdictions.length > 2 && Math.random() > 0.9;
  }

  detectLayeredTransfers(transactionData) {
    // Simplified logic - would analyze transaction complexity
    return Math.random() > 0.85;
  }
}

module.exports = new CrossBorderFraudDetection();