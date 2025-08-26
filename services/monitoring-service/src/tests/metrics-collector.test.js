const MetricsCollector = require('../services/metrics-collector');
const Redis = require('redis');
const { Pool } = require('pg');

// Mock dependencies
jest.mock('redis');
jest.mock('pg');
jest.mock('node-cron');

describe('MetricsCollector', () => {
  let metricsCollector;
  let mockRedis;
  let mockDbPool;

  beforeEach(() => {
    mockRedis = {
      connect: jest.fn(),
      quit: jest.fn(),
      hGetAll: jest.fn(),
      get: jest.fn()
    };
    
    mockDbPool = {
      query: jest.fn(),
      end: jest.fn()
    };

    Redis.createClient.mockReturnValue(mockRedis);
    Pool.mockImplementation(() => mockDbPool);

    metricsCollector = new MetricsCollector();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    test('should initialize all Prometheus metrics', () => {
      expect(metricsCollector.transactionCounter).toBeDefined();
      expect(metricsCollector.transactionDuration).toBeDefined();
      expect(metricsCollector.fraudDetectionLatency).toBeDefined();
      expect(metricsCollector.apiResponseTime).toBeDefined();
      expect(metricsCollector.reversalRate).toBeDefined();
      expect(metricsCollector.slaCompliance).toBeDefined();
    });

    test('should create Redis and database connections', () => {
      expect(Redis.createClient).toHaveBeenCalledWith({
        url: 'redis://localhost:6379'
      });
      expect(Pool).toHaveBeenCalledWith({
        connectionString: 'postgresql://localhost:5432/echopay_monitoring'
      });
    });
  });

  describe('start', () => {
    test('should connect to Redis and start collection jobs', async () => {
      mockRedis.connect.mockResolvedValue();
      
      await metricsCollector.start();
      
      expect(mockRedis.connect).toHaveBeenCalled();
      expect(metricsCollector.jobs).toHaveLength(5); // 5 scheduled jobs
    });

    test('should handle connection errors', async () => {
      const error = new Error('Connection failed');
      mockRedis.connect.mockRejectedValue(error);
      
      await expect(metricsCollector.start()).rejects.toThrow('Connection failed');
    });
  });

  describe('collectTransactionMetrics', () => {
    test('should collect metrics from Redis and database', async () => {
      const redisData = {
        'count:completed:transaction-service:USD-CBDC': '100',
        'duration:transaction-service:process': '0.25',
        'amount:USD-CBDC': '1000.50'
      };
      
      const dbResult = {
        rows: [
          {
            status: 'completed',
            currency: 'USD-CBDC',
            count: '50',
            avg_duration: '0.3',
            total_amount: '2500.75'
          }
        ]
      };

      mockRedis.hGetAll.mockResolvedValue(redisData);
      mockDbPool.query.mockResolvedValue(dbResult);

      await metricsCollector.collectTransactionMetrics();

      expect(mockRedis.hGetAll).toHaveBeenCalledWith('transaction_metrics');
      expect(mockDbPool.query).toHaveBeenCalled();
    });

    test('should handle empty Redis data', async () => {
      mockRedis.hGetAll.mockResolvedValue(null);
      mockDbPool.query.mockResolvedValue({ rows: [] });

      await expect(metricsCollector.collectTransactionMetrics()).resolves.not.toThrow();
    });

    test('should handle database errors gracefully', async () => {
      mockRedis.hGetAll.mockResolvedValue({});
      mockDbPool.query.mockRejectedValue(new Error('Database error'));

      await expect(metricsCollector.collectTransactionMetrics()).resolves.not.toThrow();
    });
  });

  describe('collectFraudMetrics', () => {
    test('should collect fraud detection metrics', async () => {
      const fraudData = {
        'latency': '0.08',
        'score': '0.75',
        'cases:open:suspicious:pending': '5'
      };
      
      const dbResult = {
        rows: [
          {
            status: 'open',
            case_type: 'suspicious',
            resolution: null,
            count: '3'
          }
        ]
      };

      mockRedis.hGetAll.mockResolvedValue(fraudData);
      mockDbPool.query.mockResolvedValue(dbResult);

      await metricsCollector.collectFraudMetrics();

      expect(mockRedis.hGetAll).toHaveBeenCalledWith('fraud_metrics');
      expect(mockDbPool.query).toHaveBeenCalled();
    });
  });

  describe('collectBusinessMetrics', () => {
    test('should calculate reversal rate and user metrics', async () => {
      const reversalResult = { rows: [{ reversal_rate: '1.5' }] };
      const dauResult = { rows: [{ dau: '1250' }] };
      const volumeResult = { 
        rows: [
          { currency: 'USD-CBDC', volume: '50000.00' },
          { currency: 'EUR-CBDC', volume: '35000.00' }
        ] 
      };

      mockDbPool.query
        .mockResolvedValueOnce(reversalResult)
        .mockResolvedValueOnce(dauResult)
        .mockResolvedValueOnce(volumeResult);

      await metricsCollector.collectBusinessMetrics();

      expect(mockDbPool.query).toHaveBeenCalledTimes(3);
    });
  });

  describe('collectSLAMetrics', () => {
    test('should calculate SLA compliance metrics', async () => {
      const slaResult = { rows: [{ sla_compliance: '98.5' }] };
      mockDbPool.query.mockResolvedValue(slaResult);
      mockRedis.get.mockResolvedValue('99.2');

      await metricsCollector.collectSLAMetrics();

      expect(mockDbPool.query).toHaveBeenCalled();
      expect(mockRedis.get).toHaveBeenCalledWith('fraud_sla_compliance');
    });
  });

  describe('stop', () => {
    test('should stop all jobs and close connections', async () => {
      const mockJob = { destroy: jest.fn() };
      metricsCollector.jobs = [mockJob];
      
      mockRedis.quit.mockResolvedValue();
      mockDbPool.end.mockResolvedValue();

      await metricsCollector.stop();

      expect(mockJob.destroy).toHaveBeenCalled();
      expect(mockRedis.quit).toHaveBeenCalled();
      expect(mockDbPool.end).toHaveBeenCalled();
      expect(metricsCollector.jobs).toHaveLength(0);
    });
  });
});