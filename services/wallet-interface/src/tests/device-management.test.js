const request = require('supertest');
const { app } = require('../index');

describe('Device Management API', () => {
  const mockUserId = 'test-user-123';
  let deviceId;

  describe('POST /api/devices/register', () => {
    it('should register a new device successfully', async () => {
      const deviceInfo = {
        deviceName: 'Test iPhone',
        deviceType: 'mobile',
        platform: 'iOS 17.0',
        location: { lat: 40.7128, lon: -74.0060 },
        clientInfo: {
          screenResolution: '1170x2532',
          timezone: 'America/New_York'
        }
      };

      const response = await request(app)
        .post('/api/devices/register')
        .set('X-User-Id', mockUserId)
        .send(deviceInfo)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.device).toHaveProperty('deviceId');
      expect(response.body.device.deviceName).toBe(deviceInfo.deviceName);
      expect(response.body.device.deviceType).toBe(deviceInfo.deviceType);
      expect(response.body.device.isTrusted).toBe(false);
      expect(response.body.device.riskScore).toBe(0.5);

      deviceId = response.body.device.deviceId;
    });

    it('should fail with invalid device type', async () => {
      const deviceInfo = {
        deviceName: 'Test Device',
        deviceType: 'invalid-type',
        platform: 'Test Platform'
      };

      await request(app)
        .post('/api/devices/register')
        .set('X-User-Id', mockUserId)
        .send(deviceInfo)
        .expect(400);
    });

    it('should fail without required fields', async () => {
      const deviceInfo = {
        deviceType: 'mobile'
        // Missing deviceName
      };

      await request(app)
        .post('/api/devices/register')
        .set('X-User-Id', mockUserId)
        .send(deviceInfo)
        .expect(400);
    });
  });

  describe('GET /api/devices', () => {
    it('should get all devices for user', async () => {
      const response = await request(app)
        .get('/api/devices')
        .set('X-User-Id', mockUserId)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.devices)).toBe(true);
      expect(response.body.devices.length).toBeGreaterThan(0);
    });
  });

  describe('POST /api/devices/:deviceId/verify', () => {
    it('should verify a device successfully', async () => {
      const response = await request(app)
        .post(`/api/devices/${deviceId}/verify`)
        .set('X-User-Id', mockUserId)
        .send({ verificationCode: '123456' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.device.isTrusted).toBe(true);
      expect(response.body.device.riskScore).toBe(0.1);
    });

    it('should fail with invalid device ID', async () => {
      await request(app)
        .post('/api/devices/invalid-id/verify')
        .set('X-User-Id', mockUserId)
        .send({ verificationCode: '123456' })
        .expect(400);
    });
  });

  describe('GET /api/devices/:deviceId/risk', () => {
    it('should get device risk assessment', async () => {
      const response = await request(app)
        .get(`/api/devices/${deviceId}/risk`)
        .set('X-User-Id', mockUserId)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.riskAssessment).toHaveProperty('riskLevel');
      expect(response.body.riskAssessment).toHaveProperty('riskScore');
      expect(response.body.riskAssessment).toHaveProperty('isTrusted');
      expect(response.body.riskAssessment).toHaveProperty('factors');
    });
  });

  describe('POST /api/devices/:deviceId/activity', () => {
    it('should update device activity', async () => {
      const activityData = {
        location: { lat: 40.7589, lon: -73.9851 }
      };

      const response = await request(app)
        .post(`/api/devices/${deviceId}/activity`)
        .set('X-User-Id', mockUserId)
        .send(activityData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.device).toHaveProperty('lastSeenAt');
    });
  });

  describe('GET /api/devices/sessions/concurrent', () => {
    it('should get concurrent sessions', async () => {
      const response = await request(app)
        .get('/api/devices/sessions/concurrent')
        .set('X-User-Id', mockUserId)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.concurrentSessions)).toBe(true);
      expect(typeof response.body.sessionCount).toBe('number');
    });
  });

  describe('POST /api/devices/:deviceId/analyze-transaction', () => {
    it('should analyze transaction for fraud', async () => {
      const transactionData = {
        transaction: {
          transactionId: 'tx-123',
          amount: 100.00,
          walletId: 'wallet-123',
          location: { lat: 40.7128, lon: -74.0060 }
        }
      };

      const response = await request(app)
        .post(`/api/devices/${deviceId}/analyze-transaction`)
        .set('X-User-Id', mockUserId)
        .send(transactionData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.analysis).toHaveProperty('riskScore');
      expect(response.body.analysis).toHaveProperty('fraudIndicators');
      expect(response.body.analysis).toHaveProperty('recommendation');
    });

    it('should generate alert for high-risk transaction', async () => {
      // Register a new untrusted device
      const newDeviceResponse = await request(app)
        .post('/api/devices/register')
        .set('X-User-Id', mockUserId)
        .send({
          deviceName: 'Suspicious Device',
          deviceType: 'web',
          platform: 'Unknown'
        });

      const suspiciousDeviceId = newDeviceResponse.body.device.deviceId;

      const transactionData = {
        transaction: {
          transactionId: 'tx-suspicious',
          amount: 10000.00, // High amount
          walletId: 'wallet-123',
          location: { lat: 51.5074, lon: -0.1278 } // London (far from previous location)
        }
      };

      const response = await request(app)
        .post(`/api/devices/${suspiciousDeviceId}/analyze-transaction`)
        .set('X-User-Id', mockUserId)
        .send(transactionData)
        .expect(200);

      expect(response.body.analysis.riskScore).toBeGreaterThan(0.5);
      expect(response.body.analysis.fraudIndicators.length).toBeGreaterThan(0);
    });
  });

  describe('GET /api/devices/fraud/statistics', () => {
    it('should get fraud statistics', async () => {
      const response = await request(app)
        .get('/api/devices/fraud/statistics')
        .set('X-User-Id', mockUserId)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.statistics).toHaveProperty('totalTransactions');
      expect(response.body.statistics).toHaveProperty('flaggedTransactions');
      expect(response.body.statistics).toHaveProperty('blockedTransactions');
    });
  });

  describe('DELETE /api/devices/:deviceId', () => {
    it('should remove device successfully', async () => {
      const response = await request(app)
        .delete(`/api/devices/${deviceId}`)
        .set('X-User-Id', mockUserId)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Device removed successfully');
    });

    it('should fail to remove non-existent device', async () => {
      await request(app)
        .delete('/api/devices/non-existent-id')
        .set('X-User-Id', mockUserId)
        .expect(400);
    });
  });
});

describe('Device Fraud Detection', () => {
  const mockUserId = 'fraud-test-user';
  let deviceId1, deviceId2;

  beforeAll(async () => {
    // Register two devices for testing
    const device1Response = await request(app)
      .post('/api/devices/register')
      .set('X-User-Id', mockUserId)
      .send({
        deviceName: 'Device 1',
        deviceType: 'mobile',
        platform: 'iOS',
        location: { lat: 40.7128, lon: -74.0060 }
      });
    deviceId1 = device1Response.body.device.deviceId;

    const device2Response = await request(app)
      .post('/api/devices/register')
      .set('X-User-Id', mockUserId)
      .send({
        deviceName: 'Device 2',
        deviceType: 'web',
        platform: 'Chrome',
        location: { lat: 51.5074, lon: -0.1278 }
      });
    deviceId2 = device2Response.body.device.deviceId;
  });

  it('should detect impossible travel', async () => {
    // First transaction from New York
    await request(app)
      .post(`/api/devices/${deviceId1}/analyze-transaction`)
      .set('X-User-Id', mockUserId)
      .send({
        transaction: {
          transactionId: 'tx-ny',
          amount: 50.00,
          location: { lat: 40.7128, lon: -74.0060 }
        }
      });

    // Immediate transaction from London (impossible travel)
    const response = await request(app)
      .post(`/api/devices/${deviceId1}/analyze-transaction`)
      .set('X-User-Id', mockUserId)
      .send({
        transaction: {
          transactionId: 'tx-london',
          amount: 50.00,
          location: { lat: 51.5074, lon: -0.1278 }
        }
      });

    expect(response.body.analysis.fraudIndicators).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'impossible_travel'
        })
      ])
    );
  });

  it('should detect concurrent sessions', async () => {
    // Update activity on both devices simultaneously
    await Promise.all([
      request(app)
        .post(`/api/devices/${deviceId1}/activity`)
        .set('X-User-Id', mockUserId)
        .send({ location: { lat: 40.7128, lon: -74.0060 } }),
      request(app)
        .post(`/api/devices/${deviceId2}/activity`)
        .set('X-User-Id', mockUserId)
        .send({ location: { lat: 51.5074, lon: -0.1278 } })
    ]);

    const response = await request(app)
      .get('/api/devices/sessions/concurrent')
      .set('X-User-Id', mockUserId);

    expect(response.body.sessionCount).toBeGreaterThanOrEqual(2);
  });

  it('should detect new device high-value transaction', async () => {
    // Register a brand new device
    const newDeviceResponse = await request(app)
      .post('/api/devices/register')
      .set('X-User-Id', mockUserId)
      .send({
        deviceName: 'Brand New Device',
        deviceType: 'desktop',
        platform: 'Windows'
      });

    const newDeviceId = newDeviceResponse.body.device.deviceId;

    // Attempt high-value transaction immediately
    const response = await request(app)
      .post(`/api/devices/${newDeviceId}/analyze-transaction`)
      .set('X-User-Id', mockUserId)
      .send({
        transaction: {
          transactionId: 'tx-high-value',
          amount: 5000.00
        }
      });

    expect(response.body.analysis.fraudIndicators).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'new_device_high_value'
        })
      ])
    );
  });
});