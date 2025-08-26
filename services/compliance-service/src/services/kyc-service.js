const axios = require('axios');
const crypto = require('crypto');
const winston = require('winston');
const KYCVerification = require('../models/kyc-verification');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'kyc-service' },
  transports: [new winston.transports.Console()]
});

/**
 * KYC Service
 * Handles Know Your Customer verification with privacy preservation
 */
class KYCService {
  constructor(config = {}) {
    this.providers = config.providers || {};
    this.defaultProvider = config.defaultProvider || 'mock';
    this.privacyKey = config.privacyKey || process.env.KYC_PRIVACY_KEY || 'default-key';
    this.verificationCache = new Map();
  }

  /**
   * Verify user identity through KYC process
   */
  async verifyIdentity(userId, documentData, options = {}) {
    try {
      logger.info('Starting KYC verification', { userId, provider: options.provider || this.defaultProvider });

      // Create verification record
      const verification = new KYCVerification({
        userId,
        providerId: options.provider || this.defaultProvider,
        documentTypes: documentData.documentTypes || []
      });

      // Validate input data
      const validation = verification.validate();
      if (!validation.isValid) {
        throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
      }

      // Generate privacy hash for sensitive data
      const sensitiveData = this.extractSensitiveData(documentData);
      verification.generatePrivacyHash(sensitiveData);

      // Perform verification with selected provider
      const providerResult = await this.performProviderVerification(
        verification.providerId,
        userId,
        documentData,
        options
      );

      // Update verification based on provider result
      verification.updateStatus(
        providerResult.verified ? 'verified' : 'rejected',
        providerResult.verificationLevel
      );
      verification.riskScore = providerResult.riskScore || 0;

      // Add any flags from provider
      if (providerResult.flags) {
        providerResult.flags.forEach(flag => {
          verification.addFlag(flag.type, flag.reason);
        });
      }

      // Cache verification result
      this.verificationCache.set(userId, verification);

      logger.info('KYC verification completed', {
        userId,
        verificationId: verification.verificationId,
        status: verification.status,
        verificationLevel: verification.verificationLevel
      });

      return verification;

    } catch (error) {
      logger.error('KYC verification failed', { userId, error: error.message });
      throw error;
    }
  }

  /**
   * Get verification status for user
   */
  async getVerificationStatus(userId) {
    try {
      // Check cache first
      if (this.verificationCache.has(userId)) {
        const verification = this.verificationCache.get(userId);
        
        // Check if expired
        if (verification.isExpired()) {
          verification.updateStatus('expired');
          this.verificationCache.set(userId, verification);
        }
        
        return verification.getSanitizedData();
      }

      // In a real implementation, this would query the database
      logger.info('No verification found for user', { userId });
      return null;

    } catch (error) {
      logger.error('Failed to get verification status', { userId, error: error.message });
      throw error;
    }
  }

  /**
   * Update verification status
   */
  async updateVerificationStatus(userId, status, reason = null) {
    try {
      const verification = this.verificationCache.get(userId);
      if (!verification) {
        throw new Error('Verification not found');
      }

      verification.updateStatus(status);
      if (reason) {
        verification.addFlag('STATUS_UPDATE', reason);
      }

      this.verificationCache.set(userId, verification);

      logger.info('Verification status updated', {
        userId,
        verificationId: verification.verificationId,
        status,
        reason
      });

      return verification.getSanitizedData();

    } catch (error) {
      logger.error('Failed to update verification status', { userId, error: error.message });
      throw error;
    }
  }

  /**
   * Perform verification with external provider
   */
  async performProviderVerification(providerId, userId, documentData, options) {
    switch (providerId) {
      case 'jumio':
        return await this.verifyWithJumio(userId, documentData, options);
      case 'onfido':
        return await this.verifyWithOnfido(userId, documentData, options);
      case 'mock':
        return await this.verifyWithMockProvider(userId, documentData, options);
      default:
        throw new Error(`Unknown KYC provider: ${providerId}`);
    }
  }

  /**
   * Mock provider for testing
   */
  async verifyWithMockProvider(userId, documentData, options) {
    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Mock verification logic
    const isValid = documentData.documentNumber && documentData.documentNumber.length > 5;
    const riskScore = Math.random() * 0.3; // Low risk for mock

    return {
      verified: isValid,
      verificationLevel: isValid ? 'basic' : 'none',
      riskScore,
      flags: isValid ? [] : [{ type: 'INVALID_DOCUMENT', reason: 'Document validation failed' }],
      providerId: 'mock',
      providerResponse: {
        confidence: isValid ? 0.95 : 0.1,
        checks: {
          documentAuthenticity: isValid,
          faceMatch: isValid,
          livenessCheck: isValid
        }
      }
    };
  }

  /**
   * Jumio provider integration with privacy preservation
   */
  async verifyWithJumio(userId, documentData, options) {
    try {
      const jumioConfig = this.providers.jumio;
      if (!jumioConfig) {
        throw new Error('Jumio provider not configured');
      }

      logger.info('Starting Jumio verification', { userId, provider: 'jumio' });

      // Privacy-preserving data preparation
      const sanitizedData = this.sanitizeDataForProvider(documentData, 'jumio');
      
      // Create verification session with Jumio
      const sessionData = {
        customerInternalReference: this.hashValue(userId), // Use hash instead of real userId
        userReference: this.hashValue(userId + Date.now()),
        workflowId: jumioConfig.workflowId || 'default',
        locale: options.locale || 'en',
        tokenLifetime: options.tokenLifetime || 3600
      };

      // In production, this would make actual API calls to Jumio
      if (process.env.NODE_ENV === 'production' && jumioConfig.apiKey && jumioConfig.apiSecret) {
        const jumioResponse = await this.callJumioAPI(sessionData, sanitizedData, jumioConfig);
        return this.processJumioResponse(jumioResponse, userId);
      } else {
        // Enhanced mock for development/testing
        logger.info('Using enhanced Jumio mock for development', { userId });
        return await this.verifyWithEnhancedMock(userId, documentData, options, 'jumio');
      }

    } catch (error) {
      logger.error('Jumio verification failed', { userId, error: error.message });
      throw error;
    }
  }

  /**
   * Onfido provider integration with privacy preservation
   */
  async verifyWithOnfido(userId, documentData, options) {
    try {
      const onfidoConfig = this.providers.onfido;
      if (!onfidoConfig) {
        throw new Error('Onfido provider not configured');
      }

      logger.info('Starting Onfido verification', { userId, provider: 'onfido' });

      // Privacy-preserving data preparation
      const sanitizedData = this.sanitizeDataForProvider(documentData, 'onfido');
      
      // Create applicant with Onfido
      const applicantData = {
        first_name: this.hashValue(documentData.fullName?.split(' ')[0] || 'Unknown'),
        last_name: this.hashValue(documentData.fullName?.split(' ').slice(1).join(' ') || 'Unknown'),
        email: options.email || `${this.hashValue(userId)}@privacy.echopay.com`,
        dob: documentData.dateOfBirth ? this.formatDateForProvider(documentData.dateOfBirth) : null,
        address: sanitizedData.address
      };

      // In production, this would make actual API calls to Onfido
      if (process.env.NODE_ENV === 'production' && onfidoConfig.apiKey) {
        const onfidoResponse = await this.callOnfidoAPI(applicantData, sanitizedData, onfidoConfig);
        return this.processOnfidoResponse(onfidoResponse, userId);
      } else {
        // Enhanced mock for development/testing
        logger.info('Using enhanced Onfido mock for development', { userId });
        return await this.verifyWithEnhancedMock(userId, documentData, options, 'onfido');
      }

    } catch (error) {
      logger.error('Onfido verification failed', { userId, error: error.message });
      throw error;
    }
  }

  /**
   * Extract sensitive data for privacy hashing
   */
  extractSensitiveData(documentData) {
    return {
      documentNumber: documentData.documentNumber,
      fullName: documentData.fullName,
      dateOfBirth: documentData.dateOfBirth,
      address: documentData.address
    };
  }

  /**
   * Encrypt sensitive data for storage
   */
  encryptSensitiveData(data) {
    // Use simple hash-based encryption for testing
    const hash = crypto.createHash('sha256');
    hash.update(JSON.stringify(data) + this.privacyKey);
    const encrypted = hash.digest('hex');
    
    return {
      encrypted,
      algorithm: 'sha256-hash'
    };
  }

  /**
   * Decrypt sensitive data (mock implementation for testing)
   */
  decryptSensitiveData(encryptedData) {
    if (typeof encryptedData === 'string') {
      // Legacy format - return as is for backward compatibility
      return JSON.parse(encryptedData);
    }
    
    // For testing purposes, return the original data
    // In real implementation, this would use proper decryption
    return {
      mockDecrypted: true,
      originalHash: encryptedData.encrypted
    };
  }

  /**
   * Check if user needs re-verification
   */
  needsReVerification(userId) {
    const verification = this.verificationCache.get(userId);
    if (!verification) {
      return true;
    }

    return verification.isExpired() || verification.status === 'rejected';
  }

  /**
   * Get verification statistics
   */
  getVerificationStats() {
    const stats = {
      total: this.verificationCache.size,
      verified: 0,
      pending: 0,
      rejected: 0,
      expired: 0
    };

    this.verificationCache.forEach(verification => {
      stats[verification.status]++;
    });

    return stats;
  }

  /**
   * Sanitize data for third-party providers (privacy preservation)
   */
  sanitizeDataForProvider(documentData, provider) {
    const sanitized = { ...documentData };
    
    // Hash sensitive identifiers
    if (sanitized.documentNumber) {
      sanitized.documentNumber = this.hashValue(sanitized.documentNumber);
    }
    
    // Minimize address data
    if (sanitized.address) {
      sanitized.address = {
        country: sanitized.address.country,
        postalCode: sanitized.address.postalCode,
        // Hash street address for privacy
        street: this.hashValue(sanitized.address.street || ''),
        city: sanitized.address.city
      };
    }
    
    // Provider-specific sanitization
    if (provider === 'jumio') {
      // Jumio-specific privacy measures
      delete sanitized.fullName; // Use hashed reference instead
    } else if (provider === 'onfido') {
      // Onfido-specific privacy measures
      sanitized.fullName = this.hashValue(sanitized.fullName || '');
    }
    
    return sanitized;
  }

  /**
   * Enhanced mock provider with realistic behavior
   */
  async verifyWithEnhancedMock(userId, documentData, options, provider) {
    // Simulate realistic processing delay
    const delay = Math.random() * 2000 + 1000; // 1-3 seconds
    await new Promise(resolve => setTimeout(resolve, delay));

    // Enhanced validation logic
    const validationScore = this.calculateDocumentValidationScore(documentData);
    const isValid = validationScore > 0.7;
    
    // Simulate provider-specific confidence levels
    const providerConfidence = provider === 'jumio' ? 
      Math.random() * 0.2 + 0.8 : // Jumio typically high confidence
      Math.random() * 0.3 + 0.7;  // Onfido variable confidence

    const riskScore = isValid ? Math.random() * 0.3 : Math.random() * 0.4 + 0.6;
    
    const flags = [];
    if (!isValid) {
      flags.push({ type: 'DOCUMENT_VALIDATION_FAILED', reason: 'Document validation failed' });
    }
    if (validationScore < 0.5) {
      flags.push({ type: 'LOW_QUALITY_DOCUMENT', reason: 'Document quality below threshold' });
    }
    if (documentData.documentType === 'drivers_license' && Math.random() < 0.1) {
      flags.push({ type: 'EXPIRED_DOCUMENT', reason: 'Document appears to be expired' });
    }

    return {
      verified: isValid,
      verificationLevel: isValid ? (validationScore > 0.9 ? 'enhanced' : 'basic') : 'none',
      riskScore,
      flags,
      providerId: provider,
      providerResponse: {
        confidence: providerConfidence,
        validationScore,
        checks: {
          documentAuthenticity: validationScore > 0.8,
          faceMatch: validationScore > 0.7 && options.skipBiometric !== true,
          livenessCheck: validationScore > 0.75 && options.skipBiometric !== true,
          dataExtraction: validationScore > 0.6
        },
        processingTime: delay
      }
    };
  }

  /**
   * Calculate document validation score based on data quality
   */
  calculateDocumentValidationScore(documentData) {
    let score = 0.5; // Base score
    
    // Document number validation
    if (documentData.documentNumber && documentData.documentNumber.length >= 6) {
      score += 0.2;
    }
    
    // Name validation
    if (documentData.fullName && documentData.fullName.split(' ').length >= 2) {
      score += 0.15;
    }
    
    // Date of birth validation
    if (documentData.dateOfBirth) {
      const age = (new Date() - new Date(documentData.dateOfBirth)) / (365.25 * 24 * 60 * 60 * 1000);
      if (age >= 18 && age <= 120) {
        score += 0.1;
      }
    }
    
    // Address validation
    if (documentData.address && documentData.address.country && documentData.address.postalCode) {
      score += 0.1;
    }
    
    // Document type validation
    if (['passport', 'drivers_license', 'national_id'].includes(documentData.documentType)) {
      score += 0.05;
    }
    
    return Math.min(score, 1.0);
  }

  /**
   * Hash value for privacy preservation
   */
  hashValue(value) {
    const hash = crypto.createHash('sha256');
    hash.update(value.toString() + this.privacyKey);
    return hash.digest('hex').substring(0, 16);
  }

  /**
   * Format date for provider APIs
   */
  formatDateForProvider(date) {
    if (typeof date === 'string') {
      return date;
    }
    return date.toISOString().split('T')[0];
  }

  /**
   * Call Jumio API (production implementation placeholder)
   */
  async callJumioAPI(sessionData, documentData, config) {
    try {
      if (process.env.NODE_ENV === 'production' && config.apiKey && config.apiSecret) {
        // Production Jumio API integration
        const authHeader = Buffer.from(`${config.apiKey}:${config.apiSecret}`).toString('base64');
        
        const response = await axios.post(`${config.baseUrl}/initiate`, sessionData, {
          headers: {
            'Authorization': `Basic ${authHeader}`,
            'Content-Type': 'application/json',
            'User-Agent': 'EchoPay-Compliance/1.0'
          },
          timeout: 30000
        });
        
        logger.info('Jumio API call successful', { 
          sessionId: response.data.sessionId,
          status: response.data.status 
        });
        
        return response.data;
      } else {
        // Development/testing mock response
        logger.info('Using Jumio mock for development environment');
        return { 
          status: 'APPROVED_VERIFIED', 
          confidence: 0.95,
          sessionId: `jumio_session_${Date.now()}`,
          checks: {
            documentAuthenticity: true,
            faceMatch: true,
            livenessCheck: true
          }
        };
      }
    } catch (error) {
      logger.error('Jumio API call failed', { error: error.message });
      throw new Error(`Jumio verification failed: ${error.message}`);
    }
  }

  /**
   * Process Jumio API response
   */
  processJumioResponse(response, userId) {
    const isVerified = response.status === 'APPROVED_VERIFIED';
    return {
      verified: isVerified,
      verificationLevel: isVerified ? 'enhanced' : 'none',
      riskScore: isVerified ? 0.1 : 0.8,
      flags: isVerified ? [] : [{ type: 'PROVIDER_REJECTION', reason: 'Jumio verification failed' }],
      providerId: 'jumio',
      providerResponse: response
    };
  }

  /**
   * Call Onfido API (production implementation placeholder)
   */
  async callOnfidoAPI(applicantData, documentData, config) {
    try {
      if (process.env.NODE_ENV === 'production' && config.apiKey) {
        // Production Onfido API integration
        const headers = {
          'Authorization': `Token token=${config.apiKey}`,
          'Content-Type': 'application/json',
          'User-Agent': 'EchoPay-Compliance/1.0'
        };
        
        // Create applicant
        const applicantResponse = await axios.post(`${config.baseUrl}/applicants`, applicantData, {
          headers,
          timeout: 30000
        });
        
        const applicantId = applicantResponse.data.id;
        
        // Create document check
        const checkData = {
          applicant_id: applicantId,
          report_names: ['document', 'facial_similarity_photo'],
          document_ids: [documentData.documentId] // Would be uploaded separately
        };
        
        const checkResponse = await axios.post(`${config.baseUrl}/checks`, checkData, {
          headers,
          timeout: 30000
        });
        
        logger.info('Onfido API call successful', { 
          applicantId,
          checkId: checkResponse.data.id,
          status: checkResponse.data.status 
        });
        
        return {
          result: checkResponse.data.result,
          confidence: 0.92,
          applicantId,
          checkId: checkResponse.data.id,
          reports: checkResponse.data.reports
        };
      } else {
        // Development/testing mock response
        logger.info('Using Onfido mock for development environment');
        return { 
          result: 'clear', 
          confidence: 0.92,
          applicantId: `onfido_applicant_${Date.now()}`,
          checkId: `onfido_check_${Date.now()}`,
          reports: [
            { name: 'document', result: 'clear' },
            { name: 'facial_similarity_photo', result: 'clear' }
          ]
        };
      }
    } catch (error) {
      logger.error('Onfido API call failed', { error: error.message });
      throw new Error(`Onfido verification failed: ${error.message}`);
    }
  }

  /**
   * Process Onfido API response
   */
  processOnfidoResponse(response, userId) {
    const isVerified = response.result === 'clear';
    return {
      verified: isVerified,
      verificationLevel: isVerified ? 'enhanced' : 'none',
      riskScore: isVerified ? 0.15 : 0.75,
      flags: isVerified ? [] : [{ type: 'PROVIDER_REJECTION', reason: 'Onfido verification failed' }],
      providerId: 'onfido',
      providerResponse: response
    };
  }
}

module.exports = KYCService;