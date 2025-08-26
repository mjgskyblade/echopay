const request = require('supertest');
const app = require('../index');
const crossBorderFraudDetection = require('../services/cross-border-fraud-detection');
const internationalCaseCoordination = require('../services/international-case-coordination');
const secureChannelManager = require('../services/secure-channel-manager');

describe('International Fraud Coordination Integration Tests', () => {
  let testTransactionData;
  let testCaseData;
  let testChannelId;

  beforeEach(() => {
    testTransactionData = {
      id: 'tx-test-123',
      fromWallet: 'wallet-us-456',
      toWallet: 'wallet-eu-789',
      amount: 50000,
      currency: 'USD-CBDC',
      timestamp: new Date().toISOString(),
      metadata: {
        description: 'International business payment',
        category: 'business'
      }
    };

    testCaseData = {
      caseId: 'case-test-456',
      type: 'SUSPICIOUS_TRANSACTION',
      description: 'Large cross-border transfer with unusual patterns',
      amounts: { total: 50000, currency: 'USD-CBDC' },
      timeframe: 'RECENT',
      urgency: 'HIGH',
      evidenceTypes: ['TRANSACTION_LOGS', 'USER_BEHAVIOR', 'NETWORK_ANALYSIS']
    };
  });

  afterEach(async () => {
    // Cleanup test channels
    if (testChannelId) {
      try {
        await secureChannelManager.closeChannel(testChannelId, 'test_cleanup');
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  });

  describe('Cross-Border Fraud Detection', () => {
    test('should analyze cross-border transaction successfully', async () => {
      const jurisdictions = ['US', 'EU'];
      
      const response = await request(app)
        .post('/api/v1/cross-border/analyze')
        .send({
          transactionData: testTransactionData,
          jurisdictions
        })
        .expect(200);

      expect(response.body).toHaveProperty('transactionId', testTransactionData.id);
      expect(response.body).toHaveProperty('riskScore');
      expect(response.body).toHaveProperty('riskFactors');
      expect(response.body).toHaveProperty('jurisdictionalAlerts');
      expect(response.body).toHaveProperty('recommendedActions');
      expect(response.body).toHaveProperty('crossBorderPatterns');
      
      expect(typeof response.body.riskScore).toBe('number');
      expect(response.body.riskScore).toBeGreaterThanOrEqual(0);
      expect(response.body.riskScore).toBeLessThanOrEqual(1);
      expect(Array.isArray(response.body.riskFactors)).toBe(true);
      expect(Array.isArray(response.body.jurisdictionalAlerts)).toBe(true);
      expect(Array.isArray(response.body.recommendedActions)).toBe(true);
    });

    test('should handle high-risk corridor analysis', async () => {
      const highRiskJurisdictions = ['US', 'RU']; // High-risk corridor
      
      const response = await request(app)
        .post('/api/v1/cross-border/analyze')
        .send({
          transactionData: {
            ...testTransactionData,
            amount: 100000 // Large amount
          },
          jurisdictions: highRiskJurisdictions
        })
        .expect(200);

      expect(response.body.riskScore).toBeGreaterThan(0.3);
      expect(response.body.riskFactors).toContain('HIGH_RISK_CORRIDOR');
      expect(response.body.recommendedActions).toContain('ENHANCED_MONITORING');
    });

    test('should share fraud patterns with international partners', async () => {
      const patterns = [
        {
          type: 'RAPID_SEQUENTIAL_TRANSFERS',
          indicators: [
            { type: 'VELOCITY', value: 'HIGH' },
            { type: 'TIMING', value: 'SUSPICIOUS' }
          ],
          riskLevel: 'HIGH',
          frequency: 15
        }
      ];

      const response = await request(app)
        .post('/api/v1/cross-border/patterns')
        .send({
          patterns,
          jurisdiction: 'US'
        })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
    });

    test('should handle multiple jurisdiction analysis', async () => {
      const multipleJurisdictions = ['US', 'EU', 'UK', 'CA'];
      
      const response = await request(app)
        .post('/api/v1/cross-border/analyze')
        .send({
          transactionData: testTransactionData,
          jurisdictions: multipleJurisdictions
        })
        .expect(200);

      expect(response.body.riskFactors).toContain('MULTIPLE_JURISDICTIONS');
      expect(response.body.riskScore).toBeGreaterThan(0.1);
    });
  });

  describe('International Case Coordination', () => {
    test('should coordinate international fraud case successfully', async () => {
      const targetJurisdictions = ['EU', 'UK'];
      
      const response = await request(app)
        .post('/api/v1/cases/coordinate')
        .send({
          caseData: testCaseData,
          targetJurisdictions
        })
        .expect(200);

      expect(response.body).toHaveProperty('coordinationId');
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('priority');
      expect(response.body).toHaveProperty('jurisdictionalResponses');
      expect(response.body).toHaveProperty('timeline');
      expect(response.body).toHaveProperty('nextSteps');
      
      expect(Array.isArray(response.body.jurisdictionalResponses)).toBe(true);
      expect(response.body.jurisdictionalResponses.length).toBe(targetJurisdictions.length);
      expect(Array.isArray(response.body.timeline)).toBe(true);
      expect(Array.isArray(response.body.nextSteps)).toBe(true);
    });

    test('should handle critical priority cases', async () => {
      const criticalCaseData = {
        ...testCaseData,
        type: 'TERRORISM_FINANCING',
        urgency: 'CRITICAL'
      };

      const response = await request(app)
        .post('/api/v1/cases/coordinate')
        .send({
          caseData: criticalCaseData,
          targetJurisdictions: ['EU', 'UK']
        })
        .expect(200);

      expect(response.body.priority).toBe(4); // CRITICAL priority
      expect(response.body.timeline[0].estimatedDuration).toBe('2 hours');
    });

    test('should retrieve case coordination status', async () => {
      // First coordinate a case
      const coordinateResponse = await request(app)
        .post('/api/v1/cases/coordinate')
        .send({
          caseData: testCaseData,
          targetJurisdictions: ['EU']
        })
        .expect(200);

      // Then retrieve status
      const statusResponse = await request(app)
        .get(`/api/v1/cases/${testCaseData.caseId}/status`)
        .expect(200);

      expect(statusResponse.body).toHaveProperty('coordinationId');
      expect(statusResponse.body).toHaveProperty('caseId', testCaseData.caseId);
      expect(statusResponse.body).toHaveProperty('status');
      expect(statusResponse.body).toHaveProperty('progress');
      expect(statusResponse.body).toHaveProperty('jurisdictionalStatus');
      expect(statusResponse.body).toHaveProperty('estimatedResolution');
    });

    test('should handle large-scale money laundering cases', async () => {
      const moneyLaunderingCase = {
        ...testCaseData,
        type: 'MONEY_LAUNDERING',
        amounts: { total: 5000000, currency: 'USD-CBDC' },
        urgency: 'HIGH'
      };

      const response = await request(app)
        .post('/api/v1/cases/coordinate')
        .send({
          caseData: moneyLaunderingCase,
          targetJurisdictions: ['EU', 'UK', 'CA']
        })
        .expect(200);

      expect(response.body.priority).toBeGreaterThanOrEqual(3);
      
      // Check that appropriate actions are requested
      const jurisdictionalResponse = response.body.jurisdictionalResponses[0];
      if (jurisdictionalResponse.status === 'success') {
        expect(jurisdictionalResponse.response).toBeDefined();
      }
    });
  });

  describe('Secure Communication Channels', () => {
    test('should establish secure communication channel', async () => {
      const response = await request(app)
        .post('/api/v1/secure-channel/establish')
        .send({
          targetJurisdiction: 'EU',
          purpose: 'case_coordination'
        })
        .expect(200);

      expect(response.body).toHaveProperty('channelId');
      expect(response.body).toHaveProperty('status', 'active');
      expect(response.body).toHaveProperty('securityLevel');
      expect(response.body).toHaveProperty('publicKey');
      expect(response.body).toHaveProperty('expiresAt');
      expect(response.body).toHaveProperty('capabilities');

      testChannelId = response.body.channelId;
    });

    test('should send secure message through established channel', async () => {
      // First establish channel
      const channelResponse = await request(app)
        .post('/api/v1/secure-channel/establish')
        .send({
          targetJurisdiction: 'EU',
          purpose: 'evidence_sharing'
        })
        .expect(200);

      testChannelId = channelResponse.body.channelId;

      // Then send message
      const message = {
        type: 'EVIDENCE_SHARE',
        priority: 'high',
        content: {
          caseId: testCaseData.caseId,
          evidenceType: 'TRANSACTION_LOGS',
          data: 'encrypted_evidence_data'
        }
      };

      const messageResponse = await request(app)
        .post('/api/v1/secure-channel/send')
        .send({
          channelId: testChannelId,
          message,
          recipient: 'EU'
        })
        .expect(200);

      expect(messageResponse.body).toHaveProperty('messageId');
      expect(messageResponse.body).toHaveProperty('status');
      expect(messageResponse.body).toHaveProperty('deliveredAt');
    });

    test('should handle high security level channels', async () => {
      const response = await request(app)
        .post('/api/v1/secure-channel/establish')
        .send({
          targetJurisdiction: 'UK',
          purpose: 'urgent_communication',
          securityLevel: 3 // CRITICAL
        })
        .expect(200);

      expect(response.body.securityLevel).toBe(3);
      expect(response.body.capabilities).toHaveProperty('keyRotation', 'enabled');

      testChannelId = response.body.channelId;
    });

    test('should reject untrusted jurisdictions', async () => {
      await request(app)
        .post('/api/v1/secure-channel/establish')
        .send({
          targetJurisdiction: 'UNTRUSTED',
          purpose: 'case_coordination'
        })
        .expect(500);
    });
  });

  describe('End-to-End Fraud Investigation Workflow', () => {
    test('should handle complete international fraud investigation', async () => {
      // Step 1: Analyze suspicious transaction
      const analysisResponse = await request(app)
        .post('/api/v1/cross-border/analyze')
        .send({
          transactionData: {
            ...testTransactionData,
            amount: 500000 // Large suspicious amount
          },
          jurisdictions: ['US', 'EU', 'UK']
        })
        .expect(200);

      expect(analysisResponse.body.riskScore).toBeGreaterThan(0.5);

      // Step 2: Coordinate case if high risk
      if (analysisResponse.body.riskScore > 0.6) {
        const coordinationResponse = await request(app)
          .post('/api/v1/cases/coordinate')
          .send({
            caseData: {
              ...testCaseData,
              type: 'SUSPICIOUS_TRANSACTION',
              amounts: { total: 500000, currency: 'USD-CBDC' }
            },
            targetJurisdictions: ['EU', 'UK']
          })
          .expect(200);

        expect(coordinationResponse.body).toHaveProperty('coordinationId');

        // Step 3: Establish secure communication
        const channelResponse = await request(app)
          .post('/api/v1/secure-channel/establish')
          .send({
            targetJurisdiction: 'EU',
            purpose: 'case_coordination'
          })
          .expect(200);

        testChannelId = channelResponse.body.channelId;

        // Step 4: Share evidence
        const evidenceMessage = {
          type: 'EVIDENCE_SHARE',
          priority: 'high',
          content: {
            caseId: testCaseData.caseId,
            coordinationId: coordinationResponse.body.coordinationId,
            evidenceType: 'FRAUD_ANALYSIS',
            data: analysisResponse.body
          }
        };

        const messageResponse = await request(app)
          .post('/api/v1/secure-channel/send')
          .send({
            channelId: testChannelId,
            message: evidenceMessage,
            recipient: 'EU'
          })
          .expect(200);

        expect(messageResponse.body.status).toBe('delivered');

        // Step 5: Check case status
        const statusResponse = await request(app)
          .get(`/api/v1/cases/${testCaseData.caseId}/status`)
          .expect(200);

        expect(statusResponse.body.progress).toBeGreaterThan(0);
      }
    });

    test('should handle multi-jurisdiction money laundering investigation', async () => {
      const complexTransaction = {
        ...testTransactionData,
        amount: 2000000,
        metadata: {
          description: 'Complex layered transaction',
          category: 'suspicious'
        }
      };

      // Analyze across multiple jurisdictions
      const analysisResponse = await request(app)
        .post('/api/v1/cross-border/analyze')
        .send({
          transactionData: complexTransaction,
          jurisdictions: ['US', 'EU', 'UK', 'CA']
        })
        .expect(200);

      expect(analysisResponse.body.riskFactors).toContain('MULTIPLE_JURISDICTIONS');

      // Coordinate with all involved jurisdictions
      const coordinationResponse = await request(app)
        .post('/api/v1/cases/coordinate')
        .send({
          caseData: {
            ...testCaseData,
            type: 'MONEY_LAUNDERING',
            amounts: { total: 2000000, currency: 'USD-CBDC' },
            urgency: 'CRITICAL'
          },
          targetJurisdictions: ['EU', 'UK', 'CA']
        })
        .expect(200);

      expect(coordinationResponse.body.priority).toBe(4); // CRITICAL
      expect(coordinationResponse.body.jurisdictionalResponses.length).toBe(3);

      // Verify timeline is appropriate for critical case
      const timeline = coordinationResponse.body.timeline;
      expect(timeline[0].estimatedDuration).toBe('2 hours'); // Fast initiation
    });
  });

  describe('Error Handling and Resilience', () => {
    test('should handle invalid transaction data gracefully', async () => {
      const invalidTransaction = {
        id: 'invalid',
        // Missing required fields
      };

      await request(app)
        .post('/api/v1/cross-border/analyze')
        .send({
          transactionData: invalidTransaction,
          jurisdictions: ['US', 'EU']
        })
        .expect(500);
    });

    test('should handle case coordination with no target jurisdictions', async () => {
      await request(app)
        .post('/api/v1/cases/coordinate')
        .send({
          caseData: testCaseData,
          targetJurisdictions: []
        })
        .expect(500);
    });

    test('should handle secure channel establishment failures', async () => {
      // Mock network failure scenario
      const originalEstablish = secureChannelManager.establishChannel;
      secureChannelManager.establishChannel = jest.fn().mockRejectedValue(
        new Error('Network timeout')
      );

      await request(app)
        .post('/api/v1/secure-channel/establish')
        .send({
          targetJurisdiction: 'EU',
          purpose: 'case_coordination'
        })
        .expect(500);

      // Restore original method
      secureChannelManager.establishChannel = originalEstablish;
    });

    test('should handle message sending to non-existent channel', async () => {
      const message = {
        type: 'TEST_MESSAGE',
        content: 'test'
      };

      await request(app)
        .post('/api/v1/secure-channel/send')
        .send({
          channelId: 'non-existent-channel',
          message,
          recipient: 'EU'
        })
        .expect(500);
    });
  });

  describe('Performance and Scalability', () => {
    test('should handle concurrent fraud analyses', async () => {
      const concurrentRequests = Array.from({ length: 10 }, (_, i) => 
        request(app)
          .post('/api/v1/cross-border/analyze')
          .send({
            transactionData: {
              ...testTransactionData,
              id: `tx-concurrent-${i}`
            },
            jurisdictions: ['US', 'EU']
          })
      );

      const responses = await Promise.all(concurrentRequests);
      
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('riskScore');
      });
    });

    test('should handle multiple case coordinations simultaneously', async () => {
      const concurrentCases = Array.from({ length: 5 }, (_, i) => 
        request(app)
          .post('/api/v1/cases/coordinate')
          .send({
            caseData: {
              ...testCaseData,
              caseId: `case-concurrent-${i}`
            },
            targetJurisdictions: ['EU']
          })
      );

      const responses = await Promise.all(concurrentCases);
      
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('coordinationId');
      });
    });
  });
});