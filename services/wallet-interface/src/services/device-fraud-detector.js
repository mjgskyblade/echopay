const logger = require('../utils/logger');

class DeviceFraudDetector {
  constructor(deviceManager, multiWalletManager) {
    this.deviceManager = deviceManager;
    this.multiWalletManager = multiWalletManager;
    this.fraudPatterns = new Map();
    this.alertThresholds = {
      riskScore: 0.7,
      concurrentSessions: 3,
      rapidLocationChanges: 2,
      newDeviceTransactionLimit: 100,
      suspiciousActivityWindow: 24 * 60 * 60 * 1000 // 24 hours
    };
  }

  /**
   * Analyze transaction for device-based fraud patterns
   */
  async analyzeTransaction(transaction, deviceId, req) {
    const fraudIndicators = [];
    let riskScore = 0;

    // Get device information
    const device = this.deviceManager.devices.get(deviceId);
    if (!device) {
      fraudIndicators.push({
        type: 'unknown_device',
        severity: 'high',
        description: 'Transaction from unregistered device'
      });
      riskScore += 0.8;
    } else {
      // Update device activity and check for suspicious patterns
      const activityResult = await this.deviceManager.updateDeviceActivity(
        deviceId, 
        req, 
        transaction.location
      );

      if (activityResult && activityResult.suspiciousPatterns.length > 0) {
        for (const pattern of activityResult.suspiciousPatterns) {
          fraudIndicators.push({
            type: pattern,
            severity: this.getPatternSeverity(pattern),
            description: this.getPatternDescription(pattern)
          });
          riskScore += this.getPatternRiskScore(pattern);
        }
      }

      // Check device trust level
      if (!device.isTrusted) {
        fraudIndicators.push({
          type: 'untrusted_device',
          severity: 'medium',
          description: 'Transaction from unverified device'
        });
        riskScore += 0.3;
      }

      // Check for new device with high-value transaction
      const deviceAge = (new Date() - device.registeredAt) / (1000 * 60 * 60); // hours
      if (deviceAge < 24 && transaction.amount > this.alertThresholds.newDeviceTransactionLimit) {
        fraudIndicators.push({
          type: 'new_device_high_value',
          severity: 'high',
          description: 'High-value transaction from recently registered device'
        });
        riskScore += 0.5;
      }
    }

    // Check for concurrent sessions from different locations
    const concurrentSessions = this.deviceManager.checkConcurrentSessions(transaction.userId);
    if (concurrentSessions.length > this.alertThresholds.concurrentSessions) {
      fraudIndicators.push({
        type: 'excessive_concurrent_sessions',
        severity: 'high',
        description: `${concurrentSessions.length} concurrent sessions detected`
      });
      riskScore += 0.4;
    }

    // Check for rapid wallet switching patterns
    const walletSwitchingRisk = await this.analyzeWalletSwitchingPattern(
      transaction.userId, 
      transaction.walletId,
      deviceId
    );
    
    if (walletSwitchingRisk.isRisky) {
      fraudIndicators.push({
        type: 'suspicious_wallet_switching',
        severity: 'medium',
        description: walletSwitchingRisk.description
      });
      riskScore += walletSwitchingRisk.riskScore;
    }

    // Check for device fingerprint anomalies
    if (device) {
      const fingerprintRisk = await this.analyzeFingerprintAnomalies(device, req);
      if (fingerprintRisk.isAnomalous) {
        fraudIndicators.push({
          type: 'fingerprint_anomaly',
          severity: 'medium',
          description: fingerprintRisk.description
        });
        riskScore += fingerprintRisk.riskScore;
      }
    }

    // Normalize risk score
    riskScore = Math.min(riskScore, 1.0);

    const analysis = {
      transactionId: transaction.transactionId,
      deviceId,
      userId: transaction.userId,
      riskScore,
      fraudIndicators,
      recommendation: this.getRecommendation(riskScore, fraudIndicators),
      timestamp: new Date()
    };

    // Log high-risk transactions
    if (riskScore >= this.alertThresholds.riskScore) {
      logger.warn('High-risk device-based fraud detected', {
        transactionId: transaction.transactionId,
        userId: transaction.userId,
        deviceId,
        riskScore,
        indicators: fraudIndicators.map(i => i.type)
      });
    }

    return analysis;
  }

  /**
   * Analyze wallet switching patterns for suspicious behavior
   */
  async analyzeWalletSwitchingPattern(userId, currentWalletId, deviceId) {
    const userWallets = this.multiWalletManager.getUserWallets(userId);
    const recentSwitches = this.getRecentWalletSwitches(userId, deviceId);

    let isRisky = false;
    let riskScore = 0;
    let description = '';

    // Check for rapid wallet switching
    const switchesInLastHour = recentSwitches.filter(
      s => (new Date() - s.timestamp) < 60 * 60 * 1000
    ).length;

    if (switchesInLastHour > 5) {
      isRisky = true;
      riskScore += 0.3;
      description = `Rapid wallet switching detected: ${switchesInLastHour} switches in last hour`;
    }

    // Check for unusual wallet access patterns
    const walletAccessPattern = this.analyzeWalletAccessPattern(userId, currentWalletId);
    if (walletAccessPattern.isUnusual) {
      isRisky = true;
      riskScore += 0.2;
      description += (description ? '; ' : '') + walletAccessPattern.reason;
    }

    return { isRisky, riskScore, description };
  }

  /**
   * Analyze device fingerprint for anomalies
   */
  async analyzeFingerprintAnomalies(device, req) {
    const currentFingerprint = this.deviceManager.generateDeviceFingerprint(req);
    const storedFingerprint = device.fingerprint;

    let isAnomalous = false;
    let riskScore = 0;
    let description = '';

    // Check for fingerprint changes
    if (currentFingerprint !== storedFingerprint) {
      // Calculate fingerprint similarity
      const similarity = this.calculateFingerprintSimilarity(currentFingerprint, storedFingerprint);
      
      if (similarity < 0.8) {
        isAnomalous = true;
        riskScore = 0.4;
        description = 'Significant device fingerprint changes detected';
      } else if (similarity < 0.9) {
        isAnomalous = true;
        riskScore = 0.2;
        description = 'Minor device fingerprint changes detected';
      }
    }

    // Check for user agent spoofing patterns
    const userAgent = req.get('User-Agent') || '';
    if (this.detectUserAgentSpoofing(userAgent, device.platform)) {
      isAnomalous = true;
      riskScore += 0.3;
      description += (description ? '; ' : '') + 'Potential user agent spoofing detected';
    }

    return { isAnomalous, riskScore, description };
  }

  /**
   * Get recent wallet switches for a user and device
   */
  getRecentWalletSwitches(userId, deviceId) {
    // In production, this would query a database
    // For demo, return mock data
    return [];
  }

  /**
   * Analyze wallet access patterns
   */
  analyzeWalletAccessPattern(userId, walletId) {
    // In production, this would analyze historical access patterns
    // For demo, return basic analysis
    return { isUnusual: false, reason: '' };
  }

  /**
   * Calculate similarity between two fingerprints
   */
  calculateFingerprintSimilarity(fp1, fp2) {
    if (fp1 === fp2) return 1.0;
    
    // Simple similarity calculation based on common characters
    const common = fp1.split('').filter(char => fp2.includes(char)).length;
    const total = Math.max(fp1.length, fp2.length);
    
    return common / total;
  }

  /**
   * Detect user agent spoofing
   */
  detectUserAgentSpoofing(currentUA, storedPlatform) {
    // Basic spoofing detection
    const suspiciousPatterns = [
      /bot|crawler|spider/i,
      /curl|wget|python/i,
      /headless/i
    ];

    return suspiciousPatterns.some(pattern => pattern.test(currentUA));
  }

  /**
   * Get pattern severity level
   */
  getPatternSeverity(pattern) {
    const severityMap = {
      'impossible_travel': 'high',
      'ip_change': 'low',
      'concurrent_sessions': 'medium',
      'new_device': 'medium',
      'fingerprint_change': 'medium'
    };
    return severityMap[pattern] || 'medium';
  }

  /**
   * Get pattern description
   */
  getPatternDescription(pattern) {
    const descriptionMap = {
      'impossible_travel': 'Device location changed impossibly fast',
      'ip_change': 'IP address changed since last session',
      'concurrent_sessions': 'Multiple active sessions detected',
      'new_device': 'Recently registered device',
      'fingerprint_change': 'Device fingerprint has changed'
    };
    return descriptionMap[pattern] || 'Suspicious pattern detected';
  }

  /**
   * Get pattern risk score
   */
  getPatternRiskScore(pattern) {
    const riskMap = {
      'impossible_travel': 0.6,
      'ip_change': 0.1,
      'concurrent_sessions': 0.3,
      'new_device': 0.2,
      'fingerprint_change': 0.3
    };
    return riskMap[pattern] || 0.2;
  }

  /**
   * Get recommendation based on risk analysis
   */
  getRecommendation(riskScore, fraudIndicators) {
    if (riskScore >= 0.8) {
      return {
        action: 'block',
        message: 'Transaction blocked due to high fraud risk',
        requiresReview: true
      };
    } else if (riskScore >= 0.5) {
      return {
        action: 'challenge',
        message: 'Additional verification required',
        requiresReview: false
      };
    } else if (riskScore >= 0.3) {
      return {
        action: 'monitor',
        message: 'Transaction flagged for monitoring',
        requiresReview: false
      };
    } else {
      return {
        action: 'allow',
        message: 'Transaction approved',
        requiresReview: false
      };
    }
  }

  /**
   * Generate fraud alert for high-risk activities
   */
  async generateFraudAlert(analysis) {
    if (analysis.riskScore < this.alertThresholds.riskScore) {
      return null;
    }

    const alert = {
      alertId: require('crypto').randomUUID(),
      userId: analysis.userId,
      deviceId: analysis.deviceId,
      transactionId: analysis.transactionId,
      alertType: 'device_fraud',
      riskScore: analysis.riskScore,
      indicators: analysis.fraudIndicators,
      recommendation: analysis.recommendation,
      status: 'active',
      createdAt: new Date()
    };

    logger.error('Fraud alert generated', alert);

    return alert;
  }

  /**
   * Update alert thresholds
   */
  updateAlertThresholds(newThresholds) {
    this.alertThresholds = { ...this.alertThresholds, ...newThresholds };
    logger.info('Alert thresholds updated', this.alertThresholds);
  }

  /**
   * Get fraud statistics for a user
   */
  getFraudStatistics(userId, timeRange = 24 * 60 * 60 * 1000) {
    // In production, this would query fraud detection logs
    // For demo, return mock statistics
    return {
      totalTransactions: 0,
      flaggedTransactions: 0,
      blockedTransactions: 0,
      averageRiskScore: 0,
      topRiskFactors: [],
      timeRange: timeRange
    };
  }
}

module.exports = DeviceFraudDetector;