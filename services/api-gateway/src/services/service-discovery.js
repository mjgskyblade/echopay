const consul = require('consul');
const logger = require('../utils/logger');
const loadBalancer = require('./load-balancer');
const CircuitBreaker = require('./circuit-breaker');

class ServiceDiscovery {
  constructor() {
    this.consul = null;
    this.services = new Map();
    this.healthCheckInterval = null;
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 3,
      recoveryTimeout: 30000,
      expectedErrors: ['ECONNREFUSED', 'ETIMEDOUT']
    });
    this.loadBalancingAlgorithm = process.env.LOAD_BALANCING_ALGORITHM || 'round-robin';
  }

  async initialize() {
    try {
      // Initialize Consul client
      this.consul = consul({
        host: process.env.CONSUL_HOST || 'localhost',
        port: process.env.CONSUL_PORT || 8500,
        secure: process.env.CONSUL_SECURE === 'true'
      });

      // Register API Gateway service
      await this.registerService();

      // Start health checking
      this.startHealthChecking();

      logger.info('Service discovery initialized with Consul');
    } catch (error) {
      logger.warn('Consul not available, using fallback service discovery:', error.message);
      this.initializeFallback();
    }
  }

  async registerService() {
    const serviceConfig = {
      name: 'api-gateway',
      id: `api-gateway-${process.env.HOSTNAME || 'local'}`,
      address: process.env.SERVICE_HOST || 'localhost',
      port: parseInt(process.env.PORT || '3000'),
      tags: ['api', 'gateway', 'load-balancer'],
      check: {
        http: `http://${process.env.SERVICE_HOST || 'localhost'}:${process.env.PORT || '3000'}/health`,
        interval: '10s',
        timeout: '5s'
      }
    };

    if (this.consul) {
      await this.consul.agent.service.register(serviceConfig);
      logger.info('API Gateway registered with Consul');
    }
  }

  initializeFallback() {
    // Fallback service registry when Consul is not available
    this.services.set('transaction-service', [{
      id: 'transaction-service-1',
      address: 'localhost',
      port: 8001,
      healthy: true
    }]);

    this.services.set('token-management', [{
      id: 'token-management-1',
      address: 'localhost',
      port: 8002,
      healthy: true
    }]);

    this.services.set('fraud-detection', [{
      id: 'fraud-detection-1',
      address: 'localhost',
      port: 8003,
      healthy: true
    }]);

    this.services.set('reversibility-service', [{
      id: 'reversibility-service-1',
      address: 'localhost',
      port: 8004,
      healthy: true
    }]);

    this.services.set('compliance-service', [{
      id: 'compliance-service-1',
      address: 'localhost',
      port: 8005,
      healthy: true
    }]);

    logger.info('Fallback service discovery initialized');
  }

  async getServiceUrl(serviceName) {
    return await this.circuitBreaker.execute(
      serviceName,
      async () => {
        if (this.consul) {
          // Get healthy services from Consul
          const services = await this.consul.health.service({
            service: serviceName,
            passing: true
          });

          if (services.length === 0) {
            throw new Error(`No healthy instances of ${serviceName} found`);
          }

          // Convert Consul format to our instance format
          const instances = services.map(service => ({
            id: service.Service.ID,
            address: service.Service.Address,
            port: service.Service.Port,
            healthy: true,
            weight: service.Service.Meta?.weight || 1
          }));

          // Use load balancer to select instance
          const selectedInstance = loadBalancer.selectInstance(
            serviceName, 
            instances, 
            this.loadBalancingAlgorithm
          );
          
          return `http://${selectedInstance.address}:${selectedInstance.port}`;
        } else {
          // Use fallback registry
          const instances = this.services.get(serviceName);
          if (!instances || instances.length === 0) {
            throw new Error(`Service ${serviceName} not found in registry`);
          }

          const healthyInstances = instances.filter(instance => 
            instance.healthy !== false && this.circuitBreaker.isHealthy(`${serviceName}:${instance.id}`)
          );
          
          if (healthyInstances.length === 0) {
            throw new Error(`No healthy instances of ${serviceName} found`);
          }

          // Use load balancer to select instance
          const selectedInstance = loadBalancer.selectInstance(
            serviceName, 
            healthyInstances, 
            this.loadBalancingAlgorithm
          );
          
          return `http://${selectedInstance.address}:${selectedInstance.port}`;
        }
      },
      // Fallback function
      async () => {
        logger.warn(`Using fallback URL for ${serviceName} due to circuit breaker`);
        return this.getFallbackUrl(serviceName);
      }
    );
  }

  getFallbackUrl(serviceName) {
    const fallbackPorts = {
      'transaction-service': 'http://localhost:8001',
      'token-management': 'http://localhost:8002',
      'fraud-detection': 'http://localhost:8003',
      'reversibility-service': 'http://localhost:8004',
      'compliance-service': 'http://localhost:8005',
      'user-service': 'http://localhost:8006'
    };

    return fallbackPorts[serviceName] || 'http://localhost:8000';
  }

  async getHealthyServices() {
    const healthyServices = {};

    if (this.consul) {
      try {
        const services = await this.consul.catalog.service.list();
        
        for (const [serviceName] of Object.entries(services)) {
          const healthCheck = await this.consul.health.service({
            service: serviceName,
            passing: true
          });
          
          healthyServices[serviceName] = {
            instances: healthCheck.length,
            healthy: healthCheck.length > 0
          };
        }
      } catch (error) {
        logger.error('Failed to get services from Consul:', error);
      }
    } else {
      // Use fallback registry
      for (const [serviceName, instances] of this.services.entries()) {
        const healthyCount = instances.filter(instance => instance.healthy).length;
        healthyServices[serviceName] = {
          instances: healthyCount,
          healthy: healthyCount > 0
        };
      }
    }

    return healthyServices;
  }

  startHealthChecking() {
    if (this.consul) {
      // Consul handles health checking
      return;
    }

    // Fallback health checking for non-Consul setup
    this.healthCheckInterval = setInterval(async () => {
      for (const [serviceName, instances] of this.services.entries()) {
        for (const instance of instances) {
          try {
            const response = await fetch(`http://${instance.address}:${instance.port}/health`, {
              timeout: 5000
            });
            instance.healthy = response.ok;
          } catch (error) {
            instance.healthy = false;
            logger.warn(`Health check failed for ${serviceName} instance ${instance.id}:`, error.message);
          }
        }
      }
    }, 30000); // Check every 30 seconds
  }

  async shutdown() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    if (this.consul) {
      try {
        await this.consul.agent.service.deregister(`api-gateway-${process.env.HOSTNAME || 'local'}`);
        logger.info('API Gateway deregistered from Consul');
      } catch (error) {
        logger.error('Failed to deregister from Consul:', error);
      }
    }
  }
}

module.exports = new ServiceDiscovery();