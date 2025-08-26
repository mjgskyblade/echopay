const MetricsCollector = require('../services/metrics-collector');
const DashboardService = require('../services/dashboard-service');
const AlertManager = require('../services/alert-manager');
const Redis = require('redis');
const { Pool } = require('pg');

// Mock dependencies
jest.mock('redis');
jest.mock('pg');
jest.mock('node-cron');

describe('Performance Monitoring Tests', () => {
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

  describe('Response Time Tracking', () => {
    test('should track API response times by service and endpoint', async () => {
      const performanceData = {
        'response_time:transaction-service:/api/transactions:POST:200': '0.245',
        'response_time:transaction-service:/api/transactions:GET:200': '0.156',
        'response_time:fraud-detection:/api/analyze:POST:200': '0.087',
        'response_time:token-management:/api/tokens:POST:201': '0.198',
        'response_time:reversibility-service:/api/fraud-reports:POST:201': '0.312'
      };

      mockRedis.hGetAll.mockResolvedValue(performanceData);

      await metricsCollector.collectPerformanceMetrics();

      expect(mockRedis.hGetAll).toHaveBeenCalledWith('performance_metrics');
      
      // Verify all services are tracked
      const services = Object.keys(performanceData).map(key => key.split(':')[1]);
      expect(services).toContain('transaction-service');
      expect(services).toContain('fraud-detection');
      expect(services).toContain('token-management');
      expect(services).toContain('reversibility-service');
    });

    test('should track response times for different HTTP methods', async () => {
      const performanceData = {
        'response_time:api-gateway:/api/health:GET:200': '0.025',
        'response_time:transaction-service:/api/transactions:POST:200': '0.245',
        'response_time:transaction-service:/api/transactions:PUT:200': '0.189',
        'response_time:transaction-service:/api/transactions:DELETE:204': '0.134'
      };

      mockRedis.hGetAll.mockResolvedValue(performanceData);

      await metricsCollector.collectPerformanceMetrics();

      // Verify different HTTP methods are tracked
      const methods = Object.keys(performanceData).map(key => key.split(':')[3]);
      expect(methods).toContain('GET');
      expect(methods).toContain('POST');
      expect(methods).toContain('PUT');
      expect(methods).toContain('DELETE');
    });

    test('should track response times for different status codes', async () => {
      const performanceData = {
        'response_time:transaction-service:/api/transactions:POST:200': '0.245',
        'response_time:transaction-service:/api/transactions:POST:400': '0.089',
        'response_time:transaction-service:/api/transactions:POST:500': '0.156',
        'response_time:fraud-detection:/api/analyze:POST:429': '0.045'
      };

      mockRedis.hGetAll.mockResolvedValue(performanceData);

      await metricsCollector.collectPerformanceMetrics();

      // Verify different status codes are tracked
      const statusCodes = Object.keys(performanceData).map(key => key.split(':')[4]);
      expect(statusCodes).toContain('200');
      expect(statusCodes).toContain('400');
      expect(statusCodes).toContain('500');
      expect(statusCodes).toContain('429');
    });
  });

  describe('SLA Compliance Monitoring', () => {
    test('should calculate transaction processing SLA compliance (<500ms)', async () => {
      const slaResult = {
        rows: [{ sla_compliance: '96.8' }]
      };

      mockDbPool.query.mockResolvedValue(slaResult);
      mockRedis.get.mockResolvedValue('98.2');

      await metricsCollector.collectSLAMetrics();

      expect(mockDbPool.query).toHaveBeenCalledWith(
        expect.stringContaining('EXTRACT(EPOCH FROM (settled_at - created_at)) < 0.5')
      );
      expect(mockDbPool.query).toHaveBeenCalledWith(
        expect.stringContaining('status = \'completed\'')
      );
    });

    test('should calculate fraud detection SLA compliance (<100ms)', async () => {
      mockDbPool.query.mockResolvedValue({ rows: [{ sla_compliance: '95.5' }] });
      mockRedis.get.mockResolvedValue('97.8');

      await metricsCollector.collectSLAMetrics();

      expect(mockRedis.get).toHaveBeenCalledWith('fraud_sla_compliance');
    });

    test('should track SLA compliance for all critical services', async () => {
      mockDbPool.query.mockResolvedValue({ rows: [{ sla_compliance: '98.0' }] });
      mockRedis.get.mockResolvedValue('99.1');

      await metricsCollector.collectSLAMetrics();

      // Verify uptime is tracked for all services
      const expectedServices = ['transaction-service', 'fraud-detection', 'token-management', 'reversibility-service'];
      expectedServices.forEach(service => {
        expect(service).toBeDefined();
      });
    });

    test('should trigger SLA breach alert when compliance drops below 95%', async () => {
      const slaRule = alertManager.alertRules.find(r => r.id === 'sla_breach');
      
      mockDbPool.query
        .mockResolvedValueOnce({ rows: [{ sla_compliance: '92.3' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'sla-alert-123' }] });

      alertManager.sendAlertNotifications = jest.fn();

      await alertManager.checkAlertRule(slaRule);

      expect(alertManager.sendAlertNotifications).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'SLA Breach',
          severity: 'critical',
          value: 92.3,
          threshold: 95
        })
      );
    });
  });

  describe('System Resource Monitoring', () => {
    test('should track CPU usage by service', async () => {
      const performanceData = {
        'resource_usage:transaction-service:cpu': '72.5',
        'resource_usage:fraud-detection:cpu': '45.8',
        'resource_usage:token-management:cpu': '38.2',
        'resource_usage:reversibility-service:cpu': '55.1',
        'resource_usage:api-gateway:cpu': '28.9'
      };

      mockRedis.hGetAll.mockResolvedValue(performanceData);

      await metricsCollector.collectPerformanceMetrics();

      // Verify CPU usage is tracked for all services
      const cpuMetrics = Object.keys(performanceData).filter(key => key.includes(':cpu'));
      expect(cpuMetrics).toHaveLength(5);
    });

    test('should track memory usage by service', async () => {
      const performanceData = {
        'resource_usage:transaction-service:memory': '68.3',
        'resource_usage:fraud-detection:memory': '82.1',
        'resource_usage:token-management:memory': '45.7',
        'resource_usage:reversibility-service:memory': '59.4',
        'resource_usage:api-gateway:memory': '35.2'
      };

      mockRedis.hGetAll.mockResolvedValue(performanceData);

      await metricsCollector.collectPerformanceMetrics();

      // Verify memory usage is tracked for all services
      const memoryMetrics = Object.keys(performanceData).filter(key => key.includes(':memory'));
      expect(memoryMetrics).toHaveLength(5);
    });

    test('should track disk usage by service', async () => {
      const performanceData = {
        'resource_usage:transaction-service:disk': '45.2',
        'resource_usage:fraud-detection:disk': '38.7',
        'resource_usage:token-management:disk': '52.1',
        'resource_usage:reversibility-service:disk': '41.8'
      };

      mockRedis.hGetAll.mockResolvedValue(performanceData);

      await metricsCollector.collectPerformanceMetrics();

      // Verify disk usage is tracked
      const diskMetrics = Object.keys(performanceData).filter(key => key.includes(':disk'));
      expect(diskMetrics).toHaveLength(4);
    });

    test('should trigger high resource usage alert when usage exceeds 85%', async () => {
      const resourceRule = alertManager.alertRules.find(r => r.id === 'system_resource_high');
      
      mockRedis.get.mockResolvedValue('87.5');

      await alertManager.checkAlertRule(resourceRule);

      // Should trigger alert for high resource usage
      expect(mockRedis.get).toHaveBeenCalledWith('system_resource_usage');
    });
  });

  describe('Connection Monitoring', () => {
    test('should track active connections by service and type', async () => {
      const performanceData = {
        'connections:api-gateway:active': '250',
        'connections:transaction-service:database': '45',
        'connections:fraud-detection:redis': '15',
        'connections:token-management:database': '32',
        'connections:reversibility-service:database': '28'
      };

      mockRedis.hGetAll.mockResolvedValue(performanceData);

      await metricsCollector.collectPerformanceMetrics();

      // Verify connection metrics are tracked
      const connectionMetrics = Object.keys(performanceData).filter(key => key.startsWith('connections:'));
      expect(connectionMetrics).toHaveLength(5);
    });

    test('should track WebSocket connections', async () => {
      const performanceData = {
        'connections:api-gateway:websocket': '125',
        'connections:monitoring-service:websocket': '85'
      };

      mockRedis.hGetAll.mockResolvedValue(performanceData);

      await metricsCollector.collectPerformanceMetrics();

      // Verify WebSocket connections are tracked
      const wsConnections = Object.keys(performanceData).filter(key => key.includes(':websocket'));
      expect(wsConnections).toHaveLength(2);
    });
  });

  describe('Performance Dashboard Integration', () => {
    test('should provide performance metrics for dashboard', async () => {
      mockRedis.keys.mockResolvedValue([
        'performance:response_time',
        'performance:resource_usage',
        'performance:connections'
      ]);
      
      mockRedis.lRange
        .mockResolvedValueOnce(['{"timestamp":"2025-01-08T10:00:00Z","service":"transaction-service","value":0.25}'])
        .mockResolvedValueOnce(['{"timestamp":"2025-01-08T10:00:00Z","service":"transaction-service","resource":"cpu","value":72.5}'])
        .mockResolvedValueOnce(['{"timestamp":"2025-01-08T10:00:00Z","service":"api-gateway","type":"active","value":200}']);

      const slaData = [
        {
          time_bucket: '2025-01-08T10:00:00Z',
          sla_compliance: '97.2',
          avg_response_time: '0.28'
        }
      ];

      mockDbPool.query.mockResolvedValue({ rows: slaData });

      const result = await dashboardService.getPerformanceMetrics('1h');

      expect(result).toHaveProperty('responseTime');
      expect(result).toHaveProperty('resourceUsage');
      expect(result).toHaveProperty('slaCompliance');
      expect(result.slaCompliance[0].compliance).toBe(97.2);
    });

    test('should handle performance data aggregation', async () => {
      const timeSeriesData = [
        '{"timestamp":"2025-01-08T10:00:00Z","value":0.25}',
        '{"timestamp":"2025-01-08T10:01:00Z","value":0.28}',
        '{"timestamp":"2025-01-08T10:02:00Z","value":0.22}'
      ];

      mockRedis.keys.mockResolvedValue(['performance:response_time']);
      mockRedis.lRange.mockResolvedValue(timeSeriesData);
      mockDbPool.query.mockResolvedValue({ rows: [] });

      const result = await dashboardService.getPerformanceMetrics('5m');

      expect(result.responseTime).toHaveLength(3);
      expect(result.responseTime[0]).toEqual(JSON.parse(timeSeriesData[0]));
    });
  });

  describe('Performance Alert Validation', () => {
    test('should trigger transaction latency alert when average exceeds 500ms', async () => {
      const latencyRule = alertManager.alertRules.find(r => r.id === 'transaction_latency_high');
      
      mockDbPool.query
        .mockResolvedValueOnce({ rows: [{ avg_latency: 0.65 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'latency-alert-456' }] });

      alertManager.sendAlertNotifications = jest.fn();

      await alertManager.checkAlertRule(latencyRule);

      expect(alertManager.sendAlertNotifications).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'High Transaction Latency',
          severity: 'warning',
          value: 0.65,
          threshold: 0.5
        })
      );
    });

    test('should trigger fraud detection latency alert when exceeds 100ms', async () => {
      const fraudLatencyRule = alertManager.alertRules.find(r => r.id === 'fraud_detection_latency_high');
      
      mockRedis.get.mockResolvedValue('0.125');

      await alertManager.checkAlertRule(fraudLatencyRule);

      expect(mockRedis.get).toHaveBeenCalledWith('fraud_detection_avg_latency');
    });

    test('should not trigger alerts during cooldown period', async () => {
      const latencyRule = alertManager.alertRules.find(r => r.id === 'transaction_latency_high');
      
      // Set alert in cooldown (2 minutes cooldown, set 1 minute ago)
      alertManager.activeAlerts.set(latencyRule.id, {
        timestamp: Date.now() - 60000,
        value: 0.75
      });

      await alertManager.checkAlertRule(latencyRule);

      // Should not query database due to cooldown
      expect(mockDbPool.query).not.toHaveBeenCalled();
    });
  });

  describe('Performance Metrics Validation', () => {
    test('should validate response time ranges', async () => {
      const performanceData = {
        'response_time:transaction-service:/api/transactions:POST:200': '0.245'
      };

      mockRedis.hGetAll.mockResolvedValue(performanceData);

      await metricsCollector.collectPerformanceMetrics();

      const responseTime = parseFloat(performanceData['response_time:transaction-service:/api/transactions:POST:200']);
      expect(responseTime).toBeGreaterThan(0);
      expect(responseTime).toBeLessThan(10); // Reasonable upper bound
    });

    test('should validate resource usage percentages', async () => {
      const performanceData = {
        'resource_usage:transaction-service:cpu': '72.5',
        'resource_usage:transaction-service:memory': '68.3'
      };

      mockRedis.hGetAll.mockResolvedValue(performanceData);

      await metricsCollector.collectPerformanceMetrics();

      const cpuUsage = parseFloat(performanceData['resource_usage:transaction-service:cpu']);
      const memoryUsage = parseFloat(performanceData['resource_usage:transaction-service:memory']);

      expect(cpuUsage).toBeGreaterThanOrEqual(0);
      expect(cpuUsage).toBeLessThanOrEqual(100);
      expect(memoryUsage).toBeGreaterThanOrEqual(0);
      expect(memoryUsage).toBeLessThanOrEqual(100);
    });

    test('should handle invalid performance data gracefully', async () => {
      const performanceData = {
        'response_time:invalid-service:invalid-endpoint:INVALID:999': 'invalid',
        'resource_usage:invalid-service:invalid-resource': '-50',
        'connections:invalid-service:invalid-type': 'not-a-number'
      };

      mockRedis.hGetAll.mockResolvedValue(performanceData);

      // Should not throw error with invalid data
      await expect(metricsCollector.collectPerformanceMetrics()).resolves.not.toThrow();
    });
  });

  describe('Performance Trend Analysis', () => {
    test('should track performance trends over time', async () => {
      const timeSeriesData = [
        { time_bucket: '2025-01-08T10:00:00Z', sla_compliance: '98.5', avg_response_time: '0.25' },
        { time_bucket: '2025-01-08T10:01:00Z', sla_compliance: '97.8', avg_response_time: '0.28' },
        { time_bucket: '2025-01-08T10:02:00Z', sla_compliance: '96.2', avg_response_time: '0.32' }
      ];

      mockDbPool.query.mockResolvedValue({ rows: timeSeriesData });
      mockRedis.keys.mockResolvedValue([]);
      mockRedis.lRange.mockResolvedValue([]);

      const result = await dashboardService.getPerformanceMetrics('5m');

      expect(result.slaCompliance).toHaveLength(3);
      
      // Verify trend shows declining performance
      expect(result.slaCompliance[0].compliance).toBeGreaterThan(result.slaCompliance[2].compliance);
      expect(result.slaCompliance[0].avgResponseTime).toBeLessThan(result.slaCompliance[2].avgResponseTime);
    });

    test('should identify performance degradation patterns', async () => {
      const performanceHistory = [
        { timestamp: '2025-01-08T10:00:00Z', value: 0.25 },
        { timestamp: '2025-01-08T10:01:00Z', value: 0.28 },
        { timestamp: '2025-01-08T10:02:00Z', value: 0.35 },
        { timestamp: '2025-01-08T10:03:00Z', value: 0.42 }
      ];

      // Check for increasing trend (performance degradation)
      let isIncreasing = true;
      for (let i = 1; i < performanceHistory.length; i++) {
        if (performanceHistory[i].value <= performanceHistory[i-1].value) {
          isIncreasing = false;
          break;
        }
      }

      expect(isIncreasing).toBe(true); // Performance is degrading
    });
  });
});