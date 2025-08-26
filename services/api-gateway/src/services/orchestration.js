const axios = require('axios');
const serviceDiscovery = require('./service-discovery');
const logger = require('../utils/logger');

class OrchestrationService {
  constructor() {
    this.timeout = 30000; // 30 second timeout
  }

  async processTransaction(transactionData, userId) {
    const correlationId = `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    logger.info('Starting transaction orchestration:', {
      correlationId,
      userId,
      amount: transactionData.amount,
      fromWallet: transactionData.fromWallet,
      toWallet: transactionData.toWallet
    });

    try {
      // Step 1: Validate tokens and wallets
      const tokenValidation = await this.validateTokens(transactionData, correlationId);
      if (!tokenValidation.valid) {
        throw new Error(`Token validation failed: ${tokenValidation.reason}`);
      }

      // Step 2: Run fraud detection
      const fraudCheck = await this.runFraudDetection(transactionData, userId, correlationId);
      
      if (fraudCheck.riskScore > 0.8) {
        logger.warn('High fraud risk detected:', {
          correlationId,
          riskScore: fraudCheck.riskScore,
          reasons: fraudCheck.reasons
        });
        
        // Block high-risk transactions
        throw new Error('Transaction blocked due to high fraud risk');
      }

      // Step 3: Process transaction
      const transaction = await this.executeTransaction({
        ...transactionData,
        fraudScore: fraudCheck.riskScore,
        correlationId
      });

      // Step 4: Update token ownership (async)
      this.updateTokenOwnership(transaction.id, transactionData, correlationId)
        .catch(error => {
          logger.error('Token ownership update failed:', {
            correlationId,
            transactionId: transaction.id,
            error: error.message
          });
        });

      // Step 5: Send notifications (async)
      this.sendTransactionNotifications(transaction, userId, correlationId)
        .catch(error => {
          logger.error('Notification sending failed:', {
            correlationId,
            error: error.message
          });
        });

      logger.info('Transaction orchestration completed:', {
        correlationId,
        transactionId: transaction.id,
        status: transaction.status
      });

      return {
        success: true,
        transaction,
        fraudScore: fraudCheck.riskScore,
        correlationId
      };

    } catch (error) {
      logger.error('Transaction orchestration failed:', {
        correlationId,
        error: error.message,
        stack: error.stack
      });

      return {
        success: false,
        error: error.message,
        correlationId
      };
    }
  }

  async processFraudReport(reportData, userId) {
    const correlationId = `fraud_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    logger.info('Starting fraud report orchestration:', {
      correlationId,
      userId,
      transactionId: reportData.transactionId
    });

    try {
      // Step 1: Create fraud case
      const fraudCase = await this.createFraudCase(reportData, userId, correlationId);

      // Step 2: Freeze disputed tokens
      await this.freezeTokens(reportData.transactionId, correlationId);

      // Step 3: Collect evidence
      const evidence = await this.collectEvidence(reportData.transactionId, correlationId);

      // Step 4: Run automated analysis
      const analysis = await this.analyzeForAutomatedReversal(fraudCase.id, evidence, correlationId);

      if (analysis.confidence > 0.9) {
        // Step 5a: Automated reversal for clear cases
        const reversal = await this.executeAutomatedReversal(fraudCase.id, correlationId);
        
        logger.info('Automated reversal completed:', {
          correlationId,
          fraudCaseId: fraudCase.id,
          reversalId: reversal.id
        });

        return {
          success: true,
          fraudCase,
          reversal,
          automated: true,
          correlationId
        };
      } else {
        // Step 5b: Escalate to human arbitration
        await this.escalateToArbitration(fraudCase.id, evidence, correlationId);
        
        logger.info('Fraud case escalated to arbitration:', {
          correlationId,
          fraudCaseId: fraudCase.id
        });

        return {
          success: true,
          fraudCase,
          automated: false,
          escalated: true,
          correlationId
        };
      }

    } catch (error) {
      logger.error('Fraud report orchestration failed:', {
        correlationId,
        error: error.message,
        stack: error.stack
      });

      return {
        success: false,
        error: error.message,
        correlationId
      };
    }
  }

  async validateTokens(transactionData, correlationId) {
    try {
      const tokenServiceUrl = await serviceDiscovery.getServiceUrl('token-management');
      
      const response = await axios.post(`${tokenServiceUrl}/validate`, {
        fromWallet: transactionData.fromWallet,
        toWallet: transactionData.toWallet,
        amount: transactionData.amount
      }, {
        headers: { 'X-Correlation-ID': correlationId },
        timeout: this.timeout
      });

      return response.data;
    } catch (error) {
      logger.error('Token validation failed:', {
        correlationId,
        error: error.message
      });
      throw new Error('Token validation service unavailable');
    }
  }

  async runFraudDetection(transactionData, userId, correlationId) {
    try {
      const fraudServiceUrl = await serviceDiscovery.getServiceUrl('fraud-detection');
      
      const response = await axios.post(`${fraudServiceUrl}/analyze`, {
        transaction: transactionData,
        userId: userId,
        timestamp: new Date().toISOString()
      }, {
        headers: { 'X-Correlation-ID': correlationId },
        timeout: this.timeout
      });

      return response.data;
    } catch (error) {
      logger.error('Fraud detection failed:', {
        correlationId,
        error: error.message
      });
      
      // Return safe default for fraud detection failures
      return {
        riskScore: 0.5,
        reasons: ['Fraud detection service unavailable'],
        fallback: true
      };
    }
  }

  async executeTransaction(transactionData) {
    try {
      const transactionServiceUrl = await serviceDiscovery.getServiceUrl('transaction-service');
      
      const response = await axios.post(`${transactionServiceUrl}/transactions`, transactionData, {
        headers: { 'X-Correlation-ID': transactionData.correlationId },
        timeout: this.timeout
      });

      return response.data;
    } catch (error) {
      logger.error('Transaction execution failed:', {
        correlationId: transactionData.correlationId,
        error: error.message
      });
      throw new Error('Transaction service unavailable');
    }
  }

  async updateTokenOwnership(transactionId, transactionData, correlationId) {
    try {
      const tokenServiceUrl = await serviceDiscovery.getServiceUrl('token-management');
      
      await axios.post(`${tokenServiceUrl}/transfer`, {
        transactionId,
        fromWallet: transactionData.fromWallet,
        toWallet: transactionData.toWallet,
        amount: transactionData.amount
      }, {
        headers: { 'X-Correlation-ID': correlationId },
        timeout: this.timeout
      });

      logger.info('Token ownership updated:', {
        correlationId,
        transactionId
      });
    } catch (error) {
      logger.error('Token ownership update failed:', {
        correlationId,
        transactionId,
        error: error.message
      });
      throw error;
    }
  }

  async createFraudCase(reportData, userId, correlationId) {
    try {
      const reversibilityServiceUrl = await serviceDiscovery.getServiceUrl('reversibility-service');
      
      const response = await axios.post(`${reversibilityServiceUrl}/fraud-reports`, {
        ...reportData,
        reporterId: userId
      }, {
        headers: { 'X-Correlation-ID': correlationId },
        timeout: this.timeout
      });

      return response.data;
    } catch (error) {
      logger.error('Fraud case creation failed:', {
        correlationId,
        error: error.message
      });
      throw new Error('Reversibility service unavailable');
    }
  }

  async freezeTokens(transactionId, correlationId) {
    try {
      const tokenServiceUrl = await serviceDiscovery.getServiceUrl('token-management');
      
      await axios.post(`${tokenServiceUrl}/freeze`, {
        transactionId
      }, {
        headers: { 'X-Correlation-ID': correlationId },
        timeout: this.timeout
      });

      logger.info('Tokens frozen:', {
        correlationId,
        transactionId
      });
    } catch (error) {
      logger.error('Token freezing failed:', {
        correlationId,
        transactionId,
        error: error.message
      });
      throw error;
    }
  }

  async collectEvidence(transactionId, correlationId) {
    try {
      const reversibilityServiceUrl = await serviceDiscovery.getServiceUrl('reversibility-service');
      
      const response = await axios.get(`${reversibilityServiceUrl}/evidence/${transactionId}`, {
        headers: { 'X-Correlation-ID': correlationId },
        timeout: this.timeout
      });

      return response.data;
    } catch (error) {
      logger.error('Evidence collection failed:', {
        correlationId,
        transactionId,
        error: error.message
      });
      return { evidence: [], automated: false };
    }
  }

  async analyzeForAutomatedReversal(fraudCaseId, evidence, correlationId) {
    try {
      const reversibilityServiceUrl = await serviceDiscovery.getServiceUrl('reversibility-service');
      
      const response = await axios.post(`${reversibilityServiceUrl}/analyze-reversal`, {
        fraudCaseId,
        evidence
      }, {
        headers: { 'X-Correlation-ID': correlationId },
        timeout: this.timeout
      });

      return response.data;
    } catch (error) {
      logger.error('Automated reversal analysis failed:', {
        correlationId,
        fraudCaseId,
        error: error.message
      });
      return { confidence: 0, automated: false };
    }
  }

  async executeAutomatedReversal(fraudCaseId, correlationId) {
    try {
      const reversibilityServiceUrl = await serviceDiscovery.getServiceUrl('reversibility-service');
      
      const response = await axios.post(`${reversibilityServiceUrl}/automated-reversal`, {
        fraudCaseId
      }, {
        headers: { 'X-Correlation-ID': correlationId },
        timeout: this.timeout
      });

      return response.data;
    } catch (error) {
      logger.error('Automated reversal execution failed:', {
        correlationId,
        fraudCaseId,
        error: error.message
      });
      throw error;
    }
  }

  async escalateToArbitration(fraudCaseId, evidence, correlationId) {
    try {
      const reversibilityServiceUrl = await serviceDiscovery.getServiceUrl('reversibility-service');
      
      await axios.post(`${reversibilityServiceUrl}/arbitration/escalate`, {
        fraudCaseId,
        evidence
      }, {
        headers: { 'X-Correlation-ID': correlationId },
        timeout: this.timeout
      });

      logger.info('Case escalated to arbitration:', {
        correlationId,
        fraudCaseId
      });
    } catch (error) {
      logger.error('Arbitration escalation failed:', {
        correlationId,
        fraudCaseId,
        error: error.message
      });
      throw error;
    }
  }

  async sendTransactionNotifications(transaction, userId, correlationId) {
    // This would integrate with a notification service
    logger.info('Transaction notification sent:', {
      correlationId,
      transactionId: transaction.id,
      userId
    });
  }
}

module.exports = new OrchestrationService();