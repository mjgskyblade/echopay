const Redis = require('redis');
const { Pool } = require('pg');
const logger = require('../utils/logger');

class DashboardService {
  constructor(io) {
    this.io = io;
    this.redis = Redis.createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379'
    });
    
    this.dbPool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/echopay_monitoring'
    });
    
    this.updateInterval = null;
  }

  async start() {
    try {
      await this.redis.connect();
      
      // Start real-time updates
      this.startRealTimeUpdates();
      
      logger.info('Dashboard service started successfully');
    } catch (error) {
      logger.error('Failed to start dashboard service:', error);
      throw error;
    }
  }

  startRealTimeUpdates() {
    // Send real-time updates every 5 seconds
    this.updateInterval = setInterval(async () => {
      try {
        const overview = await this.getOverview();
        this.io.to('dashboard').emit('overview_update', overview);

        const transactionMetrics = await this.getTransactionMetrics('5m');
        this.io.to('transactions').emit('metrics_update', transactionMetrics);

        const fraudMetrics = await this.getFraudMetrics('5m');
        this.io.to('fraud').emit('metrics_update', fraudMetrics);

        const performanceMetrics = await this.getPerformanceMetrics('5m');
        this.io.to('performance').emit('metrics_update', performanceMetrics);

      } catch (error) {
        logger.error('Error sending real-time updates:', error);
      }
    }, 5000);
  }

  async getOverview() {
    try {
      const [
        transactionStats,
        fraudStats,
        performanceStats,
        businessStats
      ] = await Promise.all([
        this.getTransactionOverview(),
        this.getFraudOverview(),
        this.getPerformanceOverview(),
        this.getBusinessOverview()
      ]);

      return {
        timestamp: new Date().toISOString(),
        transactions: transactionStats,
        fraud: fraudStats,
        performance: performanceStats,
        business: businessStats
      };
    } catch (error) {
      logger.error('Error getting dashboard overview:', error);
      return null;
    }
  }

  async getTransactionOverview() {
    try {
      const result = await this.dbPool.query(`
        SELECT 
          COUNT(*) as total_transactions,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_transactions,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_transactions,
          COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_transactions,
          SUM(amount) as total_volume,
          AVG(EXTRACT(EPOCH FROM (settled_at - created_at))) as avg_processing_time
        FROM transactions 
        WHERE created_at > NOW() - INTERVAL '1 hour'
      `);

      const row = result.rows[0];
      return {
        totalTransactions: parseInt(row.total_transactions) || 0,
        completedTransactions: parseInt(row.completed_transactions) || 0,
        failedTransactions: parseInt(row.failed_transactions) || 0,
        pendingTransactions: parseInt(row.pending_transactions) || 0,
        totalVolume: parseFloat(row.total_volume) || 0,
        avgProcessingTime: parseFloat(row.avg_processing_time) || 0,
        successRate: row.total_transactions > 0 ? 
          (row.completed_transactions / row.total_transactions * 100).toFixed(2) : 0
      };
    } catch (error) {
      logger.error('Error getting transaction overview:', error);
      return {};
    }
  }

  async getFraudOverview() {
    try {
      const [fraudCasesResult, fraudRateResult] = await Promise.all([
        this.dbPool.query(`
          SELECT 
            COUNT(*) as total_cases,
            COUNT(CASE WHEN status = 'open' THEN 1 END) as open_cases,
            COUNT(CASE WHEN status = 'investigating' THEN 1 END) as investigating_cases,
            COUNT(CASE WHEN status = 'resolved' THEN 1 END) as resolved_cases
          FROM fraud_cases 
          WHERE created_at > NOW() - INTERVAL '24 hours'
        `),
        this.dbPool.query(`
          SELECT 
            COUNT(CASE WHEN fraud_score > 0.8 THEN 1 END) * 100.0 / COUNT(*) as fraud_rate,
            AVG(fraud_score) as avg_fraud_score
          FROM transactions 
          WHERE created_at > NOW() - INTERVAL '1 hour'
        `)
      ]);

      const casesRow = fraudCasesResult.rows[0];
      const rateRow = fraudRateResult.rows[0];

      return {
        totalCases: parseInt(casesRow.total_cases) || 0,
        openCases: parseInt(casesRow.open_cases) || 0,
        investigatingCases: parseInt(casesRow.investigating_cases) || 0,
        resolvedCases: parseInt(casesRow.resolved_cases) || 0,
        fraudRate: parseFloat(rateRow.fraud_rate) || 0,
        avgFraudScore: parseFloat(rateRow.avg_fraud_score) || 0
      };
    } catch (error) {
      logger.error('Error getting fraud overview:', error);
      return {};
    }
  }

  async getPerformanceOverview() {
    try {
      // Get performance metrics from Redis
      const [
        avgResponseTime,
        cpuUsage,
        memoryUsage,
        activeConnections
      ] = await Promise.all([
        this.redis.get('avg_response_time'),
        this.redis.get('cpu_usage'),
        this.redis.get('memory_usage'),
        this.redis.get('active_connections')
      ]);

      return {
        avgResponseTime: parseFloat(avgResponseTime) || 0,
        cpuUsage: parseFloat(cpuUsage) || 0,
        memoryUsage: parseFloat(memoryUsage) || 0,
        activeConnections: parseInt(activeConnections) || 0,
        uptime: process.uptime()
      };
    } catch (error) {
      logger.error('Error getting performance overview:', error);
      return {};
    }
  }

  async getBusinessOverview() {
    try {
      const result = await this.dbPool.query(`
        SELECT 
          COUNT(DISTINCT from_wallet_id) + COUNT(DISTINCT to_wallet_id) as active_users,
          COUNT(CASE WHEN status = 'reversed' THEN 1 END) * 100.0 / COUNT(*) as reversal_rate,
          SUM(CASE WHEN currency = 'USD-CBDC' THEN amount ELSE 0 END) as usd_volume,
          SUM(CASE WHEN currency = 'EUR-CBDC' THEN amount ELSE 0 END) as eur_volume
        FROM transactions 
        WHERE created_at > CURRENT_DATE
      `);

      const row = result.rows[0];
      return {
        dailyActiveUsers: parseInt(row.active_users) || 0,
        reversalRate: parseFloat(row.reversal_rate) || 0,
        usdVolume: parseFloat(row.usd_volume) || 0,
        eurVolume: parseFloat(row.eur_volume) || 0
      };
    } catch (error) {
      logger.error('Error getting business overview:', error);
      return {};
    }
  }

  async getTransactionMetrics(timeRange) {
    try {
      const interval = this.parseTimeRange(timeRange);
      
      const result = await this.dbPool.query(`
        SELECT 
          DATE_TRUNC('minute', created_at) as time_bucket,
          COUNT(*) as transaction_count,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_count,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_count,
          SUM(amount) as volume,
          AVG(EXTRACT(EPOCH FROM (settled_at - created_at))) as avg_processing_time
        FROM transactions 
        WHERE created_at > NOW() - INTERVAL '${interval}'
        GROUP BY time_bucket
        ORDER BY time_bucket
      `);

      const currencyResult = await this.dbPool.query(`
        SELECT 
          currency,
          COUNT(*) as count,
          SUM(amount) as volume
        FROM transactions 
        WHERE created_at > NOW() - INTERVAL '${interval}'
        GROUP BY currency
      `);

      return {
        timeSeries: result.rows.map(row => ({
          timestamp: row.time_bucket,
          transactionCount: parseInt(row.transaction_count),
          completedCount: parseInt(row.completed_count),
          failedCount: parseInt(row.failed_count),
          volume: parseFloat(row.volume) || 0,
          avgProcessingTime: parseFloat(row.avg_processing_time) || 0
        })),
        byCurrency: currencyResult.rows.map(row => ({
          currency: row.currency,
          count: parseInt(row.count),
          volume: parseFloat(row.volume)
        }))
      };
    } catch (error) {
      logger.error('Error getting transaction metrics:', error);
      return { timeSeries: [], byCurrency: [] };
    }
  }

  async getFraudMetrics(timeRange) {
    try {
      const interval = this.parseTimeRange(timeRange);
      
      const timeSeriesResult = await this.dbPool.query(`
        SELECT 
          DATE_TRUNC('minute', created_at) as time_bucket,
          COUNT(*) as total_cases,
          COUNT(CASE WHEN status = 'open' THEN 1 END) as open_cases,
          COUNT(CASE WHEN status = 'resolved' THEN 1 END) as resolved_cases,
          AVG(CASE WHEN resolution = 'reversed' THEN 1 ELSE 0 END) as reversal_rate
        FROM fraud_cases 
        WHERE created_at > NOW() - INTERVAL '${interval}'
        GROUP BY time_bucket
        ORDER BY time_bucket
      `);

      const fraudScoreResult = await this.dbPool.query(`
        SELECT 
          DATE_TRUNC('minute', created_at) as time_bucket,
          AVG(fraud_score) as avg_fraud_score,
          COUNT(CASE WHEN fraud_score > 0.8 THEN 1 END) * 100.0 / COUNT(*) as high_risk_rate
        FROM transactions 
        WHERE created_at > NOW() - INTERVAL '${interval}'
        GROUP BY time_bucket
        ORDER BY time_bucket
      `);

      const caseTypeResult = await this.dbPool.query(`
        SELECT 
          case_type,
          COUNT(*) as count,
          AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))) as avg_resolution_time
        FROM fraud_cases 
        WHERE created_at > NOW() - INTERVAL '${interval}'
        AND resolved_at IS NOT NULL
        GROUP BY case_type
      `);

      return {
        timeSeries: timeSeriesResult.rows.map(row => ({
          timestamp: row.time_bucket,
          totalCases: parseInt(row.total_cases),
          openCases: parseInt(row.open_cases),
          resolvedCases: parseInt(row.resolved_cases),
          reversalRate: parseFloat(row.reversal_rate) || 0
        })),
        fraudScores: fraudScoreResult.rows.map(row => ({
          timestamp: row.time_bucket,
          avgFraudScore: parseFloat(row.avg_fraud_score) || 0,
          highRiskRate: parseFloat(row.high_risk_rate) || 0
        })),
        byCaseType: caseTypeResult.rows.map(row => ({
          caseType: row.case_type,
          count: parseInt(row.count),
          avgResolutionTime: parseFloat(row.avg_resolution_time) || 0
        }))
      };
    } catch (error) {
      logger.error('Error getting fraud metrics:', error);
      return { timeSeries: [], fraudScores: [], byCaseType: [] };
    }
  }

  async getPerformanceMetrics(timeRange) {
    try {
      // Get performance data from Redis time series
      const keys = await this.redis.keys('performance:*');
      const performanceData = {};
      
      for (const key of keys) {
        const data = await this.redis.lRange(key, 0, -1);
        const metric = key.split(':')[1];
        performanceData[metric] = data.map(item => JSON.parse(item));
      }

      // Get SLA compliance data
      const slaResult = await this.dbPool.query(`
        SELECT 
          DATE_TRUNC('minute', created_at) as time_bucket,
          COUNT(CASE WHEN EXTRACT(EPOCH FROM (settled_at - created_at)) < 0.5 THEN 1 END) * 100.0 / COUNT(*) as sla_compliance,
          AVG(EXTRACT(EPOCH FROM (settled_at - created_at))) as avg_response_time
        FROM transactions 
        WHERE created_at > NOW() - INTERVAL '${this.parseTimeRange(timeRange)}'
        AND status = 'completed'
        GROUP BY time_bucket
        ORDER BY time_bucket
      `);

      return {
        responseTime: performanceData.response_time || [],
        resourceUsage: performanceData.resource_usage || [],
        slaCompliance: slaResult.rows.map(row => ({
          timestamp: row.time_bucket,
          compliance: parseFloat(row.sla_compliance) || 0,
          avgResponseTime: parseFloat(row.avg_response_time) || 0
        }))
      };
    } catch (error) {
      logger.error('Error getting performance metrics:', error);
      return { responseTime: [], resourceUsage: [], slaCompliance: [] };
    }
  }

  async getBusinessMetrics(timeRange) {
    try {
      const interval = this.parseTimeRange(timeRange);
      
      const userActivityResult = await this.dbPool.query(`
        SELECT 
          DATE_TRUNC('hour', created_at) as time_bucket,
          COUNT(DISTINCT from_wallet_id) + COUNT(DISTINCT to_wallet_id) as active_users,
          COUNT(*) as transaction_count,
          SUM(amount) as volume
        FROM transactions 
        WHERE created_at > NOW() - INTERVAL '${interval}'
        GROUP BY time_bucket
        ORDER BY time_bucket
      `);

      const reversalMetricsResult = await this.dbPool.query(`
        SELECT 
          DATE_TRUNC('hour', created_at) as time_bucket,
          COUNT(CASE WHEN status = 'reversed' THEN 1 END) * 100.0 / COUNT(*) as reversal_rate,
          AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))) as avg_resolution_time
        FROM transactions t
        LEFT JOIN fraud_cases fc ON t.id = fc.transaction_id
        WHERE t.created_at > NOW() - INTERVAL '${interval}'
        GROUP BY time_bucket
        ORDER BY time_bucket
      `);

      const satisfactionResult = await this.dbPool.query(`
        SELECT 
          AVG(rating) as avg_satisfaction,
          COUNT(*) as total_ratings
        FROM user_feedback 
        WHERE created_at > NOW() - INTERVAL '${interval}'
      `);

      return {
        userActivity: userActivityResult.rows.map(row => ({
          timestamp: row.time_bucket,
          activeUsers: parseInt(row.active_users),
          transactionCount: parseInt(row.transaction_count),
          volume: parseFloat(row.volume) || 0
        })),
        reversalMetrics: reversalMetricsResult.rows.map(row => ({
          timestamp: row.time_bucket,
          reversalRate: parseFloat(row.reversal_rate) || 0,
          avgResolutionTime: parseFloat(row.avg_resolution_time) || 0
        })),
        satisfaction: {
          avgScore: parseFloat(satisfactionResult.rows[0]?.avg_satisfaction) || 0,
          totalRatings: parseInt(satisfactionResult.rows[0]?.total_ratings) || 0
        }
      };
    } catch (error) {
      logger.error('Error getting business metrics:', error);
      return { userActivity: [], reversalMetrics: [], satisfaction: {} };
    }
  }

  parseTimeRange(timeRange) {
    const ranges = {
      '5m': '5 minutes',
      '15m': '15 minutes',
      '1h': '1 hour',
      '6h': '6 hours',
      '24h': '24 hours',
      '7d': '7 days',
      '30d': '30 days'
    };
    
    return ranges[timeRange] || '1 hour';
  }

  async stop() {
    try {
      if (this.updateInterval) {
        clearInterval(this.updateInterval);
        this.updateInterval = null;
      }

      await this.redis.quit();
      await this.dbPool.end();

      logger.info('Dashboard service stopped successfully');
    } catch (error) {
      logger.error('Error stopping dashboard service:', error);
    }
  }
}

module.exports = DashboardService;