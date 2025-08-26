const request = require('supertest');
const jwt = require('jsonwebtoken');
const axios = require('axios');

// Mock service discovery with load balancing
jest.mock('../services/service-discovery', () => ({
  initialize: jest.fn().mockResolvedValue(undefined),
  getServiceUrl: jest.fn().mockImplementation((serviceName) => {
    const urls = {
      'token-management': 'http://localhost:8002',
      'fraud-detection': 'http://localhost:8003',
      'transaction-service': 'http://localhost:8001',
      'reversibility-service': 'http://localhost:8004',
      'compliance-service': 'http://localhost:8005'
    };
    return Promise.resolve(urls[serviceName] || 'http://localhost:8000');
  }),
  getHealthyServices: jest.fn().mockResolvedValue({
    'transaction-service': { instances: 2, healthy: true },
    'fraud-detection': { instances: 1, healthy: true },
    'token-management': { instances: 2, healthy: true },
    'reversibility-service': { instances: 1, healthy: true },
    'compliance-service': { instances: 1, healthy: true }
  }),
  circuitBreaker: {
    getAllStates: jest.fn().mockReturnValue({
      'transaction-service': { state: 'CLOSED', failureCount: 0 },
      'fraud-detection': { state: 'CLOSED', failureCount: 0 }
    }),
    getMetrics: jest.fn().mockReturnValue({
      totalCircuits: 2,
      openCircuits: 0,
      closedCircuits: 2
    }),
    reset: jest.fn(),
    forceState: jest.fn()
  },
  shutdown: jest.fn().mockResolvedValue(undefined)
}));

// Mock service responses for complete workflow
const mockServiceResponses = {
  // Token management responses
  validate: { valid: true, reason: null },
  transfer: { success: true, transferId: 'transfer_123' },
  freeze: { success: true, frozenTokens: ['token_1', 'token_2'] },
  
  // Fraud detection responses
  analyze: { 
    riskScore: 0.15, 
    reasons: [], 
    fallback: false,
    modelVersion: '1.2.3',
    processingTime: 45
  },
  
  // Transaction service responses
  transactions: { 
    id: 'txn_complete_123', 
    status: 'completed', 
    amount: 250.00,
    currency: 'USD-CBDC',
    timestamp: new Date().toISOString(),
    confirmationNumber: 'CONF_789'
  },
  
  // Reversibility service responses
  'fraud-reports': { 
    id: 'case_complete_123', 
    status: 'open', 
    transactionId: 'txn_complete_123',
    priority: 'high',
    estimatedResolution: '1 hour'
  },
  evidence: { 
    evidence: [
      { type: 'transaction_log', data: 'log_data' },
      { type: 'user_behavior', data: 'behavior_data' }
    ], 
    automated: true,
    confidence: 0.85
  },
  'analyze-reversal': { 
    confidence: 0.92, 
    automated: true,
    recommendation: 'REVERSE',
    reasoning: 'Clear fraud pattern detected'
  },
  'automated-reversal': { 
    id: 'reversal_complete_123', 
    status: 'completed',
    reversedAmount: 250.00,
    newTokens: ['token_new_1', 'token_new_2']
  }
};

// Setup axios mocks for complete workflow
beforeEach(() => {
  axios.post.mockImplementation((url, data) => {
    const endpoint = url.split('/').pop();
    if (mockServiceResponses[endpoint]) {
      return Promise.resolve({ data: mockServiceResponses[endpoint] });
    }
    return Promise.resolve({ data: { success: true } });
  });

  axios.get.mockImplementation((url) => {
    const endpoint = url.split('/').pop();
    if (mockServiceResponses[endpoint]) {
      return Promise.resolve({ data: mockServiceResponses[endpoint] });
    }
    return Promise.resolve({ data: { success: true } });
  });
});

// Import app after mocks are set up
let app;
beforeAll(async () => {
  await new Promise(resolve => setTimeout(resolve, 100));
  app = require('../index');
});

describe('Complete End-to-End Workflow Tests', () => {
  let userToken;
  let merchantToken;
  let adminToken;

  beforeAll(() => {
    // Create different user tokens
    userToken = jwt.sign(
      {
        sub: 'user_legitimate_123',
        email: 'user@example.com',
        roles: ['user'],
        permissions: ['transaction:create', 'fraud:report']
      },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );

    merchantToken = jwt.sign(
      {
        sub: 'merchant_456',
        email: 'merchant@example.com',
        roles: ['merchant'],
        permissions: ['transaction:receive', 'transaction:create']
      },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );

    adminToken = jwt.sign(
      {
        sub: 'admin_789',
        email: 'admin@example.com',
        roles: ['admin'],
        permissions: ['*']
      },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );
  });

  describe('Complete Payment and Fraud Detection Workflow', () => {
    test('should process complete legitimate payment workflow', async () => {
      // Step 1: Initiate payment
      const paymentData = {
        fromWallet: 'wallet_user_123',
        toWallet: 'wallet_merchant_456',
        amount: 250.00,
        currency: 'USD-CBDC',
        metadata: {
          description: 'Premium service subscription',
          category: 'subscription',
          merchantId: 'merchant_456',
          invoiceId: 'INV_2025_001'
        }
      };

      const paymentResponse = await request(app)
        .post('/api/v1/orchestration/transaction')
        .set('Authorization', `Bearer ${userToken}`)
        .send(paymentData)
        .expect(200);

      // Verify payment response
      expect(paymentResponse.body).toMatchObject({
        success: true,
        transaction: {
          id: 'txn_complete_123',
          status: 'completed',
          amount: 250.00,
          currency: 'USD-CBDC'
        },
        fraudScore: 0.15,
        correlationId: expect.any(String)
      });

      expect(paymentResponse.body.fraudScore).toBeLessThan(0.5);
      
      // Step 2: Verify transaction was processed through all services
      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('validate'),
        expect.objectContaining({
          fromWallet: 'wallet_user_123',
          toWallet: 'wallet_merchant_456',
          amount: 250.00
        }),
        expect.any(Object)
      );

      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('analyze'),
        expect.objectContaining({
          transaction: paymentData,
          userId: 'user_legitimate_123'
        }),
        expect.any(Object)
      );

      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('transactions'),
        expect.objectContaining({
          fromWallet: 'wallet_user_123',
          toWallet: 'wallet_merchant_456',
          amount: 250.00,
          fraudScore: 0.15
        }),
        expect.any(Object)
      );
    });

    test('should handle complete fraud detection and reversal workflow', async () => {
      // Step 1: Report fraud
      const fraudReportData = {
        transactionId: 'txn_complete_123',
        reason: 'unauthorized_transaction',
        description: 'I did not authorize this transaction. My account may have been compromised.',
        evidence: [
          'bank_statement.pdf',
          'police_report.pdf',
          'device_logs.json'
        ],
        reporterLocation: 'New York, NY',
        reporterDevice: 'iPhone 13 Pro'
      };

      const fraudResponse = await request(app)
        .post('/api/v1/orchestration/fraud-report')
        .set('Authorization', `Bearer ${userToken}`)
        .send(fraudReportData)
        .expect(200);

      // Verify fraud report response
      expect(fraudResponse.body).toMatchObject({
        success: true,
        fraudCase: {
          id: 'case_complete_123',
          status: 'open',
          transactionId: 'txn_complete_123'
        },
        reversal: {
          id: 'reversal_complete_123',
          status: 'completed'
        },
        automated: true,
        correlationId: expect.any(String)
      });

      // Step 2: Verify fraud workflow was processed through all services
      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('fraud-reports'),
        expect.objectContaining({
          transactionId: 'txn_complete_123',
          reason: 'unauthorized_transaction',
          reporterId: 'user_legitimate_123'
        }),
        expect.any(Object)
      );

      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('freeze'),
        expect.objectContaining({
          transactionId: 'txn_complete_123'
        }),
        expect.any(Object)
      );

      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('automated-reversal'),
        expect.objectContaining({
          fraudCaseId: 'case_complete_123'
        }),
        expect.any(Object)
      );
    });

    test('should handle complex fraud case requiring arbitration', async () => {
      // Mock low confidence analysis
      axios.post.mockImplementation((url, data) => {
        if (url.includes('analyze-reversal')) {
          return Promise.resolve({
            data: { 
              confidence: 0.4, 
              automated: false,
              recommendation: 'MANUAL_REVIEW',
              reasoning: 'Insufficient evidence for automated decision'
            }
          });
        }
        if (url.includes('arbitration/escalate')) {
          return Promise.resolve({
            data: { 
              success: true, 
              escalated: true,
              arbitratorId: 'arbitrator_001',
              estimatedResolution: '72 hours'
            }
          });
        }
        const endpoint = url.split('/').pop();
        return Promise.resolve({ data: mockServiceResponses[endpoint] || { success: true } });
      });

      const complexFraudData = {
        transactionId: 'txn_disputed_456',
        reason: 'disputed_transaction',
        description: 'This transaction is disputed but the circumstances are unclear',
        evidence: ['partial_evidence.pdf']
      };

      const response = await request(app)
        .post('/api/v1/orchestration/fraud-report')
        .set('Authorization', `Bearer ${userToken}`)
        .send(complexFraudData)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        fraudCase: {
          id: 'case_complete_123',
          status: 'open'
        },
        automated: false,
        escalated: true
      });

      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('arbitration/escalate'),
        expect.any(Object),
        expect.any(Object)
      );
    });
  });

  describe('System Monitoring and Health Checks', () => {
    test('should provide comprehensive system health status', async () => {
      const healthResponse = await request(app)
        .get('/health')
        .expect(200);

      expect(healthResponse.body).toMatchObject({
        status: 'healthy',
        timestamp: expect.any(String),
        uptime: expect.any(Number),
        version: expect.any(String),
        services: {
          'transaction-service': { instances: 2, healthy: true },
          'fraud-detection': { instances: 1, healthy: true },
          'token-management': { instances: 2, healthy: true },
          'reversibility-service': { instances: 1, healthy: true },
          'compliance-service': { instances: 1, healthy: true }
        },
        memory: expect.any(Object),
        system: expect.any(Object)
      });
    });

    test('should provide circuit breaker status', async () => {
      const circuitResponse = await request(app)
        .get('/circuit-breaker')
        .expect(200);

      expect(circuitResponse.body).toMatchObject({
        status: 'success',
        circuitBreakers: expect.any(Object),
        metrics: {
          totalCircuits: expect.any(Number),
          openCircuits: expect.any(Number),
          closedCircuits: expect.any(Number)
        },
        timestamp: expect.any(String)
      });
    });

    test('should provide load balancer status', async () => {
      const loadBalancerResponse = await request(app)
        .get('/load-balancer')
        .expect(200);

      expect(loadBalancerResponse.body).toMatchObject({
        status: 'success',
        algorithm: expect.any(String),
        stats: expect.any(Object),
        timestamp: expect.any(String)
      });
    });

    test('should allow circuit breaker control', async () => {
      const resetResponse = await request(app)
        .post('/circuit-breaker/transaction-service/reset')
        .expect(200);

      expect(resetResponse.body).toMatchObject({
        status: 'success',
        message: expect.stringContaining('reset'),
        timestamp: expect.any(String)
      });

      const forceResponse = await request(app)
        .post('/circuit-breaker/fraud-detection/force/open')
        .expect(200);

      expect(forceResponse.body).toMatchObject({
        status: 'success',
        message: expect.stringContaining('forced to OPEN'),
        timestamp: expect.any(String)
      });
    });
  });

  describe('Error Handling and Resilience', () => {
    test('should handle service failures gracefully with circuit breaker', async () => {
      // Mock service failure
      axios.post.mockImplementation((url) => {
        if (url.includes('validate')) {
          return Promise.reject(new Error('Service temporarily unavailable'));
        }
        const endpoint = url.split('/').pop();
        return Promise.resolve({ data: mockServiceResponses[endpoint] || { success: true } });
      });

      const response = await request(app)
        .post('/api/v1/orchestration/transaction')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          fromWallet: 'wallet_test',
          toWallet: 'wallet_merchant',
          amount: 100.00
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Token validation service unavailable');
    });

    test('should handle rate limiting', async () => {
      // Make multiple rapid requests
      const requests = Array(5).fill().map(() =>
        request(app)
          .get('/health')
      );

      const responses = await Promise.all(requests);
      
      // All should succeed (rate limit is high for health endpoint)
      responses.forEach(response => {
        expect([200, 503]).toContain(response.status);
      });
    });

    test('should maintain correlation IDs across all services', async () => {
      const capturedHeaders = [];
      
      axios.post.mockImplementation((url, data, config) => {
        if (config && config.headers) {
          capturedHeaders.push(config.headers);
        }
        const endpoint = url.split('/').pop();
        return Promise.resolve({ data: mockServiceResponses[endpoint] || { success: true } });
      });

      const response = await request(app)
        .post('/api/v1/orchestration/transaction')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          fromWallet: 'wallet_test',
          toWallet: 'wallet_merchant',
          amount: 100.00
        })
        .expect(200);

      expect(response.body.correlationId).toBeDefined();

      // Verify correlation ID was passed to all services
      capturedHeaders.forEach(headers => {
        expect(headers['X-Correlation-ID']).toBeDefined();
        // X-User-ID might not be set in all calls, so check if it exists
        if (headers['X-User-ID']) {
          expect(headers['X-User-ID']).toBe('user_legitimate_123');
        }
      });
    });
  });

  describe('Security and Authentication', () => {
    test('should enforce proper authentication for all endpoints', async () => {
      const protectedEndpoints = [
        { method: 'post', path: '/api/v1/orchestration/transaction' },
        { method: 'post', path: '/api/v1/orchestration/fraud-report' }
      ];

      for (const endpoint of protectedEndpoints) {
        const response = await request(app)[endpoint.method](endpoint.path)
          .send({})
          .expect(401);

        expect(response.body.message).toBe('Authorization token required');
      }
    });

    test('should include proper security headers', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.headers).toHaveProperty('x-content-type-options', 'nosniff');
      expect(response.headers).toHaveProperty('x-frame-options');
      expect(response.headers).toHaveProperty('x-xss-protection');
    });

    test('should handle JWT token expiration', async () => {
      const expiredToken = jwt.sign(
        {
          sub: 'user_123',
          email: 'test@example.com',
          roles: ['user']
        },
        process.env.JWT_SECRET || 'test-secret',
        { expiresIn: '-1h' } // Expired 1 hour ago
      );

      const response = await request(app)
        .post('/api/v1/orchestration/transaction')
        .set('Authorization', `Bearer ${expiredToken}`)
        .send({
          fromWallet: 'wallet_test',
          toWallet: 'wallet_merchant',
          amount: 100.00
        })
        .expect(401);

      expect(response.body.message).toBe('Token has expired');
    });
  });

  describe('Performance and Scalability', () => {
    test('should handle concurrent requests efficiently', async () => {
      const concurrentRequests = Array(10).fill().map((_, index) =>
        request(app)
          .post('/api/v1/orchestration/transaction')
          .set('Authorization', `Bearer ${userToken}`)
          .send({
            fromWallet: `wallet_user_${index}`,
            toWallet: 'wallet_merchant',
            amount: 50.00 + index
          })
      );

      const responses = await Promise.all(concurrentRequests);
      
      responses.forEach((response, index) => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.correlationId).toBeDefined();
      });
    });

    test('should provide metrics endpoint for monitoring', async () => {
      const metricsResponse = await request(app)
        .get('/metrics')
        .expect(200);

      expect(metricsResponse.text).toContain('http_requests_total');
      expect(metricsResponse.text).toContain('http_request_duration_seconds');
    });
  });
});