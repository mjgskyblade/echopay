const AlertManager = require('../services/alert-manager');
const Redis = require('redis');
const { Pool } = require('pg');

// Mock dependencies
jest.mock('redis');
jest.mock('pg');
jest.mock('node-cron');

describe('AlertManager', () => {
  let alertManager;
  let mockRedis;
  let mockDbPool;

  beforeEach(() => {
    mockRedis = {
      connect: jest.fn(),
      quit: jest.fn(),
      get: jest.fn(),
      lpush: jest.fn(),
      ltrim: jest.fn()
    };
    
    mockDbPool = {
      query: jest.fn(),
      end: jest.fn()
    };

    Redis.createClient.mockReturnValue(mockRedis);
    Pool.mockImplementation(() => mockDbPool);

    alertManager = new AlertManager();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    test('should initialize alert rules', () => {
      expect(alertManager.alertRules).toHaveLength(8);
      expect(alertManager.alertRules[0].id).toBe('high_fraud_rate');
      expect(alertManager.alertRules[1].id).toBe('transaction_latency_high');
    });

    test('should initialize active alerts map', () => {
      expect(alertManager.activeAlerts).toBeInstanceOf(Map);
      expect(alertManager.activeAlerts.size).toBe(0);
    });
  });

  describe('start', () => {
    test('should connect to Redis and initialize database', async () => {
      mockRedis.connect.mockResolvedValue();
      mockDbPool.query.mockResolvedValue();
      
      await alertManager.start();
      
      expect(mockRedis.connect).toHaveBeenCalled();
      expect(mockDbPool.query).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS alerts')
      );
      expect(alertManager.jobs).toHaveLength(2); // 2 scheduled jobs
    });
  });

  describe('checkAlertRule', () => {
    test('should skip rule if in cooldown', async () => {
      const rule = alertManager.alertRules[0];
      alertManager.activeAlerts.set(rule.id, {
        timestamp: Date.now() - 60000, // 1 minute ago
        value: 10
      });

      await alertManager.checkAlertRule(rule);

      expect(mockDbPool.query).not.toHaveBeenCalled();
    });

    test('should check database query rule', async () => {
      const rule = alertManager.alertRules[0]; // high_fraud_rate
      mockDbPool.query.mockResolvedValue({
        rows: [{ fraud_rate: 7.5 }]
      });

      await alertManager.checkAlertRule(rule);

      expect(mockDbPool.query).toHaveBeenCalledWith(rule.query);
    });

    test('should check Redis key rule', async () => {
      const rule = alertManager.alertRules[2]; // fraud_detection_latency_high
      mockRedis.get.mockResolvedValue('0.15');

      await alertManager.checkAlertRule(rule);

      expect(mockRedis.get).toHaveBeenCalledWith(rule.redisKey);
    });

    test('should trigger alert when threshold is breached', async () => {
      const rule = alertManager.alertRules[0];
      mockDbPool.query
        .mockResolvedValueOnce({ rows: [{ fraud_rate: 7.5 }] }) // Check query
        .mockResolvedValueOnce({ rows: [] }) // Check existing alert
        .mockResolvedValueOnce({ rows: [{ id: 'alert-123' }] }); // Insert alert

      alertManager.sendAlertNotifications = jest.fn();

      await alertManager.checkAlertRule(rule);

      expect(mockDbPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO alerts'),
        expect.arrayContaining([rule.id, rule.name])
      );
      expect(alertManager.sendAlertNotifications).toHaveBeenCalled();
    });

    test('should resolve alert when threshold is not breached', async () => {
      const rule = alertManager.alertRules[0];
      mockDbPool.query.mockResolvedValue({ rows: [{ fraud_rate: 2.5 }] });

      await alertManager.checkAlertRule(rule);

      expect(mockDbPool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE alerts'),
        expect.arrayContaining([rule.id])
      );
    });
  });

  describe('evaluateCondition', () => {
    test('should evaluate greater than condition', () => {
      expect(alertManager.evaluateCondition('fraud_rate > 5', 7.5, 5)).toBe(true);
      expect(alertManager.evaluateCondition('fraud_rate > 5', 3.2, 5)).toBe(false);
    });

    test('should evaluate less than condition', () => {
      expect(alertManager.evaluateCondition('sla_compliance < 95', 92.5, 95)).toBe(true);
      expect(alertManager.evaluateCondition('sla_compliance < 95', 97.8, 95)).toBe(false);
    });

    test('should evaluate greater than or equal condition', () => {
      expect(alertManager.evaluateCondition('resource_usage >= 85', 85, 85)).toBe(true);
      expect(alertManager.evaluateCondition('resource_usage >= 85', 84, 85)).toBe(false);
    });
  });

  describe('triggerAlert', () => {
    test('should create new alert when none exists', async () => {
      const rule = alertManager.alertRules[0];
      mockDbPool.query
        .mockResolvedValueOnce({ rows: [] }) // No existing alert
        .mockResolvedValueOnce({ rows: [{ id: 'alert-123' }] }); // Insert result

      alertManager.sendAlertNotifications = jest.fn();

      await alertManager.triggerAlert(rule, 7.5);

      expect(mockDbPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO alerts'),
        expect.arrayContaining([rule.id, rule.name, rule.description, rule.severity, 7.5, rule.threshold])
      );
      expect(alertManager.sendAlertNotifications).toHaveBeenCalled();
      expect(alertManager.activeAlerts.has(rule.id)).toBe(true);
    });

    test('should update existing alert', async () => {
      const rule = alertManager.alertRules[0];
      mockDbPool.query.mockResolvedValue({
        rows: [{ id: 'existing-alert-123' }]
      });

      await alertManager.triggerAlert(rule, 8.2);

      expect(mockDbPool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE alerts'),
        expect.arrayContaining([8.2, 'existing-alert-123'])
      );
    });
  });

  describe('sendAlertNotifications', () => {
    test('should store notification in Redis', async () => {
      const alert = {
        id: 'alert-123',
        name: 'High Fraud Rate',
        severity: 'critical',
        value: 7.5,
        threshold: 5
      };

      mockRedis.lpush.mockResolvedValue();
      mockRedis.ltrim.mockResolvedValue();

      await alertManager.sendAlertNotifications(alert);

      expect(mockRedis.lpush).toHaveBeenCalledWith(
        'alert_notifications',
        expect.stringContaining('"name":"High Fraud Rate"')
      );
      expect(mockRedis.ltrim).toHaveBeenCalledWith('alert_notifications', 0, 99);
    });
  });

  describe('getAlerts', () => {
    test('should retrieve alerts from database', async () => {
      const mockAlerts = [
        { id: 'alert-1', name: 'Alert 1', status: 'active' },
        { id: 'alert-2', name: 'Alert 2', status: 'active' }
      ];
      mockDbPool.query.mockResolvedValue({ rows: mockAlerts });

      const result = await alertManager.getAlerts('active', 50);

      expect(mockDbPool.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM alerts'),
        ['active', 50]
      );
      expect(result).toEqual(mockAlerts);
    });

    test('should handle database errors', async () => {
      mockDbPool.query.mockRejectedValue(new Error('Database error'));

      const result = await alertManager.getAlerts();

      expect(result).toEqual([]);
    });
  });

  describe('acknowledgeAlert', () => {
    test('should update alert acknowledgment', async () => {
      mockDbPool.query.mockResolvedValue();

      await alertManager.acknowledgeAlert('alert-123', 'user-456');

      expect(mockDbPool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE alerts'),
        ['user-456', 'alert-123']
      );
    });
  });

  describe('cleanupOldAlerts', () => {
    test('should delete old resolved alerts', async () => {
      mockDbPool.query.mockResolvedValue();

      await alertManager.cleanupOldAlerts();

      expect(mockDbPool.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM alerts')
      );
    });
  });

  describe('stop', () => {
    test('should stop all jobs and close connections', async () => {
      const mockJob = { destroy: jest.fn() };
      alertManager.jobs = [mockJob];
      
      mockRedis.quit.mockResolvedValue();
      mockDbPool.end.mockResolvedValue();

      await alertManager.stop();

      expect(mockJob.destroy).toHaveBeenCalled();
      expect(mockRedis.quit).toHaveBeenCalled();
      expect(mockDbPool.end).toHaveBeenCalled();
      expect(alertManager.jobs).toHaveLength(0);
    });
  });
});