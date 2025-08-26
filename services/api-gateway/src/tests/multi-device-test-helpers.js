const crypto = require('crypto');
const { expect } = require('chai');

/**
 * Test Helper Functions for Multi-Device and Cross-Wallet Testing
 */

class MultiDeviceTestHelpers {
  constructor() {
    this.testData = {
      users: new Map(),
      devices: new Map(),
      wallets: new Map(),
      sessions: new Map(),
      transactions: []
    };
  }

  /**
   * Generate realistic device fingerprint
   */
  generateDeviceFingerprint(deviceType = 'mobile', os = 'iOS') {
    const fingerprints = {
      mobile: {
        iOS: {
          userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)',
          screenResolution: '390x844',
          timezone: 'America/New_York',
          language: 'en-US',
          platform: 'iPhone',
          hardwareConcurrency: 6,
          deviceMemory: 8,
          colorDepth: 24,
          pixelRatio: 3,
          touchSupport: true,
          plugins: ['WebKit built-in PDF'],
          fonts: ['SF Pro Display', 'SF Pro Text', 'Helvetica Neue'],
          canvas: this.generateCanvasFingerprint(),
          webgl: this.generateWebGLFingerprint(),
          audio: this.generateAudioFingerprint()
        },
        Android: {
          userAgent: 'Mozilla/5.0 (Linux; Android 12; SM-G991B)',
          screenResolution: '360x800',
          timezone: 'America/New_York',
          language: 'en-US',
          platform: 'Linux armv8l',
          hardwareConcurrency: 8,
          deviceMemory: 6,
          colorDepth: 24,
          pixelRatio: 2.75,
          touchSupport: true,
          plugins: ['Chrome PDF Plugin'],
          fonts: ['Roboto', 'Noto Sans', 'Arial'],
          canvas: this.generateCanvasFingerprint(),
          webgl: this.generateWebGLFingerprint(),
          audio: this.generateAudioFingerprint()
        }
      },
      web: {
        macOS: {
          userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
          screenResolution: '1920x1080',
          timezone: 'America/New_York',
          language: 'en-US',
          platform: 'MacIntel',
          hardwareConcurrency: 8,
          deviceMemory: 16,
          colorDepth: 24,
          pixelRatio: 2,
          touchSupport: false,
          plugins: ['Chrome PDF Plugin', 'Chrome PDF Viewer'],
          fonts: ['Arial', 'Helvetica', 'Times', 'Courier', 'SF Pro Display'],
          canvas: this.generateCanvasFingerprint(),
          webgl: this.generateWebGLFingerprint(),
          audio: this.generateAudioFingerprint()
        },
        Windows: {
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          screenResolution: '1920x1080',
          timezone: 'America/New_York',
          language: 'en-US',
          platform: 'Win32',
          hardwareConcurrency: 8,
          deviceMemory: 16,
          colorDepth: 24,
          pixelRatio: 1,
          touchSupport: false,
          plugins: ['Chrome PDF Plugin', 'Chrome PDF Viewer'],
          fonts: ['Arial', 'Helvetica', 'Times', 'Courier', 'Segoe UI'],
          canvas: this.generateCanvasFingerprint(),
          webgl: this.generateWebGLFingerprint(),
          audio: this.generateAudioFingerprint()
        }
      }
    };

    return fingerprints[deviceType][os] || fingerprints.mobile.iOS;
  }

  /**
   * Generate canvas fingerprint hash
   */
  generateCanvasFingerprint() {
    const canvasData = `canvas_${Math.random()}_${Date.now()}`;
    return crypto.createHash('sha256').update(canvasData).digest('hex').substring(0, 16);
  }

  /**
   * Generate WebGL fingerprint hash
   */
  generateWebGLFingerprint() {
    const webglData = `webgl_${Math.random()}_${Date.now()}`;
    return crypto.createHash('sha256').update(webglData).digest('hex').substring(0, 16);
  }

  /**
   * Generate audio fingerprint hash
   */
  generateAudioFingerprint() {
    const audioData = `audio_${Math.random()}_${Date.now()}`;
    return crypto.createHash('sha256').update(audioData).digest('hex').substring(0, 16);
  }

  /**
   * Create test user with realistic profile
   */
  createTestUser(userType = 'legitimate') {
    const userId = `test_user_${crypto.randomUUID()}`;
    const profiles = {
      legitimate: {
        accountAge: '2_years',
        verificationLevel: 'full',
        transactionHistory: 'extensive',
        riskScore: 0.1,
        trustScore: 0.9,
        deviceCount: 3,
        averageTransactionAmount: 150.00,
        monthlyTransactionCount: 45
      },
      suspicious: {
        accountAge: '1_week',
        verificationLevel: 'minimal',
        transactionHistory: 'limited',
        riskScore: 0.6,
        trustScore: 0.3,
        deviceCount: 1,
        averageTransactionAmount: 5000.00,
        monthlyTransactionCount: 5
      },
      compromised: {
        accountAge: '1_year',
        verificationLevel: 'full',
        transactionHistory: 'extensive',
        riskScore: 0.8,
        trustScore: 0.2,
        deviceCount: 5, // Unusual number of devices
        averageTransactionAmount: 200.00,
        monthlyTransactionCount: 60,
        recentSecurityIncidents: true
      }
    };

    const user = {
      id: userId,
      type: userType,
      profile: profiles[userType],
      devices: [],
      wallets: [],
      sessions: [],
      createdAt: new Date()
    };

    this.testData.users.set(userId, user);
    return user;
  }

  /**
   * Create test device for user
   */
  createTestDevice(userId, deviceType = 'mobile', os = 'iOS', trusted = true) {
    const deviceId = `test_device_${crypto.randomUUID()}`;
    const device = {
      id: deviceId,
      userId,
      type: deviceType,
      os,
      trusted,
      fingerprint: this.generateDeviceFingerprint(deviceType, os),
      registeredAt: new Date(),
      lastUsed: new Date(),
      riskScore: trusted ? 0.1 : 0.7,
      compromised: false
    };

    this.testData.devices.set(deviceId, device);
    
    const user = this.testData.users.get(userId);
    if (user) {
      user.devices.push(deviceId);
    }

    return device;
  }

  /**
   * Create test wallet for user
   */
  createTestWallet(userId, walletType = 'primary') {
    const walletId = `test_wallet_${crypto.randomUUID()}`;
    const wallet = {
      id: walletId,
      userId,
      type: walletType,
      balance: Math.random() * 10000,
      currency: 'USD-CBDC',
      status: 'active',
      createdAt: new Date(),
      transactionCount: Math.floor(Math.random() * 100)
    };

    this.testData.wallets.set(walletId, wallet);
    
    const user = this.testData.users.get(userId);
    if (user) {
      user.wallets.push(walletId);
    }

    return wallet;
  }

  /**
   * Generate legitimate user behavior pattern
   */
  generateLegitimateUserBehavior(userId, deviceId, duration = '1_day') {
    const behaviors = [];
    const startTime = new Date();
    
    // Morning routine
    behaviors.push({
      time: new Date(startTime.getTime() + 8 * 60 * 60 * 1000), // 8 AM
      action: 'check_balance',
      location: { lat: 40.7128, lng: -74.0060 }, // Home
      riskScore: 0.1
    });

    behaviors.push({
      time: new Date(startTime.getTime() + 8.5 * 60 * 60 * 1000), // 8:30 AM
      action: 'coffee_purchase',
      amount: 5.50,
      location: { lat: 40.7505, lng: -73.9934 }, // Coffee shop
      riskScore: 0.1
    });

    // Work day transactions
    behaviors.push({
      time: new Date(startTime.getTime() + 12 * 60 * 60 * 1000), // 12 PM
      action: 'lunch_purchase',
      amount: 15.75,
      location: { lat: 40.7589, lng: -73.9851 }, // Work area
      riskScore: 0.1
    });

    // Evening transactions
    behaviors.push({
      time: new Date(startTime.getTime() + 18 * 60 * 60 * 1000), // 6 PM
      action: 'grocery_purchase',
      amount: 85.30,
      location: { lat: 40.7128, lng: -74.0060 }, // Near home
      riskScore: 0.1
    });

    behaviors.push({
      time: new Date(startTime.getTime() + 20 * 60 * 60 * 1000), // 8 PM
      action: 'bill_payment',
      amount: 150.00,
      location: { lat: 40.7128, lng: -74.0060 }, // Home
      riskScore: 0.1
    });

    return behaviors.map(behavior => ({
      userId,
      deviceId,
      ...behavior
    }));
  }

  /**
   * Generate fraudulent user behavior pattern
   */
  generateFraudulentUserBehavior(userId, deviceId) {
    const behaviors = [];
    const startTime = new Date();

    // Rapid account changes
    behaviors.push({
      time: startTime,
      action: 'password_change',
      location: { lat: 55.7558, lng: 37.6176 }, // Moscow
      riskScore: 0.8
    });

    behaviors.push({
      time: new Date(startTime.getTime() + 2 * 60 * 1000), // 2 minutes later
      action: 'email_change',
      location: { lat: 55.7558, lng: 37.6176 },
      riskScore: 0.9
    });

    // Large transactions
    behaviors.push({
      time: new Date(startTime.getTime() + 5 * 60 * 1000), // 5 minutes later
      action: 'large_transaction',
      amount: 10000.00,
      location: { lat: 55.7558, lng: 37.6176 },
      riskScore: 0.95
    });

    // Multiple rapid transactions
    for (let i = 0; i < 10; i++) {
      behaviors.push({
        time: new Date(startTime.getTime() + (10 + i) * 60 * 1000),
        action: 'rapid_transaction',
        amount: 500.00,
        location: { lat: 55.7558, lng: 37.6176 },
        riskScore: 0.9
      });
    }

    return behaviors.map(behavior => ({
      userId,
      deviceId,
      ...behavior
    }));
  }

  /**
   * Generate money laundering transaction pattern
   */
  generateMoneyLaunderingPattern(userId, initialAmount = 100000) {
    const pattern = [];
    let currentAmount = initialAmount;
    const wallets = [];

    // Generate intermediate wallets
    for (let i = 0; i < 10; i++) {
      wallets.push(`wallet_intermediate_${i}`);
    }

    // Placement phase
    pattern.push({
      phase: 'placement',
      from: 'wallet_source_cash',
      to: wallets[0],
      amount: currentAmount,
      description: 'cash_deposit'
    });

    // Layering phase
    for (let i = 0; i < 8; i++) {
      currentAmount *= 0.95; // 5% fee each transfer
      pattern.push({
        phase: 'layering',
        from: wallets[i],
        to: wallets[i + 1],
        amount: currentAmount,
        description: `business_payment_${i}`
      });
    }

    // Integration phase
    pattern.push({
      phase: 'integration',
      from: wallets[8],
      to: 'wallet_final_destination',
      amount: currentAmount,
      description: 'investment_return'
    });

    return pattern.map((transaction, index) => ({
      userId,
      step: index + 1,
      ...transaction,
      timestamp: new Date(Date.now() + index * 5 * 60 * 1000) // 5 minutes apart
    }));
  }

  /**
   * Generate structuring (smurfing) pattern
   */
  generateStructuringPattern(userId, totalAmount = 100000, threshold = 10000) {
    const pattern = [];
    const transactionAmount = threshold - 100; // Just below threshold
    const transactionCount = Math.ceil(totalAmount / transactionAmount);

    for (let i = 0; i < transactionCount; i++) {
      const amount = Math.min(transactionAmount, totalAmount - (i * transactionAmount));
      pattern.push({
        userId,
        step: i + 1,
        from: 'wallet_structuring_source',
        to: `wallet_structuring_dest_${i}`,
        amount,
        description: 'business_payment',
        timestamp: new Date(Date.now() + i * 10 * 60 * 1000) // 10 minutes apart
      });
    }

    return pattern;
  }

  /**
   * Simulate device compromise indicators
   */
  generateCompromiseIndicators(deviceId, compromiseType = 'malware') {
    const indicators = {
      malware: {
        unexpectedProcesses: ['suspicious_process.exe', 'crypto_miner.exe'],
        networkConnections: ['malicious-server.com:443', '192.168.1.100:8080'],
        fileSystemChanges: ['/system/modified_file', '/usr/bin/backdoor'],
        behaviorChanges: {
          unusualApiCalls: true,
          abnormalMemoryUsage: true,
          suspiciousNetworkTraffic: true,
          unexpectedDataTransfers: true
        },
        browserAnomalies: {
          unexpectedExtensions: ['malicious_extension', 'crypto_stealer'],
          modifiedUserAgent: true,
          injectedScripts: true,
          cookieTheft: true
        }
      },
      rooted: {
        systemModifications: {
          bootloaderUnlocked: true,
          rootAccess: true,
          debuggingEnabled: true,
          unknownSources: true
        },
        suspiciousApps: ['superuser_app', 'root_manager', 'xposed_framework'],
        securityBypass: {
          certificatePinningBypass: true,
          sslKillSwitch: true,
          frida: true
        }
      },
      hijacked: {
        sessionAnomalies: {
          locationJumping: true,
          fingerprintMismatch: true,
          unusualUserAgent: true,
          suspiciousIPAddress: true
        },
        behaviorChanges: {
          typingPatternChange: true,
          mouseMovementChange: true,
          navigationPatternChange: true
        }
      }
    };

    return {
      deviceId,
      compromiseType,
      indicators: indicators[compromiseType],
      detectedAt: new Date(),
      severity: 'high',
      confidence: 0.9
    };
  }

  /**
   * Calculate travel time between two locations
   */
  calculateTravelTime(location1, location2) {
    const R = 6371; // Earth's radius in km
    const dLat = (location2.lat - location1.lat) * Math.PI / 180;
    const dLon = (location2.lng - location1.lng) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(location1.lat * Math.PI / 180) * Math.cos(location2.lat * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c; // Distance in km

    // Assume average travel speed of 800 km/h (commercial flight)
    const travelTimeHours = distance / 800;
    return {
      distance,
      travelTimeHours,
      travelTimeMinutes: travelTimeHours * 60
    };
  }

  /**
   * Validate test results against expected outcomes
   */
  validateTestResults(actualResults, expectedResults) {
    const validations = [];

    for (const [key, expectedValue] of Object.entries(expectedResults)) {
      const actualValue = actualResults[key];
      
      if (typeof expectedValue === 'object' && expectedValue.range) {
        const inRange = actualValue >= expectedValue.range.min && actualValue <= expectedValue.range.max;
        validations.push({
          field: key,
          expected: expectedValue,
          actual: actualValue,
          valid: inRange,
          message: inRange ? 'PASS' : `Expected ${key} to be between ${expectedValue.range.min} and ${expectedValue.range.max}, got ${actualValue}`
        });
      } else if (typeof expectedValue === 'object' && expectedValue.threshold) {
        const meetsThreshold = expectedValue.operator === 'gt' ? 
          actualValue > expectedValue.threshold : 
          actualValue < expectedValue.threshold;
        validations.push({
          field: key,
          expected: expectedValue,
          actual: actualValue,
          valid: meetsThreshold,
          message: meetsThreshold ? 'PASS' : `Expected ${key} to be ${expectedValue.operator} ${expectedValue.threshold}, got ${actualValue}`
        });
      } else {
        const matches = actualValue === expectedValue;
        validations.push({
          field: key,
          expected: expectedValue,
          actual: actualValue,
          valid: matches,
          message: matches ? 'PASS' : `Expected ${key} to be ${expectedValue}, got ${actualValue}`
        });
      }
    }

    return validations;
  }

  /**
   * Generate performance test data
   */
  generatePerformanceTestData(userCount = 1000, devicesPerUser = 3, transactionsPerDevice = 10) {
    const testData = {
      users: [],
      devices: [],
      transactions: []
    };

    for (let i = 0; i < userCount; i++) {
      const user = this.createTestUser('legitimate');
      testData.users.push(user);

      for (let j = 0; j < devicesPerUser; j++) {
        const device = this.createTestDevice(user.id, 'mobile', 'iOS', true);
        testData.devices.push(device);

        for (let k = 0; k < transactionsPerDevice; k++) {
          testData.transactions.push({
            userId: user.id,
            deviceId: device.id,
            amount: Math.random() * 1000,
            timestamp: new Date(Date.now() + (i * devicesPerUser * transactionsPerDevice + j * transactionsPerDevice + k) * 1000)
          });
        }
      }
    }

    return testData;
  }

  /**
   * Generate advanced persistent threat (APT) simulation data
   */
  generateAPTScenario(targetUserId, duration = '30_days') {
    const aptScenario = {
      targetUserId,
      duration,
      phases: [
        {
          phase: 'reconnaissance',
          duration: '7_days',
          activities: [
            'social_media_profiling',
            'email_harvesting',
            'network_scanning',
            'vulnerability_assessment'
          ]
        },
        {
          phase: 'initial_compromise',
          duration: '1_day',
          activities: [
            'spear_phishing_email',
            'malicious_attachment',
            'credential_harvesting',
            'backdoor_installation'
          ]
        },
        {
          phase: 'persistence',
          duration: '2_days',
          activities: [
            'registry_modification',
            'scheduled_task_creation',
            'service_installation',
            'rootkit_deployment'
          ]
        },
        {
          phase: 'privilege_escalation',
          duration: '3_days',
          activities: [
            'local_exploit',
            'credential_dumping',
            'token_manipulation',
            'admin_account_creation'
          ]
        },
        {
          phase: 'lateral_movement',
          duration: '10_days',
          activities: [
            'network_discovery',
            'credential_reuse',
            'remote_code_execution',
            'additional_system_compromise'
          ]
        },
        {
          phase: 'data_exfiltration',
          duration: '7_days',
          activities: [
            'sensitive_data_identification',
            'data_compression',
            'encryption',
            'covert_channel_communication'
          ]
        }
      ],
      indicators: {
        network: [
          'unusual_outbound_connections',
          'dns_tunneling',
          'encrypted_c2_traffic',
          'data_exfiltration_patterns'
        ],
        host: [
          'suspicious_process_execution',
          'file_system_modifications',
          'registry_changes',
          'memory_artifacts'
        ],
        behavioral: [
          'off_hours_activity',
          'privilege_escalation_attempts',
          'lateral_movement_patterns',
          'data_access_anomalies'
        ]
      }
    };

    return aptScenario;
  }

  /**
   * Generate supply chain attack simulation
   */
  generateSupplyChainAttack(vendorName, affectedComponents) {
    return {
      attackType: 'supply_chain_compromise',
      vendor: vendorName,
      affectedComponents,
      compromiseVector: 'software_update',
      payload: {
        type: 'backdoor',
        persistence: 'high',
        stealth: 'high',
        capabilities: [
          'remote_access',
          'data_exfiltration',
          'credential_harvesting',
          'lateral_movement'
        ]
      },
      distributionMethod: 'legitimate_update_channel',
      affectedVersions: ['v2.1.0', 'v2.1.1', 'v2.1.2'],
      detectionDifficulty: 'high',
      remediationComplexity: 'high'
    };
  }

  /**
   * Generate quantum computing threat simulation
   */
  generateQuantumThreatScenario() {
    return {
      threatType: 'quantum_cryptographic_attack',
      targetAlgorithms: [
        { algorithm: 'RSA', keySize: 2048, breakTime: '8_hours' },
        { algorithm: 'ECC', curve: 'secp256r1', breakTime: '4_hours' },
        { algorithm: 'DH', keySize: 2048, breakTime: '6_hours' }
      ],
      quantumResistantAlternatives: [
        { algorithm: 'Kyber', type: 'lattice_based', security: 'high' },
        { algorithm: 'Dilithium', type: 'lattice_based', security: 'high' },
        { algorithm: 'SPHINCS+', type: 'hash_based', security: 'high' }
      ],
      migrationPlan: {
        phase1: 'assessment_and_planning',
        phase2: 'pilot_implementation',
        phase3: 'gradual_rollout',
        phase4: 'full_migration',
        estimatedDuration: '18_months'
      },
      riskAssessment: {
        currentVulnerability: 'high',
        timeToQuantumThreat: '10_years',
        migrationUrgency: 'medium',
        businessImpact: 'critical'
      }
    };
  }

  /**
   * Generate zero-day exploit simulation
   */
  generateZeroDayExploit(targetSystem, exploitType) {
    return {
      exploitType,
      targetSystem,
      vulnerability: {
        type: 'memory_corruption',
        severity: 'critical',
        cvssScore: 9.8,
        exploitability: 'high',
        impact: 'complete_system_compromise'
      },
      payload: {
        type: 'remote_code_execution',
        capabilities: [
          'privilege_escalation',
          'persistence',
          'defense_evasion',
          'data_exfiltration'
        ]
      },
      detectionEvasion: {
        antivirusEvasion: true,
        behaviorAnalysisEvasion: true,
        networkDetectionEvasion: true,
        forensicAntiForensics: true
      },
      indicators: {
        network: ['unusual_traffic_patterns', 'encrypted_payloads'],
        host: ['memory_anomalies', 'process_injection'],
        behavioral: ['privilege_escalation', 'lateral_movement']
      }
    };
  }

  /**
   * Generate insider threat simulation
   */
  generateInsiderThreatScenario(employeeProfile, motivationType) {
    return {
      threatType: 'insider_threat',
      employeeProfile,
      motivation: motivationType,
      accessLevel: employeeProfile.clearanceLevel,
      behaviorIndicators: {
        digital: [
          'after_hours_access',
          'unusual_data_access',
          'large_file_downloads',
          'unauthorized_system_access'
        ],
        physical: [
          'badge_sharing',
          'tailgating',
          'unauthorized_area_access',
          'document_photography'
        ],
        behavioral: [
          'disgruntlement',
          'financial_stress',
          'policy_violations',
          'security_awareness_decline'
        ]
      },
      riskFactors: {
        accessToSensitiveData: true,
        financialMotivation: motivationType === 'financial',
        ideologicalMotivation: motivationType === 'ideological',
        personalGrievance: motivationType === 'revenge',
        externalCoercion: motivationType === 'coercion'
      },
      detectionMethods: [
        'user_behavior_analytics',
        'data_loss_prevention',
        'privileged_access_monitoring',
        'psychological_assessment'
      ]
    };
  }

  /**
   * Generate social engineering attack simulation
   */
  generateSocialEngineeringAttack(attackVector, targetProfile) {
    const attacks = {
      phishing: {
        method: 'email',
        pretext: 'urgent_security_update',
        psychologicalTriggers: ['urgency', 'authority', 'fear'],
        payload: 'credential_harvesting_page',
        successRate: 0.15
      },
      vishing: {
        method: 'voice_call',
        pretext: 'bank_security_verification',
        psychologicalTriggers: ['authority', 'trust', 'urgency'],
        payload: 'personal_information_extraction',
        successRate: 0.25
      },
      smishing: {
        method: 'sms',
        pretext: 'account_verification_required',
        psychologicalTriggers: ['urgency', 'fear', 'convenience'],
        payload: 'malicious_link',
        successRate: 0.20
      },
      pretexting: {
        method: 'impersonation',
        pretext: 'it_support_technician',
        psychologicalTriggers: ['authority', 'helpfulness', 'trust'],
        payload: 'remote_access_installation',
        successRate: 0.30
      }
    };

    return {
      attackType: 'social_engineering',
      vector: attackVector,
      targetProfile,
      attackDetails: attacks[attackVector],
      preparationPhase: {
        reconnaissance: 'social_media_profiling',
        targetSelection: 'vulnerability_assessment',
        pretextDevelopment: 'scenario_crafting',
        toolPreparation: 'payload_creation'
      },
      executionPhase: {
        initialContact: 'trust_establishment',
        manipulationTechniques: attacks[attackVector].psychologicalTriggers,
        payloadDelivery: attacks[attackVector].payload,
        followUpActions: 'persistence_establishment'
      },
      indicators: [
        'unsolicited_contact',
        'urgency_pressure',
        'information_requests',
        'unusual_requests'
      ]
    };
  }

  /**
   * Generate advanced evasion technique simulation
   */
  generateAdvancedEvasionTechniques() {
    return {
      techniques: {
        antiAnalysis: [
          'virtual_machine_detection',
          'debugger_detection',
          'sandbox_evasion',
          'analysis_tool_detection'
        ],
        obfuscation: [
          'code_packing',
          'encryption',
          'polymorphism',
          'metamorphism'
        ],
        persistence: [
          'registry_modification',
          'service_installation',
          'dll_hijacking',
          'process_injection'
        ],
        privilegeEscalation: [
          'uac_bypass',
          'kernel_exploitation',
          'token_manipulation',
          'dll_injection'
        ],
        defenseEvasion: [
          'process_hollowing',
          'reflective_dll_loading',
          'living_off_the_land',
          'fileless_execution'
        ],
        lateralMovement: [
          'pass_the_hash',
          'pass_the_ticket',
          'wmi_execution',
          'powershell_remoting'
        ]
      },
      detectionChallenges: {
        signatureBased: 'high_evasion',
        behaviorBased: 'medium_evasion',
        heuristicBased: 'medium_evasion',
        machineLearning: 'low_evasion'
      },
      countermeasures: [
        'behavioral_analysis',
        'memory_forensics',
        'network_monitoring',
        'endpoint_detection_response'
      ]
    };
  }

  /**
   * Generate performance stress test scenarios
   */
  generateStressTestScenarios(testType, scale) {
    const scenarios = {
      device_registration_surge: {
        deviceCount: scale * 1000,
        registrationRate: scale * 100, // per second
        duration: 300, // seconds
        expectedSuccessRate: 0.95
      },
      concurrent_authentication: {
        userCount: scale * 500,
        devicesPerUser: 3,
        authenticationRate: scale * 50, // per second
        duration: 600, // seconds
        expectedSuccessRate: 0.98
      },
      fraud_detection_load: {
        transactionCount: scale * 10000,
        fraudPercentage: 0.1,
        processingRate: scale * 1000, // per second
        maxLatency: 100, // milliseconds
        expectedAccuracy: 0.95
      },
      multi_device_session_management: {
        concurrentSessions: scale * 2000,
        sessionDuration: 1800, // seconds
        activityRate: scale * 10, // actions per second
        expectedResponseTime: 200 // milliseconds
      }
    };

    return scenarios[testType] || scenarios.device_registration_surge;
  }

  /**
   * Clean up test data
   */
  cleanup() {
    this.testData.users.clear();
    this.testData.devices.clear();
    this.testData.wallets.clear();
    this.testData.sessions.clear();
    this.testData.transactions = [];
  }
}

module.exports = MultiDeviceTestHelpers;