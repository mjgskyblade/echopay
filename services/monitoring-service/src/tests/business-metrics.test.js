const MetricsCollector = require('../services/metrics-collector');
const DashboardService = require('../services/dashboard-service');
const AlertManager = require('../services/alert-manager');
const Redis = require('redis');
const { Pool } = require('pg');

// Mock dependencies
jest.mock('redis');
jest.mock('pg');
jest.mock('node-cron');

describe('Business Metrics Monitoring Tests', () => {
  let metricsCollector;
  let dashboardService;
  let alertManager;
  let mockRedis;
  let mockDbPool;

  beforeEach(() => {
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

    metricsCollector = new MetricsCollector();
    dashboardService = new DashboardService({
      to: jest.fn().mockReturnThis(),
      emit: jest.fn()
    });
    alertManager = new AlertManager();

    jest.clearAllMocks();
  });

  describe('Reversal Rate Tracking', () => {
    test('should calculate transaction reversal rate', async () => {
      const reversalResult = {
        rows: [{ reversal_rate: '2.3' }]
      };

      mockDbPool.query
        .mockResolvedValueOnce(reversalResult)
        .mockResolvedValueOnce({ rows: [{ dau: '1500' }] })
        .mockResolvedValueOnce({ rows: [] });

      await metricsCollector.collectBusinessMetrics();

      expect(mockDbPool.query).toHaveBeenCalledWith(
        expect.stringContaining('COUNT(CASE WHEN status = \'reversed\' THEN 1 END) * 100.0 / COUNT(*)')
      );
    });

    test('should track reversal rate over different time periods', async () => {
      const timeRanges = ['5min', '1h', '24h', '7d'];
      
      for (const timeRange of timeRanges) {
        const reversalData = [
          {
            time_bucket: '2025-01-08T10:00:00Z',
            reversal_rate: '1.8',
            avg_resolution_time: '3600'
          }
        ];

        mockDbPool.query
          .mockResolvedValueOnce({ rows: [] }) // user activity
          .mockResolvedValueOnce({ rows: reversalData }) // reversal metrics
          .mockResolvedValueOnce({ rows: [{ avg_satisfaction: '8.5', total_ratings: '150' }] }); // satisfaction

        const result = await dashboardService.getBusinessMetrics(timeRange);

        expect(result.reversalMetrics).toHaveLength(1);
        expect(result.reversalMetrics[0].reversalRate).toBe(1.8);
      }
    });

    test('should trigger high reversal rate alert when exceeds 2%', async () => {
      const re