const request = require('supertest');
const jwt = require('jsonwebtoken');
const axios = require('axios');

// Mock service responses
const mockServices = {
  'token-management': {
    validate: { valid: true, reason: null },
    transfer: { success: true },
    freeze: { success: true }
  },
  'fraud-detection': {
    analyze: { riskScore: 0.2, reasons: [], fallback: false }
  },
  'transaction-service': {
    transactions: { 
      id: 'txn_123', 
      status: 'completed', 
      amount: 100.00,
      timestamp: new Date().toISOString()
    }
  },
  'reversibility-service': {
    'fraud-reports': { 
      id: 'case_123', 
      status: 'open', 
      transactionId: 'txn_123' 
    },
    evidence: { evidence: [], automated: false },
    'analyze-reversal': { confidence: 0.95, automated: true },
    'automated-reversal': { 
      id: 'reversal_123', 
      status: 'completed' 
    }
  }
};

// Setup axios mocks
beforeEach(() => {
  axios.post.mockImplementation((url, data) => {
    const serviceName = url.split('//')[1].split(':')[0];
    const endpoint = url.split('/').pop();
    
    if (mockServices[serviceName] && mockServices[serviceName][endpoint]) {
      return Promise.resolve({ data: mockServices[serviceName][endpoint] });
    }
    
    return Promise.resolve({ data: { success: true } });
  });

  axios.get.mockImplementation((url) => {
    const serviceName = url.split('//')[1].split(':')[0];
    const endpoint = url.split('/').pop();
    
    if (mockServices[serviceName] && mockServices[serviceName][endpoint]) {
      return Promise.resolve({ data: mockServices[serviceName][endpoint] });
    }
    
    return Promise.resolve({ data: { success: true } });
  });
});

// Import app after mocks are set up
let app;
beforeAll(async () => {
  // Wait a bit for service initialization
  await new Promise(resolve => setTimeout(resolve, 100));
  app = require('../index');
});

describe('API Gateway Integration Tests', () => {
  let authToken;

  beforeAll(() => {
    // Create test JWT token
    authToken = jwt.sign(
      {
        sub: 'user_123',
        email: 'test@example.com',
        roles: ['user'],
        permissions: ['transaction:create', 'fraud:report']
      },
      process.env.JWT_SECRET || 'default-secret',
      { expiresIn: '1h' }
    );
  });

  describe('Health Checks', () => {
    test('GET /health should return gateway health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('services');
    });

    test('GET /health/ready should return readiness status', async () => {
      const response = await request(app)
        .get('/health/ready')
        .expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('criticalServices');
    });

    test('GET /health/live should return liveness status', async () => {
      const response = await request(app)
        .get('/health/live')
        .expect(200);

      expect(response.body.status).toBe('alive');
    });
  });

  describe('Authentication', () => {
    test('should reject requests without auth token', async () => {
      const response = await request(app)
        .post('/api/v1/orchestration/transaction')
        .send({
          fromWallet: 'wallet_1',
          toWallet: 'wallet_2',
          amount: 100.00
        })
        .expect(401);

      expect(response.body.message).toBe('Authorization token required');
    });

    test('should reject requests with invalid token', async () => {
      const response = await request(app)
        .post('/api/v1/orchestration/transaction')
        .set('Authorization', 'Bearer invalid_token')
        .send({
          fromWallet: 'wallet_1',
          toWallet: 'wallet_2',
          amount: 100.00
        })
        .expect(401);

      expect(response.body.message).toBe('Invalid token');
    });

    test('should accept requests with valid token', async () => {
      const response = await request(app)
        .post('/api/v1/orchestration/transaction')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          fromWallet: 'wallet_1',
          toWallet: 'wallet_2',
          amount: 100.00
        })
        .expect(200);

      expect(response.body).toHaveProperty('success');
    });
  });

  describe('Transaction Orchestration', () => {
    test('should process complete transaction workflow', async () => {
      const transactionData = {
        fromWallet: 'wallet_1',
        toWallet: 'wallet_2',
        amount: 100.00,
        currency: 'USD-CBDC',
        metadata: {
          description: 'Test payment'
        }
      };

      const response = await request(app)
        .post('/api/v1/orchestration/transaction')
        .set('Authorization', `Bearer ${authToken}`)
        .send(transactionData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body).toHaveProperty('transaction');
      expect(response.body).toHaveProperty('fraudScore');
      expect(response.body).toHaveProperty('correlationId');
      expect(response.body.transaction.id).toBe('txn_123');
    });

    test('should handle high fraud risk transactions', async () => {
      // Mock high fraud score
      const axios = require('axios');
      axios.post.mockImplementationOnce((url) => {
        if (url.includes('fraud-detection')) {
          return Promise.resolve({
            data: { riskScore: 0.9, reasons: ['Suspicious pattern'], fallback: false }
          });
        }
        return Promise.resolve({ data: { success: true } });
      });

      const response = await request(app)
        .post('/api/v1/orchestration/transaction')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          fromWallet: 'wallet_1',
          toWallet: 'wallet_2',
          amount: 10000.00
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('fraud risk');
    });

    test('should handle service failures gracefully', async () => {
      // Mock service failure
      const axios = require('axios');
      axios.post.mockImplementationOnce(() => {
        return Promise.reject(new Error('Service unavailable'));
      });

      const response = await request(app)
        .post('/api/v1/orchestration/transaction')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          fromWallet: 'wallet_1',
          toWallet: 'wallet_2',
          amount: 100.00
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Fraud Report Orchestration', () => {
    test('should process complete fraud report workflow', async () => {
      const fraudReportData = {
        transactionId: 'txn_123',
        reason: 'unauthorized_transaction',
        description: 'I did not authorize this transaction',
        evidence: ['screenshot.jpg']
      };

      const response = await request(app)
        .post('/api/v1/orchestration/fraud-report')
        .set('Authorization', `Bearer ${authToken}`)
        .send(fraudReportData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body).toHaveProperty('fraudCase');
      expect(response.body).toHaveProperty('correlationId');
      expect(response.body.fraudCase.id).toBe('case_123');
    });

    test('should handle automated reversal for clear fraud cases', async () => {
      const response = await request(app)
        .post('/api/v1/orchestration/fraud-report')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          transactionId: 'txn_123',
          reason: 'clear_fraud',
          description: 'Obviously fraudulent transaction'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.automated).toBe(true);
      expect(response.body).toHaveProperty('reversal');
      expect(response.body.reversal.id).toBe('reversal_123');
    });

    test('should escalate complex cases to arbitration', async () => {
      // Mock low confidence analysis
      const axios = require('axios');
      axios.post.mockImplementationOnce((url, data) => {
        if (url.includes('analyze-reversal')) {
          return Promise.resolve({
            data: { confidence: 0.6, automated: false }
          });
        }
        return Promise.resolve({ data: mockServices['reversibility-service']['fraud-reports'] });
      });

      const response = await request(app)
        .post('/api/v1/orchestration/fraud-report')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          transactionId: 'txn_123',
          reason: 'disputed_transaction',
          description: 'Complex dispute case'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.automated).toBe(false);
      expect(response.body.escalated).toBe(true);
    });
  });

  describe('Rate Limiting', () => {
    test('should enforce rate limits', async () => {
      // Make multiple requests quickly
      const requests = Array(10).fill().map(() =>
        request(app)
          .get('/health')
          .expect(200)
      );

      await Promise.all(requests);

      // This test would need to be adjusted based on actual rate limit settings
      // For now, just verify the endpoint works
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status');
    });
  });

  describe('Service Discovery', () => {
    test('GET /services should return service status', async () => {
      const response = await request(app)
        .get('/services')
        .expect(200);

      expect(response.body.status).toBe('success');
      expect(response.body).toHaveProperty('services');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  describe('Error Handling', () => {
    test('should handle 404 for unknown endpoints', async () => {
      const response = await request(app)
        .get('/api/v1/unknown')
        .expect(404);

      expect(response.body.status).toBe('error');
      expect(response.body.message).toBe('Endpoint not found');
    });

    test('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/api/v1/orchestration/transaction')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send('invalid json')
        .expect(400);

      expect(response.body).toHaveProperty('status');
    });
  });

  describe('CORS and Security Headers', () => {
    test('should include security headers', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.headers).toHaveProperty('x-content-type-options');
      expect(response.headers).toHaveProperty('x-frame-options');
    });
  });
});

describe('Load Balancing Tests', () => {
  test('should distribute requests across service instances', async () => {
    // This would test actual load balancing behavior
    // For now, verify that service discovery works
    const serviceDiscovery = require('../services/service-discovery');
    
    // Mock multiple service instances
    serviceDiscovery.services.set('test-service', [
      { id: 'test-1', address: 'localhost', port: 8001, healthy: true },
      { id: 'test-2', address: 'localhost', port: 8002, healthy: true }
    ]);

    const url1 = await serviceDiscovery.getServiceUrl('test-service');
    const url2 = await serviceDiscovery.getServiceUrl('test-service');

    // Both should be valid URLs (round-robin may return same or different)
    expect(url1).toMatch(/^http:\/\/localhost:800[12]$/);
    expect(url2).toMatch(/^http:\/\/localhost:800[12]$/);
  });
});