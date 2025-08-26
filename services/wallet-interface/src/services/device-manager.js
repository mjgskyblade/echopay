const crypto = require('crypto');
const logger = require('../utils/logger');

class DeviceManager {
  constructor() {
    // In-memory storage for demo - in production, use Redis or database
    this.devices = new Map();
    this.userDevices = new Map();
    this.deviceSessions = new Map();
  }

  /**
   * Generate device fingerprint based on request headers and client info
   */
  generateDeviceFingerprint(req, clientInfo = {}) {
    const components = [
      req.get('User-Agent') || '',
      req.get('Accept-Language') || '',
      req.get('Accept-Encoding') || '',
      clientInfo.screenResolution || '',
      clientInfo.timezone || '',
      clientInfo.platform || '',
      clientInfo.webglRenderer || '',
      clientInfo.canvasFingerprint || ''
    ];

    const fingerprint = crypto
      .createHash('sha256')
      .update(components.join('|'))
      .digest('hex');

    return fingerprint;
  }

  /**
   * Register a new device for a user
   */
  async registerDevice(userId, deviceInfo, req) {
    const deviceId = crypto.randomUUID();
    const fingerprint = this.generateDeviceFingerprint(req, deviceInfo);
    
    const device = {
      deviceId,
      userId,
      fingerprint,
      deviceName: deviceInfo.deviceName || 'Unknown Device',
      deviceType: deviceInfo.deviceType || 'unknown', // mobile, web, desktop
      platform: deviceInfo.platform || req.get('User-Agent'),
      ipAddress: req.ip,
      location: deviceInfo.location || null,
      registeredAt: new Date(),
      lastSeenAt: new Date(),
      isActive: true,
      isTrusted: false, // Requires verification
      riskScore: 0.5 // Initial moderate risk
    };

    this.devices.set(deviceId, device);
    
    // Add to user's device list
    if (!this.userDevices.has(userId)) {
      this.userDevices.set(userId, new Set());
    }
    this.userDevices.get(userId).add(deviceId);

    logger.info('Device registered', {
      userId,
      deviceId,
      deviceType: device.deviceType,
      fingerprint: fingerprint.substring(0, 8)
    });

    return device;
  }

  /**
   * Verify device identity and update trust level
   */
  async verifyDevice(deviceId, verificationCode) {
    const device = this.devices.get(deviceId);
    if (!device) {
      throw new Error('Device not found');
    }

    // In production, verify against sent verification code
    device.isTrusted = true;
    device.riskScore = 0.1; // Low risk for verified devices
    device.verifiedAt = new Date();

    logger.info('Device verified', {
      userId: device.userId,
      deviceId,
      deviceType: device.deviceType
    });

    return device;
  }

  /**
   * Get all devices for a user
   */
  getUserDevices(userId) {
    const deviceIds = this.userDevices.get(userId) || new Set();
    const devices = [];
    
    for (const deviceId of deviceIds) {
      const device = this.devices.get(deviceId);
      if (device && device.isActive) {
        devices.push(device);
      }
    }

    return devices;
  }

  /**
   * Update device activity and detect suspicious patterns
   */
  async updateDeviceActivity(deviceId, req, location = null) {
    const device = this.devices.get(deviceId);
    if (!device) {
      return null;
    }

    const previousLocation = device.location;
    const previousIp = device.ipAddress;
    const currentTime = new Date();
    const timeSinceLastSeen = currentTime - device.lastSeenAt;

    // Update device info
    device.lastSeenAt = currentTime;
    device.ipAddress = req.ip;
    if (location) {
      device.location = location;
    }

    // Detect suspicious patterns
    const suspiciousPatterns = [];

    // Check for rapid location changes (impossible travel)
    if (previousLocation && location) {
      const distance = this.calculateDistance(previousLocation, location);
      const timeHours = timeSinceLastSeen / (1000 * 60 * 60);
      const maxPossibleSpeed = 1000; // km/h (commercial flight speed)
      
      if (distance > maxPossibleSpeed * timeHours && timeHours < 24) {
        suspiciousPatterns.push('impossible_travel');
        device.riskScore = Math.min(device.riskScore + 0.3, 1.0);
      }
    }

    // Check for IP address changes
    if (previousIp && previousIp !== req.ip) {
      suspiciousPatterns.push('ip_change');
      device.riskScore = Math.min(device.riskScore + 0.1, 1.0);
    }

    // Check for concurrent sessions from different locations
    const concurrentSessions = this.checkConcurrentSessions(device.userId);
    if (concurrentSessions.length > 1) {
      suspiciousPatterns.push('concurrent_sessions');
      device.riskScore = Math.min(device.riskScore + 0.2, 1.0);
    }

    if (suspiciousPatterns.length > 0) {
      logger.warn('Suspicious device activity detected', {
        userId: device.userId,
        deviceId,
        patterns: suspiciousPatterns,
        riskScore: device.riskScore
      });
    }

    return {
      device,
      suspiciousPatterns,
      riskScore: device.riskScore
    };
  }

  /**
   * Check for concurrent sessions from different devices/locations
   */
  checkConcurrentSessions(userId) {
    const userDevices = this.getUserDevices(userId);
    const activeSessions = [];
    const currentTime = new Date();
    const sessionTimeout = 30 * 60 * 1000; // 30 minutes

    for (const device of userDevices) {
      const timeSinceLastSeen = currentTime - device.lastSeenAt;
      if (timeSinceLastSeen < sessionTimeout) {
        activeSessions.push({
          deviceId: device.deviceId,
          deviceType: device.deviceType,
          location: device.location,
          ipAddress: device.ipAddress,
          lastSeenAt: device.lastSeenAt
        });
      }
    }

    return activeSessions;
  }

  /**
   * Calculate distance between two locations (Haversine formula)
   */
  calculateDistance(loc1, loc2) {
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.toRadians(loc2.lat - loc1.lat);
    const dLon = this.toRadians(loc2.lon - loc1.lon);
    
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(this.toRadians(loc1.lat)) * Math.cos(this.toRadians(loc2.lat)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  toRadians(degrees) {
    return degrees * (Math.PI / 180);
  }

  /**
   * Remove device from user account
   */
  async removeDevice(userId, deviceId) {
    const device = this.devices.get(deviceId);
    if (!device || device.userId !== userId) {
      throw new Error('Device not found or unauthorized');
    }

    device.isActive = false;
    device.removedAt = new Date();

    // Remove from user's device list
    if (this.userDevices.has(userId)) {
      this.userDevices.get(userId).delete(deviceId);
    }

    logger.info('Device removed', {
      userId,
      deviceId,
      deviceType: device.deviceType
    });

    return true;
  }

  /**
   * Get device fraud risk assessment
   */
  getDeviceRiskAssessment(deviceId) {
    const device = this.devices.get(deviceId);
    if (!device) {
      return { riskLevel: 'unknown', riskScore: 1.0 };
    }

    let riskLevel = 'low';
    if (device.riskScore > 0.7) {
      riskLevel = 'high';
    } else if (device.riskScore > 0.4) {
      riskLevel = 'medium';
    }

    return {
      riskLevel,
      riskScore: device.riskScore,
      isTrusted: device.isTrusted,
      factors: this.getRiskFactors(device)
    };
  }

  /**
   * Get risk factors for a device
   */
  getRiskFactors(device) {
    const factors = [];
    
    if (!device.isTrusted) {
      factors.push('unverified_device');
    }
    
    const daysSinceRegistration = (new Date() - device.registeredAt) / (1000 * 60 * 60 * 24);
    if (daysSinceRegistration < 1) {
      factors.push('new_device');
    }

    const hoursSinceLastSeen = (new Date() - device.lastSeenAt) / (1000 * 60 * 60);
    if (hoursSinceLastSeen > 24) {
      factors.push('inactive_device');
    }

    return factors;
  }
}

module.exports = DeviceManager;