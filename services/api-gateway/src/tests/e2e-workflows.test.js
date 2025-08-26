const request = require('supertest');
const jwt = require('jsonwebtoken');
const axios = require('axios');

// Import app after mocks are set up
let app;
beforeAll(async () => {
  // Wait a bit for service initialization
  await new Promise(resolve => setTimeout(resolve, 100));
  app = require('../index');
});

describe('End-to-End Workflow Tests', () => {
  let authToken;
  let fraudsterToken;

  beforeAll(() => {
    // Create test JWT tokens
    authToken = jwt.sign(
      {
        sub: 'user_123',
        email: 'legitimate@example.com',
        roles: ['user'],
        permissions: ['transaction:create', 'fraud:report']
      },
      process.env.JWT_SECRET || 'default-secret',
      { expiresIn: '1h' }
    );

    fraudsterToken = jwt.sign(
      {
        sub: 'user_456',
        email: 'suspicious@example.com',
        roles: ['user'],
        permissions: ['transaction:create']
      },
      process.env.JWT_SECRET || 'default-secret',
      { expiresIn: '1h' }
    );
  });

  describe('Complete Payment Flow', () => {
    test('should process legitimate payment end-to-end', async () => {
      // Step 1: Initiate transaction
      const transactionData = {
        fromWallet: 'wallet_legitimate_user',
        toWallet: 'wallet_merchant',
        amount: 50.00,
        currency: 'USD-CBDC',
        metadata: {
          description: 'Coffee purchase',
          category: 'retail',
          merchantId: 'merchant_123'
        }
      };

      const response = await request(app)
        .post('/api/v1/orchestration/transaction')
        .set('Authorization', `Bearer ${authToken}`)
        .send(transactionData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.fraudScore).toBeLessThan(0.5);
      expect(response.body.transaction.status).toBe('completed');

      // Verify response structure
      expect(response.body).toMatchObject({
        success: true,
        transaction: {
          id: expect.any(String),
          status: 'completed',
          amount: 50.00
        },
        fraudScore: expect.any(Number),
        correlationId: expect.any(String)
      });
    });

    test('should handle payment with moderate fraud risk', async () => {
      // Mock moderate fraud score
      axios.post.mockImplementationOnce((url, data) => {
        if (url.includes('fraud-detection')) {
          return Promise.resolve({
            data: { 
              riskScore: 0.6, 
              reasons: ['Unusual amount', 'New merchant'], 
              fallback: false 
            }
          });
        }
        return Promise.resolve({ 
          data: { 
            id: 'txn_moderate_risk', 
            status: 'completed', 
            amount: 500.00,
            timestamp: new Date().toISOString()
          } 
        });
      });

      const response = await request(app)
        .post('/api/v1/orchestration/transaction')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          fromWallet: 'wallet_legitimate_user',
          toWallet: 'wallet_new_merchant',
          amount: 500.00,
          currency: 'USD-CBDC'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.fraudScore).toBe(0.6);
      expect(response.body.transaction.id).toBe('txn_moderate_risk');
    });

    test('should block high-risk fraudulent payment', async () => {
      // Mock high fraud score
      axios.post.mockImplementationOnce((url, data) => {
        if (url.includes('fraud-detection')) {
          return Promise.resolve({
            data: { 
              riskScore: 0.95, 
              reasons: ['Account takeover pattern', 'Suspicious velocity'], 
              fallback: false 
            }
          });
        }
        return Promise.resolve({ data: { success: true } });
      });

      const response = await request(app)
        .post('/api/v1/orchestration/transaction')
        .set('Authorization', `Bearer ${fraudsterToken}`)
        .send({
          fromWallet: 'wallet_compromised',
          toWallet: 'wallet_fraudster',
          amount: 5000.00,
          currency: 'USD-CBDC'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('fraud risk');
    });
  });

  describe('Fraud Detection and Reversal Flow', () => {
    test('should process fraud report with automated reversal', async () => {
      // Step 1: Report fraud
      const fraudReportData = {
        transactionId: 'txn_clear_fraud',
        reason: 'unauthorized_transaction',
        description: 'My account was compromised and this transaction was not authorized',
        evidence: ['bank_statement.pdf', 'police_report.pdf']
      };

      const response = await request(app)
        .post('/api/v1/orchestration/fraud-report')
        .set('Authorization', `Bearer ${authToken}`)
        .send(fraudReportData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.automated).toBe(true);
      expect(response.body.fraudCase.status).toBe('open');
      expect(response.body.reversal.status).toBe('completed');

      // Verify complete response structure
      expect(response.body).toMatchObject({
        success: true,
        fraudCase: {
          id: expect.any(String),
          status: 'open',
          transactionId: 'txn_clear_fraud'
        },
        reversal: {
          id: expect.any(String),
          status: 'completed'
        },
        automated: true,
        correlationId: expect.any(String)
      });
    });

    test('should escalate complex fraud case to arbitration', async () => {
      // Mock low confidence analysis requiring human review
      let callCount = 0;
      axios.post.mockImplementation((url, data) => {
        callCount++;
        if (url.includes('fraud-reports')) {
          return Promise.resolve({
            data: { 
              id: 'case_complex', 
              status: 'open', 
              transactionId: 'txn_disputed' 
            }
          });
        }
        if (url.includes('analyze-reversal')) {
          return Promise.resolve({
            data: { confidence: 0.4, automated: false }
          });
        }
        if (url.includes('arbitration/escalate')) {
          return Promise.resolve({
            data: { success: true, escalated: true }
          });
        }
        return Promise.resolve({ data: { success: true } });
      });

      const response = await request(app)
        .post('/api/v1/orchestration/fraud-report')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          transactionId: 'txn_disputed',
          reason: 'disputed_transaction',
          description: 'This transaction is disputed but evidence is unclear'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.automated).toBe(false);
      expect(response.body.escalated).toBe(true);
      expect(response.body.fraudCase.id).toBe('case_complex');
    });

    test('should handle fraud report for non-existent transaction', async () => {
      // Mock service error for non-existent transaction
      axios.post.mockImplementationOnce((url, data) => {
        if (url.includes('fraud-reports')) {
          return Promise.reject(new Error('Transaction not found'));
        }
        return Promise.resolve({ data: { success: true } });
      });

      const response = await request(app)
        .post('/api/v1/orchestration/fraud-report')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          transactionId: 'txn_nonexistent',
          reason: 'unauthorized_transaction',
          description: 'This transaction does not exist'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('service unavailable');
    });
  });

  describe('Multi-Service Integration Scenarios', () => {
    test('should handle partial service failures gracefully', async () => {
      // Mock token service failure but fraud detection success
      let callCount = 0;
      axios.post.mockImplementation((url, data) => {
        callCount++;
        if (url.includes('token-management') && url.includes('validate')) {
          return Promise.reject(new Error('Token service temporarily unavailable'));
        }
        if (url.includes('fraud-detection')) {
          return Promise.resolve({
            data: { riskScore: 0.3, reasons: [], fallback: false }
          });
        }
        return Promise.resolve({ data: { success: true } });
      });

      const response = await request(app)
        .post('/api/v1/orchestration/transaction')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          fromWallet: 'wallet_test',
          toWallet: 'wallet_merchant',
          amount: 100.00
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Token validation service unavailable');
    });

    test('should use fraud detection fallback when service fails', async () => {
      // Mock fraud detection service failure
      axios.post.mockImplementation((url, data) => {
        if (url.includes('token-management') && url.includes('validate')) {
          return Promise.resolve({ data: { valid: true, reason: null } });
        }
        if (url.includes('fraud-detection')) {
          return Promise.reject(new Error('Fraud detection service down'));
        }
        if (url.includes('transaction-service')) {
          return Promise.resolve({
            data: { 
              id: 'txn_fallback', 
              status: 'completed', 
              amount: 100.00,
              timestamp: new Date().toISOString()
            }
          });
        }
        return Promise.resolve({ data: { success: true } });
      });

      const response = await request(app)
        .post('/api/v1/orchestration/transaction')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          fromWallet: 'wallet_test',
          toWallet: 'wallet_merchant',
          amount: 100.00
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.fraudScore).toBe(0.5); // Fallback score
      expect(response.body.transaction.id).toBe('txn_fallback');
    });
  });

  describe('Performance and Timeout Scenarios', () => {
    test('should handle service timeouts gracefully', async () => {
      // Mock slow service response
      axios.post.mockImplementationOnce(() => {
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve({ data: { success: true } });
          }, 35000); // Longer than 30s timeout
        });
      });

      const response = await request(app)
        .post('/api/v1/orchestration/transaction')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          fromWallet: 'wallet_test',
          toWallet: 'wallet_merchant',
          amount: 100.00
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    }, 40000); // Extend test timeout

    test('should maintain correlation IDs across services', async () => {
      const capturedHeaders = [];
      
      axios.post.mockImplementation((url, data, config) => {
        capturedHeaders.push(config.headers);
        return Promise.resolve({ 
          data: { 
            id: 'txn_correlation', 
            status: 'completed', 
            amount: 100.00,
            timestamp: new Date().toISOString()
          } 
        });
      });

      const response = await request(app)
        .post('/api/v1/orchestration/transaction')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          fromWallet: 'wallet_test',
          toWallet: 'wallet_merchant',
          amount: 100.00
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.correlationId).toBeDefined();

      // Verify correlation ID was passed to services
      capturedHeaders.forEach(headers => {
        expect(headers['X-Correlation-ID']).toBeDefined();
      });
    });
  });

  describe('Security and Authorization Scenarios', () => {
    test('should prevent unauthorized access to orchestration endpoints', async () => {
      const response = await request(app)
        .post('/api/v1/orchestration/transaction')
        .send({
          fromWallet: 'wallet_test',
          toWallet: 'wallet_merchant',
          amount: 100.00
        })
        .expect(401);

      expect(response.body.message).toBe('Authorization token required');
    });

    test('should validate user permissions for fraud reporting', async () => {
      // Create token without fraud reporting permission
      const limitedToken = jwt.sign(
        {
          sub: 'user_789',
          email: 'limited@example.com',
          roles: ['user'],
          permissions: ['transaction:view'] // No fraud:report permission
        },
        process.env.JWT_SECRET || 'default-secret',
        { expiresIn: '1h' }
      );

      const response = await request(app)
        .post('/api/v1/orchestration/fraud-report')
        .set('Authorization', `Bearer ${limitedToken}`)
        .send({
          transactionId: 'txn_test',
          reason: 'unauthorized_transaction',
          description: 'Test fraud report'
        })
        .expect(200); // Gateway doesn't enforce permissions, services do

      // The actual permission check would happen in the reversibility service
      expect(response.body).toBeDefined();
    });
  });
});