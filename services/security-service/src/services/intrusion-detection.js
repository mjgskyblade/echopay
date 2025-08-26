const logger = require('../utils/logger');
const { RateLimiterRedis } = require('rate-limiter-flexible');

class IntrusionDetection {
  constructor() {
    this.threats = new Map();
    this.suspiciousIPs = new Set();
    this.blockedIPs = new Set();
    this.anomalyThresholds = {
      requestRate: 100, // requests per minute
      failedLogins: 5,
      suspiciousPatterns: 3,
      dataExfiltration: 1000000 // bytes per minute
    };
    
    this.detectionRules = [
      this.detectBruteForce.bind(this),
      this.detectSQLInjection.bind(this),
      this.detectXSS.bind(this),
      this.detectDDoS.bind(this),
      this.detectDataExfiltration.bind(this),
      this.detectUnauthorizedAccess.bind(this),
      this.detectAnomalousPatterns.bind(this)
    ];
    
    this.alertQueue = [];
    this.isMonitoring = false;
  }

  startMonitoring() {
    if (this.isMonitoring) return;
    
    this.isMonitoring = true;
    logger.info('Intrusion Detection System started');
    
    // Monitor threats every 30 seconds
    this.monitoringInterval = setInterval(() => {
      this.processAlerts();
      this.cleanupOldThreats();
      this.updateThreatIntelligence();
    }, 30000);
    
    // Real-time monitoring
    this.startRealTimeMonitoring();
  }

  stopMonitoring() {
    if (!this.isMonitoring) return;
    
    this.isMonitoring = false;
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
    logger.info('Intrusion Detection System stopped');
  }

  startRealTimeMonitoring() {
    // Monitor system resources
    setInterval(() => {
      this.monitorSystemResources();
    }, 5000);
    
    // Monitor network connections
    setInterval(() => {
      this.monitorNetworkConnections();
    }, 10000);
  }

  analyzeRequest(req) {
    const clientIP = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('User-Agent') || '';
    const requestData = {
      ip: clientIP,
      method: req.method,
      url: req.url,
      userAgent,
      timestamp: Date.now(),
      headers: req.headers,
      body: req.body
    };

    // Run all detection rules
    for (const rule of this.detectionRules) {
      try {
        const threat = rule(requestData);
        if (threat) {
          this.recordThreat(threat);
        }
      } catch (error) {
        logger.error('Detection rule error:', error);
      }
    }

    // Check if IP is blocked
    if (this.blockedIPs.has(clientIP)) {
      throw new Error('IP address is blocked due to security violations');
    }
  }

  detectBruteForce(requestData) {
    const { ip, url, timestamp } = requestData;
    
    if (url.includes('/login') || url.includes('/auth')) {
      const key = `brute_force_${ip}`;
      const attempts = this.getRecentAttempts(key, timestamp, 300000); // 5 minutes
      
      if (attempts.length > this.anomalyThresholds.failedLogins) {
        return {
          type: 'brute_force',
          severity: 'high',
          ip,
          description: `Brute force attack detected from ${ip}`,
          evidence: { attempts: attempts.length, timeWindow: '5 minutes' },
          timestamp
        };
      }
    }
    
    return null;
  }

  detectSQLInjection(requestData) {
    const { ip, url, body, timestamp } = requestData;
    const sqlPatterns = [
      /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER)\b)/i,
      /(\b(UNION|OR|AND)\b.*\b(SELECT|INSERT|UPDATE|DELETE)\b)/i,
      /(\'|\"|;|--|\*|\/\*|\*\/)/,
      /(\b(EXEC|EXECUTE|SP_|XP_)\b)/i
    ];

    const testString = `${url} ${JSON.stringify(body)}`;
    
    for (const pattern of sqlPatterns) {
      if (pattern.test(testString)) {
        return {
          type: 'sql_injection',
          severity: 'critical',
          ip,
          description: `SQL injection attempt detected from ${ip}`,
          evidence: { pattern: pattern.toString(), payload: testString.substring(0, 200) },
          timestamp
        };
      }
    }
    
    return null;
  }

  detectXSS(requestData) {
    const { ip, url, body, timestamp } = requestData;
    const xssPatterns = [
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      /javascript:/gi,
      /on\w+\s*=/gi,
      /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi
    ];

    const testString = `${url} ${JSON.stringify(body)}`;
    
    for (const pattern of xssPatterns) {
      if (pattern.test(testString)) {
        return {
          type: 'xss_attack',
          severity: 'high',
          ip,
          description: `XSS attack attempt detected from ${ip}`,
          evidence: { pattern: pattern.toString(), payload: testString.substring(0, 200) },
          timestamp
        };
      }
    }
    
    return null;
  }

  detectDDoS(requestData) {
    const { ip, timestamp } = requestData;
    const key = `ddos_${ip}`;
    const requests = this.getRecentAttempts(key, timestamp, 60000); // 1 minute
    
    if (requests.length > this.anomalyThresholds.requestRate) {
      return {
        type: 'ddos_attack',
        severity: 'critical',
        ip,
        description: `DDoS attack detected from ${ip}`,
        evidence: { requestCount: requests.length, timeWindow: '1 minute' },
        timestamp
      };
    }
    
    return null;
  }

  detectDataExfiltration(requestData) {
    const { ip, method, body, timestamp } = requestData;
    
    if (method === 'POST' && body) {
      const dataSize = JSON.stringify(body).length;
      const key = `data_exfil_${ip}`;
      const recentData = this.getRecentDataTransfer(key, timestamp, 60000); // 1 minute
      
      if (recentData + dataSize > this.anomalyThresholds.dataExfiltration) {
        return {
          type: 'data_exfiltration',
          severity: 'critical',
          ip,
          description: `Potential data exfiltration detected from ${ip}`,
          evidence: { dataSize: recentData + dataSize, timeWindow: '1 minute' },
          timestamp
        };
      }
    }
    
    return null;
  }

  detectUnauthorizedAccess(requestData) {
    const { ip, url, userAgent, timestamp } = requestData;
    
    // Check for admin panel access without proper authentication
    if (url.includes('/admin') || url.includes('/dashboard')) {
      const key = `unauth_access_${ip}`;
      const attempts = this.getRecentAttempts(key, timestamp, 600000); // 10 minutes
      
      if (attempts.length > 3) {
        return {
          type: 'unauthorized_access',
          severity: 'high',
          ip,
          description: `Unauthorized access attempts detected from ${ip}`,
          evidence: { attempts: attempts.length, targetUrl: url },
          timestamp
        };
      }
    }
    
    return null;
  }

  detectAnomalousPatterns(requestData) {
    const { ip, userAgent, timestamp } = requestData;
    
    // Detect suspicious user agents
    const suspiciousAgents = [
      'sqlmap', 'nikto', 'nmap', 'masscan', 'zap', 'burp',
      'python-requests', 'curl', 'wget'
    ];
    
    for (const agent of suspiciousAgents) {
      if (userAgent.toLowerCase().includes(agent)) {
        return {
          type: 'suspicious_agent',
          severity: 'medium',
          ip,
          description: `Suspicious user agent detected from ${ip}`,
          evidence: { userAgent },
          timestamp
        };
      }
    }
    
    return null;
  }

  recordThreat(threat) {
    const threatId = `${threat.type}_${threat.ip}_${threat.timestamp}`;
    this.threats.set(threatId, threat);
    
    logger.intrusion('Threat detected', threat);
    
    // Add to alert queue for processing
    this.alertQueue.push(threat);
    
    // Take immediate action for critical threats
    if (threat.severity === 'critical') {
      this.blockIP(threat.ip);
      this.sendImmediateAlert(threat);
    } else if (threat.severity === 'high') {
      this.suspiciousIPs.add(threat.ip);
    }
  }

  blockIP(ip) {
    this.blockedIPs.add(ip);
    logger.security(`IP ${ip} has been blocked`);
    
    // Schedule unblock after 1 hour for non-critical threats
    setTimeout(() => {
      this.unblockIP(ip);
    }, 3600000);
  }

  unblockIP(ip) {
    this.blockedIPs.delete(ip);
    this.suspiciousIPs.delete(ip);
    logger.info(`IP ${ip} has been unblocked`);
  }

  sendImmediateAlert(threat) {
    // In a real implementation, this would send alerts via email, SMS, Slack, etc.
    logger.error('IMMEDIATE SECURITY ALERT', threat);
    
    // Could integrate with external alerting systems
    this.notifySecurityTeam(threat);
  }

  notifySecurityTeam(threat) {
    // Placeholder for external notification system integration
    logger.info('Security team notified', { threatId: threat.type, ip: threat.ip });
  }

  processAlerts() {
    if (this.alertQueue.length === 0) return;
    
    const alerts = this.alertQueue.splice(0);
    logger.info(`Processing ${alerts.length} security alerts`);
    
    // Group alerts by type and IP
    const groupedAlerts = this.groupAlerts(alerts);
    
    // Send consolidated alerts
    for (const [key, alertGroup] of groupedAlerts.entries()) {
      this.sendConsolidatedAlert(alertGroup);
    }
  }

  groupAlerts(alerts) {
    const grouped = new Map();
    
    for (const alert of alerts) {
      const key = `${alert.type}_${alert.ip}`;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key).push(alert);
    }
    
    return grouped;
  }

  sendConsolidatedAlert(alertGroup) {
    const summary = {
      type: alertGroup[0].type,
      ip: alertGroup[0].ip,
      count: alertGroup.length,
      timeRange: {
        start: Math.min(...alertGroup.map(a => a.timestamp)),
        end: Math.max(...alertGroup.map(a => a.timestamp))
      },
      severity: this.getHighestSeverity(alertGroup)
    };
    
    logger.security('Consolidated security alert', summary);
  }

  getHighestSeverity(alerts) {
    const severityLevels = { low: 1, medium: 2, high: 3, critical: 4 };
    return alerts.reduce((highest, alert) => {
      return severityLevels[alert.severity] > severityLevels[highest] ? alert.severity : highest;
    }, 'low');
  }

  cleanupOldThreats() {
    const cutoff = Date.now() - 86400000; // 24 hours
    let cleanedCount = 0;
    
    for (const [threatId, threat] of this.threats.entries()) {
      if (threat.timestamp < cutoff) {
        this.threats.delete(threatId);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      logger.info(`Cleaned up ${cleanedCount} old threats`);
    }
  }

  updateThreatIntelligence() {
    // In a real implementation, this would update threat intelligence feeds
    logger.debug('Updating threat intelligence');
  }

  monitorSystemResources() {
    const usage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    // Alert on high resource usage (potential DoS)
    if (usage.heapUsed > 500 * 1024 * 1024) { // 500MB
      logger.security('High memory usage detected', { heapUsed: usage.heapUsed });
    }
  }

  monitorNetworkConnections() {
    // Monitor for unusual network patterns
    // This would integrate with system network monitoring tools
    logger.debug('Monitoring network connections');
  }

  getRecentAttempts(key, timestamp, timeWindow) {
    // In a real implementation, this would use Redis or similar
    // For now, simulate with in-memory tracking
    if (!this.attemptTracking) {
      this.attemptTracking = new Map();
    }
    
    if (!this.attemptTracking.has(key)) {
      this.attemptTracking.set(key, []);
    }
    
    const attempts = this.attemptTracking.get(key);
    attempts.push(timestamp);
    
    // Clean old attempts
    const cutoff = timestamp - timeWindow;
    const recentAttempts = attempts.filter(t => t > cutoff);
    this.attemptTracking.set(key, recentAttempts);
    
    return recentAttem