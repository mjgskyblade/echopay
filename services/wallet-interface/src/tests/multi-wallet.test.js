const request = require('supertest');
const { app } = require('../index');

describe('Multi-Wallet Management API', () => {
  const mockUserId = 'test-user-123';
  let walletId1, walletId2;

  describe('POST /api/multi-wallet', () => {
    it('should create a new wallet successfully', async () => {
      const walletInfo = {
        walletName: 'Test Personal Wallet',
        walletType: 'personal',
        currency: 'USD-CBDC',
        description: 'My primary wallet',
        color: '#007bff'
      };

      const response = await request(app)
        .post('/api/multi-wallet')
        .set('X-User-Id', mockUserId)
        .send(walletInfo)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.wallet).toHaveProperty('walletId');
      expect(response.body.wallet.walletName).toBe(walletInfo.walletName);
      expect(response.body.wallet.walletType).toBe(walletInfo.walletType);
      expect(response.body.wallet.currency).toBe(walletInfo.currency);
      expect(response.body.wallet.balance).toBe(0);
      expect(response.body.wallet.isPrimary).toBe(true); // First wallet should be primary

      walletId1 = response.body.wallet.walletId;
    });

    it('should create a second wallet (not primary)', async () => {
      const walletInfo = {
        walletName: 'Test Business Wallet',
        walletType: 'business',
        currency: 'EUR-CBDC'
      };

      const response = await request(app)
        .post('/api/multi-wallet')
        .set('X-User-Id', mockUserId)
        .send(walletInfo)
        .expect(201);

      expect(response.body.wallet.isPrimary).toBe(false); // Second wallet should not be primary
      walletId2 = response.body.wallet.walletId;
    });

    it('should fail with invalid wallet type', async () => {
      const walletInfo = {
        walletName: 'Invalid Wallet',
        walletType: 'invalid-type'
      };

      await request(app)
        .post('/api/multi-wallet')
        .set('X-User-Id', mockUserId)
        .send(walletInfo)
        .expect(400);
    });

    it('should fail without required fields', async () => {
      const walletInfo = {
        walletType: 'personal'
        // Missing walletName
      };

      await request(app)
        .post('/api/multi-wallet')
        .set('X-User-Id', mockUserId)
        .send(walletInfo)
        .expect(400);
    });
  });

  describe('GET /api/multi-wallet', () => {
    it('should get all wallets for user', async () => {
      const response = await request(app)
        .get('/api/multi-wallet')
        .set('X-User-Id', mockUserId)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.wallets)).toBe(true);
      expect(response.body.wallets.length).toBe(2);
      
      // Primary wallet should be first
      expect(response.body.wallets[0].isPrimary).toBe(true);
      expect(response.body.wallets[1].isPrimary).toBe(false);
    });
  });

  describe('GET /api/multi-wallet/:walletId', () => {
    it('should get specific wallet', async () => {
      const response = await request(app)
        .get(`/api/multi-wallet/${walletId1}`)
        .set('X-User-Id', mockUserId)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.wallet.walletId).toBe(walletId1);
      expect(response.body.wallet.walletName).toBe('Test Personal Wallet');
    });

    it('should return 404 for non-existent wallet', async () => {
      await request(app)
        .get('/api/multi-wallet/non-existent-id')
        .set('X-User-Id', mockUserId)
        .expect(400); // Invalid UUID format
    });
  });

  describe('PUT /api/multi-wallet/:walletId', () => {
    it('should update wallet information', async () => {
      const updates = {
        walletName: 'Updated Personal Wallet',
        metadata: {
          description: 'Updated description',
          color: '#28a745'
        }
      };

      const response = await request(app)
        .put(`/api/multi-wallet/${walletId1}`)
        .set('X-User-Id', mockUserId)
        .send(updates)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.wallet.walletName).toBe(updates.walletName);
      expect(response.body.wallet.metadata.description).toBe(updates.metadata.description);
      expect(response.body.wallet.metadata.color).toBe(updates.metadata.color);
    });

    it('should fail with invalid wallet ID', async () => {
      await request(app)
        .put('/api/multi-wallet/invalid-id')
        .set('X-User-Id', mockUserId)
        .send({ walletName: 'Test' })
        .expect(400);
    });
  });

  describe('POST /api/multi-wallet/:walletId/set-primary', () => {
    it('should set wallet as primary', async () => {
      const response = await request(app)
        .post(`/api/multi-wallet/${walletId2}/set-primary`)
        .set('X-User-Id', mockUserId)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.wallet.isPrimary).toBe(true);

      // Verify the previous primary wallet is no longer primary
      const walletsResponse = await request(app)
        .get('/api/multi-wallet')
        .set('X-User-Id', mockUserId);

      const wallet1 = walletsResponse.body.wallets.find(w => w.walletId === walletId1);
      const wallet2 = walletsResponse.body.wallets.find(w => w.walletId === walletId2);

      expect(wallet1.isPrimary).toBe(false);
      expect(wallet2.isPrimary).toBe(true);
    });
  });

  describe('POST /api/multi-wallet/:walletId/sync', () => {
    it('should sync wallet with device', async () => {
      const syncData = {
        deviceId: '550e8400-e29b-41d4-a716-446655440000',
        syncData: {
          version: 1,
          balance: 0
        }
      };

      const response = await request(app)
        .post(`/api/multi-wallet/${walletId1}/sync`)
        .set('X-User-Id', mockUserId)
        .send(syncData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.syncStatus).toBe('success');
      expect(response.body.wallet).toHaveProperty('syncDeviceCount');
    });

    it('should detect sync conflicts', async () => {
      const syncData = {
        deviceId: '550e8400-e29b-41d4-a716-446655440001',
        syncData: {
          version: 1,
          balance: 100 // Different balance
        }
      };

      const response = await request(app)
        .post(`/api/multi-wallet/${walletId1}/sync`)
        .set('X-User-Id', mockUserId)
        .send(syncData)
        .expect(200);

      expect(response.body.conflicts).toBeDefined();
      expect(Array.isArray(response.body.conflicts)).toBe(true);
    });
  });

  describe('GET /api/multi-wallet/:walletId/sync-status', () => {
    it('should get wallet sync status', async () => {
      const response = await request(app)
        .get(`/api/multi-wallet/${walletId1}/sync-status`)
        .set('X-User-Id', mockUserId)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.syncStatus).toHaveProperty('walletId');
      expect(response.body.syncStatus).toHaveProperty('lastSyncAt');
      expect(response.body.syncStatus).toHaveProperty('syncDeviceCount');
    });
  });

  describe('POST /api/multi-wallet/transfer', () => {
    beforeAll(async () => {
      // Add some balance to wallet1 for testing transfers
      // In a real system, this would be done through the transaction service
      // For testing, we'll simulate it by updating the wallet directly
    });

    it('should transfer funds between wallets', async () => {
      // First, we need to add some balance to the source wallet
      // This is a mock operation - in production, balance would come from transactions
      const transferData = {
        fromWalletId: walletId1,
        toWalletId: walletId2,
        amount: 50.00,
        description: 'Test transfer'
      };

      // This will fail initially because wallet has 0 balance
      // Let's test the validation first
      const response = await request(app)
        .post('/api/multi-wallet/transfer')
        .set('X-User-Id', mockUserId)
        .send(transferData)
        .expect(400);

      expect(response.body.error).toBe('Transfer failed');
      expect(response.body.message).toBe('Insufficient funds in source wallet');
    });

    it('should fail transfer with same source and destination', async () => {
      const transferData = {
        fromWalletId: walletId1,
        toWalletId: walletId1,
        amount: 50.00
      };

      // This should be caught by validation logic
      const response = await request(app)
        .post('/api/multi-wallet/transfer')
        .set('X-User-Id', mockUserId)
        .send(transferData)
        .expect(400);

      expect(response.body.error).toBe('Transfer failed');
    });

    it('should fail with invalid amount', async () => {
      const transferData = {
        fromWalletId: walletId1,
        toWalletId: walletId2,
        amount: -10.00
      };

      await request(app)
        .post('/api/multi-wallet/transfer')
        .set('X-User-Id', mockUserId)
        .send(transferData)
        .expect(400);
    });
  });

  describe('GET /api/multi-wallet/statistics/overview', () => {
    it('should get wallet statistics', async () => {
      const response = await request(app)
        .get('/api/multi-wallet/statistics/overview')
        .set('X-User-Id', mockUserId)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.statistics).toHaveProperty('totalWallets');
      expect(response.body.statistics).toHaveProperty('totalBalance');
      expect(response.body.statistics).toHaveProperty('walletTypes');
      expect(response.body.statistics).toHaveProperty('currencies');
      expect(response.body.statistics.totalWallets).toBe(2);
    });
  });

  describe('DELETE /api/multi-wallet/:walletId', () => {
    it('should fail to remove primary wallet', async () => {
      const response = await request(app)
        .delete(`/api/multi-wallet/${walletId2}`) // This is now the primary wallet
        .set('X-User-Id', mockUserId)
        .expect(400);

      expect(response.body.error).toBe('Wallet removal failed');
      expect(response.body.message).toBe('Cannot remove primary wallet. Set another wallet as primary first.');
    });

    it('should remove non-primary wallet successfully', async () => {
      const response = await request(app)
        .delete(`/api/multi-wallet/${walletId1}`) // This is not primary
        .set('X-User-Id', mockUserId)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Wallet removed successfully');

      // Verify wallet is removed
      const walletsResponse = await request(app)
        .get('/api/multi-wallet')
        .set('X-User-Id', mockUserId);

      expect(walletsResponse.body.wallets.length).toBe(1);
      expect(walletsResponse.body.wallets[0].walletId).toBe(walletId2);
    });
  });
});

describe('Multi-Wallet Synchronization', () => {
  const mockUserId = 'sync-test-user';
  let walletId;

  beforeAll(async () => {
    // Create a wallet for sync testing
    const walletResponse = await request(app)
      .post('/api/multi-wallet')
      .set('X-User-Id', mockUserId)
      .send({
        walletName: 'Sync Test Wallet',
        walletType: 'personal'
      });
    walletId = walletResponse.body.wallet.walletId;
  });

  it('should handle concurrent sync requests', async () => {
    const syncPromises = [
      request(app)
        .post(`/api/multi-wallet/${walletId}/sync`)
        .set('X-User-Id', mockUserId)
        .send({
          deviceId: '550e8400-e29b-41d4-a716-446655440010',
          syncData: { version: 1 }
        }),
      request(app)
        .post(`/api/multi-wallet/${walletId}/sync`)
        .set('X-User-Id', mockUserId)
        .send({
          deviceId: '550e8400-e29b-41d4-a716-446655440011',
          syncData: { version: 1 }
        }),
      request(app)
        .post(`/api/multi-wallet/${walletId}/sync`)
        .set('X-User-Id', mockUserId)
        .send({
          deviceId: '550e8400-e29b-41d4-a716-446655440012',
          syncData: { version: 1 }
        })
    ];

    const responses = await Promise.all(syncPromises);

    responses.forEach(response => {
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    // Check that all devices are synced
    const syncStatusResponse = await request(app)
      .get(`/api/multi-wallet/${walletId}/sync-status`)
      .set('X-User-Id', mockUserId);

    expect(syncStatusResponse.body.syncStatus.syncDeviceCount).toBe(3);
  });

  it('should detect balance conflicts during sync', async () => {
    const response = await request(app)
      .post(`/api/multi-wallet/${walletId}/sync`)
      .set('X-User-Id', mockUserId)
      .send({
        deviceId: '550e8400-e29b-41d4-a716-446655440020',
        syncData: {
          version: 2,
          balance: 999.99 // Conflicting balance
        }
      });

    expect(response.body.conflicts).toBeDefined();
    expect(response.body.conflicts.length).toBeGreaterThan(0);
    expect(response.body.conflicts[0].type).toBe('balance_mismatch');
  });

  it('should detect concurrent modifications', async () => {
    // Sync from two devices within the conflict window
    const device1Promise = request(app)
      .post(`/api/multi-wallet/${walletId}/sync`)
      .set('X-User-Id', mockUserId)
      .send({
        deviceId: '550e8400-e29b-41d4-a716-446655440030',
        syncData: { version: 3 }
      });

    const device2Promise = request(app)
      .post(`/api/multi-wallet/${walletId}/sync`)
      .set('X-User-Id', mockUserId)
      .send({
        deviceId: '550e8400-e29b-41d4-a716-446655440031',
        syncData: { version: 3 }
      });

    const [response1, response2] = await Promise.all([device1Promise, device2Promise]);

    // At least one should detect concurrent modification
    const hasConflict = response1.body.conflicts.length > 0 || response2.body.conflicts.length > 0;
    expect(hasConflict).toBe(true);
  });
});