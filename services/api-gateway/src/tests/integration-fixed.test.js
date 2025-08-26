const request = require('supertest');
const jwt = require('jsonwebtoken');
const axios = require('axios');

// Mock service discovery to return healthy services
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
    'transaction-service': { instances: 1, healthy: true },
    'fraud-detection': { instances: 1, healthy: true },
    'token-management': { instances: 1, healthy: true },
    'reversibility-service': { instances: 1, healthy: true },
    'compliance-service': { instances: 1, healthy: true }
  }),
  shutdown: jest.fn().mockResolvedValue(undefined)
}));

// Mock service responses
const mockServiceResponses = {
  validate: { valid: true, reason: null },
  analyze: { riskScore: 0.2, reasons: [], fallback: false },
  transactions: { 
    id: 'txn_123', 
    status: 'completed', 
    amount: 100.00,
    timestamp: new Date().toISOString()
  },
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
  },
  transfer: { success: true },
  freeze: { success: true }
};

// Setup axios mocks
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

describe('API Gateway Integration Tests', () => {
  let authToken;

  beforeAll(() => {
    authToken = jwt.sign(
      {
        sub: 'user_123',
        email: 'test@example.com',
        roles: ['user'],
        permissions: ['transaction:create', 'fraud:report']
      },
      process.env.JWT_SECRET || 'test-secret',
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
      // Reset and mock high fraud score
      axios.post.mockReset();
      axios.post.mockImplementation((url) => {
        if (url.includes('validate')) {
          return Promise.resolve({ data: mockServiceResponses.validate });
        }
        if (url.includes('analyze')) {
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