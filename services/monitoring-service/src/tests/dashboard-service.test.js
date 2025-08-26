const DashboardService = require('../services/dashboard-service');
const Redis = require('redis');
const { Pool } = require('pg');

// Mock dependencies
jest.mock('redis');
jest.mock('pg');

describe('DashboardService', () => {
  let dashboardService;
  let mockRedis;
  let mockDbPool;
  let mockIo;

  beforeEach(() => {
    mockRedis = {
      connect: jest.fn(),
      quit: jest.fn(),
      get: jest.fn(),
      keys: jest.fn(),
      lRange: jest.fn()
    };
    
    mockDbPool = {
      query: jest.fn(),
      end: jest.fn()
    };

    mockIo = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn()
    };

    Redis.createClient.mockReturnValue(mockRedis);
    Pool.mockImplementation(() => mockDbPool);

    dashboardService = new DashboardService(mockIo);
  });

  afterEach(() => {
    jest.clearAllMocks();
    if (dashboardService.updateInterval) {
      clearInterval(dashboardService.updateInterval);
    }
  });

  describe('start', () => {
    test('should connect to Redis and start real-time updates', async () => {
      mockRedis.connect.mockResolvedValue();
      
      await dashboardService.start();
      
      expect(mockRedis.connect).toHaveBeenCalled();
      expect(dashboardService.updateInterval).toBeDefined();
    });
  });

  describe('getOverview', () => {
    test('should return comprehensive overview data', async () => {
      // Mock transaction overview
      mockDbPool.query.mockResolvedValueOnce({
        rows: [{
          total_transactions: '1000',
          completed_transactions: '950',
          failed_transactions: '30',
          pending_transactions: '20',
          total_volume: '50000.00',
          avg_processing_time: '0.25'
        }]
      });

      // Mock fraud overview
      mockDbPool.query.mockResolvedValueOnce({
        rows: [{
          total_cases: '15',
          open_cases: '5',
          investigating_cases: '3',
          resolved_cases: '7'
        }]
      });

      mockDbPool.query.mockResolvedValueOnce({
        rows: [{
          fraud_rate: '2.5',
          avg_fraud_score: '0.15'
        }]
      });

      // Mock performance overview
      mockRedis.get
        .mockResolvedValueOnce('0.35') // avg_response_time
        .mockResolvedValueOnce('65.2') // cpu_usage
        .mockResolvedValueOnce('78.5') // memory_usage
        .mockResolvedValueOnce('150'); // active_connections

      // Mock business overview
      mockDbPool.query.mockResolvedValueOnce({
        rows: [{
          active_users: '1250',
          reversal_rate: '1.2',
          usd_volume: '45000.00',
          eur_volume: '32000.00'
        }]
      });

      const overview = await dashboardService.getOverview();

      expect(overview).toHaveProperty('timestamp');
      expect(overview).toHaveProperty('transactions');
      expect(overview).toHaveProperty('fraud');
      expect(overview).toHaveProperty('performance');
      expect(overview).toHaveProperty('business');

      expect(overview.transactions.totalTransactions).toBe(1000);
      expect(overview.transactions.successRate).toBe('95.00');
      expect(overview.fraud.totalCases).toBe(15);
      expect(overview.fraud.fraudRate).toBe(2.5);
      expect(overview.performance.avgResponseTime).toBe(0.35);
      expect(overview.business.dailyActiveUsers).toBe(1250);
    });

    test('should handle database errors gracefully', async () => {
      mockDbPool.query.mockRejectedValue(new Error('Database error'));
      mockRedis.get.mockResolvedValue('0');

      const overview = await dashboardService.getOverview();

      expect(overview).toBeNull();
    });
  });

  describe('getTransactionMetrics', () => {
    test('should return transaction time series and currency data', async () => {
      const timeSeriesData = [
        {
          time_bucket: '2025-01-08T10:00:00Z',
          transaction_count: '100',
          completed_count: '95',
          failed_count: '3',
          volume: '5000.00',
          avg_processing_time: '0.25'
        }
      ];

      const currencyData = [
        { currency: 'USD-CBDC', count: '80', volume: '4000.00' },
        { currency: 'EUR-CBDC', count: '20', volume: '1000.00' }
      ];

      mockDbPool.query
        .mockResolvedValueOnce({ rows: timeSeriesData })
        .mockResolvedValueOnce({ rows: currencyData });

      const result = await dashboardService.getTransactionMetrics('1h');

      expect(result.timeSeries).toHaveLength(1);
      expect(result.timeSeries[0].transactionCount).toBe(100);
      expect(result.timeSeries[0].completedCount).toBe(95);
      expect(result.byCurrency).toHaveLength(2);
      expect(result.byCurrency[0].currency).toBe('USD-CBDC');
    });

    test('should handle empty results', async () => {
      mockDbPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await dashboardService.getTransactionMetrics('1h');

      expect(result.timeSeries).toEqual([]);
      expect(result.byCurrency).toEqual([]);
    });
  });

  describe('getFraudMetrics', () => {
    test('should return fraud detection metrics', async () => {
      const fraudCasesData = [
        {
          time_bucket: '2025-01-08T10:00:00Z',
          total_cases: '5',
          open_cases: '2',
          resolved_cases: '3',
          reversal_rate: '0.6'
        }
      ];

      const fraudScoreData = [
        {
          time_bucket: '2025-01-08T10:00:00Z',
          avg_fraud_score: '0.25',
          high_risk_rate: '5.2'
        }
      ];

      const caseTypeData = [
        {
          case_type: 'suspicious_pattern',
          count: '3',
          avg_resolution_time: '3600'
        }
      ];

      mockDbPool.query
        .mockResolvedValueOnce({ rows: fraudCasesData })
        .mockResolvedValueOnce({ rows: fraudScoreData })
        .mockResolvedValueOnce({ rows: caseTypeData });

      const result = await dashboardService.getFraudMetrics('1h');

      expect(result.timeSeries).toHaveLength(1);
      expect(result.timeSeries[0].totalCases).toBe(5);
      expect(result.fraudScores).toHaveLength(1);
      expect(result.fraudScores[0].avgFraudScore).toBe(0.25);
      expect(result.byCaseType).toHaveLength(1);
      expect(result.byCaseType[0].caseType).toBe('suspicious_pattern');
    });
  });

  describe('getPerformanceMetrics', () => {
    test('should return performance metrics from Redis and database', async () => {
      mockRedis.keys.mockResolvedValue(['performance:response_time', 'performance:resource_usage']);
      mockRedis.lRange
        .mockResolvedValueOnce(['{"timestamp":"2025-01-08T10:00:00Z","value":0.25}'])
        .mockResolvedValueOnce(['{"timestamp":"2025-01-08T10:00:00Z","value":65.2}']);

      const slaData = [
        {
          time_bucket: '2025-01-08T10:00:00Z',
          sla_compliance: '98.5',
          avg_response_time: '0.28'
        }
      ];

      mockDbPool.query.mockResolvedValue({ rows: slaData });

      const result = await dashboardService.getPerformanceMetrics('1h');

      expect(result.responseTime).toHaveLength(1);
      expect(result.resourceUsage).toHaveLength(1);
      expect(result.slaCompliance).toHaveLength(1);
      expect(result.slaCompliance[0].compliance).toBe(98.5);
    });
  });

  describe('getBusinessMetrics', () => {
    test('should return business metrics including user activity and satisfaction', async () => {
      const userActivityData = [
        {
          time_bucket: '2025-01-08T10:00:00Z',
          active_users: '500',
          transaction_count: '1000',
          volume: '25000.00'
        }
      ];

      const reversalData = [
        {
          time_bucket: '2025-01-08T10:00:00Z',
          reversal_rate: '1.5',
          avg_resolution_time: '3600'
        }
      ];

      const satisfactionData = [
        {
          avg_satisfaction: '8.5',
          total_ratings: '150'
        }
      ];

      mockDbPool.query
        .mockResolvedValueOnce({ rows: userActivityData })
        .mockResolvedValueOnce({ rows: reversalData })
        .mockResolvedValueOnce({ rows: satisfactionData });

      const result = await dashboardService.getBusinessMetrics('24h');

      expect(result.userActivity).toHaveLength(1);
      expect(result.userActivity[0].activeUsers).toBe(500);
      expect(result.reversalMetrics).toHaveLength(1);
      expect(result.reversalMetrics[0].reversalRate).toBe(1.5);
      expect(result.satisfaction.avgScore).toBe(8.5);
      expect(result.satisfaction.totalRatings).toBe(150);
    });
  });

  describe('parseTimeRange', () => {
    test('should parse time range strings correctly', () => {
      expect(dashboardService.parseTimeRange('5m')).toBe('5 minutes');
      expect(dashboardService.parseTimeRange('1h')).toBe('1 hour');
      expect(dashboardService.parseTimeRange('24h')).toBe('24 hours');
      expect(dashboardService.parseTimeRange('7d')).toBe('7 days');
      expect(dashboardService.parseTimeRange('invalid')).toBe('1 hour');
    });
  });

  describe('startRealTimeUpdates', () => {
    test('should emit real-time updates via WebSocket', async () => {
      jest.useFakeTimers();
      
      // Mock all the get methods
      dashboardService.getOverview = jest.fn().mockResolvedValue({ test: 'overview' });
      dashboardService.getTransactionMetrics = jest.fn().mockResolvedValue({ test: 'transactions' });
      dashboardService.getFraudMetrics = jest.fn().mockResolvedValue({ test: 'fraud' });
      dashboardService.getPerformanceMetrics = jest.fn().mockResolvedValue({ test: 'performance' });

      dashboardService.startRealTimeUpdates();

      // Fast-forward time to trigger the interval
      jest.advanceTimersByTime(5000);

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockIo.to).toHaveBeenCalledWith('dashboard');
      expect(mockIo.emit).toHaveBeenCalledWith('overview_update', { test: 'overview' });

      jest.useRealTimers();
    });
  });

  describe('stop', () => {
    test('should clear interval and close connections', async () => {
      dashboardService.updateInterval = setInterval(() => {}, 1000);
      mockRedis.quit.mockResolvedValue();
      mockDbPool.end.mockResolvedValue();

      await dashboardService.stop();

      expect(dashboardService.updateInterval).toBeNull();
      expect(mockRedis.quit).toHaveBeenCalled();
      expect(mockDbPool.end).toHaveBeenCalled();
    });
  });
});