const request = require('supertest');
const { app } = require('../index');

describe('Device Switching Scenarios', () => {
  const mockUserId = 'device-switching-user';
  let mobileDeviceId, webDeviceId, desktopDeviceId;
  let walletId1, walletId2;

  beforeAll(async () => {
    // Create multiple devices
    const mobileResponse = await request(app)
      .post('/api/devices/register')
      .set('X-User-Id', mockUserId)
      .send({
        deviceName: 'iPhone 15',
        deviceType: 'mobile',
        platform: 'iOS 17.0',
        location: { lat: 40.7128, lon: -74.0060 }
      });
    mobileDeviceId = mobileResponse.body.device.deviceId;

    const webResponse = await request(app)
      .post('/api/devices/register')
      .set('X-User-Id', mockUserId)
      .send({
        deviceName: 'Chrome Browser',
        deviceType: 'web',
        platform: 'Chrome 120.0',
        location: { lat: 40.7128, lon: -74.0060 }
      });
    webDeviceId = webResponse.body.device.deviceId;

    const desktopResponse = await request(app)
      .post('/api/devices/register')
      .set('X-User-Id', mockUserId)
      .send({
        deviceName: 'MacBook Pro',
        deviceType: 'desktop',
        platform: 'macOS 14.0',
        location: { lat: 40.7128, lon: -74.0060 }
      });
    desktopDeviceId = desktopResponse.body.device.deviceId;

    // Verify all devices
    await Promise.all([
      request(app)
        .post(`/api/devices/${mobileDeviceId}/verify`)
        .set('X-User-Id', mockUserId)
        .send({ verificationCode: '123456' }),
      request(app)
        .post(`/api/devices/${webDeviceId}/verify`)
        .set('X-User-Id', mockUserId)
        .send({ verificationCode: '123456' }),
      request(app)
        .post(`/api/devices/${desktopDeviceId}/verify`)
        .set('X-User-Id', mockUserId)
        .send({ verificationCode: '123456' })
    ]);

    // Create multiple wallets
    const wallet1Response = await request(app)
      .post('/api/multi-wallet')
      .set('X-User-Id', mockUserId)
      .send({
        walletName: 'Primary Wallet',
        walletType: 'personal',
        currency: 'USD-CBDC'
      });
    walletId1 = wallet1Response.body.wallet.walletId;

    const wallet2Response = await request(app)
      .post('/api/multi-wallet')
      .set('X-User-Id', mockUserId)
      .send({
        walletName: 'Business Wallet',
        walletType: 'business',
        currency: 'USD-CBDC'
      });
    walletId2 = wallet2Response.body.wallet.walletId;
  });

  describe('Normal Device Switching', () => {
    it('should handle legitimate device switching', async () => {
      // Sync wallet from mobile device
      const mobileSync = await request(app)
        .post(`/api/multi-wallet/${walletId1}/sync`)
        .set('X-User-Id', mockUserId)
        .send({
          deviceId: mobileDeviceId,
          syncData: { version: 1 }
        });

      expect(mobileSync.body.success).toBe(true);

      // Switch to web device after reasonable time
      await new Promise(resolve => setTimeout(resolve, 100));

      const webSync = await request(app)
        .post(`/api/multi-wallet/${walletId1}/sync`)
        .set('X-User-Id', mockUserId)
        .send({
          deviceId: webDeviceId,
          syncData: { version: 1 }
        });

      expect(webSync.body.success).toBe(true);
      expect(webSync.body.conflicts.length).toBe(0);

      // Verify concurrent sessions
      const sessionsResponse = await request(app)
        .get('/api/devices/sessions/concurrent')
        .set('X-User-Id', mockUserId);

      expect(sessionsResponse.body.sessionCount).toBeGreaterThanOrEqual(2);
    });

    it('should handle cross-platform wallet access', async () => {
      // Access different wallets from different devices
      const mobileWallet1 = await request(app)
        .post(`/api/multi-wallet/${walletId1}/sync`)
        .set('X-User-Id', mockUserId)
        .send({
          deviceId: mobileDeviceId,
          syncData: { version: 2 }
        });

      const desktopWallet2 = await request(app)
        .post(`/api/multi-wallet/${walletId2}/sync`)
        .set('X-User-Id', mockUserId)
        .send({
          deviceId: desktopDeviceId,
          syncData: { version: 2 }
        });

      expect(mobileWallet1.body.success).toBe(true);
      expect(desktopWallet2.body.success).toBe(true);
    });
  });

  describe('Suspicious Device Switching Patterns', () => {
    it('should detect rapid device switching', async () => {
      const transactions = [];

      // Rapid switching between devices with transactions
      for (let i = 0; i < 6; i++) {
        const deviceId = i % 2 === 0 ? mobileDeviceId : webDeviceId;
        const transaction = {
          transactionId: `rapid-switch-${i}`,
          amount: 10.00,
          walletId: walletId1
        };

        const response = await request(app)
          .post(`/api/devices/${deviceId}/analyze-transaction`)
          .set('X-User-Id', mockUserId)
          .send({ transaction });

        transactions.push(response.body);
      }

      // Later transactions should have higher risk scores
      const lastTransaction = transactions[transactions.length - 1];
      expect(lastTransaction.analysis.riskScore).toBeGreaterThan(0.3);
    });

    it('should detect impossible location changes', async () => {
      // Transaction from New York
      await request(app)
        .post(`/api/devices/${mobileDeviceId}/activity`)
        .set('X-User-Id', mockUserId)
        .send({
          location: { lat: 40.7128, lon: -74.0060 } // New York
        });

      const nyTransaction = await request(app)
        .post(`/api/devices/${mobileDeviceId}/analyze-transaction`)
        .set('X-User-Id', mockUserId)
        .send({
          transaction: {
            transactionId: 'ny-transaction',
            amount: 100.00,
            location: { lat: 40.7128, lon: -74.0060 }
          }
        });

      // Immediate transaction from London (impossible travel)
      await request(app)
        .post(`/api/devices/${mobileDeviceId}/activity`)
        .set('X-User-Id', mockUserId)
        .send({
          location: { lat: 51.5074, lon: -0.1278 } // London
        });

      const londonTransaction = await request(app)
        .post(`/api/devices/${mobileDeviceId}/analyze-transaction`)
        .set('X-User-Id', mockUserId)
        .send({
          transaction: {
            transactionId: 'london-transaction',
            amount: 100.00,
            location: { lat: 51.5074, lon: -0.1278 }
          }
        });

      expect(londonTransaction.body.analysis.fraudIndicators).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'impossible_travel'
          })
        ])
      );
    });

    it('should detect excessive concurrent sessions', async () => {
      // Create activity on all devices simultaneously
      await Promise.all([
        request(app)
          .post(`/api/devices/${mobileDeviceId}/activity`)
          .set('X-User-Id', mockUserId)
          .send({ location: { lat: 40.7128, lon: -74.0060 } }),
        request(app)
          .post(`/api/devices/${webDeviceId}/activity`)
          .set('X-User-Id', mockUserId)
          .send({ location: { lat: 40.7589, lon: -73.9851 } }),
        request(app)
          .post(`/api/devices/${desktopDeviceId}/activity`)
          .set('X-User-Id', mockUserId)
          .send({ location: { lat: 40.6892, lon: -74.0445 } })
      ]);

      // Analyze transaction with multiple concurrent sessions
      const response = await request(app)
        .post(`/api/devices/${mobileDeviceId}/analyze-transaction`)
        .set('X-User-Id', mockUserId)
        .send({
          transaction: {
            transactionId: 'concurrent-session-tx',
            amount: 200.00
          }
        });

      expect(response.body.analysis.fraudIndicators).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'excessive_concurrent_sessions'
          })
        ])
      );
    });
  });

  describe('Wallet Transfer Scenarios', () => {
    it('should handle legitimate cross-device wallet transfers', async () => {
      // Sync wallets to different devices
      await request(app)
        .post(`/api/multi-wallet/${walletId1}/sync`)
        .set('X-User-Id', mockUserId)
        .send({
          deviceId: mobileDeviceId,
          syncData: { version: 3 }
        });

      await request(app)
        .post(`/api/multi-wallet/${walletId2}/sync`)
        .set('X-User-Id', mockUserId)
        .send({
          deviceId: desktopDeviceId,
          syncData: { version: 3 }
        });

      // Verify both wallets are accessible
      const wallet1Response = await request(app)
        .get(`/api/multi-wallet/${walletId1}`)
        .set('X-User-Id', mockUserId);

      const wallet2Response = await request(app)
        .get(`/api/multi-wallet/${walletId2}`)
        .set('X-User-Id', mockUserId);

      expect(wallet1Response.body.success).toBe(true);
      expect(wallet2Response.body.success).toBe(true);
    });

    it('should detect suspicious wallet switching patterns', async () => {
      // Rapid wallet switching with transactions
      const walletIds = [walletId1, walletId2];
      const deviceIds = [mobileDeviceId, webDeviceId, desktopDeviceId];

      for (let i = 0; i < 10; i++) {
        const walletId = walletIds[i % walletIds.length];
        const deviceId = deviceIds[i % deviceIds.length];

        const response = await request(app)
          .post(`/api/devices/${deviceId}/analyze-transaction`)
          .set('X-User-Id', mockUserId)
          .send({
            transaction: {
              transactionId: `wallet-switch-${i}`,
              amount: 25.00,
              walletId
            }
          });

        // Later iterations should show increased risk
        if (i > 5) {
          expect(response.body.analysis.riskScore).toBeGreaterThan(0.2);
        }
      }
    });
  });

  describe('Device Compromise Scenarios', () => {
    it('should detect potential device compromise', async () => {
      // Register a new device with suspicious characteristics
      const suspiciousDeviceResponse = await request(app)
        .post('/api/devices/register')
        .set('X-User-Id', mockUserId)
        .send({
          deviceName: 'Unknown Device',
          deviceType: 'web',
          platform: 'Suspicious Browser',
          location: { lat: 55.7558, lon: 37.6176 } // Moscow (far from user's normal location)
        });

      const suspiciousDeviceId = suspiciousDeviceResponse.body.device.deviceId;

      // Attempt high-value transaction from suspicious device
      const response = await request(app)
        .post(`/api/devices/${suspiciousDeviceId}/analyze-transaction`)
        .set('X-User-Id', mockUserId)
        .send({
          transaction: {
            transactionId: 'suspicious-device-tx',
            amount: 5000.00,
            location: { lat: 55.7558, lon: 37.6176 }
          }
        });

      expect(response.body.analysis.riskScore).toBeGreaterThan(0.7);
      expect(response.body.analysis.recommendation.action).toBe('block');
      expect(response.body.alert).toBeDefined();
    });

    it('should handle device recovery scenarios', async () => {
      // Simulate device recovery by removing and re-registering
      await request(app)
        .delete(`/api/devices/${mobileDeviceId}`)
        .set('X-User-Id', mockUserId);

      // Re-register the same device
      const recoveryResponse = await request(app)
        .post('/api/devices/register')
        .set('X-User-Id', mockUserId)
        .send({
          deviceName: 'iPhone 15 (Recovered)',
          deviceType: 'mobile',
          platform: 'iOS 17.0',
          location: { lat: 40.7128, lon: -74.0060 }
        });

      const recoveredDeviceId = recoveryResponse.body.device.deviceId;

      // Verify the device
      await request(app)
        .post(`/api/devices/${recoveredDeviceId}/verify`)
        .set('X-User-Id', mockUserId)
        .send({ verificationCode: '123456' });

      // Test wallet sync on recovered device
      const syncResponse = await request(app)
        .post(`/api/multi-wallet/${walletId1}/sync`)
        .set('X-User-Id', mockUserId)
        .send({
          deviceId: recoveredDeviceId,
          syncData: { version: 4 }
        });

      expect(syncResponse.body.success).toBe(true);
    });
  });

  describe('Performance Under Load', () => {
    it('should handle multiple simultaneous device operations', async () => {
      const operations = [];

      // Create multiple concurrent operations
      for (let i = 0; i < 20; i++) {
        const deviceId = [mobileDeviceId, webDeviceId, desktopDeviceId][i % 3];
        const walletId = [walletId1, walletId2][i % 2];

        operations.push(
          request(app)
            .post(`/api/devices/${deviceId}/analyze-transaction`)
            .set('X-User-Id', mockUserId)
            .send({
              transaction: {
                transactionId: `load-test-${i}`,
                amount: Math.random() * 100,
                walletId
              }
            })
        );

        operations.push(
          request(app)
            .post(`/api/multi-wallet/${walletId}/sync`)
            .set('X-User-Id', mockUserId)
            .send({
              deviceId,
              syncData: { version: i + 5 }
            })
        );
      }

      const startTime = Date.now();
      const responses = await Promise.all(operations);
      const endTime = Date.now();

      // All operations should complete successfully
      responses.forEach(response => {
        expect(response.status).toBeLessThan(500);
      });

      // Should complete within reasonable time (10 seconds)
      expect(endTime - startTime).toBeLessThan(10000);
    });
  });
});