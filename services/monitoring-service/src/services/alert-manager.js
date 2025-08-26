const cron = require('node-cron');
const Redis = require('redis');
const { Pool } = require('pg');
const logger = require('../utils/logger');

class AlertManager {
  constructor() {
    this.redis = Redis.createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379'
    });
    
    this.dbPool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/echopay_monitoring'
    });
    
    this.alertRules = this.initializeAlertRules();
    this.jobs = [];
    this.activeAlerts = new Map();
  }

  initializeAlertRules() {
    return [
      {
        id: 'high_fraud_rate',
        name: 'High Fraud Rate',
        description: 'Fraud rate exceeds 5% in the last 5 minutes',
        severity: 'critical',
        condition: 'fraud_rate > 5',
        query: `
          SELECT 
            (COUNT(CASE WHEN fraud_score > 0.8 THEN 1 END) * 100.0 / COUNT(*)) as fraud_rate
          FROM transactions 
          WHERE created_at > NOW() - INTERVAL '5 minutes'
        `,
        threshold: 5,
        cooldown: 300 // 5 minutes
      },
      {
        id: 'transaction_latency_high',
        name: 'High Transaction Latency',
        description: 'Average transaction processing time exceeds 500ms',
        severity: 'warning',
        condition: 'avg_latency > 0.5',
        query: `
          SELECT 
            AVG(EXTRACT(EPOCH FROM (settled_at - created_at))) as avg_latency
          FROM transactions 
          WHERE created_at > NOW() - INTERVAL '2 minutes'
          AND status = 'completed'
        `,
        threshold: 0.5,
        cooldown: 120 // 2 minutes
      },
      {
        id: 'fraud_detection_latency_high',
        name: 'High Fraud Detection Latency',
        description: 'Fraud detection processing time exceeds 100ms',
        severity: 'warning',
        condition: 'fraud_latency > 0.1',
        redisKey: 'fraud_detection_avg_latency',
        threshold: 0.1,
        cooldown: 60 // 1 minute
      },
      {
        id: 'reversal_rate_high',
        name: 'High Reversal Rate',
        description: 'Transaction reversal rate exceeds 2% in the last hour',
        severity: 'warning',
        condition: 'reversal_rate > 2',
        query: `
          SELECT 
            (COUNT(CASE WHEN status = 'reversed' THEN 1 END) * 100.0 / COUNT(*)) as reversal_rate
          FROM transactions 
          WHERE created_at > NOW() - INTERVAL '1 hour'
        `,
        threshold: 2,
        cooldown: 600 // 10 minutes
      },
      {
        id: 'system_resource_high',
        name: 'High System Resource Usage',
        description: 'System resource usage exceeds 85%',
        severity: 'warning',
        condition: 'resource_usage > 85',
        redisKey: 'system_resource_usage',
        threshold: 85,
        cooldown: 180 // 3 minutes
      },
      {
        id: 'sla_breach',
        name: 'SLA Breach',
        description: 'SLA compliance drops below 95%',
        severity: 'critical',
        condition: 'sla_compliance < 95',
        query: `
          SELECT 
            (COUNT(CASE WHEN EXTRACT(EPOCH FROM (settled_at - created_at)) < 0.5 THEN 1 END) * 100.0 / COUNT(*)) as sla_compliance
          FROM transactions 
          WHERE created_at > NOW() - INTERVAL '5 minutes'
          AND status = 'completed'
        `,
        threshold: 95,
        cooldown: 300 // 5 minutes
      },
      {
        id: 'failed_transactions_high',
        name: 'High Failed Transaction Rate',
        description: 'Failed transaction rate exceeds 1% in the last 5 minutes',
        severity: 'warning',
        condition: 'failed_rate > 1',
        query: `
          SELECT 
            (COUNT(CASE WHEN status = 'failed' THEN 1 END) * 100.0 / COUNT(*)) as failed_rate
          FROM transactions 
          WHERE created_at > NOW() - INTERVAL '5 minutes'
        `,
        threshold: 1,
        cooldown: 180 // 3 minutes
      },
      {
        id: 'active_fraud_cases_high',
        name: 'High Number of Active Fraud Cases',
        description: 'Number of active fraud cases exceeds 100',
        severity: 'warning',
        condition: 'active_cases > 100',
        query: `
          SELECT COUNT(*) as active_cases
          FROM fraud_cases 
          WHERE status IN ('open', 'investigating')
        `,
        threshold: 100,
        cooldown: 600 // 10 minutes
      }
    ];
  }

  async start() {
    try {
      await this.redis.connect();
      await this.initializeDatabase();
      
      // Schedule alert checking
      this.scheduleAlertChecks();
      
      logger.info('Alert manager started successfully');
    } catch (error) {
      logger.error('Failed to start alert manager:', error);
      throw error;
    }
  }

  async initializeDatabase() {
    try {
      await this.dbPool.query(`
        CREATE TABLE IF NOT EXISTS alerts (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          rule_id VARCHAR(100) NOT NULL,
          name VARCHAR(255) NOT NULL,
          description TEXT,
          severity VARCHAR(20) NOT NULL,
          status VARCHAR(20) DEFAULT 'active',
          value DECIMAL(10,2),
          threshold DECIMAL(10,2),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          acknowledged_at TIMESTAMP WITH TIME ZONE,
          acknowledged_by VARCHAR(100),
          resolved_at TIMESTAMP WITH TIME ZONE,
          metadata JSONB
        );
      `);

      await this.dbPool.query(`
        CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status);
      `);

      await this.dbPool.query(`
        CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON alerts(created_at);
      `);

      await this.dbPool.query(`
        CREATE INDEX IF NOT EXISTS idx_alerts_rule_id ON alerts(rule_id);
      `);

    } catch (error) {
      logger.error('Error initializing alert database:', error);
      throw error;
    }
  }

  scheduleAlertChecks() {
    // Check alerts every 30 seconds
    const alertJob = cron.schedule('*/30 * * * * *', async () => {
      await this.checkAlerts();
    });
    this.jobs.push(alertJob);

    // Clean up resolved alerts every hour
    const cleanupJob = cron.schedule('0 * * * *', async () => {
      await this.cleanupOldAlerts();
    });
    this.jobs.push(cleanupJob);
  }

  async checkAlerts() {
    try {
      for (const rule of this.alertRules) {
        await this.checkAlertRule(rule);
      }
    } catch (error) {
      logger.error('Error checking alerts:', error);
    }
  }

  async checkAlertRule(rule) {
    try {
      // Check if alert is in cooldown
      const lastAlert = this.activeAlerts.get(rule.id);
      if (lastAlert && (Date.now() - lastAlert.timestamp) < (rule.cooldown * 1000)) {
        return;
      }

      let value;
      
      if (rule.query) {
        // Database query
        const result = await this.dbPool.query(rule.query);
        if (result.rows.length > 0) {
          const row = result.rows[0];
          value = parseFloat(Object.values(row)[0]) || 0;
        } else {
          value = 0;
        }
      } else if (rule.redisKey) {
        // Redis key
        const redisValue = await this.redis.get(rule.redisKey);
        value = parseFloat(redisValue) || 0;
      } else {
        return;
      }

      // Check if threshold is breached
      const isBreached = this.evaluateCondition(rule.condition, value, rule.threshold);
      
      if (isBreached) {
        await this.triggerAlert(rule, value);
      } else {
        // Resolve alert if it was active
        await this.resolveAlert(rule.id);
      }

    } catch (error) {
      logger.error(`Error checking alert rule ${rule.id}:`, error);
    }
  }

  evaluateCondition(condition, value, threshold) {
    // Simple condition evaluation
    if (condition.includes('>')) {
      return value > threshold;
    } else if (condition.includes('<')) {
      return value < threshold;
    } else if (condition.includes('>=')) {
      return value >= threshold;
    } else if (condition.includes('<=')) {
      return value <= threshold;
    } else if (condition.includes('==')) {
      return value === threshold;
    }
    return false;
  }

  async triggerAlert(rule, value) {
    try {
      // Check if alert already exists and is active
      const existingAlert = await this.dbPool.query(`
        SELECT id FROM alerts 
        WHERE rule_id = $1 AND status = 'active'
        ORDER BY created_at DESC 
        LIMIT 1
      `, [rule.id]);

      if (existingAlert.rows.length > 0) {
        // Update existing alert
        await this.dbPool.query(`
          UPDATE alerts 
          SET value = $1, created_at = NOW()
          WHERE id = $2
        `, [value, existingAlert.rows[0].id]);
      } else {
        // Create new alert
        const result = await this.dbPool.query(`
          INSERT INTO alerts (rule_id, name, description, severity, value, threshold, metadata)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING id
        `, [
          rule.id,
          rule.name,
          rule.description,
          rule.severity,
          value,
          rule.threshold,
          JSON.stringify({ condition: rule.condition })
        ]);

        const alertId = result.rows[0].id;
        
        // Send notifications
        await this.sendAlertNotifications({
          id: alertId,
          ruleId: rule.id,
          name: rule.name,
          description: rule.description,
          severity: rule.severity,
          value,
          threshold: rule.threshold
        });
      }

      // Update active alerts cache
      this.activeAlerts.set(rule.id, {
        timestamp: Date.now(),
        value
      });

      logger.warn(`Alert triggered: ${rule.name} (${value} > ${rule.threshold})`);

    } catch (error) {
      logger.error(`Error triggering alert for rule ${rule.id}:`, error);
    }
  }

  async resolveAlert(ruleId) {
    try {
      await this.dbPool.query(`
        UPDATE alerts 
        SET status = 'resolved', resolved_at = NOW()
        WHERE rule_id = $1 AND status = 'active'
      `, [ruleId]);

      // Remove from active alerts cache
      this.activeAlerts.delete(ruleId);

    } catch (error) {
      logger.error(`Error resolving alert for rule ${ruleId}:`, error);
    }
  }

  async sendAlertNotifications(alert) {
    try {
      // In a real implementation, this would send notifications via:
      // - Email
      // - Slack
      // - PagerDuty
      // - SMS
      // - WebSocket to dashboard
      
      logger.info(`Alert notification: ${alert.name}`, {
        alertId: alert.id,
        severity: alert.severity,
        value: alert.value,
        threshold: alert.threshold
      });

      // Store notification in Redis for dashboard
      await this.redis.lpush('alert_notifications', JSON.stringify({
        ...alert,
        timestamp: new Date().toISOString()
      }));

      // Keep only last 100 notifications
      await this.redis.ltrim('alert_notifications', 0, 99);

    } catch (error) {
      logger.error('Error sending alert notifications:', error);
    }
  }

  async getAlerts(status = 'active', limit = 50) {
    try {
      const result = await this.dbPool.query(`
        SELECT * FROM alerts 
        WHERE status = $1
        ORDER BY created_at DESC 
        LIMIT $2
      `, [status, limit]);

      return result.rows;
    } catch (error) {
      logger.error('Error getting alerts:', error);
      return [];
    }
  }

  async acknowledgeAlert(alertId, userId) {
    try {
      await this.dbPool.query(`
        UPDATE alerts 
        SET acknowledged_at = NOW(), acknowledged_by = $1
        WHERE id = $2
      `, [userId, alertId]);

      logger.info(`Alert ${alertId} acknowledged by ${userId}`);
    } catch (error) {
      logger.error('Error acknowledging alert:', error);
      throw error;
    }
  }

  async cleanupOldAlerts() {
    try {
      // Delete resolved alerts older than 7 days
      await this.dbPool.query(`
        DELETE FROM alerts 
        WHERE status = 'resolved' 
        AND resolved_at < NOW() - INTERVAL '7 days'
      `);

      logger.info('Old alerts cleaned up');
    } catch (error) {
      logger.error('Error cleaning up old alerts:', error);
    }
  }

  async stop() {
    try {
      // Stop all cron jobs
      this.jobs.forEach(job => job.destroy());
      this.jobs = [];

      // Close connections
      await this.redis.quit();
      await this.dbPool.end();

      logger.info('Alert manager stopped successfully');
    } catch (error) {
      logger.error('Error stopping alert manager:', error);
    }
  }
}

module.exports = AlertManager;