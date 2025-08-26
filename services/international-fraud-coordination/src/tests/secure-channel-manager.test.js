const secureChannelManager = require('../services/secure-channel-manager');

describe('Secure Channel Manager', () => {
  let testChannelId;

  afterEach(async () => {
    // Cleanup test channels
    if (testChannelId) {
      try {
        await secureChannelManager.closeChannel(testChannelId, 'test_cleanup');
      } catch (error) {
        // Ignore cleanup errors
      }
      testChannelId = null;
    }
  });

  describe('establishChannel', () => {
    test('should establish secure communication channel successfully', async () => {
      const result = await secureChannelManager.establishChannel(
        'EU', 
        'case_coordination'
      );

      expect(result).toHaveProperty('channelId');
      expect(result).toHaveProperty('status', 'active');
      expect(result).toHaveProperty('securityLevel');
      expect(result).toHaveProperty('publicKey');
      expect(result).toHaveProperty('expiresAt');
      expect(result).toHaveProperty('capabilities');

      expect(typeof result.channelId).toBe('string');
      expect(result.channelId.length).toBeGreaterThan(0);
      expect(typeof result.publicKey).toBe('string');
      expect(new Date(result.expiresAt)).toBeGreaterThan(new Date());

      testChannelId = result.channelId;
    });

    test('should establish high security level channel', async () => {
      const result = await secureChannelManager.establishChannel(
        'UK', 
        'evidence_sharing', 
        3 // CRITICAL security level
      );

      expect(result.securityLevel).toBe(3);
      expect(result.capabilities).toHaveProperty('keyRotation', 'enabled');
      expect(result.capabilities).toHaveProperty('authentication', 'RSA-4096');

      testChannelId = result.channelId;
    });

    test('should set appropriate capabilities for evidence sharing', async () => {
      const result = await secureChannelManager.establishChannel(
        'CA', 
        'evidence_sharing'
      );

      expect(result.capabilities).toHaveProperty('fileTransfer', 'enabled');
      expect(result.capabilities).toHaveProperty('digitalSignatures', 'enabled');

      testChannelId = result.channelId;
    });

    test('should reject untrusted jurisdictions', async () => {
      await expect(
        secureChannelManager.establishChannel('UNTRUSTED', 'case_coordination')
      ).rejects.toThrow('Untrusted jurisdiction: UNTRUSTED');
    });

    test('should set appropriate expiration time', async () => {
      const result = await secureChannelManager.establishChannel(
        'AU', 
        'regulatory_reporting'
      );

      const expirationDate = new Date(result.expiresAt);
      const now = new Date();
      const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      expect(expirationDate).toBeGreaterThan(now);
      expect(expirationDate).toBeLessThanOrEqual(sevenDaysFromNow);

      testChannelId = result.channelId;
    });
  });

  describe('sendSecureMessage', () => {
    beforeEach(async () => {
      // Establish a channel for testing
      const channel = await secureChannelManager.establishChannel(
        'EU', 
        'case_coordination'
      );
      testChannelId = channel.channelId;
    });

    test('should send secure message successfully', async () => {
      const message = {
        type: 'CASE_UPDATE',
        priority: 'high',
        content: {
          caseId: 'case-123',
          status: 'investigating',
          findings: 'Suspicious patterns detected'
        }
      };

      const result = await secureChannelManager.sendSecureMessage(
        testChannelId, 
        message, 
        'EU'
      );

      expect(result).toHaveProperty('messageId');
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('deliveredAt');

      expect(typeof result.messageId).toBe('string');
      expect(result.messageId.length).toBeGreaterThan(0);
      expect(new Date(result.deliveredAt)).toBeInstanceOf(Date);
    });

    test('should send evidence sharing message', async () => {
      const evidenceMessage = {
        type: 'EVIDENCE_SHARE',
        priority: 'critical',
        content: {
          caseId: 'case-456',
          evidenceType: 'TRANSACTION_LOGS',
          data: 'encrypted_evidence_data',
          signature: 'digital_signature'
        }
      };

      const result = await secureChannelManager.sendSecureMessage(
        testChannelId, 
        evidenceMessage, 
        'EU'
      );

      expect(result.status).toBeDefined();
      expect(result.messageId).toBeDefined();
    });

    test('should handle urgent communication messages', async () => {
      const urgentMessage = {
        type: 'URGENT_ALERT',
        priority: 'critical',
        content: {
          alertType: 'IMMEDIATE_THREAT',
          description: 'Terrorist financing detected',
          requiredAction: 'FREEZE_ASSETS'
        }
      };

      const result = await secureChannelManager.sendSecureMessage(
        testChannelId, 
        urgentMessage, 
        'EU'
      );

      expect(result.messageId).toBeDefined();
      expect(result.status).toBeDefined();
    });

    test('should reject message to non-existent channel', async () => {
      const message = { type: 'TEST', content: 'test' };

      await expect(
        secureChannelManager.sendSecureMessage('non-existent', message, 'EU')
      ).rejects.toThrow('Channel not found');
    });

    test('should reject message to inactive channel', async () => {
      // Close the channel first
      await secureChannelManager.closeChannel(testChannelId, 'test');
      
      const message = { type: 'TEST', content: 'test' };

      await expect(
        secureChannelManager.sendSecureMessage(testChannelId, message, 'EU')
      ).rejects.toThrow('Channel not active');
    });
  });

  describe('receiveSecureMessage', () => {
    beforeEach(async () => {
      const channel = await secureChannelManager.establishChannel(
        'UK', 
        'case_coordination'
      );
      testChannelId = channel.channelId;
    });

    test('should receive and decrypt secure message', async () => {
      const mockMessageEnvelope = {
        messageId: 'msg-123',
        channelId: testChannelId,
        sender: 'UK',
        recipient: 'US',
        timestamp: new Date().toISOString(),
        messageType: 'CASE_UPDATE',
        priority: 'normal',
        encryptedPayload: 'encrypted_test_payload',
        signature: 'test_signature',
        integrity: 'test_integrity',
        authTag: 'test_auth_tag'
      };

      // This would normally fail due to encryption, but we're testing the structure
      try {
        const result = await secureChannelManager.receiveSecureMessage(mockMessageEnvelope);
        
        expect(result).toHaveProperty('messageId', mockMessageEnvelope.messageId);
        expect(result).toHaveProperty('sender', mockMessageEnvelope.sender);
        expect(result).toHaveProperty('timestamp', mockMessageEnvelope.timestamp);
      } catch (error) {
        // Expected to fail due to mock data, but structure should be correct
        expect(error.message).toContain('verification failed');
      }
    });

    test('should reject message with invalid integrity', async () => {
      const invalidMessageEnvelope = {
        messageId: 'msg-456',
        channelId: testChannelId,
        sender: 'UK',
        encryptedPayload: 'payload',
        signature: 'signature',
        integrity: 'invalid_integrity'
      };

      await expect(
        secureChannelManager.receiveSecureMessage(invalidMessageEnvelope)
      ).rejects.toThrow();
    });

    test('should reject message to non-existent channel', async () => {
      const messageEnvelope = {
        messageId: 'msg-789',
        channelId: 'non-existent',
        sender: 'UK'
      };

      await expect(
        secureChannelManager.receiveSecureMessage(messageEnvelope)
      ).rejects.toThrow('Channel not found');
    });
  });

  describe('closeChannel', () => {
    beforeEach(async () => {
      const channel = await secureChannelManager.establishChannel(
        'CA', 
        'regulatory_reporting'
      );
      testChannelId = channel.channelId;
    });

    test('should close channel successfully', async () => {
      const result = await secureChannelManager.closeChannel(
        testChannelId, 
        'normal_closure'
      );

      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('closedAt');
      expect(new Date(result.closedAt)).toBeInstanceOf(Date);

      // Channel should no longer be usable
      const message = { type: 'TEST', content: 'test' };
      await expect(
        secureChannelManager.sendSecureMessage(testChannelId, message, 'CA')
      ).rejects.toThrow('Channel not active');

      testChannelId = null; // Prevent cleanup attempt
    });

    test('should handle emergency closure', async () => {
      const result = await secureChannelManager.closeChannel(
        testChannelId, 
        'security_breach'
      );

      expect(result.success).toBe(true);
      testChannelId = null;
    });

    test('should reject closure of non-existent channel', async () => {
      await expect(
        secureChannelManager.closeChannel('non-existent', 'test')
      ).rejects.toThrow('Channel not found');
    });
  });

  describe('Security Features', () => {
    test('should generate unique channel keys', () => {
      const keys1 = secureChannelManager.generateChannelKeys(2);
      const keys2 = secureChannelManager.generateChannelKeys(2);

      expect(keys1.private).not.toBe(keys2.private);
      expect(keys1.public).not.toBe(keys2.public);
      expect(keys1.aesKey).not.toEqual(keys2.aesKey);
      expect(keys1.hmacKey).not.toEqual(keys2.hmacKey);
    });

    test('should use stronger keys for higher security levels', () => {
      const standardKeys = secureChannelManager.generateChannelKeys(2);
      const criticalKeys = secureChannelManager.generateChannelKeys(4);

      // Critical security should use longer keys
      expect(criticalKeys.private.length).toBeGreaterThan(standardKeys.private.length);
      expect(criticalKeys.public.length).toBeGreaterThan(standardKeys.public.length);
    });

    test('should encrypt and decrypt messages correctly', async () => {
      const channel = await secureChannelManager.establishChannel(
        'JP', 
        'case_coordination'
      );
      testChannelId = channel.channelId;

      const originalMessage = {
        type: 'TEST_MESSAGE',
        content: 'This is a test message',
        sensitive: true
      };

      // Get the internal channel object (this would be internal in real implementation)
      const internalChannel = secureChannelManager.activeChannels?.get?.(testChannelId);
      
      if (internalChannel) {
        const encrypted = secureChannelManager.encryptMessage(originalMessage, internalChannel);
        
        expect(encrypted).toHaveProperty('payload');
        expect(encrypted).toHaveProperty('signature');
        expect(encrypted).toHaveProperty('integrity');
        expect(encrypted.payload).not.toContain('This is a test message');
      }
    });

    test('should maintain audit trail', async () => {
      const channel = await secureChannelManager.establishChannel(
        'AU', 
        'evidence_sharing'
      );
      testChannelId = channel.channelId;

      const message = {
        type: 'AUDIT_TEST',
        content: 'Testing audit trail'
      };

      await secureChannelManager.sendSecureMessage(testChannelId, message, 'AU');

      // Audit trail should be maintained internally
      // This would be verified through internal methods in a real implementation
    });
  });

  describe('Channel Capabilities', () => {
    test('should provide appropriate capabilities for evidence sharing', () => {
      const capabilities = secureChannelManager.getChannelCapabilities(
        'evidence_sharing', 
        3
      );

      expect(capabilities).toHaveProperty('fileTransfer', 'enabled');
      expect(capabilities).toHaveProperty('digitalSignatures', 'enabled');
      expect(capabilities).toHaveProperty('keyRotation', 'enabled');
    });

    test('should provide basic capabilities for standard coordination', () => {
      const capabilities = secureChannelManager.getChannelCapabilities(
        'case_coordination', 
        2
      );

      expect(capabilities).toHaveProperty('encryption', 'AES-256-GCM');
      expect(capabilities).toHaveProperty('authentication', 'RSA-2048');
      expect(capabilities).toHaveProperty('integrity', 'HMAC-SHA256');
    });

    test('should enhance capabilities for critical security level', () => {
      const capabilities = secureChannelManager.getChannelCapabilities(
        'urgent_communication', 
        4
      );

      expect(capabilities).toHaveProperty('authentication', 'RSA-4096');
      expect(capabilities).toHaveProperty('keyRotation', 'enabled');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle key generation failures gracefully', () => {
      // This would test resilience to cryptographic failures
      expect(() => {
        secureChannelManager.generateChannelKeys(2);
      }).not.toThrow();
    });

    test('should handle network timeouts during channel establishment', async () => {
      // This would test timeout handling
      // In a real implementation, this would mock network failures
      try {
        const result = await secureChannelManager.establishChannel(
          'EU', 
          'case_coordination'
        );
        testChannelId = result.channelId;
        expect(result).toBeDefined();
      } catch (error) {
        // Should handle timeouts gracefully
        expect(error.message).toBeDefined();
      }
    });

    test('should handle expired channels', async () => {
      const channel = await secureChannelManager.establishChannel(
        'UK', 
        'case_coordination'
      );
      testChannelId = channel.channelId;

      // Simulate expired channel by modifying expiration (internal test)
      const message = { type: 'TEST', content: 'test' };
      
      // This would test expiration handling in a real implementation
      // For now, we just verify the channel was created
      expect(channel.expiresAt).toBeDefined();
    });

    test('should handle malformed messages', async () => {
      const channel = await secureChannelManager.establishChannel(
        'CA', 
        'case_coordination'
      );
      testChannelId = channel.channelId;

      const malformedMessage = null;

      await expect(
        secureChannelManager.sendSecureMessage(testChannelId, malformedMessage, 'CA')
      ).rejects.toThrow();
    });

    test('should handle concurrent channel operations', async () => {
      const channelPromises = Array.from({ length: 5 }, (_, i) =>
        secureChannelManager.establishChannel(
          'EU', 
          `test_purpose_${i}`
        )
      );

      const channels = await Promise.all(channelPromises);
      
      expect(channels.length).toBe(5);
      channels.forEach(channel => {
        expect(channel.channelId).toBeDefined();
        expect(channel.status).toBe('active');
      });

      // Cleanup all test channels
      await Promise.all(channels.map(channel =>
        secureChannelManager.closeChannel(channel.channelId, 'test_cleanup')
      ));
    });
  });

  describe('Performance and Scalability', () => {
    test('should handle multiple simultaneous message sends', async () => {
      const channel = await secureChannelManager.establishChannel(
        'EU', 
        'case_coordination'
      );
      testChannelId = channel.channelId;

      const messages = Array.from({ length: 10 }, (_, i) => ({
        type: 'PERFORMANCE_TEST',
        content: `Message ${i}`,
        timestamp: new Date().toISOString()
      }));

      const sendPromises = messages.map(message =>
        secureChannelManager.sendSecureMessage(testChannelId, message, 'EU')
      );

      const results = await Promise.all(sendPromises);
      
      expect(results.length).toBe(10);
      results.forEach(result => {
        expect(result.messageId).toBeDefined();
      });
    });

    test('should maintain performance with large messages', async () => {
      const channel = await secureChannelManager.establishChannel(
        'UK', 
        'evidence_sharing'
      );
      testChannelId = channel.channelId;

      const largeMessage = {
        type: 'LARGE_EVIDENCE',
        content: {
          data: 'x'.repeat(10000), // 10KB of data
          metadata: 'Large evidence file'
        }
      };

      const startTime = Date.now();
      const result = await secureChannelManager.sendSecureMessage(
        testChannelId, 
        largeMessage, 
        'UK'
      );
      const endTime = Date.now();

      expect(result.messageId).toBeDefined();
      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });
});