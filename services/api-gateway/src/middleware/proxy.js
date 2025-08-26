const { createProxyMiddleware } = require('http-proxy-middleware');
const serviceDiscovery = require('../services/service-discovery');
const logger = require('../utils/logger');

class ProxyMiddleware {
  constructor() {
    this.proxies = new Map();
  }

  createProxy(serviceName) {
    // Return cached proxy if exists
    if (this.proxies.has(serviceName)) {
      return this.proxies.get(serviceName);
    }

    const proxy = createProxyMiddleware({
      target: 'http://localhost:3000', // Default fallback
      changeOrigin: true,
      pathRewrite: {
        [`^/api/v1/${serviceName.replace('-service', '')}`]: ''
      },
      router: async (req) => {
        try {
          const serviceUrl = await serviceDiscovery.getServiceUrl(serviceName);
          return serviceUrl;
        } catch (error) {
          logger.error(`Failed to get service URL for ${serviceName}:`, error);
          // Return fallback URL based on service name
          return this.getFallbackUrl(serviceName);
        }
      },
      onError: (err, req, res) => {
        logger.error(`Proxy error for ${serviceName}:`, {
          error: err.message,
          url: req.url,
          method: req.method
        });

        if (!res.headersSent) {
          res.status(503).json({
            status: 'error',
            message: 'Service temporarily unavailable',
            service: serviceName
          });
        }
      },
      onProxyReq: (proxyReq, req, res) => {
        // Add correlation ID for tracing
        proxyReq.setHeader('X-Correlation-ID', req.id);
        
        // Add user context
        if (req.user) {
          proxyReq.setHeader('X-User-ID', req.user.id);
          proxyReq.setHeader('X-User-Roles', JSON.stringify(req.user.roles));
        }

        // Log request
        logger.debug(`Proxying request to ${serviceName}:`, {
          method: req.method,
          url: req.url,
          correlationId: req.id
        });
      },
      onProxyRes: (proxyRes, req, res) => {
        // Add response headers
        proxyRes.headers['X-Gateway'] = 'EchoPay-Gateway';
        proxyRes.headers['X-Correlation-ID'] = req.id;

        // Log response
        logger.debug(`Response from ${serviceName}:`, {
          statusCode: proxyRes.statusCode,
          correlationId: req.id
        });
      },
      timeout: 30000, // 30 second timeout
      proxyTimeout: 30000,
      logLevel: 'warn'
    });

    // Cache the proxy
    this.proxies.set(serviceName, proxy);
    return proxy;
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

  // Health check proxy for service health endpoints
  createHealthProxy(serviceName) {
    return createProxyMiddleware({
      target: this.getFallbackUrl(serviceName),
      changeOrigin: true,
      pathRewrite: {
        [`^/health/${serviceName}`]: '/health'
      },
      timeout: 5000,
      onError: (err, req, res) => {
        if (!res.headersSent) {
          res.status(503).json({
            status: 'error',
            message: 'Service health check failed',
            service: serviceName
          });
        }
      }
    });
  }
}

module.exports = new ProxyMiddleware();