const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

class SecurityManager {
  constructor() {
    this.securityConfig = {
      jwtSecret: process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex'),
      encryptionKey: process.env.ENCRYPTION_KEY || crypto.randomBytes(32),
      saltRounds: 12,
      sessionTimeout: 3600000, // 1 hour
      maxLoginAttempts: 5,
      lockoutDuration: 900000, // 15 minutes
    };
    
    this.activeSessions = new Map();
    this.loginAttempts = new Map();
    this.securityMetrics = {
      totalRequests: 0,
      blockedRequests: 0,
      failedLogins: 0,
      successfulLogins: 0,
      encryptionOperations: 0,
      decryptionOperations: 0
    };
  }

  initialize() {
    logger.info('Security Manager initialized');
    this.startSecurityMonitoring();
  }

  startSecurityMonitoring() {
    // Monitor security metrics every minute
    setInterval(() => {
      this.logSecurityMetrics();
      this.cleanupExpiredSessions();
      this.resetLoginAttempts();
    }, 60000);
  }

  async hashPassword(password) {
    try {
      const hash = await bcrypt.hash(password, this.securityConfig.saltRounds);
      logger.audit('Password hashed successfully');
      return hash;
    } catch (error) {
      logger.error('Password hashing failed:', error);
      throw new Error('Password hashing failed');
    }
  }

  async verifyPassword(password, hash) {
    try {
      const isValid = await bcrypt.compare(password, hash);
      if (isValid) {
        logger.audit('Password verification successful');
      } else {
        logger.security('Password verification failed');
      }
      return isValid;
    } catch (error) {
      logger.error('Password verification error:', error);
      throw new Error('Password verification failed');
    }
  }

  generateToken(payload, expiresIn = '1h') {
    try {
      const token = jwt.sign(payload, this.securityConfig.jwtSecret, { expiresIn });
      logger.audit('JWT token generated', { userId: payload.userId });
      return token;
    } catch (error) {
      logger.error('Token generation failed:', error);
      throw new Error('Token generation failed');
    }
  }

  verifyToken(token) {
    try {
      const decoded = jwt.verify(token, this.securityConfig.jwtSecret);
      logger.audit('JWT token verified', { userId: decoded.userId });
      return decoded;
    } catch (error) {
      logger.security('Token verification failed:', error);
      throw new Error('Invalid token');
    }
  }

  encrypt(data) {
    try {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipher('aes-256-cbc', this.securityConfig.encryptionKey);
      let encrypted = cipher.update(data, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      this.securityMetrics.encryptionOperations++;
      logger.audit('Data encrypted successfully');
      
      return {
        iv: iv.toString('hex'),
        encryptedData: encrypted
      };
    } catch (error) {
      logger.error('Encryption failed:', error);
      throw new Error('Encryption failed');
    }
  }

  decrypt(encryptedData, iv) {
    try {
      const decipher = crypto.createDecipher('aes-256-cbc', this.securityConfig.encryptionKey);
      let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      this.securityMetrics.decryptionOperations++;
      logger.audit('Data decrypted successfully');
      
      return decrypted;
    } catch (error) {
      logger.error('Decryption failed:', error);
      throw new Error('Decryption failed');
    }
  }

  recordLoginAttempt(identifier, success) {
    const now = Date.now();
    
    if (!this.loginAttempts.has(identifier)) {
      this.loginAttempts.set(identifier, { attempts: 0, lastAttempt: now, lockedUntil: null });
    }
    
    const record = this.loginAttempts.get(identifier);
    
    if (success) {
      this.loginAttempts.delete(identifier);
      this.securityMetrics.successfulLogins++;
      logger.audit('Successful login', { identifier });
    } else {
      record.attempts++;
      record.lastAttempt = now;
      this.securityMetrics.failedLogins++;
      
      if (record.attempts >= this.securityConfig.maxLoginAttempts) {
        record.lockedUntil = now + this.securityConfig.lockoutDuration;
        logger.security('Account locked due to failed login attempts', { identifier, attempts: record.attempts });
      }
      
      logger.security('Failed login attempt', { identifier, attempts: record.attempts });
    }
  }

  isAccountLocked(identifier) {
    const record = this.loginAttempts.get(identifier);
    if (!record || !record.lockedUntil) return false;
    
    if (Date.now() > record.lockedUntil) {
      record.lockedUntil = null;
      record.attempts = 0;
      return false;
    }
    
    return true;
  }

  createSession(userId, metadata = {}) {
    const sessionId = crypto.randomUUID();
    const session = {
      userId,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      metadata,
      expiresAt: Date.now() + this.securityConfig.sessionTimeout
    };
    
    this.activeSessions.set(sessionId, session);
    logger.audit('Session created', { userId, sessionId });
    
    return sessionId;
  }

  validateSession(sessionId) {
    const session = this.activeSessions.get(sessionId);
    if (!session) return null;
    
    if (Date.now() > session.expiresAt) {
      this.activeSessions.delete(sessionId);
      logger.security('Session expired', { sessionId });
      return null;
    }
    
    session.lastActivity = Date.now();
    return session;
  }

  revokeSession(sessionId) {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      this.activeSessions.delete(sessionId);
      logger.audit('Session revoked', { sessionId, userId: session.userId });
    }
  }

  cleanupExpiredSessions() {
    const now = Date.now();
    let cleanedCount = 0;
    
    for (const [sessionId, session] of this.activeSessions.entries()) {
      if (now > session.expiresAt) {
        this.activeSessions.delete(sessionId);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      logger.info(`Cleaned up ${cleanedCount} expired sessions`);
    }
  }

  resetLoginAttempts() {
    const now = Date.now();
    let resetCount = 0;
    
    for (const [identifier, record] of this.loginAttempts.entries()) {
      if (record.lockedUntil && now > record.lockedUntil) {
        record.lockedUntil = null;
        record.attempts = 0;
        resetCount++;
      }
    }
    
    if (resetCount > 0) {
      logger.info(`Reset login attempts for ${resetCount} accounts`);
    }
  }

  getSecurityStatus() {
    return {
      activeSessions: this.activeSessions.size,
      lockedAccounts: Array.from(this.loginAttempts.values()).filter(r => r.lockedUntil && Date.now() < r.lockedUntil).length,
      metrics: { ...this.securityMetrics },
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    };
  }

  logSecurityMetrics() {
    logger.info('Security metrics', this.getSecurityStatus());
  }

  generateSecureRandom(length = 32) {
    return crypto.randomBytes(length).toString('hex');
  }

  validatePasswordStrength(password) {
    const minLength = 8;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);
    
    const issues = [];
    
    if (password.length < minLength) {
      issues.push(`Password must be at least ${minLength} characters long`);
    }
    if (!hasUpperCase) {
      issues.push('Password must contain at least one uppercase letter');
    }
    if (!hasLowerCase) {
      issues.push('Password must contain at least one lowercase letter');
    }
    if (!hasNumbers) {
      issues.push('Password must contain at least one number');
    }
    if (!hasSpecialChar) {
      issues.push('Password must contain at least one special character');
    }
    
    return {
      isValid: issues.length === 0,
      issues
    };
  }
}

module.exports = SecurityManager;