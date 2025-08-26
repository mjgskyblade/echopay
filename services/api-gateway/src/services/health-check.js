const serviceDiscovery = require('./service-discovery');
const logger = require('../utils/logger');

class HealthCheck {
  constructor() {
    this.startTime = Date.now();
  }

  handler = async (req, res) => {
    try {
      const uptime = Date.now() - this.startTime;
      const services = await serviceDiscovery.getHealthyServices();
      
      const healthStatus = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: uptime,
        version: process.env.npm_package_version || '1.0.0',
        services: services,
        memory: process.memoryUsage(),
        system: {
          platform: process.platform,
          nodeVersion: process.version,
          pid: process.pid
        }
      };

      // Check if any critical services are down
      const criticalServices = ['transaction-service', 'fraud-detection', 'token-management'];
      const unhealthyServices = criticalServices.filter(service => 
        !services[service] || !services[service].healthy
      );

      if (unhealthyServices.length > 0) {
        healthStatus.status = 'degraded';
        healthStatus.issues = unhealthyServices.map(service => ({
          service,
          issue: 'Service unavailable'
        }));
      }

      const statusCode = healthStatus.status === 'healthy' ? 200 : 503;
      res.status(statusCode).json(healthStatus);
    } catch (error) {
      logger.error('Health check failed:', error);
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message
      });
    }
  };

  readinessCheck = async (req, res) => {
    try {
      // Check if gateway is ready to serve traffic
      const services = await serviceDiscovery.getHealthyServices();
      const criticalServices = ['transaction-service', 'fraud-detection'];
      
      const readyServices = criticalServices.filter(service => 
        services[service] && services[service].healthy
      );

      const isReady = readyServices.length === criticalServices.length;

      res.status(isReady ? 200 : 503).json({
        status: isReady ? 'ready' : 'not_ready',
        timestamp: new Date().toISOString(),
        criticalServices: criticalServices.map(service => ({
          name: service,
          ready: services[service] && services[service].healthy
        }))
      });
    } catch (error) {
      logger.error('Readiness check failed:', error);
      res.status(503).json({
        status: 'not_ready',
        timestamp: new Date().toISOString(),
        error: error.message
      });
    }
  };

  livenessCheck = (req, res) => {
    // Simple liveness check - if we can respond, we're alive
    res.status(200).json({
      status: 'alive',
      timestamp: new Date().toISOString(),
      uptime: Date.now() - this.startTime
    });
  };
}

module.exports = new HealthCheck();