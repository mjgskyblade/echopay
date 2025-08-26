const request = require('supertest');
const { app } = require('../index');
const Redis = require('redis');
const { Pool } = require('pg');

// Mock dependencies
jest.mock('redis');
jest.mock('pg');
jest.mock('node-cron');

describe('Monitoring Service Integration Tests', () => {
  let mockRedis;
  let mockDbPool;

  beforeAll(() => {
    mockRedis = {
      connect: jest.fn(),
      quit: jest.fn(),
      hGetAll: jest.fn(),
      get: jest.fn(),
      keys: jest.fn(),
      lRange: jest.fn()
    };
    
    mockDbPool = {
      query: jest.fn(),
      end: jest.fn()
    };

    Redis.createClient.mockReturnValue(mockRedis);
    Pool.mockImplementation(() => mockDbPool);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockRedis.connect.mockResolvedValue();
    mockDbPool.query.mockResolvedValue({ rows: [] });
  });

  describe('Health Check', () => {
    test('GET /health should return service status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('version');
    });
  });

  describe('Metrics Endpoint', () => {
    test('GET /metrics should return Prometheus metrics', async () => {
      const response = await request(app)
        .get('/metrics')
        .expect(200);

      expect(response.headers['content-type']).toContain('text/plain');
      expect(response.text).toContain('echopay_');
    });

    test('GET /metrics should handle errors gracefully', async () => {
      // Mock prometheus register to throw error
      const originalMetrics = require('prom-client').register.metrics;
      require('prom-client').register.metrics = jest.fn().mockRejectedValue(new Error('Metrics error'));

      await request(app)
        .get('/metrics')
        .expect(500);

      // Restore original function
      require('prom-client').register.metrics = originalMetrics;
    });
  });

  describe('Dashboard API', () => {
    test('GET /api/dashboard/overview should return dashboard overview', async () => {
      // Mock database responses
      mockDbPool.query
        .mockResolvedValueOnce({
          rows: [{
            total_transactions: '1000',
            completed_transactions: '950',
            failed_transactions: '30',
            pending_transactions: '20',
            total_volume: '50000.00',
            avg_processing_time: '0.25'
          }]
        })
        .mockResolvedValueOnce({
          rows: [{
            total_cases: '15',
            open_cases: '5',
            investigating_cases: '3',
            resolved_cases: '7'
          }]
        })
        .mockResolvedValueOnce({
          rows: [{
            fraud_rate: '2.5',
            avg_fraud_score: '0.15'
          }]
        })
        .mockResolvedValueOnce({
          rows: [{
            active_users: '1250',
            reversal_rate: '1.2',
            usd_volume: '45000.00',
            eur_volume: '32000.00'
          }]
        });

      // Mock Redis responses
      mockRedis.get
        .mockResolvedValueOnce('0.35') // avg_response_time
        .mockResolvedValueOnce('65.2') // cpu_usage
        .mockResolvedValueOnce('78.5') // memory_usage
        .mockResolvedValueOnce('150'); // active_connections

      const response = await request(app)
        .get('/api/dashboard/overview')
        .expect(200);

      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('transactions');
      expect(response.body).toHaveProperty('fraud');
      expect(response.body).toHaveProperty('performance');
      expect(response.body).toHaveProperty('business');

      expect(response.body.transactions.totalTransactions).toBe(1000);
      expect(response.body.fraud.totalCases).toBe(15);
      expect(response.body.performance.avgResponseTime).toBe(0.35);
      expect(response.body.business.dailyActiveUsers).toBe(1250);
    });

    test('GET /api/dashboard/transactions should return transaction metrics', async () => {
      mockDbPool.query
        .mockResolvedValueOnce({
          rows: [{
            time_bucket: '2025-01-08T10:00:00Z',
            transaction_count: '100',
            completed_count: '95',
            failed_count: '3',
            volume: '5000.00',
            avg_processing_time: '0.25'
          }]
        })
        .mockResolvedValueOnce({
          rows: [
            { currency: 'USD-CBDC', count: '80', volume: '4000.00' },
            { currency: 'EUR-CBDC', count: '20', volume: '1000.00' }
          ]
        });

      const response = await request(app)
        .get('/api/dashboard/transactions?timeRange=1h')
        .expect(200);

      expect(response.body).toHaveProperty('timeSeries');
      expect(response.body).toHaveProperty('byCurrency');
      expect(response.body.timeSeries).toHaveLength(1);
      expect(response.body.byCurrency).toHaveLength(2);
    });

    test('GET /api/dashboard/fraud should return fraud metrics', async () => {
      mockDbPool.query
        .mockResolvedValueOnce({
          rows: [{
            time_bucket: '2025-01-08T10:00:00Z',
            total_cases: '5',
            open_cases: '2',
            resolved_cases: '3',
            reversal_rate: '0.6'
          }]
        })
        .mockResolvedValueOnce({
          rows: [{
            time_bucket: '2025-01-08T10:00:00Z',
            avg_fraud_score: '0.25',
            high_risk_rate: '5.2'
          }]
        })
        .mockResolvedValueOnce({
          rows: [{
            case_type: 'suspicious_pattern',
            count: '3',
            avg_resolution_time: '3600'
          }]
        });

      const response = await request(app)
        .get('/api/dashboard/fraud?timeRange=1h')
        .expect(200);

      expect(response.body).toHaveProperty('timeSeries');
      expect(response.body).toHaveProperty('fraudScores');
      expect(response.body).toHaveProperty('byCaseType');
    });

    test('GET /api/dashboard/performance should return performance metrics', async () => {
      mockRedis.keys.mockResolvedValue(['performance:response_time']);
      mockRedis.lRange.mockResolvedValue(['{"timestamp":"2025-01-08T10:00:00Z","value":0.25}']);
      
      mockDbPool.query.mockResolvedValue({
        rows: [{
          time_bucket: '2025-01-08T10:00:00Z',
          sla_compliance: '98.5',
          avg_response_time: '0.28'
        }]
      });

      const response = await request(app)
        .get('/api/dashboard/performance?timeRange=1h')
        .expect(200);

      expect(response.body).toHaveProperty('responseTime');
      expect(response.body).toHaveProperty('resourceUsage');
      expect(response.body).toHaveProperty('slaCompliance');
    });

    test('GET /api/dashboard/business should return business metrics', async () => {
      mockDbPool.query
        .mockResolvedValueOnce({
          rows: [{
            time_bucket: '2025-01-08T10:00:00Z',
            active_users: '500',
            transaction_count: '1000',
            volume: '25000.00'
          }]
        })
        .mockResolvedValueOnce({
          rows: [{
            time_bucket: '2025-01-08T10:00:00Z',
            reversal_rate: '1.5',
            avg_resolution_time: '3600'
          }]
        })
        .mockResolvedValueOnce({
          rows: [{
            avg_satisfaction: '8.5',
            total_ratings: '150'
          }]
        });

      const response = await request(app)
        .get('/api/dashboard/business?timeRange=24h')
        .expect(200);

      expect(response.body).toHaveProperty('userActivity');
      expect(response.body).toHaveProperty('reversalMetrics');
      expect(response.body).toHaveProperty('satisfaction');
    });

    test('should handle database errors gracefully', async () => {
      mockDbPool.query.mockRejectedValue(new Error('Database connection failed'));

      const response = await request(app)
        .get('/api/dashboard/overview')
        .expect(500);

      expect(response.body).toHaveProperty('error', 'Internal server error');
    });
  });

  describe('Alerts API', () => {
    test('GET /api/alerts should return active alerts', async () => {
      const mockAlerts = [
        {
          id: 'alert-1',
          rule_id: 'high_fraud_rate',
          name: 'High Fraud Rate',
          severity: 'critical',
          status: 'active',
          value: 7.5,
          threshold: 5.0,
          created_at: '2025-01-08T10:00:00Z'
        }
      ];

      mockDbPool.query.mockResolvedValue({ rows: mockAlerts });

      const response = await request(app)
        .get('/api/alerts?status=active&limit=50')
        .expect(200);

      expect(response.body).toEqual(mockAlerts);
      expect(mockDbPool.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM alerts'),
        ['active', 50]
      );
    });

    test('POST /api/alerts/:alertId/acknowledge should acknowledge alert', async () => {
      mockDbPool.query.mockResolvedValue();

      const response = await request(app)
        .post('/api/alerts/alert-123/acknowledge')
        .send({ userId: 'user-456' })
        .expect(200);

      expect(response.body).toEqual({ success: true });
      expect(mockDbPool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE alerts'),
        ['user-456', 'alert-123']
      );
    });

    test('should handle alert acknowledgment errors', async () => {
      mockDbPool.query.mockRejectedValue(new Error('Database error'));

      await request(app)
        .post('/api/alerts/alert-123/acknowledge')
        .send({ userId: 'user-456' })
        .expect(500);
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid routes', async () => {
      await request(app)
        .get('/api/invalid-endpoint')
        .expect(404);
    });

    test('should handle malformed JSON requests', async () => {
      await request(app)
        .post('/api/alerts/alert-123/acknowledge')
        .send('invalid json')
        .type('application/json')
        .expect(400);
    });
  });

  describe('CORS and Security', () => {
    test('should include CORS headers', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.headers).toHaveProperty('access-control-allow-origin');
    });

    test('should include security headers', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.headers).toHaveProperty('x-content-type-options');
      expect(response.headers).toHaveProperty('x-frame-options');
    });
  });
});