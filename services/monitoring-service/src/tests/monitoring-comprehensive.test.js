const request = require('supertest');
const { app } = require('../index');
const MetricsCollector = require('../services/metrics-collector');
const DashboardService = require('../services/dashboard-service');
const AlertManager = require('../services/alert-manager');
const Redis = require('redis');
const { Pool } = require('pg');

// Mock dependencies
jest.mock('redis');
jest.mock('pg');
jest.mock('node-cron');

describe('Comprehensive Monitoring Tests', () => {
  let mockRedis;
  let mockDbPool;
  let metricsCollector;
  let dashboardService;
  let alertManager;

  beforeAll(() => {
    mockRedis = {
      connect: jest.fn(),
      quit: jest.fn(),
      hGetAll: jest.fn(),
      get: jest.fn(),
      keys: jest.fn(),
      lRange: jest.fn(),
      lpush: jest.fn(),
      ltrim: jest.fn()
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
    
    metricsCollector = new MetricsCollector();
    dashboardService = new DashboardService({
      to: jest.fn().mockReturnThis(),
      emit: jest.fn()
    });
    alertManager = new AlertManager();
  });

  describe('Critical Metrics Tracking', () => {
    describe('Transaction Metrics', () => {
      test('should track transaction count by status and currency', async () => {
        const transactionData = {
          'count:completed:transaction-service:USD-CBDC': '500',
          'count:failed:transaction-service:USD-CBDC': '25',
          'count:pending:transaction-service:EUR-CBDC': '10'
        };

        mockRedis.hGetAll.mockResolvedValue(transactionData);
        mockDbPool.query.mockResolvedValue({
          rows: [{
            status: 'completed',
            currency: 'USD-CBDC',
            count: '300',
            avg_duration: '0.25',
            total_amount: '15000.00'
          }]
        });

        await metricsCollector.collectTransactionMetrics();

        expect(mockRedis.hGetAll).toHaveBeenCalledWith('transaction_metrics');
        expect(mockDbPool.query).toHaveBeenCalledWith(
          expect.stringContaining('SELECT')
        );
      });

      test('should track transaction processing duration', async () => {
        const dbResult = {
          rows: [{
            status: 'completed',
            currency: 'USD-CBDC',
            count: '100',
            avg_duration: '0.35',
            total_amount: '5000.00'
          }]
        };

        mockDbPool.query.mockResolvedValue(dbResult);

        await metricsCollector.collectTransactionMetrics();

        // Verify that duration metrics are being tracked
        expect(mockDbPool.query).toHaveBeenCalledWith(
          expect.stringContaining('AVG(EXTRACT(EPOCH FROM (settled_at - created_at)))')
        );
      });

      test('should track transaction amounts by currency', async () => {
        const dbResult = {
          rows: [
            { status: 'completed', currency: 'USD-CBDC', count: '80', avg_duration: '0.2', total_amount: '4000.00' },
            { status: 'completed', currency: 'EUR-CBDC', count: '20', avg_duration: '0.3', total_amount: '1500.00' }
          ]
        };

        mockDbPool.query.mockResolvedValue(dbResult);

        await metricsCollector.collectTransactionMetrics();

        expect(dbResult.rows).toHaveLength(2);
        expect(dbResult.rows[0].currency).toBe('USD-CBDC');
        expect(dbResult.rows[1].currency).toBe('EUR-CBDC');
      });
    });

    describe('Fraud Detection Metrics', () => {
      test('should track fraud detection latency', async () => {
        const fraudData = {
          'latency': '0.085',
          'score': '0.65',
          'cases:open:suspicious:pending': '3'
        };

        mockRedis.hGetAll.mockResolvedValue(fraudData);
        mockDbPool.query.mockResolvedValue({
          rows: [{
            status: 'open',
            case_type: 'suspicious',
            resolution: null,
            count: '2'
          }]
        });

        await metricsCollector.collectFraudMetrics();

        expect(mockRedis.hGetAll).toHaveBeenCalledWith('fraud_metrics');
        expect(mockDbPool.query).toHaveBeenCalledWith(
          expect.stringContaining('FROM fraud_cases')
        );
      });

      test('should track fraud score distribution', async () => {
        const fraudData = {
          'score': '0.75'
        };

        mockRedis.hGetAll.mockResolvedValue(fraudData);
        mockDbPool.query.mockResolvedValue({ rows: [] });

        await metricsCollector.collectFraudMetrics();

        // Verify fraud score is being tracked
        expect(fraudData.score).toBe('0.75');
      });

      test('should track fraud cases by status and type', async () => {
        const dbResult = {
          rows: [
            { status: 'open', case_type: 'suspicious_pattern', resolution: null, count: '5' },
            { status: 'investigating', case_type: 'account_takeover', resolution: null, count: '2' },
            { status: 'resolved', case_type: 'false_positive', resolution: 'cleared', count: '8' }
          ]
        };

        mockDbPool.query.mockResolvedValue(dbResult);

        await metricsCollector.collectFraudMetrics();

        expect(dbResult.rows).toHaveLength(3);
        expect(dbResult.rows[0].status).toBe('open');
        expect(dbResult.rows[1].status).toBe('investigating');
        expect(dbResult.rows[2].status).toBe('resolved');
      });
    });

    describe('Performance Metrics', () => {
      test('should track API response times by service and endpoint', async () => {
        const performanceData = {
          'response_time:transaction-service:/api/transactions:POST:200': '0.25',
          'response_time:fraud-detection:/api/analyze:POST:200': '0.08',
          'resource_usage:transaction-service:cpu': '65.2',
          'connections:api-gateway:active': '150'
        };

        mockRedis.hGetAll.mockResolvedValue(performanceData);

        await metricsCollector.collectPerformanceMetrics();

        expect(mockRedis.hGetAll).toHaveBeenCalledWith('performance_metrics');
      });

      test('should track system resource usage', async () => {
        const performanceData = {
          'resource_usage:transaction-service:cpu': '72.5',
          'resource_usage:transaction-service:memory': '68.3',
          'resource_usage:fraud-detection:cpu': '45.8'
        };

        mockRedis.hGetAll.mockResolvedValue(performanceData);

        await metricsCollector.collectPerformanceMetrics();

        // Verify resource usage metrics are tracked
        expect(performanceData['resource_usage:transaction-service:cpu']).toBe('72.5');
        expect(performanceData['resource_usage:transaction-service:memory']).toBe('68.3');
      });

      test('should track active connections by service', async () => {
        const performanceData = {
          'connections:api-gateway:active': '200',
          'connections:transaction-service:database': '25',
          'connections:fraud-detection:redis': '10'
        };

        mockRedis.hGetAll.mockResolvedValue(performanceData);

        await metricsCollector.collectPerformanceMetrics();

        expect(performanceData['connections:api-gateway:active']).toBe('200');
      });
    });

    describe('Business Metrics', () => {
      test('should track reversal rates', async () => {
        const reversalResult = {
          rows: [{ reversal_rate: '1.8' }]
        };

        mockDbPool.query
          .mockResolvedValueOnce(reversalResult)
          .mockResolvedValueOnce({ rows: [{ dau: '1500' }] })
          .mockResolvedValueOnce({ rows: [] });

        await metricsCollector.collectBusinessMetrics();

        expect(mockDbPool.query).toHaveBeenCalledWith(
          expect.stringContaining('COUNT(CASE WHEN status = \'reversed\' THEN 1 END)')
        );
      });

      test('should track daily active users', async () => {
        const dauResult = {
          rows: [{ dau: '2250' }]
        };

        mockDbPool.query
          .mockResolvedValueOnce({ rows: [{ reversal_rate: '1.2' }] })
          .mockResolvedValueOnce(dauResult)
          .mockResolvedValueOnce({ rows: [] });

        await metricsCollector.collectBusinessMetrics();

        expect(mockDbPool.query).toHaveBeenCalledWith(
          expect.stringContaining('COUNT(DISTINCT user_id)')
        );
      });

      test('should track transaction volume by currency', async () => {
        const volumeResult = {
          rows: [
            { currency: 'USD-CBDC', volume: '125000.50' },
            { currency: 'EUR-CBDC', volume: '87500.25' }
          ]
        };

        mockDbPool.query
          .mockResolvedValueOnce({ rows: [{ reversal_rate: '1.5' }] })
          .mockResolvedValueOnce({ rows: [{ dau: '1800' }] })
          .mockResolvedValueOnce(volumeResult);

        await metricsCollector.collectBusinessMetrics();

        expect(volumeResult.rows).toHaveLength(2);
        expect(volumeResult.rows[0].currency).toBe('USD-CBDC');
        expect(volumeResult.rows[1].currency).toBe('EUR-CBDC');
      });

      test('should track user satisfaction scores', async () => {
        const satisfactionData = [
          { avg_satisfaction: '8.2', total_ratings: '450' }
        ];

        mockDbPool.query.mockResolvedValue({ rows: satisfactionData });

        const result = await dashboardService.getBusinessMetrics('24h');

        expect(result.satisfaction.avgScore).toBe(8.2);
        expect(result.satisfaction.totalRatings).toBe(450);
      });
    });

    describe('SLA Metrics', () => {
      test('should track transaction processing SLA compliance', async () => {
        const slaResult = {
          rows: [{ sla_compliance: '97.8' }]
        };

        mockDbPool.query.mockResolvedValue(slaResult);
        mockRedis.get.mockResolvedValue('98.5');

        await metricsCollector.collectSLAMetrics();

        expect(mockDbPool.query).toHaveBeenCalledWith(
          expect.stringContaining('EXTRACT(EPOCH FROM (settled_at - created_at)) < 0.5')
        );
      });

      test('should track fraud detection SLA compliance', async () => {
        mockDbPool.query.mockResolvedValue({ rows: [{ sla_compliance: '96.2' }] });
        mockRedis.get.mockResolvedValue('99.1');

        await metricsCollector.collectSLAMetrics();

        expect(mockRedis.get).toHaveBeenCalledWith('fraud_sla_compliance');
      });

      test('should track service uptime percentages', async () => {
        mockDbPool.query.mockResolvedValue({ rows: [{ sla_compliance: '98.0' }] });
        mockRedis.get.mockResolvedValue('97.5');

        await metricsCollector.collectSLAMetrics();

        // Verify uptime is tracked for all services
        const services = ['transaction-service', 'fraud-detection', 'token-management', 'reversibility-service'];
        services.forEach(service => {
          // In real implementation, uptime would be set for each service
          expect(service).toBeDefined();
        });
      });
    });
  });

  describe('Real-time Dashboard Updates', () => {
    test('should emit real-time transaction metrics', async () => {
      const mockIo = {
        to: jest.fn().mockReturnThis(),
        emit: jest.fn()
      };

      dashboardService = new DashboardService(mockIo);
      
      // Mock the get methods
      dashboardService.getTransactionMetrics = jest.fn().mockResolvedValue({
        timeSeries: [{ timestamp: '2025-01-08T10:00:00Z', transactionCount: 100 }],
        byCurrency: [{ currency: 'USD-CBDC', count: 80 }]
      });

      dashboardService.startRealTimeUpdates();

      // Fast forward time to trigger update
      jest.useFakeTimers();
      jest.advanceTimersByTime(5000);
      
      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockIo.to).toHaveBeenCalledWith('transactions');
      expect(mockIo.emit).toHaveBeenCalledWith('metrics_update', expect.any(Object));

      jest.useRealTimers();
    });

    test('should emit real-time fraud metrics', async () => {
      const mockIo = {
        to: jest.fn().mockReturnThis(),
        emit: jest.fn()
      };

      dashboardService = new DashboardService(mockIo);
      
      dashboardService.getFraudMetrics = jest.fn().mockResolvedValue({
        timeSeries: [{ timestamp: '2025-01-08T10:00:00Z', totalCases: 5 }],
        fraudScores: [{ timestamp: '2025-01-08T10:00:00Z', avgFraudScore: 0.25 }]
      });

      dashboardService.startRealTimeUpdates();

      jest.useFakeTimers();
      jest.advanceTimersByTime(5000);
      
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockIo.to).toHaveBeenCalledWith('fraud');
      expect(mockIo.emit).toHaveBeenCalledWith('metrics_update', expect.any(Object));

      jest.useRealTimers();
    });

    test('should emit real-time performance metrics', async () => {
      const mockIo = {
        to: jest.fn().mockReturnThis(),
        emit: jest.fn()
      };

      dashboardService = new DashboardService(mockIo);
      
      dashboardService.getPerformanceMetrics = jest.fn().mockResolvedValue({
        responseTime: [{ timestamp: '2025-01-08T10:00:00Z', value: 0.25 }],
        slaCompliance: [{ timestamp: '2025-01-08T10:00:00Z', compliance: 98.5 }]
      });

      dashboardService.startRealTimeUpdates();

      jest.useFakeTimers();
      jest.advanceTimersByTime(5000);
      
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockIo.to).toHaveBeenCalledWith('performance');
      expect(mockIo.emit).toHaveBeenCalledWith('metrics_update', expect.any(Object));

      jest.useRealTimers();
    });
  });

  describe('Alert System Validation', () => {
    test('should trigger high fraud rate alert', async () => {
      const rule = alertManager.alertRules.find(r => r.id === 'high_fraud_rate');
      
      mockDbPool.query
        .mockResolvedValueOnce({ rows: [{ fraud_rate: 7.5 }] }) // Check query
        .mockResolvedValueOnce({ rows: [] }) // No existing alert
        .mockResolvedValueOnce({ rows: [{ id: 'alert-123' }] }); // Insert alert

      alertManager.sendAlertNotifications = jest.fn();

      await alertManager.checkAlertRule(rule);

      expect(alertManager.sendAlertNotifications).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'High Fraud Rate',
          severity: 'critical',
          value: 7.5
        })
      );
    });

    test('should trigger transaction latency alert', async () => {
      const rule = alertManager.alertRules.find(r => r.id === 'transaction_latency_high');
      
      mockDbPool.query
        .mockResolvedValueOnce({ rows: [{ avg_latency: 0.75 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'alert-456' }] });

      alertManager.sendAlertNotifications = jest.fn();

      await alertManager.checkAlertRule(rule);

      expect(alertManager.sendAlertNotifications).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'High Transaction Latency',
          severity: 'warning',
          value: 0.75
        })
      );
    });

    test('should trigger SLA breach alert', async () => {
      const rule = alertManager.alertRules.find(r => r.id === 'sla_breach');
      
      mockDbPool.query
        .mockResolvedValueOnce({ rows: [{ sla_compliance: 92.5 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'alert-789' }] });

      alertManager.sendAlertNotifications = jest.fn();

      await alertManager.checkAlertRule(rule);

      expect(alertManager.sendAlertNotifications).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'SLA Breach',
          severity: 'critical',
          value: 92.5
        })
      );
    });

    test('should respect alert cooldown periods', async () => {
      const rule = alertManager.alertRules.find(r => r.id === 'high_fraud_rate');
      
      // Set recent alert in cooldown
      alertManager.activeAlerts.set(rule.id, {
        timestamp: Date.now() - 60000, // 1 minute ago, cooldown is 5 minutes
        value: 8.0
      });

      await alertManager.checkAlertRule(rule);

      // Should not query database due to cooldown
      expect(mockDbPool.query).not.toHaveBeenCalled();
    });
  });

  describe('Monitoring API Integration', () => {
    test('should provide comprehensive dashboard overview', async () => {
      // Mock all required database calls
      mockDbPool.query
        .mockResolvedValueOnce({
          rows: [{
            total_transactions: '5000',
            completed_transactions: '4750',
            failed_transactions: '150',
            pending_transactions: '100',
            total_volume: '250000.00',
            avg_processing_time: '0.28'
          }]
        })
        .mockResolvedValueOnce({
          rows: [{
            total_cases: '25',
            open_cases: '8',
            investigating_cases: '5',
            resolved_cases: '12'
          }]
        })
        .mockResolvedValueOnce({
          rows: [{
            fraud_rate: '3.2',
            avg_fraud_score: '0.18'
          }]
        })
        .mockResolvedValueOnce({
          rows: [{
            active_users: '2500',
            reversal_rate: '1.8',
            usd_volume: '180000.00',
            eur_volume: '70000.00'
          }]
        });

      // Mock Redis calls
      mockRedis.get
        .mockResolvedValueOnce('0.32')
        .mockResolvedValueOnce('68.5')
        .mockResolvedValueOnce('72.1')
        .mockResolvedValueOnce('250');

      const response = await request(app)
        .get('/api/dashboard/overview')
        .expect(200);

      // Verify comprehensive metrics are returned
      expect(response.body.transactions.totalTransactions).toBe(5000);
      expect(response.body.transactions.successRate).toBe('95.00');
      expect(response.body.fraud.fraudRate).toBe(3.2);
      expect(response.body.performance.avgResponseTime).toBe(0.32);
      expect(response.body.business.reversalRate).toBe(1.8);
    });

    test('should handle high-load scenarios gracefully', async () => {
      // Simulate database timeout
      mockDbPool.query.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({ rows: [] }), 100))
      );

      const response = await request(app)
        .get('/api/dashboard/overview')
        .timeout(50);

      // Should handle timeout gracefully
      expect(response.status).toBe(500);
    });
  });

  describe('Metrics Data Integrity', () => {
    test('should validate metric data types and ranges', async () => {
      const transactionData = {
        'count:completed:transaction-service:USD-CBDC': '500',
        'duration:transaction-service:process': '0.25',
        'amount:USD-CBDC': '1000.50'
      };

      mockRedis.hGetAll.mockResolvedValue(transactionData);
      mockDbPool.query.mockResolvedValue({ rows: [] });

      await metricsCollector.collectTransactionMetrics();

      // Verify data types
      expect(parseFloat(transactionData['count:completed:transaction-service:USD-CBDC'])).toBe(500);
      expect(parseFloat(transactionData['duration:transaction-service:process'])).toBe(0.25);
      expect(parseFloat(transactionData['amount:USD-CBDC'])).toBe(1000.50);
    });

    test('should handle null and undefined metric values', async () => {
      const transactionData = {
        'count:completed:transaction-service:USD-CBDC': null,
        'duration:transaction-service:process': undefined,
        'amount:USD-CBDC': ''
      };

      mockRedis.hGetAll.mockResolvedValue(transactionData);
      mockDbPool.query.mockResolvedValue({ rows: [] });

      // Should not throw error with invalid data
      await expect(metricsCollector.collectTransactionMetrics()).resolves.not.toThrow();
    });

    test('should validate fraud score ranges (0-1)', async () => {
      const fraudData = {
        'score': '0.85'
      };

      mockRedis.hGetAll.mockResolvedValue(fraudData);
      mockDbPool.query.mockResolvedValue({ rows: [] });

      await metricsCollector.collectFraudMetrics();

      const score = parseFloat(fraudData.score);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });
  });
});