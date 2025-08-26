const prometheus = require('prom-client');
const cron = require('node-cron');
const Redis = require('redis');
const { Pool } = require('pg');
const logger = require('../utils/logger');

class MetricsCollector {
  constructor() {
    this.redis = Redis.createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379'
    });
    
    this.dbPool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/echopay_monitoring'
    });
    
    this.initializeMetrics();
    this.jobs = [];
  }

  initializeMetrics() {
    // Transaction metrics
    this.transactionCounter = new prometheus.Counter({
      name: 'echopay_transactions_total',
      help: 'Total number of transactions processed',
      labelNames: ['status', 'service', 'currency']
    });

    this.transactionDuration = new prometheus.Histogram({
      name: 'echopay_transaction_duration_seconds',
      help: 'Transaction processing duration in seconds',
      labelNames: ['service', 'operation'],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5]
    });

    this.transactionAmount = new prometheus.Histogram({
      name: 'echopay_transaction_amount',
      help: 'Transaction amounts',
      labelNames: ['currency'],
      buckets: [1, 10, 50, 100, 500, 1000, 5000, 10000, 50000]
    });

    // Fraud detection metrics
    this.fraudDetectionLatency = new prometheus.Histogram({
      name: 'echopay_fraud_detection_latency_seconds',
      help: 'Fraud detection processing latency',
      buckets: [0.01, 0.05, 0.1, 0.2, 0.5, 1]
    });

    this.fraudScoreDistribution = new prometheus.Histogram({
      name: 'echopay_fraud_score_distribution',
      help: 'Distribution of fraud scores',
      buckets: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]
    });

    this.fraudCasesCounter = new prometheus.Counter({
      name: 'echopay_fraud_cases_total',
      help: 'Total number of fraud cases',
      labelNames: ['status', 'type', 'resolution']
    });

    // Performance metrics
    this.apiResponseTime = new prometheus.Histogram({
      name: 'echopay_api_response_time_seconds',
      help: 'API response time in seconds',
      labelNames: ['service', 'endpoint', 'method', 'status_code'],
      buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10]
    });

    this.systemResourceUsage = new prometheus.Gauge({
      name: 'echopay_system_resource_usage',
      help: 'System resource usage percentage',
      labelNames: ['service', 'resource_type']
    });

    this.activeConnections = new prometheus.Gauge({
      name: 'echopay_active_connections',
      help: 'Number of active connections',
      labelNames: ['service', 'connection_type']
    });

    // Business metrics
    this.reversalRate = new prometheus.Gauge({
      name: 'echopay_reversal_rate',
      help: 'Transaction reversal rate percentage',
      labelNames: ['time_period']
    });

    this.userSatisfactionScore = new prometheus.Gauge({
      name: 'echopay_user_satisfaction_score',
      help: 'User satisfaction score (1-10)',
      labelNames: ['service', 'time_period']
    });

    this.dailyActiveUsers = new prometheus.Gauge({
      name: 'echopay_daily_active_users',
      help: 'Number of daily active users'
    });

    this.transactionVolume = new prometheus.Gauge({
      name: 'echopay_transaction_volume',
      help: 'Transaction volume in currency units',
      labelNames: ['currency', 'time_period']
    });

    // SLA metrics
    this.slaCompliance = new prometheus.Gauge({
      name: 'echopay_sla_compliance_percentage',
      help: 'SLA compliance percentage',
      labelNames: ['service', 'sla_type']
    });

    this.uptimePercentage = new prometheus.Gauge({
      name: 'echopay_uptime_percentage',
      help: 'Service uptime percentage',
      labelNames: ['service']
    });

    // Register all metrics
    prometheus.register.registerMetric(this.transactionCounter);
    prometheus.register.registerMetric(this.transactionDuration);
    prometheus.register.registerMetric(this.transactionAmount);
    prometheus.register.registerMetric(this.fraudDetectionLatency);
    prometheus.register.registerMetric(this.fraudScoreDistribution);
    prometheus.register.registerMetric(this.fraudCasesCounter);
    prometheus.register.registerMetric(this.apiResponseTime);
    prometheus.register.registerMetric(this.systemResourceUsage);
    prometheus.register.registerMetric(this.activeConnections);
    prometheus.register.registerMetric(this.reversalRate);
    prometheus.register.registerMetric(this.userSatisfactionScore);
    prometheus.register.registerMetric(this.dailyActiveUsers);
    prometheus.register.registerMetric(this.transactionVolume);
    prometheus.register.registerMetric(this.slaCompliance);
    prometheus.register.registerMetric(this.uptimePercentage);
  }

  async start() {
    try {
      await this.redis.connect();
      logger.info('Connected to Redis for metrics collection');

      // Schedule metric collection jobs
      this.scheduleJobs();
      
      logger.info('Metrics collector started successfully');
    } catch (error) {
      logger.error('Failed to start metrics collector:', error);
      throw error;
    }
  }

  scheduleJobs() {
    // Collect transaction metrics every minute
    const transactionJob = cron.schedule('* * * * *', async () => {
      await this.collectTransactionMetrics();
    });
    this.jobs.push(transactionJob);

    // Collect fraud metrics every 30 seconds
    const fraudJob = cron.schedule('*/30 * * * * *', async () => {
      await this.collectFraudMetrics();
    });
    this.jobs.push(fraudJob);

    // Collect performance metrics every 15 seconds
    const performanceJob = cron.schedule('*/15 * * * * *', async () => {
      await this.collectPerformanceMetrics();
    });
    this.jobs.push(performanceJob);

    // Collect business metrics every 5 minutes
    const businessJob = cron.schedule('*/5 * * * *', async () => {
      await this.collectBusinessMetrics();
    });
    this.jobs.push(businessJob);

    // Collect SLA metrics every minute
    const slaJob = cron.schedule('* * * * *', async () => {
      await this.collectSLAMetrics();
    });
    this.jobs.push(slaJob);
  }

  async collectTransactionMetrics() {
    try {
      // Get transaction data from Redis cache
      const transactionData = await this.redis.hGetAll('transaction_metrics');
      
      if (transactionData) {
        // Update transaction counters
        Object.entries(transactionData).forEach(([key, value]) => {
          const [metric, ...labels] = key.split(':');
          const numValue = parseFloat(value) || 0;
          
          switch (metric) {
            case 'count':
              this.transactionCounter.inc({ status: labels[0], service: labels[1], currency: labels[2] }, numValue);
              break;
            case 'duration':
              this.transactionDuration.observe({ service: labels[0], operation: labels[1] }, numValue);
              break;
            case 'amount':
              this.transactionAmount.observe({ currency: labels[0] }, numValue);
              break;
          }
        });
      }

      // Query database for additional transaction metrics
      const dbResult = await this.dbPool.query(`
        SELECT 
          status,
          currency,
          COUNT(*) as count,
          AVG(EXTRACT(EPOCH FROM (settled_at - created_at))) as avg_duration,
          SUM(amount) as total_amount
        FROM transactions 
        WHERE created_at > NOW() - INTERVAL '1 minute'
        GROUP BY status, currency
      `);

      dbResult.rows.forEach(row => {
        this.transactionCounter.inc({
          status: row.status,
          service: 'transaction-service',
          currency: row.currency
        }, parseInt(row.count));

        if (row.avg_duration) {
          this.transactionDuration.observe({
            service: 'transaction-service',
            operation: 'process'
          }, parseFloat(row.avg_duration));
        }

        if (row.total_amount) {
          this.transactionAmount.observe({
            currency: row.currency
          }, parseFloat(row.total_amount));
        }
      });

    } catch (error) {
      logger.error('Error collecting transaction metrics:', error);
    }
  }

  async collectFraudMetrics() {
    try {
      // Get fraud detection metrics from Redis
      const fraudData = await this.redis.hGetAll('fraud_metrics');
      
      if (fraudData) {
        Object.entries(fraudData).forEach(([key, value]) => {
          const [metric, ...labels] = key.split(':');
          const numValue = parseFloat(value) || 0;
          
          switch (metric) {
            case 'latency':
              this.fraudDetectionLatency.observe(numValue);
              break;
            case 'score':
              this.fraudScoreDistribution.observe(numValue);
              break;
            case 'cases':
              this.fraudCasesCounter.inc({
                status: labels[0],
                type: labels[1],
                resolution: labels[2]
              }, numValue);
              break;
          }
        });
      }

      // Query fraud cases from database
      const fraudCasesResult = await this.dbPool.query(`
        SELECT 
          status,
          case_type,
          resolution,
          COUNT(*) as count
        FROM fraud_cases 
        WHERE created_at > NOW() - INTERVAL '30 seconds'
        GROUP BY status, case_type, resolution
      `);

      fraudCasesResult.rows.forEach(row => {
        this.fraudCasesCounter.inc({
          status: row.status,
          type: row.case_type,
          resolution: row.resolution || 'pending'
        }, parseInt(row.count));
      });

    } catch (error) {
      logger.error('Error collecting fraud metrics:', error);
    }
  }

  async collectPerformanceMetrics() {
    try {
      // Get API response times from Redis
      const performanceData = await this.redis.hGetAll('performance_metrics');
      
      if (performanceData) {
        Object.entries(performanceData).forEach(([key, value]) => {
          const [metric, ...labels] = key.split(':');
          const numValue = parseFloat(value) || 0;
          
          switch (metric) {
            case 'response_time':
              this.apiResponseTime.observe({
                service: labels[0],
                endpoint: labels[1],
                method: labels[2],
                status_code: labels[3]
              }, numValue);
              break;
            case 'resource_usage':
              this.systemResourceUsage.set({
                service: labels[0],
                resource_type: labels[1]
              }, numValue);
              break;
            case 'connections':
              this.activeConnections.set({
                service: labels[0],
                connection_type: labels[1]
              }, numValue);
              break;
          }
        });
      }

    } catch (error) {
      logger.error('Error collecting performance metrics:', error);
    }
  }

  async collectBusinessMetrics() {
    try {
      // Calculate reversal rate
      const reversalResult = await this.dbPool.query(`
        SELECT 
          (COUNT(CASE WHEN status = 'reversed' THEN 1 END) * 100.0 / COUNT(*)) as reversal_rate
        FROM transactions 
        WHERE created_at > NOW() - INTERVAL '5 minutes'
      `);

      if (reversalResult.rows[0]?.reversal_rate !== null) {
        this.reversalRate.set({ time_period: '5min' }, parseFloat(reversalResult.rows[0].reversal_rate));
      }

      // Calculate daily active users
      const dauResult = await this.dbPool.query(`
        SELECT COUNT(DISTINCT user_id) as dau
        FROM transactions 
        WHERE created_at > CURRENT_DATE
      `);

      if (dauResult.rows[0]?.dau) {
        this.dailyActiveUsers.set(parseInt(dauResult.rows[0].dau));
      }

      // Calculate transaction volume
      const volumeResult = await this.dbPool.query(`
        SELECT 
          currency,
          SUM(amount) as volume
        FROM transactions 
        WHERE created_at > NOW() - INTERVAL '5 minutes'
        GROUP BY currency
      `);

      volumeResult.rows.forEach(row => {
        this.transactionVolume.set({
          currency: row.currency,
          time_period: '5min'
        }, parseFloat(row.volume));
      });

    } catch (error) {
      logger.error('Error collecting business metrics:', error);
    }
  }

  async collectSLAMetrics() {
    try {
      // Calculate SLA compliance for transaction processing (< 500ms)
      const slaResult = await this.dbPool.query(`
        SELECT 
          (COUNT(CASE WHEN EXTRACT(EPOCH FROM (settled_at - created_at)) < 0.5 THEN 1 END) * 100.0 / COUNT(*)) as sla_compliance
        FROM transactions 
        WHERE created_at > NOW() - INTERVAL '1 minute'
        AND status = 'completed'
      `);

      if (slaResult.rows[0]?.sla_compliance !== null) {
        this.slaCompliance.set({
          service: 'transaction-service',
          sla_type: 'response_time'
        }, parseFloat(slaResult.rows[0].sla_compliance));
      }

      // Calculate fraud detection SLA compliance (< 100ms)
      const fraudSlaData = await this.redis.get('fraud_sla_compliance');
      if (fraudSlaData) {
        this.slaCompliance.set({
          service: 'fraud-detection',
          sla_type: 'response_time'
        }, parseFloat(fraudSlaData));
      }

      // Calculate uptime percentage (mock data for now)
      const services = ['transaction-service', 'fraud-detection', 'token-management', 'reversibility-service'];
      services.forEach(service => {
        // In a real implementation, this would check actual service health
        this.uptimePercentage.set({ service }, 99.9);
      });

    } catch (error) {
      logger.error('Error collecting SLA metrics:', error);
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

      logger.info('Metrics collector stopped successfully');
    } catch (error) {
      logger.error('Error stopping metrics collector:', error);
    }
  }
}

module.exports = MetricsCollector;