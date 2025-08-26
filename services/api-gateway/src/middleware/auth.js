const jwt = require('jsonwebtoken');
const redis = require('redis');
const logger = require('../utils/logger');

class AuthMiddleware {
  constructor() {
    this.redisClient = null;
    this.initRedis();
  }

  async initRedis() {
    try {
      this.redisClient = redis.createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379'
      });
      
      this.redisClient.on('error', (err) => {
        logger.error('Redis client error:', err);
      });
      
      await this.redisClient.connect();
      logger.info('Redis client connected for auth middleware');
    } catch (error) {
      logger.error('Failed to connect to Redis:', error);
    }
  }

  authenticate = async (req, res, next) => {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          status: 'error',
          message: 'Authorization token required'
        });
      }

      const token = authHeader.substring(7);
      
      // Check if token is blacklisted
      if (this.redisClient) {
        const isBlacklisted = await this.redisClient.get(`blacklist:${token}`);
        if (isBlacklisted) {
          return res.status(401).json({
            status: 'error',
            message: 'Token has been revoked'
          });
        }
      }

      // Verify JWT token
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-secret');
      
      // Add user info to request
      req.user = {
        id: decoded.sub,
        email: decoded.email,
        roles: decoded.roles || [],
        permissions: decoded.permissions || []
      };

      // Add request ID for tracing
      req.id = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      next();
    } catch (error) {
      logger.warn('Authentication failed:', {
        error: error.message,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });

      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
          status: 'error',
          message: 'Token has expired'
        });
      }

      if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({
          status: 'error',
          message: 'Invalid token'
        });
      }

      return res.status(401).json({
        status: 'error',
        message: 'Authentication failed'
      });
    }
  };

  requireRole = (requiredRole) => {
    return (req, res, next) => {
      if (!req.user || !req.user.roles.includes(requiredRole)) {
        return res.status(403).json({
          status: 'error',
          message: 'Insufficient permissions'
        });
      }
      next();
    };
  };

  requirePermission = (requiredPermission) => {
    return (req, res, next) => {
      if (!req.user || !req.user.permissions.includes(requiredPermission)) {
        return res.status(403).json({
          status: 'error',
          message: 'Insufficient permissions'
        });
      }
      next();
    };
  };
}

module.exports = new AuthMiddleware();