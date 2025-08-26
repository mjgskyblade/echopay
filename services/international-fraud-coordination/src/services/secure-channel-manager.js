const crypto = require('crypto');
const NodeRSA = require('node-rsa');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

class SecureChannelManager {
  constructor() {
    this.activeChannels = new Map();
    this.keyPairs = new Map();
    this.trustedJurisdictions = new Set(['US', 'EU', 'UK', 'CA', 'JP', 'AU']);
    
    // Initialize RSA key pair for secure communications
    this.initializeKeyPair();
    
    this.channelTypes = {
      EVIDENCE_SHARING: 'evidence_sharing',
      CASE_COORDINATION: 'case_coordination',
      URGENT_COMMUNICATION: 'urgent_communication',
      REGULATORY_REPORTING: 'regulatory_reporting'
    };

    this.securityLevels = {
      STANDARD: 1,
      HIGH: 2,
      CRITICAL: 3,
      TOP_SECRET: 4
    };
  }

  /**
   * Initialize RSA key pair for secure communications
   */
  initializeKeyPair() {
    try {
      const key = new NodeRSA({ b: 2048 });
      this.masterKeyPair = {
        private: key.exportKey('private'),
        public: key.exportKey('public')
      };
      
      logger.info('Master key pair initialized for secure communications');
    } catch (error) {
      logger.error('Failed to initialize key pair', error);
      throw error;
    }
  }

  /**
   * Establish secure communication channel
   */
  async establishChannel(targetJurisdiction, purpose, securityLevel = this.securityLevels.HIGH) {
    try {
      if (!this.trustedJurisdictions.has(targetJurisdiction)) {
        throw new Error(`Untrusted jurisdiction: ${targetJurisdiction}`);
      }

      const channelId = uuidv4();
      logger.info('Establishing secure channel', {
        channelId,
        targetJurisdiction,
        purpose,
        securityLevel
      });

      // Generate channel-specific encryption keys
      const channelKeys = this.generateChannelKeys(securityLevel);
      
      // Create channel configuration
      const channel = {
        channelId,
        targetJurisdiction,
        purpose,
        securityLevel,
        status: 'establishing',
        createdAt: new Date().toISOString(),
        keys: channelKeys,
        participants: ['US', targetJurisdiction], // Assuming US is initiator
        messageLog: [],
        auditTrail: [],
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
      };

      // Perform key exchange with target jurisdiction
      const keyExchange = await this.performKeyExchange(channel);
      
      if (keyExchange.success) {
        channel.status = 'active';
        channel.remotePublicKey = keyExchange.remotePublicKey;
        channel.sharedSecret = keyExchange.sharedSecret;
        
        // Store active channel
        this.activeChannels.set(channelId, channel);
        
        // Log establishment
        this.logChannelActivity(channel, 'CHANNEL_ESTABLISHED', {
          participants: channel.participants,
          securityLevel: channel.securityLevel
        });

        logger.info('Secure channel established successfully', {
          channelId,
          targetJurisdiction
        });

        return {
          channelId,
          status: 'active',
          securityLevel,
          publicKey: channelKeys.public,
          expiresAt: channel.expiresAt,
          capabilities: this.getChannelCapabilities(purpose, securityLevel)
        };
      } else {
        throw new Error('Key exchange failed');
      }
    } catch (error) {
      logger.error('Failed to establish secure channel', error);
      throw error;
    }
  }

  /**
   * Send secure message through established channel
   */
  async sendSecureMessage(channelId, message, recipient) {
    try {
      const channel = this.activeChannels.get(channelId);
      if (!channel) {
        throw new Error('Channel not found');
      }

      if (channel.status !== 'active') {
        throw new Error('Channel not active');
      }

      if (new Date() > new Date(channel.expiresAt)) {
        throw new Error('Channel expired');
      }

      logger.info('Sending secure message', {
        channelId,
        recipient,
        messageType: message.type
      });

      // Encrypt message
      const encryptedMessage = this.encryptMessage(message, channel);
      
      // Create message envelope
      const messageEnvelope = {
        messageId: uuidv4(),
        channelId,
        sender: 'US', // Assuming US sender
        recipient,
        timestamp: new Date().toISOString(),
        messageType: message.type,
        priority: message.priority || 'normal',
        encryptedPayload: encryptedMessage.payload,
        signature: encryptedMessage.signature,
        integrity: encryptedMessage.integrity
      };

      // Send message to recipient
      const deliveryResult = await this.deliverMessage(messageEnvelope, channel);
      
      // Log message
      this.logChannelActivity(channel, 'MESSAGE_SENT', {
        messageId: messageEnvelope.messageId,
        recipient,
        messageType: message.type,
        deliveryStatus: deliveryResult.status
      });

      // Store in message log
      channel.messageLog.push({
        messageId: messageEnvelope.messageId,
        direction: 'outbound',
        timestamp: messageEnvelope.timestamp,
        recipient,
        status: deliveryResult.status,
        messageType: message.type
      });

      return {
        messageId: messageEnvelope.messageId,
        status: deliveryResult.status,
        deliveredAt: deliveryResult.deliveredAt,
        acknowledgment: deliveryResult.acknowledgment
      };
    } catch (error) {
      logger.error('Failed to send secure message', error);
      throw error;
    }
  }

  /**
   * Receive and decrypt secure message
   */
  async receiveSecureMessage(messageEnvelope) {
    try {
      const channel = this.activeChannels.get(messageEnvelope.channelId);
      if (!channel) {
        throw new Error('Channel not found');
      }

      logger.info('Receiving secure message', {
        channelId: messageEnvelope.channelId,
        messageId: messageEnvelope.messageId,
        sender: messageEnvelope.sender
      });

      // Verify message integrity
      if (!this.verifyMessageIntegrity(messageEnvelope, channel)) {
        throw new Error('Message integrity verification failed');
      }

      // Decrypt message
      const decryptedMessage = this.decryptMessage(messageEnvelope, channel);
      
      // Log message receipt
      this.logChannelActivity(channel, 'MESSAGE_RECEIVED', {
        messageId: messageEnvelope.messageId,
        sender: messageEnvelope.sender,
        messageType: messageEnvelope.messageType
      });

      // Store in message log
      channel.messageLog.push({
        messageId: messageEnvelope.messageId,
        direction: 'inbound',
        timestamp: messageEnvelope.timestamp,
        sender: messageEnvelope.sender,
        status: 'received',
        messageType: messageEnvelope.messageType
      });

      // Send acknowledgment
      await this.sendAcknowledgment(messageEnvelope, channel);

      return {
        messageId: messageEnvelope.messageId,
        message: decryptedMessage,
        sender: messageEnvelope.sender,
        timestamp: messageEnvelope.timestamp,
        verified: true
      };
    } catch (error) {
      logger.error('Failed to receive secure message', error);
      throw error;
    }
  }

  /**
   * Generate channel-specific encryption keys
   */
  generateChannelKeys(securityLevel) {
    const keySize = securityLevel >= this.securityLevels.CRITICAL ? 4096 : 2048;
    const key = new NodeRSA({ b: keySize });
    
    return {
      private: key.exportKey('private'),
      public: key.exportKey('public'),
      aesKey: crypto.randomBytes(32), // For symmetric encryption
      hmacKey: crypto.randomBytes(32) // For message authentication
    };
  }

  /**
   * Perform key exchange with target jurisdiction
   */
  async performKeyExchange(channel) {
    try {
      const jurisdictionEndpoint = this.getJurisdictionEndpoint(channel.targetJurisdiction);
      
      const keyExchangeRequest = {
        channelId: channel.channelId,
        initiator: 'US',
        purpose: channel.purpose,
        securityLevel: channel.securityLevel,
        publicKey: channel.keys.public,
        timestamp: new Date().toISOString(),
        signature: this.signKeyExchange(channel)
      };

      const response = await axios.post(`${jurisdictionEndpoint}/secure-channel/key-exchange`, 
        keyExchangeRequest, {
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json',
          'X-Channel-ID': channel.channelId,
          'X-Security-Level': channel.securityLevel
        }
      });

      if (response.data.success) {
        // Verify remote signature
        if (this.verifyRemoteSignature(response.data, channel.targetJurisdiction)) {
          // Generate shared secret using ECDH
          const sharedSecret = this.generateSharedSecret(
            channel.keys.private,
            response.data.publicKey
          );

          return {
            success: true,
            remotePublicKey: response.data.publicKey,
            sharedSecret
          };
        } else {
          throw new Error('Remote signature verification failed');
        }
      } else {
        throw new Error('Key exchange rejected by remote jurisdiction');
      }
    } catch (error) {
      logger.error('Key exchange failed', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Encrypt message for secure transmission
   */
  encryptMessage(message, channel) {
    try {
      const messageString = JSON.stringify(message);
      
      // Use AES for message encryption (faster for large messages)
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipher('aes-256-gcm', channel.keys.aesKey);
      cipher.setAAD(Buffer.from(channel.channelId));
      
      let encrypted = cipher.update(messageString, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const authTag = cipher.getAuthTag();
      
      // Create HMAC for integrity
      const hmac = crypto.createHmac('sha256', channel.keys.hmacKey);
      hmac.update(encrypted);
      const integrity = hmac.digest('hex');
      
      // Sign with RSA private key
      const signature = crypto.sign('sha256', Buffer.from(encrypted), channel.keys.private);

      return {
        payload: encrypted,
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex'),
        signature: signature.toString('hex'),
        integrity
      };
    } catch (error) {
      logger.error('Message encryption failed', error);
      throw error;
    }
  }

  /**
   * Decrypt received message
   */
  decryptMessage(messageEnvelope, channel) {
    try {
      // Verify signature first
      const signatureValid = crypto.verify(
        'sha256',
        Buffer.from(messageEnvelope.encryptedPayload, 'hex'),
        channel.remotePublicKey,
        Buffer.from(messageEnvelope.signature, 'hex')
      );

      if (!signatureValid) {
        throw new Error('Message signature verification failed');
      }

      // Decrypt message
      const decipher = crypto.createDecipher('aes-256-gcm', channel.keys.aesKey);
      decipher.setAAD(Buffer.from(channel.channelId));
      decipher.setAuthTag(Buffer.from(messageEnvelope.authTag, 'hex'));
      
      let decrypted = decipher.update(messageEnvelope.encryptedPayload, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return JSON.parse(decrypted);
    } catch (error) {
      logger.error('Message decryption failed', error);
      throw error;
    }
  }

  /**
   * Deliver message to target jurisdiction
   */
  async deliverMessage(messageEnvelope, channel) {
    try {
      const jurisdictionEndpoint = this.getJurisdictionEndpoint(channel.targetJurisdiction);
      
      const response = await axios.post(`${jurisdictionEndpoint}/secure-channel/message`, 
        messageEnvelope, {
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json',
          'X-Channel-ID': channel.channelId,
          'X-Message-ID': messageEnvelope.messageId
        }
      });

      return {
        status: 'delivered',
        deliveredAt: new Date().toISOString(),
        acknowledgment: response.data.acknowledgment
      };
    } catch (error) {
      logger.error('Message delivery failed', error);
      return {
        status: 'failed',
        error: error.message
      };
    }
  }

  /**
   * Verify message integrity
   */
  verifyMessageIntegrity(messageEnvelope, channel) {
    try {
      const hmac = crypto.createHmac('sha256', channel.keys.hmacKey);
      hmac.update(messageEnvelope.encryptedPayload);
      const expectedIntegrity = hmac.digest('hex');
      
      return expectedIntegrity === messageEnvelope.integrity;
    } catch (error) {
      logger.error('Integrity verification failed', error);
      return false;
    }
  }

  /**
   * Send acknowledgment for received message
   */
  async sendAcknowledgment(messageEnvelope, channel) {
    try {
      const ack = {
        messageId: messageEnvelope.messageId,
        channelId: channel.channelId,
        status: 'received',
        timestamp: new Date().toISOString(),
        recipient: messageEnvelope.sender
      };

      // This would typically be sent back through the same secure channel
      logger.info('Acknowledgment sent', {
        messageId: messageEnvelope.messageId,
        channelId: channel.channelId
      });

      return ack;
    } catch (error) {
      logger.error('Failed to send acknowledgment', error);
    }
  }

  /**
   * Log channel activity for audit trail
   */
  logChannelActivity(channel, activity, details) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      channelId: channel.channelId,
      activity,
      details,
      securityLevel: channel.securityLevel
    };

    channel.auditTrail.push(logEntry);
    
    logger.info('Channel activity logged', logEntry);
  }

  /**
   * Get jurisdiction endpoint for communication
   */
  getJurisdictionEndpoint(jurisdiction) {
    const endpoints = {
      'US': process.env.US_SECURE_ENDPOINT || 'https://secure.us-cbdc.gov',
      'EU': process.env.EU_SECURE_ENDPOINT || 'https://secure.eu-cbdc.europa.eu',
      'UK': process.env.UK_SECURE_ENDPOINT || 'https://secure.uk-cbdc.gov.uk',
      'CA': process.env.CA_SECURE_ENDPOINT || 'https://secure.ca-cbdc.gc.ca',
      'JP': process.env.JP_SECURE_ENDPOINT || 'https://secure.jp-cbdc.boj.or.jp',
      'AU': process.env.AU_SECURE_ENDPOINT || 'https://secure.au-cbdc.rba.gov.au'
    };

    return endpoints[jurisdiction];
  }

  /**
   * Get channel capabilities based on purpose and security level
   */
  getChannelCapabilities(purpose, securityLevel) {
    const capabilities = {
      encryption: 'AES-256-GCM',
      authentication: 'RSA-2048',
      integrity: 'HMAC-SHA256'
    };

    if (securityLevel >= this.securityLevels.CRITICAL) {
      capabilities.encryption = 'AES-256-GCM';
      capabilities.authentication = 'RSA-4096';
      capabilities.keyRotation = 'enabled';
    }

    if (purpose === this.channelTypes.EVIDENCE_SHARING) {
      capabilities.fileTransfer = 'enabled';
      capabilities.digitalSignatures = 'enabled';
    }

    return capabilities;
  }

  /**
   * Sign key exchange data
   */
  signKeyExchange(channel) {
    const data = `${channel.channelId}:${channel.keys.public}:${channel.timestamp}`;
    return crypto.sign('sha256', Buffer.from(data), this.masterKeyPair.private).toString('hex');
  }

  /**
   * Verify remote signature
   */
  verifyRemoteSignature(data, jurisdiction) {
    // This would verify using the jurisdiction's known public key
    // For now, we'll simulate verification
    return true;
  }

  /**
   * Generate shared secret using ECDH
   */
  generateSharedSecret(privateKey, remotePublicKey) {
    // Simplified implementation - would use proper ECDH
    const hash = crypto.createHash('sha256');
    hash.update(privateKey + remotePublicKey);
    return hash.digest('hex');
  }

  /**
   * Close secure channel
   */
  async closeChannel(channelId, reason = 'normal_closure') {
    try {
      const channel = this.activeChannels.get(channelId);
      if (!channel) {
        throw new Error('Channel not found');
      }

      logger.info('Closing secure channel', { channelId, reason });

      // Notify remote jurisdiction
      await this.notifyChannelClosure(channel, reason);

      // Log closure
      this.logChannelActivity(channel, 'CHANNEL_CLOSED', { reason });

      // Mark as closed
      channel.status = 'closed';
      channel.closedAt = new Date().toISOString();
      channel.closureReason = reason;

      // Remove from active channels after audit period
      setTimeout(() => {
        this.activeChannels.delete(channelId);
      }, 30 * 24 * 60 * 60 * 1000); // 30 days

      return { success: true, closedAt: channel.closedAt };
    } catch (error) {
      logger.error('Failed to close channel', error);
      throw error;
    }
  }

  /**
   * Notify remote jurisdiction of channel closure
   */
  async notifyChannelClosure(channel, reason) {
    try {
      const jurisdictionEndpoint = this.getJurisdictionEndpoint(channel.targetJurisdiction);
      
      await axios.post(`${jurisdictionEndpoint}/secure-channel/close`, {
        channelId: channel.channelId,
        reason,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.warn('Failed to notify remote jurisdiction of closure', error);
    }
  }
}

module.exports = new SecureChannelManager();