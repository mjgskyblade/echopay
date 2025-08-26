const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const prometheus = require('prom-client');
require('dotenv').config();

const MetricsCollector = require('./services/metrics-collector');
const AlertManager = require('./services/alert-manager');
const DashboardService = require('./services/dashboard-service');
const logger = require('./utils/logger');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ["http://localhost:3000"],
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Initialize services
const metricsCollector = new MetricsCollector();
const alertManager = new AlertManager();
const dashboardService = new DashboardService(io);

// Prometheus metrics endpoint
app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', prometheus.register.contentType);
    res.end(await prometheus.register.metrics());
  } catch (error) {
    logger.error('Error generating metrics:', error);
    res.status(500).end();
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0'
  });
});

// Dashboard API endpoints
app.get('/api/dashboard/overview', async (req, res) => {
  try {
    const overview = await dashboardService.getOverview();
    res.json(overview);
  } catch (error) {
    logger.error('Error getting dashboard overview:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/dashboard/transactions', async (req, res) => {
  try {
    const { timeRange = '1h' } = req.query;
    const metrics = await dashboardService.getTransactionMetrics(timeRange);
    res.json(metrics);
  } catch (error) {
    logger.error('Error getting transaction metrics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/dashboard/fraud', async (req, res) => {
  try {
    const { timeRange = '1h' } = req.query;
    const metrics = await dashboardService.getFraudMetrics(timeRange);
    res.json(metrics);
  } catch (error) {
    logger.error('Error getting fraud metrics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/dashboard/performance', async (req, res) => {
  try {
    const { timeRange = '1h' } = req.query;
    const metrics = await dashboardService.getPerformanceMetrics(timeRange);
    res.json(metrics);
  } catch (error) {
    logger.error('Error getting performance metrics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/dashboard/business', async (req, res) => {
  try {
    const { timeRange = '24h' } = req.query;
    const metrics = await dashboardService.getBusinessMetrics(timeRange);
    res.json(metrics);
  } catch (error) {
    logger.error('Error getting business metrics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Alerts API
app.get('/api/alerts', async (req, res) => {
  try {
    const { status = 'active', limit = 50 } = req.query;
    const alerts = await alertManager.getAlerts(status, parseInt(limit));
    res.json(alerts);
  } catch (error) {
    logger.error('Error getting alerts:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/alerts/:alertId/acknowledge', async (req, res) => {
  try {
    const { alertId } = req.params;
    const { userId } = req.body;
    await alertManager.acknowledgeAlert(alertId, userId);
    res.json({ success: true });
  } catch (error) {
    logger.error('Error acknowledging alert:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// WebSocket connection handling
io.on('connection', (socket) => {
  logger.info(`Client connected: ${socket.id}`);
  
  socket.on('subscribe', (channels) => {
    channels.forEach(channel => {
      socket.join(channel);
      logger.info(`Client ${socket.id} subscribed to ${channel}`);
    });
  });
  
  socket.on('unsubscribe', (channels) => {
    channels.forEach(channel => {
      socket.leave(channel);
      logger.info(`Client ${socket.id} unsubscribed from ${channel}`);
    });
  });
  
  socket.on('disconnect', () => {
    logger.info(`Client disconnected: ${socket.id}`);
  });
});

// Start metrics collection
metricsCollector.start();

// Start alert monitoring
alertManager.start();

// Start dashboard service
dashboardService.start();

// Error handling
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    metricsCollector.stop();
    alertManager.stop();
    dashboardService.stop();
    process.exit(0);
  });
});

const PORT = process.env.PORT || 3005;
server.listen(PORT, () => {
  logger.info(`Monitoring service running on port ${PORT}`);
});

module.exports = { app, server, io };