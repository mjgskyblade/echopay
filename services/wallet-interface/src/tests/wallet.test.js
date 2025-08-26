const request = require('supertest');
const { app } = require('../index');

describe('Wallet Interface API', () => {
  let authToken;
  let testWalletId;

  beforeAll(async () => {
    // Register a test user and get auth token
    const registerResponse = await request(app)
      .post('/api/auth/register')
      .send({
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com',
        password: 'testpassword123'
      });

    authToken = registerResponse.body.token;

    // Create a test wallet
    const walletResponse = await request(app)
      .post('/api/wallet/create')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Test Wallet',
        currency: 'USD-CBDC'
      });

    testWalletId = walletResponse.body.wallet.id;
  });

  describe('Authentication', () => {
    test('should register a new user', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com',
          password: 'password123'
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('token');
      expect(response.body.user).toHaveProperty('email', 'john@example.com');
    });

    test('should login with valid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'testpassword123'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('token');
      expect(response.body.user).toHaveProperty('email', 'test@example.com');
    });

    test('should reject invalid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'wrongpassword'
        });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Authentication failed');
    });

    test('should get user profile with valid token', async () => {
      const response = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.user).toHaveProperty('email', 'test@example.com');
    });
  });

  describe('Wallet Management', () => {
    test('should create a new wallet', async () => {
      const response = await request(app)
        .post('/api/wallet/create')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'My Wallet',
          currency: 'USD-CBDC'
        });

      expect(response.status).toBe(201);
      expect(response.body.wallet).toHaveProperty('name', 'My Wallet');
      expect(response.body.wallet).toHaveProperty('currency', 'USD-CBDC');
      expect(response.body.wallet).toHaveProperty('balance', 0);
    });

    test('should get wallet dashboard', async () => {
      const response = await request(app)
        .get(`/api/wallet/${testWalletId}/dashboard`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('wallet');
      expect(response.body).toHaveProperty('recentTransactions');
      expect(response.body).toHaveProperty('quickStats');
      expect(response.body.wallet).toHaveProperty('id', testWalletId);
    });

    test('should get transaction history', async () => {
      const response = await request(app)
        .get(`/api/wallet/${testWalletId}/transactions`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('transactions');
      expect(response.body).toHaveProperty('pagination');
      expect(Array.isArray(response.body.transactions)).toBe(true);
    });

    test('should filter transactions by category', async () => {
      const response = await request(app)
        .get(`/api/wallet/${testWalletId}/transactions?category=sent`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('transactions');
    });

    test('should search transactions', async () => {
      const response = await request(app)
        .get(`/api/wallet/${testWalletId}/transactions?search=coffee`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('transactions');
    });

    test('should get wallet settings', async () => {
      const response = await request(app)
        .get(`/api/wallet/${testWalletId}/settings`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('settings');
      expect(response.body.settings).toHaveProperty('notifications');
      expect(response.body.settings).toHaveProperty('fraudAlerts');
    });

    test('should update wallet settings', async () => {
      const newSettings = {
        notifications: false,
        fraudAlerts: true,
        transactionLimits: {
          daily: 5000,
          single: 2500
        }
      };

      const response = await request(app)
        .put(`/api/wallet/${testWalletId}/settings`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(newSettings);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message', 'Settings updated successfully');
      expect(response.body.settings.notifications).toBe(false);
      expect(response.body.settings.transactionLimits.daily).toBe(5000);
    });
  });

  describe('Transaction Operations', () => {
    test('should send a transaction', async () => {
      const transactionData = {
        fromWallet: testWalletId,
        toWallet: 'wallet-test-recipient',
        amount: 100.00,
        currency: 'USD-CBDC',
        description: 'Test payment'
      };

      const response = await request(app)
        .post('/api/transactions/send')
        .set('Authorization', `Bearer ${authToken}`)
        .send(transactionData);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('message', 'Transaction initiated successfully');
      expect(response.body.transaction).toHaveProperty('id');
      expect(response.body.transaction).toHaveProperty('status');
    });

    test('should get transaction details', async () => {
      // First create a transaction
      const transactionData = {
        fromWallet: testWalletId,
        toWallet: 'wallet-test-recipient',
        amount: 50.00,
        currency: 'USD-CBDC',
        description: 'Test transaction for details'
      };

      const sendResponse = await request(app)
        .post('/api/transactions/send')
        .set('Authorization', `Bearer ${authToken}`)
        .send(transactionData);

      const transactionId = sendResponse.body.transaction.id;

      // Then get its details
      const response = await request(app)
        .get(`/api/transactions/${transactionId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.transaction).toHaveProperty('id', transactionId);
      expect(response.body.transaction).toHaveProperty('formattedAmount');
      expect(response.body.transaction).toHaveProperty('statusDetails');
    });

    test('should get transaction receipt', async () => {
      // Create a completed transaction (mock)
      const transactionId = 'tx-completed-test';

      const response = await request(app)
        .get(`/api/transactions/${transactionId}/receipt`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.receipt).toHaveProperty('transactionId', transactionId);
      expect(response.body.receipt).toHaveProperty('confirmationNumber');
      expect(response.body.receipt).toHaveProperty('securityHash');
    });

    test('should validate transaction data', async () => {
      const invalidTransaction = {
        fromWallet: 'invalid-wallet-id',
        toWallet: 'invalid-wallet-id',
        amount: -100, // Invalid negative amount
        currency: 'INVALID-CURRENCY'
      };

      const response = await request(app)
        .post('/api/transactions/send')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidTransaction);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Validation failed');
    });
  });

  describe('Error Handling', () => {
    test('should require authentication for protected routes', async () => {
      const response = await request(app)
        .get(`/api/wallet/${testWalletId}/dashboard`);

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Access denied');
    });

    test('should handle invalid wallet ID', async () => {
      const response = await request(app)
        .get('/api/wallet/invalid-wallet-id/dashboard')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'Wallet not found');
    });

    test('should handle malformed requests', async () => {
      const response = await request(app)
        .post('/api/wallet/create')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          // Missing required fields
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Validation failed');
    });
  });

  describe('Real-time Features', () => {
    test('should handle socket connections', (done) => {
      const io = require('socket.io-client');
      const client = io('http://localhost:3003', {
        auth: {
          token: authToken
        }
      });

      client.on('connect', () => {
        expect(client.connected).toBe(true);
        client.disconnect();
        done();
      });
    });
  });

  describe('Responsive Design', () => {
    test('should serve main HTML page', async () => {
      const response = await request(app).get('/');
      
      expect(response.status).toBe(200);
      expect(response.text).toContain('EchoPay Wallet');
      expect(response.text).toContain('viewport');
    });

    test('should serve login page', async () => {
      const response = await request(app).get('/login');
      
      expect(response.status).toBe(200);
      expect(response.text).toContain('EchoPay - Login');
      expect(response.text).toContain('viewport');
    });

    test('should serve static assets', async () => {
      const response = await request(app).get('/js/app.js');
      
      expect(response.status).toBe(200);
      expect(response.text).toContain('WalletApp');
    });
  });

  describe('Cross-platform Compatibility', () => {
    test('should handle mobile user agents', async () => {
      const response = await request(app)
        .get('/')
        .set('User-Agent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)');
      
      expect(response.status).toBe(200);
      expect(response.text).toContain('viewport');
    });

    test('should handle desktop user agents', async () => {
      const response = await request(app)
        .get('/')
        .set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
      
      expect(response.status).toBe(200);
      expect(response.text).toContain('EchoPay Wallet');
    });
  });
});